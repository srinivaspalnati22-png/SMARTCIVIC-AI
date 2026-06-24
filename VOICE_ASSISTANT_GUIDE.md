# Voice Assistant Setup & Troubleshooting Guide

## ✅ What to Do Now

### Step 1: Test Your Setup
Open this page in your browser:
```
http://localhost:5000/voice-test.html
```

This will check:
- ✓ Microphone access
- ✓ Speech recognition (Web Speech API)
- ✓ Speech synthesis (Text-to-Speech)
- ✓ API connection to backend

### Step 2: Ensure Backend is Running
Make sure Flask backend is running on localhost:5000:
```bash
cd /path/to/smartcivic_ai
python backend/app.py
```

You should see:
```
✅ Gemini Client Configured Successfully
 * Running on http://127.0.0.1:5000
```

### Step 3: Grant Microphone Permission
When you click the 🎙️ button:
1. Browser will ask: "Allow microphone access?"
2. **Click ALLOW**
3. If you see "Permission denied" - check browser settings

### Step 4: Test Voice Assistant
Go to main page: `http://localhost:5000/`
Click the 🎙️ **Talk to AI** button

Expected flow:
1. 🔊 Assistant speaks welcome in 4 languages
2. 🎤 Listening starts - mic indicator appears
3. 🗣️ Say a language (English/Hindi/Telugu/Tamil)
4. 🎤 Your voice is recognized and shown
5. 🔊 Assistant responds with next question
6. Continue the conversation...

---

## 🔧 Troubleshooting

### Issue 1: "No microphone detected"
**Solutions:**
- Check browser permissions (Chrome: ⋮ → Settings → Privacy → Microphone)
- Restart browser
- Try different browser (Firefox, Edge, Safari)
- Check if other apps are using microphone

### Issue 2: "Cannot hear assistant speaking"
**Solutions:**
- Check system volume (bottom right corner)
- Browser volume might be muted - unmute speaker
- Test speech: Open F12 console and run:
  ```javascript
  window.speechSynthesis.speak(new SpeechSynthesisUtterance("Hello, can you hear me?"))
  ```

### Issue 3: "Voice not recognized"
**Solutions:**
- Speak clearly and slowly
- Increase microphone volume
- Reduce background noise
- Test recognition: Open F12 console and run:
  ```javascript
  const rec = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
  rec.start();
  rec.onresult = (e) => console.log(e.results[0][0].transcript);
  ```

### Issue 4: "API not responding"
**Solutions:**
- Check if backend is running:
  ```bash
  curl http://localhost:5000/api/chat
  ```
- Verify .env file has GEMINI_API_KEY
- Check backend is on localhost:5000
- Look at backend console for errors

### Issue 5: "Chat window not showing"
**Solutions:**
- Click the 🎙️ button again
- Check browser console (F12) for errors
- Make sure JavaScript is enabled
- Clear browser cache: Ctrl+Shift+Delete

---

## 🐛 Debug Commands (in Browser Console F12)

```javascript
// Check if voice assistant loaded
console.log(window.voiceAssistant);

// Check browser capabilities
console.log('Speech Recognition:', !!window.SpeechRecognition);
console.log('Speech Synthesis:', !!window.speechSynthesis);
console.log('Microphone API:', !!navigator.mediaDevices?.getUserMedia);

// Check available voices
window.speechSynthesis.getVoices().forEach(v => console.log(v.name, v.lang));

// Get assistant status
console.log(window.voiceAssistant.currentState);
console.log(window.voiceAssistant.currentLanguage);

// Test API manually
fetch('/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    message: 'hello',
    context: { page: 'test', form_state: {}, history: [] },
    language: 'en-IN'
  })
}).then(r => r.json()).then(console.log);

// Manually speak
window.voiceAssistant.speak("Hello from manual test");

// Check chat box
console.log(document.getElementById('chatBox').style.display);
```

---

## 📋 Checklist

Before using voice assistant:

- [ ] Backend server is running (`python backend/app.py`)
- [ ] .env file has valid GEMINI_API_KEY
- [ ] Firefox, Chrome, or Edge browser (Safari has limited support)
- [ ] Microphone is working and enabled
- [ ] Speaker volume is not muted
- [ ] No other app is using the microphone
- [ ] Page is loading from http://localhost:5000 (not offline)

---

## 🆘 Quick Fix: Clear Cache & Restart

If nothing works:

```bash
# 1. Stop backend (Ctrl+C)
# 2. Clear browser cache (Ctrl+Shift+Delete)
# 3. Close browser completely
# 4. Restart backend:
python backend/app.py
# 5. Open fresh browser tab:
http://localhost:5000/
```

---

## 📞 Support

Open Browser Console (F12) and check for red error messages.
Copy the error and share it for debugging.

Common errors and fixes:
- **"Speech Recognition not supported"** → Use Chrome/Firefox on desktop
- **"Permission denied"** → Grant microphone access in browser settings
- **"Gemini API key not found"** → Add key to .env file and restart backend
- **"Cannot read properties of undefined"** → Clear cache, refresh page
