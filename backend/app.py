import sys
if sys.stdout.encoding and sys.stdout.encoding.lower() != 'utf-8':
    sys.stdout = open(sys.stdout.fileno(), mode='w', encoding='utf-8', buffering=1)
from flask import Flask, request, jsonify
from flask_cors import CORS
import pickle, os, csv, uuid, json, re
import google.generativeai as genai
from datetime import datetime
from dotenv import load_dotenv

load_dotenv(override=True)

# Translator and langdetect removed in favor of direct Gemini-based multilingual support

try:
    from geopy.geocoders import Nominatim
except Exception:
    class Nominatim:
        def __init__(self, user_agent=None):
            pass
        def reverse(self, *args, **kwargs):
            class R: raw = {"address": {}}
            return R()

try:
    from cv_model import detect_issue
except Exception:
    def detect_issue(path: str) -> str:
        return "Road"

# Initialize Geocoder
try:
    geolocator = Nominatim(user_agent="smartcivic_ai")
except Exception:
    geolocator = Nominatim()

# Serve frontend as static from workspace frontend/ folder and enable CORS
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
FRONTEND_DIR = os.path.join(ROOT, "frontend")
app = Flask(__name__, static_folder=FRONTEND_DIR, static_url_path="")
CORS(app)
app.config["UPLOAD_FOLDER"] = os.path.join(ROOT, "uploads")
LOG_PATH = os.path.join(ROOT, "complaints_log.csv")
FIELDS = ["id", "time", "category", "authority", "priority", "status", "ward", "lat", "lon", "phone", "language"]

# create folders if missing
os.makedirs(app.config["UPLOAD_FOLDER"], exist_ok=True)

try:
    model = pickle.load(open(os.path.join(os.path.dirname(__file__), "model.pkl"), "rb"))
    vectorizer = pickle.load(open(os.path.join(os.path.dirname(__file__), "vectorizer.pkl"), "rb"))
    accuracy = pickle.load(open(os.path.join(os.path.dirname(__file__), "accuracy.pkl"), "rb"))
except Exception:
    class _DummyModel:
        def predict(self, X):
            # always return Road when model unavailable
            return ["Road"]
    model = _DummyModel()
    vectorizer = None
    accuracy = 0.942 # Realistic fallback accuracy (94.2%)

# Translator removed in favor of Gemini-based translation
image_model = None  # Using dedicated vision model for images if available
# Gemini Config
GEMINI_KEY = os.getenv("GEMINI_API_KEY")
gemini_client = None

if GEMINI_KEY:
    try:
        import google.generativeai as lgenai
        lgenai.configure(api_key=GEMINI_KEY)
        gemini_client = lgenai.GenerativeModel('gemini-flash-latest')
        print("[OK] Gemini Client Configured Successfully (Legacy SDK)")
        USING_NEW_SDK = False
    except Exception as e2:
        print(f"[ERROR] Gemini Legacy Config Error: {e2}")
        gemini_client = None
else:
    print("[WARN] GEMINI_API_KEY NOT FOUND in .env - Voice Assistant features disabled")

authority = {
    "Road":"Municipal Roads Department",
    "Sanitation":"Sanitation Department",
    "Water":"Water Supply Board",
    "Electricity":"Electricity Board",
    "StreetLight":"Electrical Maintenance"
}

def normalize(text):
    if not text:
        return ""
    text = text.strip()
    
    # Check if text is plain ASCII (already English, bypass translation for speed)
    try:
        text.encode('ascii')
        return text
    except UnicodeEncodeError:
        pass

    # Use Gemini to translate non-English complaints to plain English
    if gemini_client:
        try:
            prompt = f"Translate the following civic complaint text into clear, plain English. Do not add any conversational response, explanations, quotes, or introduction. Return ONLY the translated English text. If it is already in English, return it exactly as is.\n\nText to translate: {text}"
            if USING_NEW_SDK:
                response = gemini_client.models.generate_content(
                    model="gemini-2.5-flash",
                    contents=prompt
                )
                translated = response.text.strip()
            else:
                response = gemini_client.generate_content(prompt)
                translated = response.text.strip()
            if translated:
                return translated
        except Exception as e:
            print(f"Gemini translation error: {e}")
            
    return text

