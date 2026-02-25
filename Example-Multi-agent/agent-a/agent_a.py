import os
import json
from dotenv import load_dotenv

load_dotenv()
from flask import Flask, request, jsonify, Response
from flask_cors import CORS
from google import genai
import requests

# Configuration
PORT = int(os.environ.get("AGENT_A_PORT", 5001))
AGENT_B_URL = os.environ.get("AGENT_B_URL", "http://localhost:5002")
GOOGLE_API_KEY = os.environ.get("GOOGLE_API_KEY")

if not GOOGLE_API_KEY:
    print("FATAL: GOOGLE_API_KEY environment variable is required.")
    exit(1)

client = genai.Client(api_key=GOOGLE_API_KEY)

app = Flask(__name__)
CORS(app)

# Session memory
sessions = {}

def get_session_history(session_id: str):
    if session_id not in sessions:
        sessions[session_id] = [
            {"role": "user", "parts": [{"text": "You are a helpful conversational AI assistant. You can chat with the user normally. However, you also have a UI Agent (Agent B) that can render visual UIs for the user using the Freesail Framework. If you determine that the user is asking for something visual (e.g. 'show me a dashboard', 'render a widget', 'display the weather clearly', 'create a form'), you should output a specific command: [DELEGATE_UI: <instruction>]. Do NOT output anything else besides this command when you want to show UI. The instruction should describe what needs to be rendered."}]},
            {"role": "model", "parts": [{"text": "Understood."}]}
        ]
    return sessions[session_id]

def send_a2a_task_to_agent_b(session_id: str, instruction: str):
    """
    Sends an A2A task request to Agent B's render_ui skill.
    """
    try:
        print(f"Delegating UI rendering to Agent B for session {session_id}...")
        url = f"{AGENT_B_URL}/a2a/tasks/send"
        payload = {
            "task_id": f"task-{os.urandom(4).hex()}",
            "skill_id": "render_ui",
            "input": {
                "session_id": session_id,
                "instruction": instruction
            }
        }
        response = requests.post(url, json=payload)
        response.raise_for_status()
        print("Task delegated successfully.")
        return True
    except Exception as e:
        print(f"Failed to delegate task to Agent B: {e}")
        return False

@app.route('/chat', methods=['POST'])
def chat():
    data = request.json
    if not data or 'message' not in data or 'session_id' not in data:
        return jsonify({"error": "message and session_id are required"}), 400
        
    session_id = data['session_id']
    user_msg = data['message']
    
    history = get_session_history(session_id)
    history.append({"role": "user", "parts": [{"text": user_msg}]})
    
    try:
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=history
        )
        reply = response.text
        
        # Check if we should delegate to the UI Agent
        if "[DELEGATE_UI:" in reply:
            start_idx = reply.find("[DELEGATE_UI:") + len("[DELEGATE_UI:")
            end_idx = reply.find("]", start_idx)
            instruction = reply[start_idx:end_idx].strip()
            
            success = send_a2a_task_to_agent_b(session_id, instruction)
            
            if success:
                reply = "I've asked my UI assistant to display that for you!"
            else:
                reply = "I tried to show you that visually, but the UI assistant is not responding."
                
            history.append({"role": "model", "parts": [{"text": reply}]})
            return jsonify({"reply": reply})

        # Standard conversation
        history.append({"role": "model", "parts": [{"text": reply}]})
        return jsonify({"reply": reply})
        
    except Exception as e:
        print(f"Chat error: {e}")
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=PORT)
