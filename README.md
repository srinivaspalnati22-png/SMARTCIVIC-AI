# SmartCivic AI

SmartCivic AI is an AI-powered platform for reporting and managing civic issues like potholes, water leaks, and other infrastructure problems. It features a fully integrated Voice Assistant capable of understanding multiple languages (English, Hindi, Telugu, Tamil) and interacting with users seamlessly.

## Features

- **Multilingual Voice Assistant**: Report issues using voice in English, Hindi, Telugu, or Tamil.
- **Smart Categorization**: The Gemini AI backend automatically categorizes the complaints.
- **Real-time Chat Interface**: See your transcriptions and AI responses in real-time.
- **Location Tracking**: Easily attach location data to your reports.

## Quick Start

### 1. Setup Backend
Install dependencies and run the Flask backend:
```bash
pip install -r requirements.txt
python backend/app.py
```
*Note: Ensure your `.env` file is properly configured with your `GEMINI_API_KEY`.*

### 2. Access the Application
Open your browser and navigate to:
```
http://localhost:5000/
```

### 3. Usage
Click the **Talk to AI** (🎙️) button, allow microphone access, and state your language and complaint. The AI will guide you through the rest.

## Project Structure

- `/backend`: Contains the Flask server, API endpoints, and Gemini AI integration.
- `/frontend`: Contains the web interface, CSS styling, and JavaScript logic (including `voice-assistant.js`).
- `complaints_log.csv`: Local storage for logged complaints.

## Documentation
For more detailed guides and troubleshooting, refer to:
- `QUICK_START.md`
- `VOICE_ASSISTANT_GUIDE.md`
- `VOICE_FIXES_SUMMARY.md`
