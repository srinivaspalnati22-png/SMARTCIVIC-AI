// Core variables - no default location, wait for GPS
window.lat = null;
window.lon = null;
let map = null,
    heat = null;

// Ultra-resilient API detection
const getApiBase = () => {
    if (location.protocol === 'file:') return 'http://127.0.0.1:5000';
    if (location.port === '5000') return ''; // Internal relative calls
    return `http://${location.hostname}:5000`; // Cross-port or cross-IP calls
};
const API_BASE = getApiBase();

// ============================================================
// MULTILINGUAL TRANSLATION ENGINE (v2 — Robust Text-Node Walk)
// ============================================================

// Map of stored original text nodes so we can restore English
const _originals = new WeakMap();
let _translationInProgress = false;

/**
 * Walk the live DOM and collect every visible text node that has
 * meaningful content (>2 non-space chars), skipping script/style.
 */
function _collectTextNodes(root) {
    const walker = document.createTreeWalker(
        root || document.body,
        NodeFilter.SHOW_TEXT,
        {
            acceptNode(node) {
                const parent = node.parentElement;
                if (!parent) return NodeFilter.FILTER_REJECT;
                const tag = parent.tagName;
                // Skip script, style, input placeholders, selects, code
                if (['SCRIPT','STYLE','NOSCRIPT','OPTION','INPUT','TEXTAREA'].includes(tag))
                    return NodeFilter.FILTER_REJECT;
                // Skip if parent has data-no-translate attribute
                if (parent.closest('[data-no-translate]'))
                    return NodeFilter.FILTER_REJECT;
                const text = node.nodeValue.trim();
                // Must have at least 3 real characters (not just emoji/symbols)
                if (text.length < 3) return NodeFilter.FILTER_SKIP;
                // Skip purely numeric text (IDs, numbers, etc.)
                if (/^[\d\s.,:%+<>-]+$/.test(text)) return NodeFilter.FILTER_SKIP;
                return NodeFilter.FILTER_ACCEPT;
            }
        }
    );

    const nodes = [];
    let node;
    while ((node = walker.nextNode())) nodes.push(node);
    return nodes;
}

/** Restore the page to original English text */
function _restoreEnglish() {
    const allNodes = _collectTextNodes();
    allNodes.forEach(node => {
        if (_originals.has(node)) {
            node.nodeValue = _originals.get(node);
        }
    });
}

function syncLanguageSelector(lang) {
    const selector = document.getElementById('languageSelector');
    if (selector) selector.value = lang;
}

window.changeLanguage = function(lang) {
    localStorage.setItem('siteLanguage', lang);
    syncLanguageSelector(lang);
    if (lang === 'en') {
        _restoreEnglish();
        showToast('Language set to English', 'success');
    } else {
        translatePage(lang);
    }
};

/** Main translation function — calls backend /api/translate_ui */
window.translatePage = async function(targetLang) {
    if (!targetLang || targetLang === 'en') return;
    if (_translationInProgress) return;
    _translationInProgress = true;

    // Collect text nodes from body
    const nodes = _collectTextNodes();
    if (nodes.length === 0) { _translationInProgress = false; return; }

    // Save originals (only first time, so re-translating doesn't drift)
    nodes.forEach(node => {
        if (!_originals.has(node)) {
            _originals.set(node, node.nodeValue);
        }
    });

    // Build payload from ORIGINAL text (avoid translating already-translated text)
    const texts = nodes.map(node => _originals.get(node).trim());

    showToast('🌐 Translating page...', 'info');

    try {
        // Split into chunks of 40 to stay within API limits
        const CHUNK = 40;
        const allTranslations = [];

        for (let i = 0; i < texts.length; i += CHUNK) {
            const chunk = texts.slice(i, i + CHUNK);
            const res = await fetch(API_BASE + '/api/translate_ui', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ texts: chunk, target_language: targetLang })
            });

            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();

            if (data.error) throw new Error(data.error);
            if (!Array.isArray(data.translations)) throw new Error('Bad response format');

            allTranslations.push(...data.translations);
        }

        // Apply translations back to DOM nodes
        nodes.forEach((node, i) => {
            const translated = allTranslations[i];
            if (translated && translated.trim()) {
                // Preserve surrounding whitespace from original
                const orig = node.nodeValue;
                const leadWS = orig.match(/^\s*/)[0];
                const trailWS = orig.match(/\s*$/)[0];
                node.nodeValue = leadWS + translated.trim() + trailWS;
            }
        });

        showToast('✅ Translation complete!', 'success');
    } catch(e) {
        console.error('Translation error:', e);
        showToast('⚠️ Translation failed: ' + e.message, 'error');
        // Restore originals on failure
        _restoreEnglish();
    } finally {
        _translationInProgress = false;
    }
};