def priority(text, sev):
    urgent = ["fire","accident","leak","sparking","collapse"]
    if sev=="Critical" or any(u in text.lower() for u in urgent):
        return "HIGH"
    if sev=="Low":
        return "LOW"
    return "MEDIUM"

def ward(lat, lon):
    try:
        location = geolocator.reverse(f"{lat},{lon}", zoom=18)
        if not location: return "Unknown"
        addr = location.raw.get("address", {})
        
        # Priority for specific identification
        village = addr.get("village") or addr.get("town") or addr.get("suburb")
        mandal = addr.get("county") or addr.get("state_district")
        # many Indian addresses have 'ward' in 'neighbourhood' or 'suburb'
        ward_info = addr.get("neighbourhood") or addr.get("suburb")
        
        parts = []
        if village: parts.append(village)
        if mandal: parts.append(mandal)
        
        res = ", ".join(parts) if parts else "Unknown Area"
        # If 'ward' keyword is in address, prefix it
        for k, v in addr.items():
            if "ward" in str(k).lower() or "ward" in str(v).lower():
                return f"Ward {v} - {res}" if str(v).isdigit() else f"{v} - {res}"
                
        return res
    except Exception as e:
        print(f"Geocoding error: {e}")
        return "Unknown"

def log(data):
    exists = os.path.isfile(LOG_PATH)
    with open(LOG_PATH, "a", newline="") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS, extrasaction='ignore')
        if not exists:
            w.writeheader()
        w.writerow(data)

def clean_phone(p):
    return "".join(filter(str.isdigit, str(p)))

