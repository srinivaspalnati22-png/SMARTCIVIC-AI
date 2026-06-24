
import google.generativeai as genai

KEY = "AIzaSyBPMlm4y9E0XTFSJCVOilbq1ECD_hHixAw"

print("START TEST")
try:
    genai.configure(api_key=KEY)
    model = genai.GenerativeModel("gemini-2.5-flash")
    response = model.generate_content("Hi")
    print(f"SUCCESS: {response.text}")
except Exception as e:
    # Print only first 100 chars of error to avoid snapshot cutoff
    err_str = str(e)
    print(f"ERROR: {err_str[:200]}")