/** Called on page load — re-applies saved language preference */
function initLanguageSystem() {
    const savedLang = localStorage.getItem('siteLanguage');
    if (!savedLang || savedLang === 'en') return;

    const applyTranslation = () => {
        syncLanguageSelector(savedLang);
        // Slight delay to let dynamic content render first
        setTimeout(() => translatePage(savedLang), 600);
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', applyTranslation);
    } else {
        applyTranslation();
    }
}

initLanguageSystem();

// Theme Management
function initTheme() {
    const theme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', theme);
}

function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    showToast(`Switched to ${next} mode`);
}

// Toast Notification System
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <div style="display: flex; align-items: center; gap: 12px;">
            <span style="font-size: 20px;">${getToastIcon(type)}</span>
            <span>${message}</span>
        </div>
    `;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function getToastIcon(type) {
    const icons = {
        success: '✅',
        error: '❌',
        warning: '⚠️',
        info: 'ℹ️'
    };
    return icons[type] || icons.info;
}

// Map Initialization
function initMap() {
    // Don't initialize map without valid coordinates
    if (!window.lat || !window.lon) {
        console.log('Waiting for GPS location before initializing map...');
        const mapDiv = document.getElementById('map');
        if (mapDiv) {
            mapDiv.innerHTML = `
                <div style="display: flex; align-items: center; justify-content: center; height: 100%; background: var(--bg-2); border-radius: 20px; flex-direction: column; gap: 16px;">
                    <div style="font-size: 3rem; animation: pulse 2s infinite;">📍</div>
                    <div style="font-size: 1.2rem; font-weight: 700; color: var(--text);">Waiting for GPS Location...</div>
                    <div style="font-size: 0.9rem; color: var(--muted);">Click "Use My Location" button to detect your position</div>
                </div>
            `;
        }
        return;
    }

    if (document.getElementById('map')) {
        const streetTiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        });

        const satelliteTiles = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
        });

        if (!map) {
            map = L.map('map', {
                center: [window.lat, window.lon],
                zoom: 15,
                layers: [streetTiles]
            });

            const baseMaps = {
                "Street View": streetTiles,
                "Satellite (Village View)": satelliteTiles
            };
            L.control.layers(baseMaps).addTo(map);

            // Click to set location
            map.on('click', (e) => {
                window.lat = e.latlng.lat;
                window.lon = e.latlng.lng;
                window.selectedLatitude = e.latlng.lat;
                window.selectedLongitude = e.latlng.lng;
                updateLocationMarker();
                showToast('Location updated via map', 'info');
            });
        } else {
            map.setView([window.lat, window.lon], 15);
        }

        updateLocationMarker();
        setTimeout(() => map.invalidateSize(), 300);
    }
}

async function updateLocationMarker() {
    if (!map) return;

    // Clear existing markers
    map.eachLayer(l => { if (l instanceof L.Marker) map.removeLayer(l); });

    const marker = L.marker([window.lat, window.lon]).addTo(map);

    // Fetch real-time ward/village info for the "Real View"
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${window.lat}&lon=${window.lon}&zoom=18&addressdetails=1`);
        const data = await res.json();
        const addr = data.address;
        const village = addr.village || addr.town || addr.suburb || addr.neighbourhood || addr.residential;
        const mandal = addr.county || addr.state_district || "";
        const wardNum = addr.neighbourhood && addr.neighbourhood.includes('Ward') ? addr.neighbourhood : "";

        let placeName = village || "Unknown Area";
        if (mandal) placeName += `, ${mandal}`;

        marker.bindPopup(`
            <div style="text-align: center; font-family: 'Inter', sans-serif;">
                <div style="font-weight: bold; color: var(--accent-1); font-size: 1.1rem; margin-bottom: 4px;">📍 Current Ward/Village</div>
                <div style="font-size: 1rem; color: var(--text);">${placeName}</div>
                ${wardNum ? `<div style="font-size: 0.9rem; color: var(--accent-2);">${wardNum}</div>` : ''}
                <div style="margin-top: 8px; font-size: 0.75rem; background: rgba(16, 185, 129, 0.1); color: var(--success); padding: 4px 8px; border-radius: 4px;">🎯 Real-time Precision</div>
            </div>
        `).openPopup();

        // Also update session info if on report page
        const wardBadge = document.getElementById('currentWardInfo');
        if (wardBadge) {
            wardBadge.innerHTML = `📍 ${placeName}${wardNum ? ` - ${wardNum}` : ''}`;
            wardBadge.style.display = 'inline-block';
        }
    } catch (e) {
        marker.bindPopup('Your Location').openPopup();
    }
}