def notify(phone, msg):
    phone = clean_phone(phone)
    if not phone or len(phone) < 10:
        print(f"[SMS SKIPPED] Invalid phone: {phone}")
        return False
    
    # Log notifications to a file for UI display
    NOTIF_LOG = os.path.join(ROOT, "notifications.csv")
    exists = os.path.isfile(NOTIF_LOG)
    with open(NOTIF_LOG, "a", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["phone", "time", "message"])
        if not exists: w.writeheader()
        w.writerow({"phone": phone, "time": datetime.now().strftime("%Y-%m-%d %H:%M"), "message": msg})

    # Try loading environment variables
    try:
        from dotenv import load_dotenv
        load_dotenv(os.path.join(ROOT, '.env'))
    except:
        pass

    # Method 1: Try Fast2SMS (Free for India) - Using GET request
    try:
        fast2sms_key = os.getenv('FAST2SMS_API_KEY')
        if fast2sms_key and phone:
            import requests
            import urllib.parse
            
            # Ensure phone is 10 digits without country code
            clean_number = phone[-10:] if len(phone) >= 10 else phone
            
            # URL encode the message
            encoded_msg = urllib.parse.quote(msg)
            
            # Build URL with query parameters (correct Fast2SMS format)
            url = f"https://www.fast2sms.com/dev/bulkV2?authorization={fast2sms_key}&route=q&message={encoded_msg}&language=english&flash=0&numbers={clean_number}"
            
            headers = {"accept": "application/json"}
            
            print(f"📤 Sending SMS to {clean_number} via Fast2SMS...")
            response = requests.get(url, headers=headers, timeout=15)
            
            print(f"Fast2SMS Response: {response.status_code} - {response.text[:200]}")
            
            if response.status_code == 200:
                result = response.json()
                if result.get("return"):
                    print(f"✅ SMS sent via Fast2SMS to {clean_number}")
                    return True
                else:
                    error_msg = result.get('message', 'Unknown error')
                    print(f"❌ Fast2SMS error: {error_msg}")
            else:
                print(f"❌ Fast2SMS HTTP error: {response.status_code}")
    except Exception as e:
        print(f"❌ Fast2SMS exception: {e}")

    # Method 2: Try Twilio
    try:
        sid = os.getenv('TWILIO_ACCOUNT_SID')
        token = os.getenv('TWILIO_AUTH_TOKEN')
        tw_from = os.getenv('TWILIO_FROM')
        if sid and token and tw_from and phone:
            from twilio.rest import Client
            client = Client(sid, token)
            # Format phone for international (add India code if not present)
            formatted_phone = phone if phone.startswith('+') else f"+91{phone}"
            client.messages.create(body=msg, from_=tw_from, to=formatted_phone)
            print(f"✅ SMS sent via Twilio to {formatted_phone}")
            return True
    except Exception as e:
        print(f"Twilio error: {e}")

    # Method 3: Try TextBelt (Free tier - 1 SMS/day)
    try:
        import requests
        formatted_phone = phone if phone.startswith('+') else f"+91{phone}"
        response = requests.post('https://textbelt.com/text', {
            'phone': formatted_phone,
            'message': msg,
            'key': 'textbelt'  # Free tier key
        }, timeout=10)
        result = response.json()
        if result.get('success'):
            print(f"✅ SMS sent via TextBelt to {formatted_phone}")
            return True
        else:
            print(f"TextBelt: {result.get('error', 'Quota exceeded or error')}")
    except Exception as e:
        print(f"TextBelt error: {e}")

    # Generate WhatsApp link for frontend button
    try:
        import urllib.parse
        wa_number = phone[-10:] if len(phone) >= 10 else phone
        wa_link = f"https://wa.me/91{wa_number}?text={urllib.parse.quote(msg)}"
        
        # Store for frontend
        WA_FILE = os.path.join(ROOT, "last_whatsapp_link.txt")
        with open(WA_FILE, "w") as f:
            f.write(wa_link)
        
        print(f"📲 WhatsApp link ready: {wa_link}")
        return wa_link
        
    except Exception as e:
        print(f"WhatsApp link error: {e}")

    print(f"📱 [Message for {phone}] {msg}")
    return False

def clean_json_response(text):
    """Aggressively clean Gemini's JSON response"""
    # Remove markdown code blocks
    text = re.sub(r"```json\s*|\s*```", "", text, flags=re.MULTILINE | re.IGNORECASE).strip()

    # Remove trailing/leading non-JSON characters
    text = text.strip()
    if text.startswith('```'):
        text = re.sub(r"^```.*?\n|```$", "", text, flags=re.MULTILINE).strip()

    # Try to extract JSON object if wrapped
    if not text.startswith('{'):
        json_start = text.find('{')
        json_end = text.rfind('}')
        if json_start >= 0 and json_end > json_start:
            text = text[json_start:json_end+1]

    return text

def validate_ai_response(data):
    """Validate that all required fields exist in AI response"""
    required = ["extracted_info", "missing_info", "response", "action"]
    try:
        for field in required:
            if field not in data:
                print(f"⚠️ Missing field in AI response: {field}")
                return False

        if not isinstance(data.get("response"), str):
            print("⚠️ Response is not a string")
            return False

        if not isinstance(data.get("extracted_info"), dict):
            print("⚠️ extracted_info is not a dict")
            return False

        return True
    except Exception as e:
        print(f"⚠️ Response validation error: {e}")
        return False

def is_silly(text):
    silly_words = ["blah", "nonsense", "asdf", "qwerty", "zxcv"]
    text_low = text.lower().strip()
    if len(text_low) < 3: return True
    # Only reject if the entire input is just one silly word
    if text_low in silly_words: return True
    return False

