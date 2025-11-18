// Import Firebase modules
// Note: These URLs work in a browser module script.
// For a build setup, you'd use 'firebase/app', 'firebase/auth', etc.
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { 
    getAuth, 
    signInWithEmailAndPassword, 
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { 
    getDatabase, 
    ref, 
    onValue, 
    set,
    goOnline,
    goOffline
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js";

// --- 1. CONFIGURATION ---

// Your Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCusxa4akf9NUQ81a57ch5IJnE4PfBfIQM",
  authDomain: "voice-controlled-automat-e6f26.firebaseapp.com",
  projectId: "voice-controlled-automat-e6f26",
  storageBucket: "voice-controlled-automat-e6f26.firebasestorage.app",
  messagingSenderId: "372351351604",
  appId: "1:372351351604:web:9226bf062b121251700361",
  measurementId: "G-VMT7S9MBLD"
};

// Your Auth credentials
const email = "parthv.nexinnovation.hap.dashboard@gmail.com";
const password = "parthv.nexinnovation.hap.dashboard.0416";

// Firebase app references
let app;
let auth;
let db;

// In-memory state for fast access
let deviceStates = {};
let deviceNames = {};
let isAuthReady = false; // Flag to prevent clicks before auth

// DOM Elements
const statusBar = document.getElementById('status-bar');
const relayIDs = ['r1', 'r2', 'r3', 'r4', 'r5', 'r6'];

// --- 2. HELPER FUNCTIONS ---

/**
 * Updates the status bar with a message.
 * @param {string} message - The text to display.
 * @param {string} type - 'info', 'success', or 'error'.
 */
function updateStatus(message, type = 'info') {
    statusBar.textContent = message;
    statusBar.classList.remove('bg-blue-100', 'text-blue-800', 'bg-green-100', 'text-green-800', 'bg-red-100', 'text-red-800');

    if (type === 'success') {
        statusBar.classList.add('bg-green-100', 'text-green-800');
    } else if (type === 'error') {
        statusBar.classList.add('bg-red-100', 'text-red-800');
    } else {
        statusBar.classList.add('bg-blue-100', 'text-blue-800');
    }
}

/**
 * Updates a single switch's UI (box and toggle).
 * @param {string} relayId - The ID of the relay (e.g., 'r1').
 * @param {boolean} state - The new state (true for on, false for off).
 */
function updateSwitchUI(relayId, state) {
    const box = document.getElementById(`box-${relayId}`);
    const checkbox = document.getElementById(`switch-${relayId}`);
    const name = document.getElementById(`name-${relayId}`);
    
    if (!box || !checkbox || !name) return;

    // Update checkbox state
    checkbox.checked = state;

    // Update box and text color
    box.classList.toggle('bg-blue-50', state);
    box.classList.toggle('border-blue-500', state);
    box.classList.toggle('bg-white', !state);
    box.classList.toggle('border-transparent', !state);
    
    name.classList.toggle('text-blue-800', state);
    name.classList.toggle('text-gray-700', !state);
}

/**
 * Updates all device name labels in the UI.
 */
function updateAllDeviceNames() {
    for (const relayId of relayIDs) {
        const nameEl = document.getElementById(`name-${relayId}`);
        if (nameEl) {
            nameEl.textContent = deviceNames[relayId] || relayId.toUpperCase();
        }
    }
}

/**
 * Handles the click event on a switch box for optimistic update.
 * @param {string} relayId - The ID of the relay to toggle.
 */
async function handleSwitchToggle(relayId) {
    if (!isAuthReady || deviceStates[relayId] === undefined) {
        console.log("Auth not ready or state not synced. Click ignored.");
        return; // Don't allow toggles until we have data
    }

    const currentState = deviceStates[relayId];
    const newState = !currentState;

    // 1. Optimistic UI Update (for speed)
    console.log(`[Optimistic] Setting ${relayId} to ${newState}`);
    deviceStates[relayId] = newState; // Update in-memory state
    updateSwitchUI(relayId, newState);
    
    // 2. Update sessionStorage
    sessionStorage.setItem('deviceStates', JSON.stringify(deviceStates));

    // 3. Send to Firebase
    try {
        const switchRef = ref(db, `main_office/${relayId}`);
        await set(switchRef, newState);
        console.log(`[Firebase] Successfully set ${relayId} to ${newState}`);
    } catch (error) {
        console.error(`[Firebase] Error setting ${relayId}:`, error);
        updateStatus(`Error updating ${relayId}. Reverting.`, 'error');
        
        // If write failed, revert state
        // The onValue listener will likely do this, but we can be explicit
        deviceStates[relayId] = currentState;
        sessionStorage.setItem('deviceStates', JSON.stringify(deviceStates));
        updateSwitchUI(relayId, currentState);
    }
}

// --- 3. FIREBASE LISTENERS ---

/**
 * Sets up real-time listeners for switch states and device names.
 */
function initializeRealtimeListeners() {
    // A. Listener for switch states
    const mainOfficeRef = ref(db, 'main_office');
    onValue(mainOfficeRef, (snapshot) => {
        if (snapshot.exists()) {
            const data = snapshot.val();
            console.log("[Firebase] Received state update:", data);
            deviceStates = data;
            sessionStorage.setItem('deviceStates', JSON.stringify(deviceStates));
            
            // Update all UIs to match Firebase
            for (const relayId of relayIDs) {
                updateSwitchUI(relayId, deviceStates[relayId]);
            }
            console.log("... UI updated from FIREBASE states."); // Log for Firebase state update
            updateStatus("Dashboard is live and in sync.", 'success');
        } else {
            console.warn("[Firebase] '/main_office' path does not exist.");
            updateStatus("Connected, but no switch data found.", 'error');
        }
    }, (error) => {
        console.error("[Firebase] State listener error:", error);
        updateStatus("Lost real-time connection to switches.", 'error');
    });

    // B. Listener for device names
    const configNamesRef = ref(db, 'config/device_names');
    onValue(configNamesRef, (snapshot) => {
        if (snapshot.exists()) {
            const names = snapshot.val();
            console.log("[Firebase] Received device names:", names);
            deviceNames = names;
            sessionStorage.setItem('deviceNames', JSON.stringify(deviceNames));
            updateAllDeviceNames();
            console.log("... UI updated from FIREBASE device names."); // Log for Firebase name update
        } else {
            console.warn("[Firebase] '/config/device_names' path does not exist.");
        }
    }, (error) => {
        console.error("[Firebase] Name listener error:", error);
    });
}

// --- 4. INITIALIZATION ---

// This event listener is crucial. It waits for the HTML document
// to be fully loaded before trying to find elements like 'status-bar'.
document.addEventListener('DOMContentLoaded', () => {
    updateStatus("Initializing dashboard...", 'info');

    // --- A. Load from SessionStorage (for fast load) ---
    console.log("[Page Load] DOM loaded. Applying cached states...");
    try {
        const cachedStates = sessionStorage.getItem('deviceStates');
        if (cachedStates) {
            deviceStates = JSON.parse(cachedStates);
            for (const relayId of relayIDs) {
                if (deviceStates[relayId] !== undefined) {
                    updateSwitchUI(relayId, deviceStates[relayId]);
                }
            }
            console.log("[SessionStorage] Loaded states from cache:", deviceStates);
        }
        const cachedNames = sessionStorage.getItem('deviceNames');
        if (cachedNames) {
            deviceNames = JSON.parse(cachedNames);
            updateAllDeviceNames();
            console.log("[SessionStorage] Loaded names from cache:", deviceNames);
        }
    } catch (e) {
        console.error("Error reading from sessionStorage:", e);
        sessionStorage.clear();
    }

    // --- B. Setup Click Listeners ---
    relayIDs.forEach(relayId => {
        const box = document.getElementById(`box-${relayId}`);
        if (box) {
            box.addEventListener('click', () => handleSwitchToggle(relayId));
        }
    });
    
    // --- C. Initialize Firebase ---
    try {
        app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        db = getDatabase(app);
        updateStatus("Connecting to Firebase...", 'info');
        
        // --- D. Handle Authentication ---
        onAuthStateChanged(auth, (user) => {
            if (user) {
                // User is signed in
                console.log("User is authenticated:", user.uid);
                isAuthReady = true;
                goOnline(db); // Ensure DB connection is active
                initializeRealtimeListeners(); // Start listening for data
            } else {
                // User is signed out, attempt to sign in
                console.log("User is not authenticated. Attempting login...");
                isAuthReady = false;
                goOffline(db); // Keep DB offline until auth
                updateStatus("Authenticating...", 'info');
                
                signInWithEmailAndPassword(auth, email, password)
                    .then((userCredential) => {
                        // Sign-in successful.
                        // The onAuthStateChanged listener will fire again with the user.
                        console.log("Login successful.");
                        // We don't need to call initializeRealtimeListeners() here,
                        // the `if (user)` block will handle it.
                    })
                    .catch((error) => {
                        console.error("Firebase Login Error:", error);
                        updateStatus(`Authentication failed: ${error.message}`, 'error');
                    });
            }
        });

    } catch (e) {
        console.error("Error initializing Firebase:", e);
        updateStatus("Could not initialize dashboard. Check console.", 'error');
    }
});

// --- 5. VOICE COMMAND INTEGRATION ---

const voiceBtn = document.getElementById('voice-btn');
const voicePulse = document.getElementById('voice-pulse');
const voiceFeedback = document.getElementById('voice-feedback');

// Check browser support
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

if (SpeechRecognition) {
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.lang = 'en-IN'; // Optimized for Indian English accents
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    // 1. Start Listening
    voiceBtn.addEventListener('click', () => {
        if (!isAuthReady) {
            updateStatus("Wait for connection...", "error");
            return;
        }
        try {
            recognition.start();
        } catch (e) {
            console.log("Recognition already started");
        }
    });

    // 2. UI Updates on Start/End
    recognition.onstart = () => {
        voicePulse.classList.remove('hidden');
        voiceFeedback.textContent = "Listening... (e.g., 'Turn on Light')";
        voiceBtn.classList.add('bg-red-500');
        voiceBtn.classList.remove('bg-blue-600');
    };

    recognition.onend = () => {
        voicePulse.classList.add('hidden');
        voiceBtn.classList.remove('bg-red-500');
        voiceBtn.classList.add('bg-blue-600');
        // Clear feedback after 3 seconds
        setTimeout(() => {
            if (voiceFeedback.textContent.includes("Listening")) {
                voiceFeedback.textContent = ""; 
            }
        }, 3000);
    };

    // 3. Process Result
    recognition.onresult = (event) => {
        const command = event.results[0][0].transcript.toLowerCase().trim();
        voiceFeedback.textContent = `Heard: "${command}"`;
        console.log("[Voice] Command:", command);
        
        processCommand(command);
    };

    // 4. Command Logic
    function processCommand(text) {
        // Determine intent (ON or OFF)
        const turnOn = text.includes('on') || text.includes('start') || text.includes('open');
        const turnOff = text.includes('off') || text.includes('stop') || text.includes('close');

        if (!turnOn && !turnOff) {
            updateStatus("Voice command unclear. Say 'On' or 'Off'.", 'error');
            return;
        }

        // Determine Target Device
        let targetId = null;

        // Check 1: Match against custom names (e.g., "Kitchen")
        for (const [id, name] of Object.entries(deviceNames)) {
            if (name && text.includes(name.toLowerCase())) {
                targetId = id;
                break;
            }
        }

        // Check 2: Match against generic names (e.g., "Switch 1", "Relay 2")
        if (!targetId) {
            relayIDs.forEach((id, index) => {
                const num = index + 1;
                const words = ['one', 'two', 'three', 'four', 'five', 'six'];
                if (text.includes(`switch ${num}`) || 
                    text.includes(`relay ${num}`) || 
                    text.includes(`number ${num}`) ||
                    text.includes(`switch ${words[index]}`)) {
                    targetId = id;
                }
            });
        }

        // Check 3: "All" command
        if (text.includes('all') || text.includes('everything')) {
            updateStatus(`Turning ALL ${turnOn ? 'ON' : 'OFF'}`, 'success');
            relayIDs.forEach(id => controlDeviceSecure(id, turnOn));
            return;
        }

        // Execute
        if (targetId) {
            controlDeviceSecure(targetId, turnOn);
            updateStatus(`Voice: ${deviceNames[targetId] || targetId} turned ${turnOn ? 'ON' : 'OFF'}`, 'success');
        } else {
            updateStatus("Device not found in command.", 'error');
        }
    }

    // Helper to set specific state (unlike toggle)
    function controlDeviceSecure(relayId, targetState) {
        const currentState = deviceStates[relayId];
        
        // Only act if the current state is different from the target state
        if (currentState !== targetState) {
            // We can reuse your existing logic, but we need to ensure we don't just toggle blindly.
            // Since handleSwitchToggle toggles whatever the CURRENT in-memory state is, 
            // and we just verified currentState != targetState, calling handleSwitchToggle will achieve the target.
            handleSwitchToggle(relayId);
        } else {
            console.log(`[Voice] ${relayId} is already ${targetState ? 'ON' : 'OFF'}. No action.`);
        }
    }

} else {
    voiceBtn.style.display = 'none';
    voiceFeedback.textContent = "Voice control not supported in this browser.";
}