// Geolocation
function usePreciseGPS() {
    showToast('Requesting Precise GPS...', 'info');
    navigator.geolocation.getCurrentPosition(
        p => {
            window.lat = p.coords.latitude;
            window.lon = p.coords.longitude;
            window.selectedLatitude = p.coords.latitude;
            window.selectedLongitude = p.coords.longitude;
            initMap();
            showToast('Precise location detected', 'success');
        },
        err => {
            showToast('GPS Error. Please search manually.', 'error');
        },
        { enableHighAccuracy: true, timeout: 10000 }
    );
}

// Auto-track current location with full details
async function autoTrackCurrentLocation() {
    // Show loading state
    const wardBadge = document.getElementById('currentWardInfo');
    if (wardBadge) {
        wardBadge.innerHTML = '📍 Detecting your location...';
        wardBadge.style.display = 'inline-flex';
    }

    showToast('🛰️ Activating GPS...', 'info');

    // Check if geolocation is supported
    if (!navigator.geolocation) {
        showToast('❌ Geolocation is not supported by your browser', 'error');
        if (wardBadge) wardBadge.style.display = 'none';
        return;
    }

    try {
        // Get high-accuracy position
        const position = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(
                resolve,
                reject,
                {
                    enableHighAccuracy: true,
                    timeout: 15000,
                    maximumAge: 0
                }
            );
        });

        // Update coordinates
        window.lat = position.coords.latitude;
        window.lon = position.coords.longitude;
        window.selectedLatitude = position.coords.latitude;
        window.selectedLongitude = position.coords.longitude;

        // Update or initialize map with zoom
        if (map) {
            map.setView([window.lat, window.lon], 17); // Zoom level 17 for very detailed view
        } else {
            initMap();
        }

        // Update marker immediately
        updateLocationMarker();

        showToast('📍 Location detected! Fetching address...', 'info');

        // Reverse geocode to get location name
        try {
            const res = await fetch(
                `https://nominatim.openstreetmap.org/reverse?format=json&lat=${window.lat}&lon=${window.lon}&zoom=18&addressdetails=1`
            );
            const data = await res.json();

            if (data && data.address) {
                const addr = data.address;

                // Extract ward/area name
                const wardName = addr.village ||
                    addr.town ||
                    addr.suburb ||
                    addr.neighbourhood ||
                    addr.residential ||
                    addr.city ||
                    addr.municipality ||
                    'Current Location';

                const mandal = addr.county || addr.state_district || '';
                const district = addr.state || '';

                // Auto-fill ward name field
                const wardInput = document.getElementById('wardName');
                if (wardInput) {
                    wardInput.value = wardName;
                }

                // Update location badge
                if (wardBadge) {
                    let locationText = `📍 ${wardName}`;
                    if (mandal) locationText += `, ${mandal}`;
                    wardBadge.innerHTML = locationText;
                    wardBadge.style.display = 'inline-flex';
                    wardBadge.style.background = 'linear-gradient(135deg, rgba(67, 233, 123, 0.15), rgba(56, 249, 215, 0.15))';
                    wardBadge.style.borderColor = 'var(--success)';
                }

                // Show detailed success message
                let locationDetails = wardName;
                if (mandal) locationDetails += `, ${mandal}`;
                if (district) locationDetails += `, ${district}`;

                showToast(`✅ Location: ${locationDetails}`, 'success');

                // Also update map popup
                if (map) {
                    map.eachLayer(l => {
                        if (l instanceof L.Marker) {
                            l.bindPopup(`
                            <div style="text-align: center; font-family: 'Inter', sans-serif;">
                                <div style="font-weight: bold; color: var(--success); font-size: 1.1rem; margin-bottom: 4px;">📍 Your Current Location</div>
                                <div style="font-size: 1rem; color: var(--text);">${wardName}</div>
                                ${mandal ? `<div style="font-size: 0.9rem; color: var(--accent-2);">${mandal}</div>` : ''}
                                <div style="margin-top: 8px; font-size: 0.75rem; background: rgba(67, 233, 123, 0.1); color: var(--success); padding: 4px 8px; border-radius: 4px;">🎯 GPS Accuracy: ${Math.round(position.coords.accuracy)}m</div>
                            </div>
                        `).openPopup();
                        }
                    });
                }

            } else {
                showToast('✓ Location detected (coordinates saved)', 'success');
                if (wardBadge) {
                    wardBadge.innerHTML = `📍 Location: ${window.lat.toFixed(4)}, ${window.lon.toFixed(4)}`;
                }
            }

        } catch (geoError) {
            console.error('Reverse geocoding error:', geoError);
            showToast('✓ GPS coordinates saved', 'success');
            if (wardBadge) {
                wardBadge.innerHTML = `📍 GPS: ${window.lat.toFixed(4)}, ${window.lon.toFixed(4)}`;
            }
        }

    } catch (error) {
        console.error('Geolocation error:', error);

        if (wardBadge) wardBadge.style.display = 'none';

        // Provide specific error messages
        if (error.code === 1) {
            showToast('❌ Location access denied. Please allow location access in your browser settings.', 'error');
        } else if (error.code === 2) {
            showToast('❌ Location unavailable. Please check your GPS/network connection.', 'error');
        } else if (error.code === 3) {
            showToast('❌ Location request timed out. Please try again.', 'error');
        } else {
            showToast('❌ Unable to detect location. You can click on the map or search instead.', 'error');
        }
    }
}