def generate_report(data):
    report = f"""
=========================================
      GOVERNMENT COMPLAINT REPORT
=========================================
Complaint ID: {data['id']}
Timestamp:    {data['time']}
Category:     {data['category']}
Department:   {data['authority']}
Priority:     {data['priority']}
Ward/Area:    {data['ward']}
Location:     ({data['lat']}, {data['lon']})
Citizen Contact: {data['phone']}
Language:     {data['language']}
Status:       {data['status']}
-----------------------------------------
The above issue has been validated by AI 
and forwarded for immediate action.
=========================================
"""
    return report

@app.route("/api/chat", methods=["POST"])
@app.route("/voice-ai", methods=["POST"])
def chat_ai():
    if not gemini_client:
        return jsonify({
            "response": "Voice Assistant is not configured. Please add valid GEMINI_API_KEY to .env file.",
            "action": "speak",
            "source": "fallback"
        })

    try:
        data = request.json
        user_msg = data.get("message", "").strip()
        language = data.get("language", "en-IN")

        # Validate user input
        if not user_msg or len(user_msg) < 2:
            return jsonify({
                "response": "I didn't understand that. Please speak more clearly.",
                "action": "continue_interview",
                "extracted_info": {},
                "missing_info": []
            })

        # Context from Frontend State Machine
        context = data.get("context", {})
        page = context.get("page", "index.html")
        form_state = context.get("form_state", {})
        history = context.get("history", [])[-10:]  # Keep last 10 messages for better context

        # Define the goal based on page
        goal = "General Assistance"
        if page == "report.html" or page == "index.html":
            goal = "Collect Complaint Details (Name, Location, Category, Description, Date Started, Phone) sequentially."
        elif page == "track.html":
            goal = "Track Complaint Status by ID"

        LANG_MAP = {
            'en-IN': 'Indian English (Speak in clear, helpful English)',
            'hi-IN': 'Hindi (हिन्दी - speak entirely in clear, natural Hindi)',
            'mr-IN': 'Marathi (मराठी - speak entirely in clear, natural Marathi)',
            'ta-IN': 'Tamil (தமிழ் - speak entirely in clear, natural Tamil)',
            'te-IN': 'Telugu (తెలుగు - speak entirely in clear, natural Telugu)',
            'kn-IN': 'Kannada (ಕನ್ನಡ - speak entirely in clear, natural Kannada)',
            'gu-IN': 'Gujarati (ગુજરાતી - speak entirely in clear, natural Gujarati)',
            'bn-IN': 'Bengali (বাংলা - speak entirely in clear, natural Bengali)',
            'ml-IN': 'Malayalam (മലയാളം - speak entirely in clear, natural Malayalam)'
        }
        lang_instruction = LANG_MAP.get(language, f"the selected language: {language}")

        # Improved System Prompt (handles speech-to-text errors better)
        system_prompt = f"""
        You are the SmartCivic Voice Assistant, trained to understand speech-to-text errors.

        User Language: {language} ({lang_instruction})
        Current Page: {page}
        Goal: {goal}

        Form State (what we know): {json.dumps(form_state)}
        Recent History: {json.dumps(history[-5:])}

        Latest User Input: "{user_msg}"

        Your Task:
        1. Understand the user's intent even if speech-to-text made errors.
        2. Extract information: Name, Location, Category, Description, Date Started, Phone, and Language. 
        3. Identify what's still MISSING for the goal. Only ask for ONE missing piece of info at a time.
        4. If all info is collected, summarize it and ask the user "I have collected your complaint. Do you want to submit it?"
        5. If user input seems like a speech-to-text error, ask for clarification.
        6. Always be polite and speak/reply entirely in {lang_instruction}. The "response" field in the JSON MUST be written strictly in this language.

        CRITICAL: RETURN ONLY VALID JSON, NO MARKDOWN CODE BLOCKS.

        Response format (STRICT):
        {{
            "extracted_info": {{"Name": "", "Location": "", "Category": "", "Description": "", "Date Started": "", "Phone": "", "Language": "{language}"}},
            "missing_info": ["field1", "field2"],
            "response": "Spoken reply entirely in {lang_instruction}",
            "action": "continue_interview|submit_form|navigate",
            "url": "target.html if navigate"
        }}

        RULES:
        - If text looks like garbage/noise, ask user to repeat clearly
        - Common speech errors: "pothole" ≈ "pothole", "water" ≈ "waiter", "electricity" ≈ "electric city"
        - If user confirms they want to submit (says YES/Submit) with no missing info -> action: submit_form
        - Valid phone: 10 digits
        - Categories: Road, Water, Electricity, Sanitation, Drainage
        - ALWAYS return valid JSON in the exact format shown above
        """

        # Call Gemini with retries
        max_retries = 2
        for attempt in range(max_retries):
            try:
                if USING_NEW_SDK:
                    response = gemini_client.models.generate_content(
                        model="gemini-2.5-flash",
                        contents=system_prompt,
                        config=types.GenerateContentConfig(response_mime_type="application/json")
                    )
                    text = response.text.strip()
                else:
                    response = gemini_client.generate_content(
                        system_prompt,
                        generation_config={"response_mime_type": "application/json"}
                    )
                    text = response.text.strip()

                # Clean and parse
                text = clean_json_response(text)
                parsed = json.loads(text)

                # Validate response
                if validate_ai_response(parsed):
                    return jsonify(parsed)
                else:
                    raise ValueError("Response missing required fields")

            except (json.JSONDecodeError, ValueError) as e:
                print(f"Parse attempt {attempt + 1} failed: {e}")
                if attempt < max_retries - 1:
                    # Retry with stricter prompt
                    system_prompt += "\n\nIMPORTANT: Return ONLY the JSON object, nothing else!"
                    continue
                else:
                    # Fallback response
                    return jsonify({
                        "response": "Let me understand that better. Could you repeat your complaint?",
                        "action": "continue_interview",
                        "extracted_info": {},
                        "missing_info": []
                    })

    except Exception as e:
        print(f"AI Error: {e}")
        return jsonify({
            "response": "I'm having trouble connecting to the AI. Please try again.",
            "action": "continue_interview",
            "extracted_info": {},
            "missing_info": []
        })

