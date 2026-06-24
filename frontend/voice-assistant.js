/**
 * SmartCivic AI - Premium Voice Assistant (Overhaul)
 * Features:
 * - Multilingual Welcome & Language Selection
 * - Guided Interview Flow (Category -> Location -> Details)
 * - State Machine Architecture
 * - Robust Error Recovery
 */

class VoiceAssistant {
    constructor() {
        this.recognition = null;
        this.synthesis = window.speechSynthesis;
        this.currentLanguage = localStorage.getItem('preferredLanguage') || 'en-IN';

        // State Machine
        this.STATE = {
            IDLE: 'IDLE',
            WELCOMING: 'WELCOMING',
            LANGUAGE_SELECT: 'LANGUAGE_SELECT',
            LISTENING: 'LISTENING',
            PROCESSING: 'PROCESSING',
            SPEAKING: 'SPEAKING',
            CONFIRMING: 'CONFIRMING'
        };
        this.currentState = this.STATE.IDLE;

        // Conversation Context
        this.context = {
            extracted: {}, // category, location, etc.
            missing: [],   // fields needed
            history: []    // conversation log
        };

        this.listeningTimeout = null; // For timeout management

        this.languages = {
            'en-IN': { name: 'English', flag: '🇬🇧', code: 'en', keywords: ['english', 'angreji', 'englis'] },
            'hi-IN': { name: 'हिन्दी', flag: '🇮🇳', code: 'hi', keywords: ['hindi', 'hindustan', 'hindhi'] },
            'mr-IN': { name: 'मराठी', flag: '🇮🇳', code: 'mr', keywords: ['marathi', 'marata', 'marati'] },
            'ta-IN': { name: 'தமிழ்', flag: '🇮🇳', code: 'ta', keywords: ['tamil', 'tamizh', 'thamil'] },
            'te-IN': { name: 'తెలుగు', flag: '🇮🇳', code: 'te', keywords: ['telugu', 'telungu'] },
            'kn-IN': { name: 'ಕನ್ನಡ', flag: '🇮🇳', code: 'kn', keywords: ['kannada', 'kanada'] },
            'gu-IN': { name: 'ગુજરાતી', flag: '🇮🇳', code: 'gu', keywords: ['gujarati', 'gujarathi', 'gujrati'] },
            'bn-IN': { name: 'বাংলা', flag: '🇮🇳', code: 'bn', keywords: ['bengali', 'bangla', 'bengali'] },
            'ml-IN': { name: 'മലയാളം', flag: '🇮🇳', code: 'ml', keywords: ['malayalam', 'malayali'] }
        };

        // Bind methods
        this.handleResult = this.handleResult.bind(this);
        this.handleError = this.handleError.bind(this);
        this.handleEnd = this.handleEnd.bind(this);

        this.init();
    }

    async init() {
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR) {
            console.error("Voice Assistant: Speech Recognition not supported.");
            return;
        }

        this.recognition = new SR();
        this.recognition.continuous = true;  // Keep listening for multiple phrases
        this.recognition.interimResults = true;  // Show partial results for better UX
        this.recognition.maxAlternatives = 3;  // Get multiple interpretations

        this.recognition.onresult = this.handleResult;
        this.recognition.onerror = this.handleError;
        this.recognition.onend = this.handleEnd;

        // Add confidence tracking
        this.confidenceThreshold = 0.5;  // Only accept results above 50% confidence
        this.retryCount = 0;
        this.maxRetries = 2;

