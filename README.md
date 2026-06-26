# SmartCivic AI 🏙️
live url link:https://smartcivicai.vercel.app/

An AI-powered civic complaint management platform for Indian citizens. Report infrastructure issues (roads, water, electricity, sanitation) using voice or text, get real-time status tracking, and receive government department escalation — all in multiple Indian languages.

## 🚀 Live Demo
> Deployed on Render.com — see deployment badge above.

## ✨ Features
- 🎤 **Voice Assistant** — Multilingual AI voice interface (Gemini-powered)
- 📸 **Image Analysis** — Upload photos of civic issues for auto-categorization
- 🗺️ **GPS Location** — Auto-detect ward and area from coordinates
- 📊 **Admin Dashboard** — Real-time complaint tracking and status updates
- 🌐 **8 Indian Languages** — Hindi, Telugu, Tamil, Kannada, Marathi, Bengali, Gujarati, Malayalam
- 📱 **SMS Notifications** — Fast2SMS / Twilio / WhatsApp alerts

## 🛠️ Tech Stack
| Layer | Tech |
|---|---|
| Backend | Python Flask + Gunicorn |
| AI | Google Gemini (gemini-flash-latest) |
| ML | scikit-learn NLP classifier |
| Frontend | Vanilla HTML/CSS/JS |
| Geolocation | geopy + Nominatim |
| SMS | Fast2SMS / Twilio / TextBelt |

## 🔧 Local Setup
```bash
git clone https://github.com/srinivaspalnati22-png/SMARTCIVIC-AI.git
cd SMARTCIVIC-AI
pip install -r requirements.txt
cp .env.example .env   # Add your API keys
python backend/app.py
```
Open http://localhost:5000

## 🌐 Deploy on Render
1. Fork this repo
2. Connect to [Render.com](https://render.com)
3. Select "New Web Service" → connect GitHub repo
4. Render auto-detects `render.yaml`
5. Add env vars: `GEMINI_API_KEY`, `FAST2SMS_API_KEY`

## 📁 Project Structure
```
smartcivic_ai/
├── backend/
│   └── app.py          # Flask API server
├── frontend/
│   ├── index.html      # Main dashboard
│   ├── report.html     # Complaint submission
│   ├── track.html      # Complaint tracking
│   ├── admin.html      # Admin panel
│   └── style.css       # Styling
├── requirements.txt
└── render.yaml         # Render deployment config
```

## 🔑 Environment Variables
| Variable | Description |
|---|---|
| `GEMINI_API_KEY` | Google Gemini API key (required) |
| `FAST2SMS_API_KEY` | Fast2SMS key for India SMS (optional) |
| `TWILIO_ACCOUNT_SID` | Twilio SID (optional) |
| `TWILIO_AUTH_TOKEN` | Twilio token (optional) |