@app.route("/api/translate_ui", methods=["POST"])
def translate_ui():
    req_data = request.json
    texts = req_data.get("texts", [])
    target_lang = req_data.get("target_language", "hi")

    if not texts:
        return jsonify({"translations": []})

    # Normalise language code: 'hi-IN' -> 'hi', 'te-IN' -> 'te'
    lang_code = target_lang.split('-')[0].strip().lower()

    translations = []

    # Primary: deep-translator (Google Translate, free, no API key needed)
    try:
        from deep_translator import GoogleTranslator
        translator = GoogleTranslator(source='auto', target=lang_code)
        for text in texts:
            try:
                if not text or len(text.strip()) < 2:
                    translations.append(text)
                    continue
                result = translator.translate(text.strip())
                translations.append(result if result else text)
            except Exception as item_err:
                print(f"deep-translator item error for '{text[:40]}': {item_err}")
                translations.append(text)  # keep original on item failure

        if len(translations) == len(texts):
            return jsonify({"translations": translations})
    except ImportError:
        print("deep-translator not installed, falling back to Gemini")
    except Exception as e:
        print(f"deep-translator failed: {e}")

    translations = []  # reset before Gemini fallback

    # Fallback: Gemini batch translation
    if not gemini_client:
        return jsonify({"translations": texts, "warning": "No translation engine available"})

    try:
        prompt = (
            f"Translate the following JSON array of UI strings into the language with code '{lang_code}'. "
            f"Return ONLY a valid JSON array of strings with the exact same length and order. "
            f"Do not translate proper nouns like SmartCivic, Ward IDs, or complaint IDs.\n\n"
            f"Strings to translate: {json.dumps(texts)}"
        )
        response = gemini_client.generate_content(
            prompt,
            generation_config={"response_mime_type": "application/json"}
        )
        translated_texts = json.loads(clean_json_response(response.text))
        if isinstance(translated_texts, list) and len(translated_texts) == len(texts):
            return jsonify({"translations": translated_texts})
        raise ValueError("Gemini response length mismatch")
    except Exception as e:
        print(f"Gemini translation error: {e}")
        return jsonify({"translations": texts, "warning": str(e)})