// Search for village/mandal
async function searchLocation(query) {
    const q = query || document.getElementById('mapSearchInput')?.value;
    if (!q || !q.trim()) {
        showToast('Please enter a location to search', 'warning');
        return;
    }

    // Show loading state
    showToast('Searching for location...', 'info');

    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q.trim())}`);
        const data = await res.json();

        if (data && data.length > 0) {
            const location = data[0];

            // Update global coordinates
            window.lat = parseFloat(location.lat);
            window.lon = parseFloat(location.lon);

            // Update selected coordinates for form submission
            window.selectedLatitude = window.lat;
            window.selectedLongitude = window.lon;

            // Update or initialize map with proper zoom
            if (map) {
                map.setView([window.lat, window.lon], 16); // Zoom level 16 for better detail
                updateLocationMarker();
            } else {
                initMap();
            }

            // Auto-fill ward name field
            const wardInput = document.getElementById('wardName');
            if (wardInput && location.address) {
                const addr = location.address;
                const wardName = addr.village ||
                    addr.town ||
                    addr.suburb ||
                    addr.neighbourhood ||
                    addr.residential ||
                    addr.city ||
                    location.display_name.split(',')[0];
                wardInput.value = wardName;
            }

            // Show success message with location name
            const locationName = location.display_name.split(',').slice(0, 2).join(',');
            showToast(`✓ Found: ${locationName}`, 'success');

        } else {
            showToast('Location not found. Try a different search term or nearby area.', 'warning');
        }
    } catch (e) {
        console.error('Search error:', e);
        showToast('Search service unavailable. Please try again later.', 'error');
    }
}

// Initial GPS detection on page load
navigator.geolocation.getCurrentPosition(
    p => {
        window.lat = p.coords.latitude;
        window.lon = p.coords.longitude;
        window.selectedLatitude = p.coords.latitude;
        window.selectedLongitude = p.coords.longitude;
        initMap();
        showToast('✓ Your location detected', 'success');
    },
    err => {
        // GPS failed - don't use any default, wait for user action
        console.warn('Initial GPS detection failed:', err.message);

        // Show map in waiting state
        initMap();

        // Show prominent message
        showToast('📍 Location needed! Click "Use My Location" button to detect your position.', 'warning');

        // If on report page, show the badge with a prompt
        const wardBadge = document.getElementById('currentWardInfo');
        if (wardBadge) {
            wardBadge.innerHTML = '⚠️ Location Required - Click "Use My Location" button';
            wardBadge.style.display = 'inline-flex';
            wardBadge.style.background = 'linear-gradient(135deg, rgba(251, 191, 36, 0.15), rgba(245, 158, 11, 0.15))';
            wardBadge.style.borderColor = 'var(--warning)';
        }
    },
    {
        enableHighAccuracy: true,
        timeout: 8000,
        maximumAge: 30000  // Accept cached position if less than 30 seconds old
    }
);

// Complaint Analysis
async function analyze() {
    const cEl = document.getElementById('complaint');
    const sEl = document.getElementById('severity');
    const phoneEl = document.getElementById('phone');

    if (!cEl || !cEl.value.trim()) {
        showToast('Please enter a complaint description', 'error');
        return { error: 'Empty description' };
    }

    const d = new FormData();
    d.append('complaint', cEl.value);
    d.append('severity', sEl ? sEl.value : 'Medium');
    d.append('lat', window.lat);
    d.append('lon', window.lon);
    d.append('phone', phoneEl ? phoneEl.value : '');

    showResult('<div class="loading"></div> Analyzing your complaint...');

    try {
        const res = await fetch(`${API_BASE}/analyze`, { method: 'POST', body: d });
        const x = await res.json();

        const resultDiv = document.getElementById('result');
        if (resultDiv) {
            resultDiv.innerHTML = `
                <div style="animation: fadeInUp 0.6s ease;">
                    <h3 style="margin-bottom: 16px; color: var(--accent-1);">🧾 Complaint Receipt</h3>
                    <div style="display: grid; gap: 12px;">
                        <div><strong>ID:</strong> <span style="color: var(--accent-2);">${x.id}</span></div>
                        <div><strong>Issue:</strong> ${x.category}</div>
                        <div><strong>Department:</strong> ${x.authority}</div>
                        <div><strong>Priority:</strong> <span class="badge" style="background: ${getPriorityColor(x.priority)}">${x.priority}</span></div>
                        <div><strong>Ward:</strong> ${x.ward}</div>
                        <div><strong>Status:</strong> <span style="color: var(--success);">${x.status}</span></div>
                    </div>
                </div>
            `;
        }

        showToast('Complaint submitted successfully!', 'success');

        // Clear form (except on report.html where we show results side-by-side)
        if (!location.pathname.includes('report.html')) {
            if (cEl) cEl.value = '';
            // if (phoneEl) phoneEl.value = ''; // keep phone for convenience
        }

        return x;
    } catch (e) {
        if (resultDiv) resultDiv.innerText = '⚠️ Submission failed — server unreachable';
        showToast('Failed to submit complaint', 'error');
        return { error: e.message };
    }
}

function getPriorityColor(priority) {
    const colors = {
        'HIGH': 'var(--danger)',
        'MEDIUM': 'var(--warning)',
        'LOW': 'var(--success)'
    };
    return colors[priority] || 'var(--muted)';
}

// Image Upload
async function upload() {
    const img = document.getElementById('image');
    if (!img || !img.files || !img.files[0]) {
        showToast('Please choose an image', 'error');
        return;
    }

    const d = new FormData();
    d.append('image', img.files[0]);

    showResult('<div class="loading"></div> Analyzing image...');

    try {
        const res = await fetch(`${API_BASE}/image`, { method: 'POST', body: d });
        const j = await res.json();
        showResult(`
            <div style="animation: fadeInUp 0.6s ease;">
                <h3>📸 Image Analysis</h3>
                <p><strong>Detected Issue:</strong> ${j.category}</p>
                <p><strong>Responsible Authority:</strong> ${j.authority}</p>
            </div>
        `);
        showToast('Image analyzed successfully!', 'success');
    } catch (e) {
        showResult('❌ Image upload failed');
        showToast('Failed to analyze image', 'error');
    }
}

// Heatmap
async function loadHeatmap() {
    if (!map) {
        showToast('Map not initialized', 'error');
        return;
    }

    try {
        const r = await fetch(`${API_BASE}/heatmap`);
        const p = await r.json();

        if (heat) map.removeLayer(heat);
        heat = L.heatLayer(p, { radius: 25, blur: 15, maxZoom: 17 }).addTo(map);

        showResult(`
            <div style="animation: fadeInUp 0.6s ease;">
                <h3>🗺️ Heatmap Loaded</h3>
                <p>Showing ${p.length} complaint locations</p>
            </div>
        `);
        showToast('Heatmap loaded successfully', 'success');
    } catch (e) {
        showResult('❌ Unable to load heatmap');
        showToast('Failed to load heatmap', 'error');
    }
}

// Metrics
async function loadMetrics() {
    try {
        const r = await fetch(`${API_BASE}/metrics`);
        const m = await r.json();

        showResult(`
            <div style="animation: fadeInUp 0.6s ease;">
                <h3 style="margin-bottom: 20px;">📊 System Metrics</h3>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 16px;">
                    <div class="stat">
                        <div class="num">${m.nlp_accuracy}%</div>
                        <div class="label">NLP Accuracy</div>
                    </div>
                    <div class="stat">
                        <div class="num">${m.cv_confidence}</div>
                        <div class="label">CV Confidence</div>
                    </div>
                    <div class="stat">
                        <div class="num">${m.fusion_accuracy}</div>
                        <div class="label">Fusion Accuracy</div>
                    </div>
                </div>
            </div>
        `);
        showToast('Metrics loaded successfully', 'success');
    } catch (e) {
        showResult('❌ Unable to fetch metrics');
        showToast('Failed to load metrics', 'error');
    }
}

// Voice Recognition
function voice() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
        showToast('Voice recognition not supported in this browser', 'error');
        return;
    }

    let r = new SpeechRecognition();
    r.lang = 'en-IN';

    r.onstart = () => {
        showToast('Listening... Speak now', 'info');
    };

    r.onresult = e => {
        const t = e.results[0][0].transcript;
        const c = document.getElementById('complaint');
        if (c) {
            c.value = t;
            showToast('Voice input captured successfully', 'success');
        }
    };

    r.onerror = () => {
        showToast('Voice recognition failed', 'error');
    };

    r.start();
}

// Show Result
function showResult(html) {
    const el = document.getElementById('result');
    if (el) {
        el.innerHTML = html;
        el.style.display = 'block';
    }
}

// Admin Functions
async function loadComplaints() {
    try {
        const r = await fetch(`${API_BASE}/admin/complaints`);
        const data = await r.json();

        const table = document.getElementById('table');
        if (!table) return;

        let html = `
            <tr>
                <th>ID</th>
                <th>Issue</th>
                <th>Priority</th>
                <th>Ward</th>
                <th>Phone</th>
                <th>Status</th>
                <th>Update</th>
            </tr>
        `;

        data.forEach(c => {
            html += `
                <tr>
                    <td><code>${c.id}</code></td>
                    <td>${c.category}</td>
                    <td><span class="badge" style="background: ${getPriorityColor(c.priority)}">${c.priority || '-'}</span></td>
                    <td>${c.ward || '-'}</td>
                    <td>${c.phone || '-'}</td>
                    <td><span style="color: ${getStatusColor(c.status)}">${c.status}</span></td>
                    <td>
                        <select onchange="updateComplaint('${c.id}', this.value)" style="padding: 8px 12px;">
                            <option ${c.status === 'Submitted' ? 'selected' : ''}>Submitted</option>
                            <option ${c.status === 'In Progress' ? 'selected' : ''}>In Progress</option>
                            <option ${c.status === 'Resolved' ? 'selected' : ''}>Resolved</option>
                        </select>
                    </td>
                </tr>
            `;
        });

        table.innerHTML = html;
        showToast(`Loaded ${data.length} complaints`, 'success');
    } catch (e) {
        showToast('Failed to load complaints', 'error');
    }
}

function getStatusColor(status) {
    const colors = {
        'Submitted': 'var(--warning)',
        'In Progress': 'var(--accent-1)',
        'Resolved': 'var(--success)'
    };
    return colors[status] || 'var(--muted)';
}

async function updateComplaint(id, status) {
    try {
        await fetch(`${API_BASE}/admin/update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, status })
        });
        showToast(`Complaint ${id} updated to ${status}`, 'success');
        loadComplaints();
    } catch (e) {
        showToast('Failed to update complaint', 'error');
    }
}

