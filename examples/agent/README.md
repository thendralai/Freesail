# Freesail Agent Example

Example AI agent using LangChain.js and Google Gemini 2.5 Flash to drive the Freesail UI.

## Setup

1. Get a Google API key from [Google AI Studio](https://aistudio.google.com/app/apikey)

2. Set the environment variable:
   ```bash
   export GOOGLE_API_KEY=your-api-key
   ```

3. Install dependencies:
   ```bash
   npm install
   ```

## Running

Start the agent server:
```bash
npm run dev
```

The agent runs on `http://localhost:3002` by default.

## Usage

The agent exposes a chat API:

```bash
# Send a message
curl -X POST http://localhost:3002/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Show me a welcome card"}'

# Clear conversation history
curl -X POST http://localhost:3002/clear
```

## Environment Variables

- `GOOGLE_API_KEY` - Required. Your Google API key for Gemini.
- `AGENT_PORT` - Port for the agent server (default: 3002)
- `GATEWAY_URL` - URL of the Freesail gateway (default: http://localhost:3001)

## Example Prompts

Try these with the chat interface:

- "Show me a welcome card with a greeting"
- "Create a counter with increment and decrement buttons"
- "Display a list of tasks"
- "Show a user profile card"
- "Create a simple form with name and email fields"