        // Log initialization
        console.log('🎤 Voice Assistant Initialized');
        console.log('Speech Recognition:', SR.name);
        console.log('Speech Synthesis Available:', !!window.speechSynthesis);

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.setupUI());
        } else {
            this.setupUI();
        }
    }

    setupUI() {
        if (document.getElementById('voiceBtn')) return;

        // Create FAB
        const btn = document.createElement('div');
        btn.id = 'voiceBtn';
        btn.innerHTML = `
            <div class="pulse-ring"></div>
            <span style="font-size: 1.4rem;">🎙️</span>
            <span id="voiceBtnText">Talk to AI</span>
        `;
        btn.onclick = () => this.toggleSession();
        document.body.appendChild(btn);

        // Create Chat Box
        const chat = document.createElement('div');
        chat.id = 'chatBox';
        chat.innerHTML = `
            <div class="chat-header">
                    <div class="ai-avatar-container" style="position:relative; width:40px; height:40px; background:var(--gradient-primary); border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:1.5rem; box-shadow:0 0 10px rgba(102,126,234,0.5);">
                        <span id="va-avatar">👩🏻‍💼</span>
                        <div id="va-avatar-ring" style="position:absolute; top:0; left:0; right:0; bottom:0; border-radius:50%; border:2px solid transparent; transition:all 0.3s ease;"></div>
                    </div>
                    <div>
                        <div style="font-weight:900; font-size:1.1rem;">AI Smart Assistant</div>
                        <div id="va-status" style="font-size:0.75rem; opacity:0.8; font-weight:600;">Ready</div>
                    </div>
                </div>
                <button onclick="voiceAssistant.hideChat()" style="background:rgba(255,255,255,0.2); border:none; color:white; width:32px; height:32px; border-radius:50%; cursor:pointer;">&times;</button>
            </div>
            <div id="va-messages" class="chat-messages"></div>
            
            <div id="va-wave" class="mic-wave" style="display:none; background:var(--bg-1); padding: 15px 0;">
                <div class="wave-bar"></div><div class="wave-bar"></div><div class="wave-bar"></div><div class="wave-bar"></div><div class="wave-bar"></div>
            </div>

            <div class="chat-footer">
                <div id="va-lang-hint" style="font-size:0.8rem; color:var(--muted); margin-right:10px;"></div>
            </div>
        `;
        document.body.appendChild(chat);
    }

    // --- State Management ---

    async toggleSession() {
        if (this.currentState !== this.STATE.IDLE) {
            this.stopSession();
        } else {
            this.startSession();
        }
    }

    async startSession() {
        console.log('🎤 Starting voice session...');
        this.showChat();
        this.updateBtn(true);
        this.playPing('start');

        // Start with Multilingual Welcome
        this.currentState = this.STATE.WELCOMING;
        console.log('📢 Playing welcome message...');
        await this.playWelcomeMessage();
    }

    stopSession() {
        this.currentState = this.STATE.IDLE;
        this.stopListening();

        // Cancel all speech
        try {
            window.speechSynthesis.cancel();
            console.log('✓ Speech synthesis cancelled');
        } catch (e) {
            console.warn('Error cancelling speech:', e);
        }

        this.updateBtn(false);
        this.hideChat();
        this.playPing('end');
        this.context = { extracted: {}, missing: [], history: [] }; // Reset context
        console.log('Session stopped');
    }

    async playWelcomeMessage() {
        this.addMessage('ai', "Hello! Namaste! Vanakkam! Which language do you prefer? (English, Hindi, Marathi, Telugu, Tamil, Kannada, Gujarati, Bengali, Malayalam)");

        // Play sequential greeting
        const greetings = [
            { text: "Hello! Which language do you prefer?", lang: "en-IN" },
            { text: "Namaste! Aap kaunsi bhasha pasand karenge?", lang: "hi-IN" },
            { text: "Namaskar! Tumhala konti bhasha havi aahe?", lang: "mr-IN" },
            { text: "Namaskaram! Meeku eh bhasha kavali?", lang: "te-IN" },
            { text: "Vanakkam! Ungaluku endha mozhi pidikum?", lang: "ta-IN" },
            { text: "Namaskara! Nimage yav bhashe beku?", lang: "kn-IN" },
            { text: "Namaste! Tamne kai bhasha pasand chhe?", lang: "gu-IN" },
            { text: "Nomoshkar! Apni kon bhasha pochhondo koren?", lang: "bn-IN" },
            { text: "Namaskaram! Njangal ഏത് ഭാഷയാണ് സംസാരിക്കേണ്ടത്?", lang: "ml-IN" }
        ];

        for (const g of greetings) {
            if (this.currentState !== this.STATE.WELCOMING) return; // Stop if interrupted
            await this.speak(g.text, g.lang);
        }

        // After greeting, listen for language selection
        this.currentState = this.STATE.LANGUAGE_SELECT;
        this.startListening();
    }

    // --- Listening Logic ---

    startListening() {
        // Only prevent listening in specific inactive states
        if (this.currentState === this.STATE.IDLE || this.currentState === this.STATE.SPEAKING || this.currentState === this.STATE.PROCESSING) {
            console.log(`Skipping listening in state: ${this.currentState}`);
            return;
        }

        // Ensure state is LISTENING for proper result processing
        if (this.currentState === this.STATE.LANGUAGE_SELECT) {
            // Keep LANGUAGE_SELECT state for language detection
            console.log('🎤 Listening for language selection');
        } else {
            this.currentState = this.STATE.LISTENING;
            console.log('🎤 Listening for user input');
        }

        try {
            // Set the language for recognition
            this.recognition.lang = (this.currentState === this.STATE.LANGUAGE_SELECT) ? 'en-IN' : this.currentLanguage;
            console.log(`Recognition language set to: ${this.recognition.lang}`);

            // Safely restart recognition - ensure previous one is stopped
            try {
                this.recognition.abort(); // Use abort instead of stop for cleaner reset
            } catch (e) {
                // Recognition might not be running, that's fine
            }

            // Small delay to ensure clean restart
            setTimeout(() => {
                try {
                    this.recognition.start();
                    this.updateWave(true);
                    this.setStatus('🎤 Listening...');
                    console.log('✓ Recognition started');
                } catch (e) {
                    console.error('Failed to start recognition after delay:', e);
                    this.setStatus('❌ Microphone error');
                }
            }, 100);

            // Add timeout to prevent infinite listening (30 seconds max)
            if (this.listeningTimeout) clearTimeout(this.listeningTimeout);
            this.listeningTimeout = setTimeout(() => {
                if (this.currentState === this.STATE.LISTENING || this.currentState === this.STATE.LANGUAGE_SELECT) {
                    console.warn('Listening timeout - restarting recognition');
                    this.stopListening();
                    this.startListening();
                }
            }, 30000);

        } catch (e) {
            console.error("Recognition start failed:", e);
            this.setStatus('❌ Microphone error');
        }
    }

    stopListening() {
        try {
            if (this.recognition) {
                // Use abort for cleaner stop
                this.recognition.abort();
                console.log('✓ Recognition aborted');
            }
        } catch (e) {
            console.warn("Error stopping recognition:", e);
        }

        if (this.listeningTimeout) {
            clearTimeout(this.listeningTimeout);
        }
        this.updateWave(false);
    }

    // --- Event Handlers ---

    handleResult(event) {
        // Get the best result with highest confidence
        let bestResult = null;
        let bestConfidence = 0;

        // Find the best final result (not interim)
        for (let i = event.resultIndex; i < event.results.length; i++) {
            if (event.results[i].isFinal) {
                const result = event.results[i][0];
                const confidence = result.confidence || 0;

                if (confidence > bestConfidence) {
                    bestConfidence = confidence;
                    bestResult = result.transcript.toLowerCase().trim();
                }
            } else {
                // Show interim results for better UX
                const interim = event.results[i][0].transcript.toLowerCase().trim();
                if (interim) {
                    this.setStatus(`🎤 Listening... "${interim}"`);
                }
            }
        }

        // Only process if we have a final result with good confidence
        if (!bestResult) {
            console.log('No final result received yet');
            return;
        }

        console.log(`✓ Speech recognized: "${bestResult}" (Confidence: ${Math.round(bestConfidence * 100)}%)`);

        // Store whether this was a low confidence result
        const isLowConfidence = bestConfidence < this.confidenceThreshold;

        if (isLowConfidence) {
            this.retryCount++;
            console.warn(`Low confidence (${Math.round(bestConfidence * 100)}%). Retry ${this.retryCount}/${this.maxRetries}`);
            if (this.retryCount < this.maxRetries) {
                this.setStatus(`⚠️ Didn't catch that (${Math.round(bestConfidence * 100)}%). Please repeat.`);
                this.addMessage('ai', 'Could you repeat that please?');
                // Restart listening after a brief pause
                setTimeout(() => this.startListening(), 500);
                return;
            }
        }

        // Reset retry counter on success or final attempt
        this.retryCount = 0;
        this.addMessage('user', `${bestResult} (${Math.round(bestConfidence * 100)}%)`);
        this.updateWave(false);

        // Check if we're in a state where we can process input
        if (this.currentState === this.STATE.SPEAKING || this.currentState === this.STATE.PROCESSING) {
            console.log(`Deferring input processing - current state: ${this.currentState}`);
            return;
        }

        // Process the input based on current state
        if (this.currentState === this.STATE.LANGUAGE_SELECT) {
            console.log('Processing as language selection');
            this.handleLanguageSelection(bestResult);
        } else if (this.currentState === this.STATE.LISTENING) {
            console.log('Processing as conversation input');
            this.handleConversationInput(bestResult);
        } else {
            console.log(`Processing in unexpected state: ${this.currentState}`);
            // If we have input in an unexpected state, try to handle it
            this.handleConversationInput(bestResult);
        }
    }

    handleError(event) {
        this.updateWave(false);

        const errorMessages = {
            'no-speech': 'No speech detected. Speak a bit louder please.',
            'audio-capture': 'No microphone detected. Check your device.',
            'network': 'Network error. Please check connection.',
            'not-allowed': 'Microphone permission denied.',
            'service-not-allowed': 'Speech service not available in your region.',
            'bad-grammar': 'Please rephrase that.'
        };

        const errorMsg = errorMessages[event.error] || `Error: ${event.error}`;
        this.setStatus(`⚠️ ${errorMsg}`);
        this.addMessage('ai', errorMsg);

        // Auto-retry for recoverable errors
        if (['no-speech', 'audio-capture'].includes(event.error)) {
            if (this.currentState === this.STATE.LISTENING || this.currentState === this.STATE.LANGUAGE_SELECT) {
                // Restart listening after a short delay
                setTimeout(() => {
                    if (this.currentState === this.STATE.LISTENING || this.currentState === this.STATE.LANGUAGE_SELECT) {
                        this.startListening();
                    }
                }, 1000);
            }
        } else {
            console.error("Speech Error:", event.error);
        }
    }

    handleEnd() {
        // If we are still expecting input and haven't moved to a different state, restart
        if (this.currentState === this.STATE.LISTENING || this.currentState === this.STATE.LANGUAGE_SELECT) {
            // Add a small delay before restarting to prevent immediate re-trigger
            setTimeout(() => {
                if (this.currentState === this.STATE.LISTENING || this.currentState === this.STATE.LANGUAGE_SELECT) {
                    this.startListening();
                }
            }, 100);
        }
    }

    // --- Logic Handlers ---

    async handleLanguageSelection(text) {
        // Enhanced fuzzy matching for language selection
        let selectedLang = null;
        let maxScore = 0;

        for (const [code, lang] of Object.entries(this.languages)) {
            // Check keywords with fuzzy matching
            for (const keyword of lang.keywords) {
                const score = this.fuzzyMatch(text, keyword);
                if (score > maxScore) {
                    maxScore = score;
                    selectedLang = code;
                }
            }
        }

        // Only select if confidence is reasonable
        if (selectedLang && maxScore > 0.6) {
            this.currentLanguage = selectedLang;
            localStorage.setItem('preferredLanguage', selectedLang);
            this.retryCount = 0;

            const langName = this.languages[selectedLang].name;
            const prompts = {
                'en-IN': "Okay, English. What is your name?",
                'hi-IN': "ठीक है, हिंदी। आपका नाम क्या है?",
                'mr-IN': "ठीक आहे, मराठी. तुमचे नाव काय आहे?",
                'te-IN': "సరే, తెలుగు. మీ పేరు ఏమిటి?",
                'ta-IN': "சரி, தமிழ். உங்கள் பெயர் என்ன?",
                'kn-IN': "ಸರಿ, Kannada. ನಿಮ್ಮ ಹೆಸರೇನು?",
                'gu-IN': "બરાબર, ગુજરાતી. તમારું નામ શું છે?",
                'bn-IN': "ঠিক আছে, বাংলা। আপনার নাম কি?",
                'ml-IN': "ശരി, മലയാളം. നിങ്ങളുടെ പേര് എന്താണ്?"
            };

            await this.speak(prompts[selectedLang] || prompts['en-IN']);
            // After speaking, transition to LISTENING and restart recognition
            this.currentState = this.STATE.LISTENING;
            this.startListening();
        } else {
            // Ask again with clear options
            this.retryCount++;
            if (this.retryCount < 3) {
                await this.speak("I didn't quite catch that. Did you mean English, Hindi, Marathi, Telugu, Tamil, Kannada, Gujarati, Bengali, or Malayalam?");
                // Keep LANGUAGE_SELECT state and restart recognition
                this.currentState = this.STATE.LANGUAGE_SELECT;
                this.startListening();
            } else {
                // Default to English after multiple failures
                this.currentLanguage = 'en-IN';
                localStorage.setItem('preferredLanguage', 'en-IN');
                this.retryCount = 0;
                await this.speak("Let's use English. What is your name?");
                // After speaking, transition to LISTENING
                this.currentState = this.STATE.LISTENING;
                this.startListening();
            }
        }
    }

    // Fuzzy string matching for better language detection
    fuzzyMatch(str1, str2) {
        const s1 = str1.toLowerCase();
        const s2 = str2.toLowerCase();

        // Direct substring match
        if (s1.includes(s2) || s2.includes(s1)) return 1.0;

        // Levenshtein-like scoring (simplified)
        let matches = 0;
        for (let char of s2) {
            if (s1.includes(char)) matches++;
        }
        return matches / Math.max(s1.length, s2.length);
    }

    // Helper to get the best available language/voice for TTS
    getBestLanguageForTTS(targetLang) {
        const voices = this.synthesis.getVoices();
        if (voices.length === 0) return targetLang; // Return target if no voices available

        // Try exact match first
        let voice = voices.find(v => v.lang === targetLang);
        if (voice) return targetLang;

        // Try to match language code (e.g., 'hi' from 'hi-IN')
        const langCode = targetLang.split('-')[0];
        voice = voices.find(v => v.lang.startsWith(langCode));
        if (voice) return voice.lang;

        // Default to English if available
        voice = voices.find(v => v.lang.startsWith('en'));
        return voice ? voice.lang : voices[0].lang;
    }

    async handleConversationInput(text) {
        this.currentState = this.STATE.PROCESSING;
        this.setStatus('🧠 Analyzing...');
        this.playPing('process');

        try {
            const contextPayload = {
                page: window.location.pathname.split('/').pop() || 'index.html',
                form_state: this.context.extracted,
                history: this.context.history
            };

            this.context.history.push({ role: "user", content: text });

            // Create a fetch request with proper timeout handling
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout

            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: text,
                    context: contextPayload,
                    language: this.currentLanguage
                }),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`API returned ${response.status}`);
            }

            const data = await response.json();
            console.log('API Response:', data);

            // Validate response has required fields
            if (!data.response) {
                console.error('API missing response field:', data);
                throw new Error('Invalid response format: missing response');
            }
            if (!data.action) {
                console.error('API missing action field:', data);
                throw new Error('Invalid response format: missing action');
            }

            // Update context state
            if (data.extracted_info && Object.keys(data.extracted_info).length > 0) {
                this.context.extracted = { ...this.context.extracted, ...data.extracted_info };
                this.setStatus(`✅ Got: ${Object.keys(data.extracted_info).join(', ')}`);
            }

            // Speak AI response
            this.addMessage('ai', data.response);
            this.context.history.push({ role: "model", content: data.response });
            await this.speak(data.response);

            // Handle Actions
            if (data.action === 'submit_form') {
                this.submitForm();
            } else if (data.action === 'navigate' && data.url) {
                window.location.href = data.url;
            } else {
                // Continue conversation (default action: continue_interview)
                this.currentState = this.STATE.LISTENING;
                this.startListening();
            }

        } catch (e) {
            console.error("Conversation Error:", e.message, e);
            const errorMsg = e.message.includes('API')
                ? "Trouble connecting to AI. Please try again."
                : e.message.includes('Abort')
                    ? "Request timed out. Please try again."
                    : "I didn't understand that. Please repeat.";

            this.addMessage('ai', errorMsg);
            await this.speak(errorMsg);
            this.setStatus('❌ ' + errorMsg);
            this.currentState = this.STATE.LISTENING;
            this.startListening();
        }
    }

    submitForm() {
        this.currentState = this.STATE.SUBMITTING;
        this.setStatus('🚀 Submitting...');

        // Fill the real form if on report page
        if (typeof window.submitDetailedComplaint === 'function') {
            const f = this.context.extracted;
            const conversion = {
                Category: 'issueCategory',
                Location: 'wardName',
                Phone: 'phoneNumber',
                Description: 'complaint',
                Name: 'fullName'
            };

            for (const [key, id] of Object.entries(conversion)) {
                if (f[key] && document.getElementById(id)) {
                    document.getElementById(id).value = f[key];
                }
            }

            window.submitDetailedComplaint();
            this.speak("Complaint submitted successfully!");
        } else {
            window.location.href = 'report.html';
        }
    }

    // --- Helpers ---

    async speak(text, lang) {
        this.currentState = this.STATE.SPEAKING;
        this.setStatus('🔊 Speaking...');
        this.stopListening(); // Ensure mic is off

        // Cancel any ongoing speech first
        if (window.speechSynthesis.speaking) {
            window.speechSynthesis.cancel();
            console.log("Cancelled existing speech");
        }

        return new Promise((resolve) => {
            try {
                // Small delay to ensure cancel completes
                setTimeout(() => {
                    try {
                        const utterance = new SpeechSynthesisUtterance(text);
                        const targetLang = lang || this.currentLanguage;

                        // Get the best available language for TTS
                        utterance.lang = this.getBestLanguageForTTS(targetLang);
                        console.log(`Target language: ${targetLang}, Using: ${utterance.lang}`);

                        // Load and select voice
                        const selectVoice = () => {
                            const voices = window.speechSynthesis.getVoices();
                            console.log(`Available voices: ${voices.length}`);

                            if (voices.length > 0) {
                                // Try exact match first
                                let voice = voices.find(v => v.lang === utterance.lang);

                                // Try language code match if no exact match
                                if (!voice && utterance.lang.includes('-')) {
                                    const langCode = utterance.lang.split('-')[0];
                                    voice = voices.find(v => v.lang.startsWith(langCode));
                                }

                                // If no language match, fall back to default voice instead of strictly trying English/first. 
                                // (the browser will use its default voice on this OS automatically)
                                if (voice) {
                                    utterance.voice = voice;
                                    console.log(`✓ Selected voice: ${voice.name} (${voice.lang})`);
                                } else {
                                    console.log(`Using default browser TTS voice for ${utterance.lang}`);
                                }
                            } else {
                                console.warn('No voices available yet');
                            }
                        };

                        // Select voice with voices already loaded
                        selectVoice();

                        // Also listen for voice changes (voices may load async)
                        window.speechSynthesis.onvoiceschanged = selectVoice;

                        // Set speech properties
                        utterance.rate = 0.95;    // Slightly faster
                        utterance.pitch = 1.0;
                        utterance.volume = 1.0;   // Full volume

                        // Success callback
                        utterance.onstart = () => {
                            console.log('✓ Speech started');
                        };

                        // Completion callback
                        utterance.onend = () => {
                            console.log('✓ Speech completed successfully');
                            window.speechSynthesis.onvoiceschanged = null; // Clean up
                            resolve();
                        };

                        // Error callback
                        utterance.onerror = (event) => {
                            console.error('✗ Speech error:', event.error);
                            window.speechSynthesis.onvoiceschanged = null; // Clean up

                            // Map error codes to messages
                            const errorMap = {
                                'aborted': 'Speech was aborted',
                                'network': 'Network error',
                                'not-allowed': 'Speech not allowed',
                                'no-speech': 'No speech detected',
                                'audio-busy': 'Audio device busy',
                                'synthesis-failed': 'Speech synthesis engine failed or is unsupported on this device/language.',
                                'unknown-error': 'Unknown error'
                            };

                            const errorMsg = errorMap[event.error] || `Error: ${event.error}`;
                            this.setStatus(`⚠️ ${errorMsg}`);
                            console.warn(`Setting status: ${errorMsg}`);

                            // Still resolve to continue flow but make sure we restart listening if we were just trying to talk
                            window.speechSynthesis.cancel();
                            resolve();
                        };

                        // Speak the text
                        console.log(`🔊 Speaking: "${text.substring(0, 50)}..." in ${utterance.lang}`);
                        window.speechSynthesis.speak(utterance);

                        // Safety timeout - resolve after 60 seconds even if speech doesn't complete
                        setTimeout(() => {
                            if (window.speechSynthesis.speaking) {
                                console.warn('Speech timeout - cancelling');
                                window.speechSynthesis.cancel();
                            }
                            resolve();
                        }, 60000);

                    } catch (innerError) {
                        console.error('Error in speak timeout:', innerError);
                        this.setStatus('❌ Speech synthesis error');
                        resolve();
                    }
                }, 50);

            } catch (e) {
                console.error('Speak function error:', e);
                this.setStatus('❌ Speech synthesis error');
                resolve(); // Resolve to continue flow
            }
        });
    }

    setStatus(text) {
        const el = document.getElementById('va-status');
        if (el) {
            el.textContent = text;
            console.log(`Status: ${text}`);

            // Update Avatar ring based on state
            const ring = document.getElementById('va-avatar-ring');
            if (ring) {
                if (text.includes('Listening')) {
                    ring.style.border = '2px solid #4facfe';
                    ring.style.boxShadow = '0 0 15px rgba(79, 172, 254, 0.6)';
                    ring.style.animation = 'avatarPulse 1.5s infinite';
                } else if (text.includes('Speaking')) {
                    ring.style.border = '2px solid #f093fb';
                    ring.style.boxShadow = '0 0 15px rgba(240, 147, 251, 0.6)';
                    ring.style.animation = 'avatarPulse 1s infinite alternate';
                } else {
                    ring.style.border = '2px solid transparent';
                    ring.style.boxShadow = 'none';
                    ring.style.animation = 'none';
                }
            }
        } else {
            console.warn('Status element not found, trying to create it');
            // Create status if it doesn't exist
        }
    }

    addMessage(type, text) {
        const box = document.getElementById('va-messages');
        if (!box) {
            console.warn('Chat message box not found');
            return;
        }

        const d = document.createElement('div');
        d.className = `message ${type}`;
        d.textContent = text;

        // Add styling if not already in CSS
        if (type === 'user') {
            d.style.cssText = 'background: #e3f2fd; padding: 8px 12px; border-radius: 4px; margin: 5px 0; word-wrap: break-word;';
        } else if (type === 'ai') {
            d.style.cssText = 'background: #f5f5f5; padding: 8px 12px; border-radius: 4px; margin: 5px 0; word-wrap: break-word;';
        }

        box.appendChild(d);
        box.scrollTop = box.scrollHeight;
        console.log(`[${type.toUpperCase()}] ${text}`);
    }

    updateWave(active) {
        const el = document.getElementById('va-wave');
        if (el) el.style.display = active ? 'flex' : 'none';

        // Show language flag in footer
        const langEl = document.getElementById('va-lang-hint');
        if (langEl && this.currentState !== this.STATE.WELCOMING) {
            const l = this.languages[this.currentLanguage];
            langEl.textContent = `${l.flag} ${l.name}`;
        }
    }

    showChat() {
        const c = document.getElementById('chatBox');
        if (c) c.style.display = 'flex';
    }

    hideChat() {
        const c = document.getElementById('chatBox');
        if (c) c.style.display = 'none';
    }

    updateBtn(active) {
        const btn = document.getElementById('voiceBtn');
        if (btn) btn.classList.toggle('active', active);
    }

    playPing(type) {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);

        if (type === 'start') {
            osc.frequency.setValueAtTime(600, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(1000, ctx.currentTime + 0.1);
        } else if (type === 'end') {
            osc.frequency.setValueAtTime(800, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + 0.1);
        } else {
            osc.frequency.setValueAtTime(400, ctx.currentTime);
        }

        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);

        osc.start();
        osc.stop(ctx.currentTime + 0.3);
    }
}

// Initialize Global Instance
window.voiceAssistant = new VoiceAssistant();

// Log initialization status
console.log('✅ Voice Assistant loaded and ready');
console.log('Available languages:', Object.keys(window.voiceAssistant.languages));
console.log('Current language:', window.voiceAssistant.currentLanguage);

// Add debug info to check if voices load properly
if (window.speechSynthesis) {
    setTimeout(() => {
        const voices = window.speechSynthesis.getVoices();
        console.log('🎙️ Available Speech Synthesis Voices:', voices.length);
        if (voices.length > 0) {
            console.log('Sample voices:', voices.slice(0, 3).map(v => `${v.name} (${v.lang})`));
        }
    }, 500);
}
