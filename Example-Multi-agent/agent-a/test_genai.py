from google import genai
import os

client = genai.Client(api_key=os.environ.get("GOOGLE_API_KEY"))
history = [
    {"role": "user", "parts": ["Hello"]}
]
response = client.models.generate_content(
    model='gemini-2.5-flash',
    contents=history
)
print(response.text)