// Search and Filter
function searchComplaints() {
    const input = document.getElementById('searchInput');
    const filter = input.value.toUpperCase();
    const table = document.getElementById('table');
    const tr = table.getElementsByTagName('tr');

    for (let i = 1; i < tr.length; i++) {
        let txtValue = tr[i].textContent || tr[i].innerText;
        if (txtValue.toUpperCase().indexOf(filter) > -1) {
            tr[i].style.display = '';
        } else {
            tr[i].style.display = 'none';
        }
    }
}

// Header Scroll Effect
window.addEventListener('scroll', () => {
    const header = document.querySelector('.site-header');
    if (header) {
        if (window.scrollY > 50) {
            header.classList.add('scrolled');
        } else {
            header.classList.remove('scrolled');
        }
    }
});

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initMap(); // Ensure map starts up

    // Auto-load admin complaints if on admin page
    if (window.location.pathname.includes('admin.html')) {
        loadComplaints();
        setInterval(loadComplaints, 30000);
    }

    // Auto-load heatmap if on index page
    if (window.location.pathname.includes('index.html') || window.location.pathname.endsWith('/')) {
        // Wait slightly for map to init
        setTimeout(() => {
            loadHeatmap();
            loadMetrics();
        }, 1000);
    }
});

// Detailed complaint submission for report page
async function submitToGovernment(formData) {
    console.log('Submitting to government:', formData);

    // Validate required fields
    if (!formData.phone || formData.phone.length !== 10) {
        showToast('Please provide a valid 10-digit phone number', 'error');
        return;
    }

    if (!formData.category) {
        showToast('Please select a complaint category', 'error');
        return;
    }

    if (!formData.complaint || formData.complaint.trim().length < 10) {
        showToast('Please provide a detailed description (at least 10 characters)', 'error');
        return;
    }

    // Check if location is available
    const latitude = formData.latitude || window.selectedLatitude || window.lat;
    const longitude = formData.longitude || window.selectedLongitude || window.lon;

    if (!latitude || !longitude) {
        showToast('📍 Location required! Please click "Use My Location" button to detect your position.', 'error');
        return;
    }

    try {
        // Show loading state
        showToast('Submitting your report...', 'info');

        // Prepare form data for backend
        const fd = new FormData();
        fd.append('complaint', formData.complaint);
        fd.append('severity', formData.severity || 'MEDIUM');
        fd.append('phone', formData.phone);
        fd.append('lat', latitude);
        fd.append('lon', longitude);

        // Add optional fields
        if (formData.email) fd.append('email', formData.email);
        if (formData.name) fd.append('name', formData.name);
        if (formData.ward) fd.append('ward', formData.ward);
        if (formData.landmark) fd.append('landmark', formData.landmark);
        if (formData.address) fd.append('address', formData.address);

        // Add uploaded photos if available
        if (typeof window.getUploadedFiles === 'function') {
            const files = window.getUploadedFiles();
            files.forEach((file, index) => {
                fd.append('images', file);
            });
        }

        // Submit to backend
        const response = await fetch(`${API_BASE}/analyze`, {
            method: 'POST',
            body: fd
        });

        const result = await response.json();

        if (result.id) {
            // SUCCESS! Display comprehensive result
            const resultDiv = document.getElementById('result');
            if (resultDiv) {
                resultDiv.style.display = 'block';
                resultDiv.innerHTML = `
                    <div style="animation: fadeInUp 0.8s ease; text-align: center;">
                        <div style="font-size: 4rem; margin-bottom: 16px;">✅</div>
                        <h2 style="color: var(--success); font-size: 2rem; font-weight: 900; margin-bottom: 20px;">
                            Report Submitted Successfully!
                        </h2>
                        
                        <div style="background: linear-gradient(135deg, rgba(67, 233, 123, 0.15), rgba(56, 249, 215, 0.15)); 
                                    border: 2px solid var(--success); border-radius: 16px; padding: 24px; margin: 20px 0; text-align: left;">
                            <h3 style="font-size: 1.3rem; font-weight: 800; margin-bottom: 16px; color: var(--text);">
                                📋 Complaint Details
                            </h3>
                            <div style="display: grid; gap: 12px;">
                                <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid var(--glass-border);">
                                    <strong>Complaint ID:</strong>
                                    <span style="color: var(--accent-1); font-weight: 700; font-size: 1.1rem;">${result.id}</span>
                                </div>
                                <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid var(--glass-border);">
                                    <strong>Category:</strong>
                                    <span>${result.category || formData.category}</span>
                                </div>
                                <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid var(--glass-border);">
                                    <strong>Priority:</strong>
                                    <span class="badge" style="background: ${getPriorityColor(result.priority || formData.severity)}; padding: 6px 12px; border-radius: 20px; font-weight: 700;">
                                        ${result.priority || formData.severity}
                                    </span>
                                </div>
                                <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid var(--glass-border);">
                                    <strong>Department:</strong>
                                    <span>${result.authority || 'Municipal Corporation'}</span>
                                </div>
                                <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid var(--glass-border);">
                                    <strong>Ward/Area:</strong>
                                    <span>${result.ward || formData.ward || 'Auto-detected'}</span>
                                </div>
                                <div style="display: flex; justify-content: space-between; padding: 8px 0;">
                                    <strong>Status:</strong>
                                    <span style="color: var(--success); font-weight: 700;">Submitted</span>
                                </div>
                            </div>
                        </div>
                        
                        <div style="background: rgba(102, 126, 234, 0.1); border-radius: 12px; padding: 20px; margin: 20px 0;">
                            <div style="font-size: 1.5rem; margin-bottom: 8px;">📱</div>
                            <p style="font-size: 1rem; font-weight: 600; margin: 0; line-height: 1.6;">
                                You will receive updates at <strong>${formData.phone}</strong><br>
                                about the progress of your complaint.
                            </p>
                        </div>
                        
                        <a href="https://wa.me/91${formData.phone}?text=${encodeURIComponent('🏛️ SmartCivic Complaint ID: ' + result.id + ' - ' + (result.category || formData.category) + '. Status: Submitted. Track at: smartcivic.in/track')}" 
                           target="_blank" 
                           style="display: flex; align-items: center; justify-content: center; gap: 12px; 
                                  background: linear-gradient(135deg, #25D366, #128C7E); 
                                  color: white; padding: 16px 24px; border-radius: 12px; 
                                  text-decoration: none; font-weight: 700; font-size: 1.1rem;
                                  margin: 20px 0; box-shadow: 0 4px 15px rgba(37, 211, 102, 0.3);">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
                                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                            </svg>
                            📲 Save Complaint to WhatsApp
                        </a>
                        
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 24px;">
                            <a href="track.html" class="btn secondary" style="text-decoration: none; text-align: center; padding: 16px;">
                                📊 Track Status
                            </a>
                            <button onclick="window.location.reload()" class="btn primary" style="padding: 16px;">
                                ➕ Report Another Issue
                            </button>
                        </div>
                    </div>
                `;

                // Scroll to result
                resultDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }

            // Show success toast
            showToast(`✅ Complaint ${result.id} submitted successfully!`, 'success');

            // Also update location marker if on map
            if (window.selectedLatitude && window.selectedLongitude) {
                window.lat = window.selectedLatitude;
                window.lon = window.selectedLongitude;
            }

        } else if (result.error) {
            showToast(`Error: ${result.error}`, 'error');
            console.error('Submission error:', result.error);
        } else {
            showToast('Unexpected response from server', 'error');
            console.error('Unexpected response:', result);
        }

    } catch (error) {
        console.error('Submission failed:', error);
        showToast('Failed to submit complaint. Please check your connection and try again.', 'error');

        const resultDiv = document.getElementById('result');
        if (resultDiv) {
            resultDiv.style.display = 'block';
            resultDiv.innerHTML = `
                <div style="text-align: center; padding: 32px;">
                    <div style="font-size: 3rem; margin-bottom: 16px;">⚠️</div>
                    <h3 style="color: var(--danger); margin-bottom: 12px;">Submission Failed</h3>
                    <p class="muted" style="margin-bottom: 20px;">
                        Unable to connect to server. Please check your internet connection and try again.
                    </p>
                    <button onclick="window.location.reload()" class="btn primary">
                        Try Again
                    </button>
                </div>
            `;
        }
    }
}

// Store selected location coordinates
window.selectedLatitude = null;
window.selectedLongitude = null;

// Export functions for inline use
window.analyze = analyze;
window.upload = upload;
window.loadHeatmap = loadHeatmap;
window.loadMetrics = loadMetrics;
window.voice = voice;
window.toggleTheme = toggleTheme;
window.updateComplaint = updateComplaint;
window.searchComplaints = searchComplaints;
window.showToast = showToast;
window.updateLocationMarker = updateLocationMarker;
window.searchLocation = searchLocation;
window.usePreciseGPS = usePreciseGPS;
window.autoTrackCurrentLocation = autoTrackCurrentLocation;
window.initMap = initMap;
window.submitToGovernment = submitToGovernment;