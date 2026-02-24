import os
import json
import asyncio
from dotenv import load_dotenv

load_dotenv()
from typing import Dict, Any, List
from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn
from contextlib import asynccontextmanager
from openai import AsyncOpenAI
from mcp import ClientSession
from mcp.client.streamable_http import streamable_http_client

# Configuration
PORT = int(os.environ.get("AGENT_B_PORT", 5002))
MCP_URL = os.environ.get("MCP_URL", "http://localhost:3000/mcp")
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")

if not OPENAI_API_KEY:
    print("FATAL: OPENAI_API_KEY environment variable is required.")
    exit(1)

openai_client = AsyncOpenAI(api_key=OPENAI_API_KEY)

# State
mcp_session: ClientSession | None = None
mcp_tools_cache = []
a2ui_prompt_cache = ""

# --- A2A Server (FastAPI) ---

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Connect to MCP
    print(f"Connecting to Gateway MCP at {MCP_URL}...")
    global mcp_session, mcp_tools_cache, a2ui_prompt_cache
    
    # We maintain the SSE connection in a background task
    async def mcp_worker():
        global mcp_session, mcp_tools_cache, a2ui_prompt_cache
        try:
            async with streamable_http_client(MCP_URL) as streams:
                async with ClientSession(streams[0], streams[1]) as session:
                    await session.initialize()
                    mcp_session = session
                    print("Connected to Gateway MCP.")
                    
                    # Fetch tools
                    tools_response = await session.list_tools()
                    mcp_tools_cache = tools_response.tools
                    print(f"Discovered {len(mcp_tools_cache)} MCP tools.")
                    
                    # Fetch A2UI prompt
                    prompt_response = await session.get_prompt("a2ui_system")
                    if prompt_response and prompt_response.messages:
                        a2ui_prompt_cache = prompt_response.messages[0].content.text
                        print("Fetched A2UI system prompt.")
                    
                    # Keep connection alive
                    while True:
                        await asyncio.sleep(1)
        except Exception as e:
            print(f"MCP connection failed: {e}")
            
    worker_task = asyncio.create_task(mcp_worker())
    
    yield
    
    # Shutdown
    worker_task.cancel()

app = FastAPI(title="Freesail UI Agent (Agent B)", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_headers=["*"], allow_methods=["*"])

# Agent Card endpoint
@app.get("/.well-known/agent-card.json")
async def get_agent_card():
    return {
        "schemaVersion": "1.0",
        "humanReadableId": "freesail/ui-agent",
        "agentVersion": "0.1.0",
        "name": "Freesail UI Agent",
        "description": "I render dynamic visual UIs using the Freesail framework based on instructions.",
        "url": f"http://localhost:{PORT}",
        "capabilities": {
            "a2aVersion": "1.0"
        },
        "defaultInputModes": ["application/json"],
        "defaultOutputModes": ["application/json"],
        "skills": [
            {
                "id": "render_ui",
                "name": "Render UI",
                "description": "Generates and renders a visual UI for the user based on instructions.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "session_id": {"type": "string", "description": "The client session ID to render to"},
                        "instruction": {"type": "string", "description": "Description of the UI to render and any relevant data to include."}
                    },
                    "required": ["session_id", "instruction"]
                }
            }
        ]
    }

class A2ATaskRequest(BaseModel):
    task_id: str
    skill_id: str
    input: Dict[str, Any]

@app.post("/a2a/tasks/send")
async def handle_a2a_task(req: A2ATaskRequest):
    print(f"Received A2A task: {req.skill_id} (Session: {req.input.get('session_id')})")
    
    if req.skill_id != "render_ui":
        raise HTTPException(status_code=400, detail=f"Unknown skill: {req.skill_id}")
        
    session_id = req.input.get("session_id")
    instruction = req.input.get("instruction")
    
    if not session_id or not instruction:
        raise HTTPException(status_code=400, detail="session_id and instruction are required.")
        
    if not mcp_session:
        raise HTTPException(status_code=503, detail="MCP connection not ready.")
        
    # Execute tool calling loop with OpenAI
    await execute_ui_generation(session_id, instruction)
    
    return {
        "task_id": req.task_id,
        "status": "completed",
        "result": {"message": "UI successfully generated and sent to client."}
    }
    
async def execute_ui_generation(session_id: str, instruction: str):
    print(f"Generating UI for session {session_id}...")
    
    # Prepare OpenAI tools standard format from MCP tools
    openai_tools = []
    for tool in mcp_tools_cache:
        openai_tools.append({
            "type": "function",
            "function": {
                "name": tool.name,
                "description": tool.description,
                "parameters": tool.inputSchema
            }
        })
        
    # Add MCP core resource tools
    openai_tools.extend([
        {
            "type": "function",
            "function": {
                "name": "list_resources",
                "description": "List available MCP resources such as Catalogs.",
                "parameters": {"type": "object", "properties": {}, "required": []}
            }
        },
        {
            "type": "function",
            "function": {
                "name": "read_resource",
                "description": "Read the content of a specific MCP resource.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "uri": {"type": "string", "description": "The URI of the resource to read."}
                    },
                    "required": ["uri"]
                }
            }
        }
    ])
        
    messages = [
        {"role": "system", "content": a2ui_prompt_cache},
        {"role": "user", "content": f"The user needs a UI. Target Session ID: \"{session_id}\".\nInstruction: {instruction}\n\nMake sure to call create_surface, update_components, and update_data_model as needed."}
    ]
    
    try:
        while True:
            response = await openai_client.chat.completions.create(
                model="gpt-4o",
                messages=messages,
                tools=openai_tools,
                temperature=0.2,
            )
            
            msg = response.choices[0].message
            messages.append(msg)
            
            if not msg.tool_calls:
                break
                
            for tool_call in msg.tool_calls:
                func_name = tool_call.function.name
                func_args = json.loads(tool_call.function.arguments)
                
                content = ""
                if func_name == "list_resources":
                    print(">> Executing MCP Core: list_resources")
                    response = await mcp_session.list_resources()
                    content = json.dumps([r.model_dump() if hasattr(r, 'model_dump') else r for r in response.resources], default=str)
                elif func_name == "read_resource":
                    uri = func_args.get("uri")
                    from pydantic import AnyUrl
                    print(f">> Executing MCP Core: read_resource ({uri})")
                    response = await mcp_session.read_resource(AnyUrl(uri))
                    content = json.dumps([c.model_dump() if hasattr(c, 'model_dump') else c for c in response.contents], default=str)
                else:
                    print(f">> Executing MCP Tool: {func_name}")
                    result = await mcp_session.call_tool(func_name, arguments=func_args)
                    
                    if result.isError:
                        print(f"  MCP Tool Error: {result.content}")
                        content = f"Error: {result.content}"
                    else:
                        print(f"  MCP Tool Success")
                        # MCP tool responses contain a list of TextContent objects
                        content = json.dumps([c.model_dump() if hasattr(c, 'model_dump') else c for c in result.content]) if result.content else "Success"
                    
                messages.append({
                    "role": "tool",
                    "tool_call_id": tool_call.id,
                    "name": func_name,
                    "content": content
                })
                    
    except Exception as e:
        print(f"Error executing UI generation: {e}")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=PORT)
