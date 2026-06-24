
import os
from dotenv import load_dotenv
import google.generativeai as genai

load_dotenv()
api_key = os.getenv("GEMINI_API_KEY")

if not api_key:
    print("❌ API Key NOT found in .env")
    exit(1)

# Debug: Check for quotes
if api_key.startswith('"') and api_key.endswith('"'):
    print("⚠️ Key has quotes, stripping...")
    api_key = api_key.strip('"')

print(f"✅ Found API Key: {api_key[:5]}...{api_key[-5:]} (Length: {len(api_key)})")

try:
    genai.configure(api_key=api_key)
    
    # List models to see what's available
    print("📋 Listing available models...")
    for m in genai.list_models():
        if 'generateContent' in m.supported_generation_methods:
            print(f"   - {m.name}")

    # Try newer model first
    model_name = "gemini-2.5-flash"
    print(f"🔄 Testing with {model_name}...")
    model = genai.GenerativeModel(model_name)
    response = model.generate_content("Hello")
    print(f"✅ Gemini Response: {response.text}")

except Exception as e:
    print(f"❌ API Error: {e}")
    # Fallback try
    try:
        print("🔄 Retrying with gemini-2.5-flash...")
        model = genai.GenerativeModel("gemini-2.5-flash")
        response = model.generate_content("Hello")
        print(f"✅ Gemini Response (metrics): {response.text}")
    except Exception as e2:
         print(f"❌ API Error (Fallback): {e2}")