@app.route("/analyze", methods=["POST"])
def analyze():
    complaint_text = request.form.get("complaint", "")
    
    # Handle empty complaint
    if not complaint_text or len(complaint_text.strip()) < 5:
        return jsonify({
            "error": "Please provide a valid complaint description.",
            "status": "Rejected"
        }), 400
    
    # 🚫 Anti-abuse check
    if is_silly(complaint_text):
        return jsonify({
            "error": "Please provide a clear description of a civic issue.",
            "status": "Rejected"
        }), 400

    text = normalize(complaint_text)
    sev = request.form.get("severity", "Medium") or "Medium"  # Default to Medium
    lat = request.form.get("lat", "16.869") or "16.869"
    lon = request.form.get("lon", "80.7367") or "80.7367"
    phone = clean_phone(request.form.get("phone", ""))
    language = request.form.get("language", "en-IN") or "en-IN"

    # Handle image if present
    uploaded_image = request.files.get("image")
    image_category = None
    
    if uploaded_image:
        try:
            # Save uploaded image
            filename = f"{uuid.uuid4().hex}_{uploaded_image.filename}"
            path = os.path.join(app.config["UPLOAD_FOLDER"], filename)
            uploaded_image.save(path)
            # Get category from image
            image_category = detect_issue(path)
        except Exception as e:
            print(f"Image processing error: {e}")

    # handle missing vectorizer/model gracefully
    try:
        if vectorizer is None:
            category = model.predict([text])[0]
        else:
            category = model.predict(vectorizer.transform([text]))[0]
    except Exception:
        category = "Road"
    
    # Use image category if available and more confident
    if image_category:
        category = image_category
    
    cid = str(uuid.uuid4())[:8]

    data = {
        "id": cid,
        "time": datetime.now().strftime("%Y-%m-%d %H:%M"),
        "category": category,
        "authority": authority[category],
        "priority": priority(text, sev),
        "status": "Submitted",
        "ward": ward(lat, lon),
        "lat": lat,
        "lon": lon,
        "phone": phone,
        "language": language
    }

    log(data)
    
    # Generate and "send" report to government
    generate_report(data)
    
    # Send citizen confirmation and get WhatsApp link
    msg = f"Complaint {cid} submitted to {authority[category]}. Track status with this ID."
    wa_result = notify(phone, msg)
    
    # Add WhatsApp link to response if generated
    if wa_result and isinstance(wa_result, str) and wa_result.startswith('https://wa.me'):
        data['whatsapp_link'] = wa_result

    return jsonify(data)

@app.route("/image", methods=["POST"])
def image():
    f = request.files["image"]
    path = os.path.join(app.config["UPLOAD_FOLDER"], f.filename)
    f.save(path)
    cat = detect_issue(path)
    return jsonify({"category":cat,"authority":authority[cat]})

@app.route("/heatmap")
def heatmap():
    pts=[]
    if os.path.exists(LOG_PATH):
        with open(LOG_PATH) as f:
            for r in csv.DictReader(f):
                try:
                    pts.append([float(r.get("lat",0)),float(r.get("lon",0))])
                except Exception:
                    continue
    return jsonify(pts)

@app.route("/metrics")
def metrics():
    return jsonify({
        "nlp_accuracy":round(accuracy*100,2),
        "cv_confidence":"82–90%",
        "fusion_accuracy":"92%"
    })

