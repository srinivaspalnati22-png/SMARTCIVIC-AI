import requests
import json
import time

API_URL = "http://127.0.0.1:5000/api/chat"
HEADERS = {"Content-Type": "application/json"}

def test_flow():
    print("🚀 Starting Voice Assistant Simulation...")
    
    # 1. Start with English
    print("\n[Step 1] User selects English")
    payload = {
        "message": "English",
        "language": "en-IN",
        "context": { "page": "report.html", "form_state": {}, "history": [] }
    }
    r = requests.post(API_URL, json=payload).json()
    print(f"🤖 AI Response: {r.get('response')}")
    assert "extracted_info" in r
    
    # 2. Provide partial info
    print("\n[Step 2] User reports issue")
    history = [{"role": "user", "content": "English"}, {"role": "model", "content": r.get("response")}]
    payload = {
        "message": "There is a big pothole near the market",
        "language": "en-IN",
        "context": { "page": "report.html", "form_state": {}, "history": history }
    }
    r = requests.post(API_URL, json=payload).json()
    print(f"🤖 AI Response: {r.get('response')}")
    print(f"📝 Extracted: {r.get('extracted_info')}")
    print(f"❓ Missing: {r.get('missing_info')}")
    
    # 3. Provide Phone
    print("\n[Step 3] User provides phone")
    history.append({"role": "user", "content": payload["message"]})
    history.append({"role": "model", "content": r.get("response")})
    current_state = r.get("extracted_info", {})
    
    payload = {
        "message": "My number is 9876543210",
        "language": "en-IN",
        "context": { "page": "report.html", "form_state": current_state, "history": history }
    }
    r = requests.post(API_URL, json=payload).json()
    print(f"🤖 AI Response: {r.get('response')}")
    print(f"📝 Extracted: {r.get('extracted_info')}")
    
    # 4. Verification in Hindi
    print("\n[Step 4] Testing Hindi Prompt")
    payload = {
        "message": "Pani nahi aa raha hai",
        "language": "hi-IN",
        "context": { "page": "report.html", "form_state": {}, "history": [] }
    }
    r = requests.post(API_URL, json=payload).json()
    print(f"🤖 AI Response (Hindi): {r.get('response')}")
    
    print("\n✅ Simulation Complete!")

if __name__ == "__main__":
    try:
        test_flow()
    except Exception as e:
        print(f"❌ Test Failed: {e}")
