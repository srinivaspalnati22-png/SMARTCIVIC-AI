
from google import genai
import os

KEY = "AIzaSyBPMlm4y9E0XTFSJCVOilbq1ECD_hHixAw"
print("START (New SDK)")

try:
    client = genai.Client(api_key=KEY)
    
    print("Listing Models:")
    for m in client.models.list():
        print(f" - {m.name}")

    print("Trying generate...")
    response = client.models.generate_content(
        model="gemini-pro", 
        contents="Hi"
    )
    print(f"SUCCESS: {response.text}")
except Exception as e:
    print(f"ERROR: {e}")
    # print e.body if present
    if hasattr(e, 'body'):
        print(f"BODY: {e.body}")
