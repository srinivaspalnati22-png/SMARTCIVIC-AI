
# 🔑 How to Fix "Permission Denied" (403) Error

The API Key you provided (`AIzaSy...`) is valid, but Google is blocking it because the **Generative Language API** is not enabled or the key has restrictions.

### ✅ Solution 1: Enable the API (Recommended)
1. Go to the **[Google Cloud Console](https://console.cloud.google.com/apis/library/generativelanguage.googleapis.com)**.
2. Select the project associated with your API Key.
3. Click the **"Enable"** button for **Generative Language API**.
4. Wait 1-2 minutes for changes to propagate.

### ✅ Solution 2: Get a New Key from Google AI Studio (Easiest)
If the above is confusing, just get a fresh key designed for Gemini:
1. Go to **[Google AI Studio](https://aistudio.google.com/app/apikey)** (log in with your Google account).
2. Click **"Create API Key"**.
3. Choose **"Create API key in new project"**.
4. Copy the new key (it starts with `AIza...`).
5. Open `.env` file in this project and replace the old key:
   ```bash
   GEMINI_API_KEY="paste_new_key_here"
   ```
6. The voice assistant will automatically work after saving!

### 🔍 How to Test
After updating the key, run the test script in the terminal:
```bash
python test_new_sdk.py
```
If you see `SUCCESS: ...`, you are good to go!