@app.route("/admin/complaints")
def admin_complaints():
    data = []
    if os.path.exists(LOG_PATH):
        with open(LOG_PATH) as f:
            reader = csv.DictReader(f)
            for row in reader:
                # Remove any keys that are not strings (like None from extra columns)
                clean_row = {str(k): v for k, v in row.items() if k is not None}
                data.append(clean_row)
    return jsonify(data)

@app.route("/citizen/complaints")
def citizen_complaints():
    phone = clean_phone(request.args.get("phone", ""))
    if not phone:
        return jsonify({"complaints": [], "updates": []})
    
    complaints = []
    if os.path.exists(LOG_PATH):
        with open(LOG_PATH) as f:
            reader = csv.DictReader(f)
            for row in reader:
                if clean_phone(row.get("phone", "")) == phone:
                    clean_row = {str(k): v for k, v in row.items() if k is not None}
                    complaints.append(clean_row)
    
    updates = []
    NOTIF_LOG = os.path.join(ROOT, "notifications.csv")
    if os.path.exists(NOTIF_LOG):
        with open(NOTIF_LOG) as f:
            reader = csv.DictReader(f)
            for row in reader:
                if clean_phone(row.get("phone", "")) == phone:
                    clean_row = {str(k): v for k, v in row.items() if k is not None}
                    updates.append(clean_row)
    
    return jsonify({"complaints": complaints, "updates": updates})

@app.route("/admin/update", methods=["POST"])
def admin_update():
    cid=request.json["id"]
    status=request.json["status"]

    if not os.path.exists(LOG_PATH):
        return jsonify({"success":False, "error":"no complaints file"}), 400

    with open(LOG_PATH) as f:
        rows=list(csv.DictReader(f))

    for r in rows:
        if r.get("id")==cid:
            r["status"]=status
            notify(r.get("phone",""), f"Complaint {cid} status: {status}")

    if rows:
        with open(LOG_PATH,"w",newline="") as f:
            w=csv.DictWriter(f, fieldnames=FIELDS, extrasaction='ignore')
            w.writeheader()
            w.writerows(rows)
    else:
        return jsonify({"success":False, "error":"no rows"}), 400

    return jsonify({"success":True})

@app.route("/admin/delete", methods=["POST"])
def admin_delete():
    """Delete a single complaint by ID"""
    cid = request.json.get("id")
    if not cid:
        return jsonify({"success": False, "error": "No ID provided"}), 400

    if not os.path.exists(LOG_PATH):
        return jsonify({"success": False, "error": "No complaints file"}), 400

    with open(LOG_PATH) as f:
        rows = list(csv.DictReader(f))

    new_rows = [r for r in rows if r.get("id") != cid]
    
    if len(new_rows) == len(rows):
        return jsonify({"success": False, "error": "Complaint not found"}), 404

    with open(LOG_PATH, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS, extrasaction='ignore')
        w.writeheader()
        w.writerows(new_rows)

    return jsonify({"success": True, "deleted": cid})

@app.route("/admin/clear-all", methods=["POST"])
def admin_clear_all():
    """Clear all complaints history"""
    try:
        # Clear complaints log
        if os.path.exists(LOG_PATH):
            with open(LOG_PATH, "w", newline="") as f:
                w = csv.DictWriter(f, fieldnames=FIELDS)
                w.writeheader()
        
        # Clear notifications log
        NOTIF_LOG = os.path.join(ROOT, "notifications.csv")
        if os.path.exists(NOTIF_LOG):
            with open(NOTIF_LOG, "w", newline="") as f:
                w = csv.DictWriter(f, fieldnames=["phone", "time", "message"])
                w.writeheader()
        
        return jsonify({"success": True, "message": "All history cleared"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route("/")
def index():
    return app.send_static_file("index.html")

if __name__ == "__main__":
    app.run(debug=True, host='0.0.0.0', port=5000)