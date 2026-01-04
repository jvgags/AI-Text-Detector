/* ========== AI DETECTOR APP.JS ========== */

let history = JSON.parse(localStorage.getItem('ai_history')) || [];
let currentTheme = localStorage.getItem('ai_theme') || 'light';

let OPENROUTER_MODELS = []; 
let modelsLoaded = false;

// Initialization
window.onload = () => {
    applyTheme(currentTheme);
    document.getElementById('themeSelect').value = currentTheme;
    
    // Load saved model selection
    const savedModel = localStorage.getItem('selected_model') || 'anthropic/claude-3.5-sonnet';
    document.getElementById('modelSelect').value = savedModel;
    
    fetchOpenRouterModels();

    renderHistory();
    checkApiKey();
};

// --- OpenRouter Model Management ---

async function fetchOpenRouterModels() {
    if (modelsLoaded) return;

    try {
        showToast('Loading models from OpenRouter...');
        
        const response = await fetch('https://openrouter.ai/api/v1/models', {
            headers: {
                'HTTP-Referer': window.location.origin,
                'X-Title': 'Pym Write'
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch models: ${response.status}`);
        }

        const data = await response.json();
        
        // Transform the API response into our format
        OPENROUTER_MODELS = data.data.map(model => ({
            id: model.id,
            name: model.name,
            provider: extractProvider(model.id),
            contextLength: model.context_length || 0,
            pricing: model.pricing || {},
            isFree: isFreeModel(model.pricing)
        }));

        // Sort models: free first, then by provider
        OPENROUTER_MODELS.sort((a, b) => {
            if (a.isFree && !b.isFree) return -1;
            if (!a.isFree && b.isFree) return 1;
            return a.provider.localeCompare(b.provider);
        });

        modelsLoaded = true;
        populateModelSelect();
        showToast(`Loaded ${OPENROUTER_MODELS.length} models!`);
        
    } catch (error) {
        console.error('Error fetching models:', error);
        showToast('Failed to load models. Using default list.');
        
        // Fallback to a basic list if API fails
        OPENROUTER_MODELS = [
            { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', provider: 'Anthropic', isFree: false },
            { id: 'openai/gpt-4-turbo', name: 'GPT-4 Turbo', provider: 'OpenAI', isFree: false },
            { id: 'openai/gpt-3.5-turbo', name: 'GPT-3.5 Turbo', provider: 'OpenAI', isFree: false },
            { id: 'google/gemini-pro', name: 'Gemini Pro', provider: 'Google', isFree: false },
            { id: 'meta-llama/llama-3-8b-instruct:free', name: 'Llama 3 8B (Free)', provider: 'Meta', isFree: true }
        ];
        modelsLoaded = true;
        populateModelSelect();
    }
}

function extractProvider(modelId) {
    return modelId.split('/')[0].toUpperCase();
}

function isFreeModel(pricing) {
    if (!pricing) return false;
    return parseFloat(pricing.prompt) === 0 && parseFloat(pricing.completion) === 0;
}

function populateModelSelect() {
    const modelSelect = document.getElementById('modelSelect');
    if (!modelSelect) return;
    
    modelSelect.innerHTML = ''; // Clear "Loading..." message

    // 1. Separate models into Free and Paid arrays
    const freeModels = OPENROUTER_MODELS.filter(m => m.isFree);
    const paidModels = OPENROUTER_MODELS.filter(m => !m.isFree);

    // 2. Helper function to create a group
    const createGroup = (label, models) => {
        if (models.length === 0) return null;

        const group = document.createElement('optgroup');
        group.label = label;

        models.forEach(model => {
            const option = document.createElement('option');
            option.value = model.id;
            
            // Format matching your image: Name (free) (Provider)
            const priceTag = model.isFree ? ' (free)' : '';
            option.textContent = `${model.name}${priceTag} (${model.provider})`;
            
            group.appendChild(option);
        });
        return group;
    };

    // 3. Append groups to the select element
    const freeGroup = createGroup('🆓 Free Models', freeModels);
    const paidGroup = createGroup('💰 Paid Models', paidModels);

    if (freeGroup) modelSelect.appendChild(freeGroup);
    if (paidGroup) modelSelect.appendChild(paidGroup);

    // 4. Restore the user's previous selection
    const savedModel = localStorage.getItem('selected_model');
    if (savedModel && OPENROUTER_MODELS.some(m => m.id === savedModel)) {
        modelSelect.value = savedModel;
    }
}

// New function to save the selection
function saveModelSelection(modelValue) {
    localStorage.setItem('selected_model', modelValue);
    showToast("Model preference saved");
}

// --- API Key Management ---
function checkApiKey() {
    const key = localStorage.getItem('hf_token');
    const statusEl = document.getElementById('apiStatus');
    
    if (key && key.trim()) {
        statusEl.textContent = "✓ API Key Saved";
        statusEl.style.color = "var(--success-color)";
    } else {
        statusEl.textContent = "⚠ No API Key (Using Mock Data)";
        statusEl.style.color = "var(--warning-color, #f1c40f)";
    }
}

// --- Theme Logic ---
function openModal() { 
    document.getElementById('apiKeyModal').style.display = 'flex';
    const savedKey = localStorage.getItem('hf_token');
    if (savedKey) {
        document.getElementById('apiKeyInput').value = savedKey;
    }
}

function closeModal() { 
    document.getElementById('apiKeyModal').style.display = 'none'; 
}

function changeTheme(theme) {
    currentTheme = theme;
    applyTheme(theme);
}

function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
}

function saveSettings() {
    const key = document.getElementById('apiKeyInput').value.trim();
    localStorage.setItem('ai_theme', currentTheme);
    if(key) {
        localStorage.setItem('hf_token', key);
        showToast("Settings Saved ✨");
    } else {
        localStorage.removeItem('hf_token');
        showToast("Theme Updated");
    }
    checkApiKey();
    closeModal();
}

// --- Analysis Logic ---
// --- Analysis Logic ---
async function analyzeText() {
    const text = document.getElementById('textInput').value.trim();
    if (text.length < 100) {
        showToast("Text too short for reliable analysis.");
        return;
    }

    const btn = document.getElementById('scanBtn');
    const btnOriginalText = btn.innerText;
    btn.disabled = true;
    
    // Show loading state
    showLoadingState();

    const apiKey = localStorage.getItem('hf_token'); 
    let score;

    if (apiKey && apiKey.trim()) {
        try {
            const result = await callOpenRouterAPI(text, apiKey);
            score = result.score;
            showToast("Analysis complete!");
        } catch (error) {
            console.error("OpenRouter Error:", error);
            showToast("⚠ API Error - Using mock data.");
            
            await new Promise(resolve => setTimeout(resolve, 1000));
            score = Math.random();
        }
    } else {
        await new Promise(resolve => setTimeout(resolve, 1500));
        score = Math.random();
        showToast("Using mock data (no API key)");
    }

    hideLoadingState();
    displayResult(score);
    
    const title = prompt("Give this scan a title (optional):", text.substring(0, 30) + "...");
    const displayTitle = title && title.trim() ? title.trim() : text.substring(0, 35) + "...";
    
    addToHistory(displayTitle, score, text);
    
    btn.innerText = btnOriginalText;
    btn.disabled = false;
}

function showLoadingState() {
    const btn = document.getElementById('scanBtn');
    btn.innerHTML = `
        <span class="loading-spinner"></span>
        <span>Analyzing</span>
        <span class="loading-dots"></span>
    `;
    
    // Show loading overlay
    const loadingOverlay = document.createElement('div');
    loadingOverlay.id = 'loadingOverlay';
    loadingOverlay.className = 'loading-overlay';
    loadingOverlay.innerHTML = `
        <div class="loading-content">
            <div class="loading-circle">
                <div class="loading-bar"></div>
            </div>
            <p class="loading-text">Analyzing text patterns...</p>
            <div class="loading-progress">
                <div class="loading-progress-bar"></div>
            </div>
        </div>
    `;
    document.body.appendChild(loadingOverlay);
    
    // Animate progress bar
    setTimeout(() => {
        const progressBar = document.querySelector('.loading-progress-bar');
        if (progressBar) progressBar.style.width = '100%';
    }, 100);
}

function hideLoadingState() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.style.opacity = '0';
        setTimeout(() => overlay.remove(), 300);
    }
}

async function callOpenRouterAPI(text, apiKey) {
    const API_URL = "https://openrouter.ai/api/v1/chat/completions";
    // Retrieve the saved model or fallback to Claude
    const selectedModel = localStorage.getItem('selected_model') || 'anthropic/claude-3.5-sonnet';
    
    const response = await fetch(API_URL, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            "model": selectedModel, // Using the user's selected model here
            "messages": [
                {
                    "role": "system",
                    "content": "Analyze the provided text and return ONLY a JSON object with 'score' (0-1 float for AI probability)."
                },
                { "role": "user", "content": text }
            ],
            "response_format": { "type": "json_object" }
        })
    });

    if (!response.ok) throw new Error(`API Error: ${response.status}`);
    const data = await response.json();
    const content = JSON.parse(data.choices[0].message.content);
    return { score: content.score };
}

// --- OpenRouter Model Management ---

async function populateModels() {
    const modelSelect = document.getElementById('modelSelect');
    
    try {
        const response = await fetch('https://openrouter.ai/api/v1/models');
        const result = await response.json();
        
        // Clear existing hardcoded options
        modelSelect.innerHTML = '';

        // OpenRouter returns a large list; we can filter for common/high-quality ones
        // or just show the top 50.
        result.data.slice(0, 50).forEach(model => {
            const option = document.createElement('option');
            option.value = model.id;
            option.textContent = `${model.name} (${model.id})`;
            modelSelect.appendChild(option);
        });

        // Set the dropdown to the previously saved model
        const savedModel = localStorage.getItem('selected_model');
        if (savedModel) {
            modelSelect.value = savedModel;
        }
    } catch (error) {
        console.error("Failed to fetch models:", error);
        // Fallback options if the API fails
        modelSelect.innerHTML = '<option value="anthropic/claude-3.5-sonnet">Claude 3.5 Sonnet</option>';
    }
}

async function callHuggingFaceAPI(text, apiKey) {
    // Using Roberta-base-openai-detector model for AI detection
    const API_URL = "https://api-inference.huggingface.co/models/roberta-base-openai-detector";
    
    try {
        const response = await fetch(API_URL, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                inputs: text
            })
        });

        if (!response.ok) {
            let errorMsg = `HTTP ${response.status}`;
            try {
                const errorData = await response.json();
                errorMsg = errorData.error || errorMsg;
            } catch (e) {
                // Couldn't parse error
            }
            throw new Error(errorMsg);
        }

        const result = await response.json();
        
        // Handle model loading state
        if (result.error && result.error.includes("loading")) {
            throw new Error("Model is loading. Please try again in a moment.");
        }
        
        // The model returns labels like "Real" and "Fake"
        // Find the "Fake" (AI-generated) score
        if (Array.isArray(result) && result.length > 0) {
            const fakeLabel = result[0].find(item => item.label === "Fake" || item.label === "LABEL_1");
            return fakeLabel ? fakeLabel.score : 0.5;
        }
        
        return 0.5; // Default fallback
    } catch (error) {
        // Re-throw with more context
        throw new Error(error.message || "Failed to fetch from API");
    }
}

function displayResult(score) {
    const percentage = Math.round(score * 100);
    const resultCard = document.getElementById('resultCard');
    const gauge = document.getElementById('gaugeFill');
    
    resultCard.style.display = "block";
    
    // Update Gauge
    setTimeout(() => { gauge.style.width = percentage + "%"; }, 100);
    gauge.style.background = score > 0.7 ? "var(--error-color)" : (score > 0.4 ? "#f1c40f" : "var(--success-color)");
    
    document.getElementById('aiProb').innerText = percentage + "%";
    
    // Typewriter Verdict
    const verdict = score > 0.7 ? "Likely AI-Generated" : (score > 0.4 ? "Potentially Mixed" : "Likely Human-Written");
    typeWriter(verdict, "verdict");
}

function typeWriter(text, elementId) {
    const el = document.getElementById(elementId);
    el.innerHTML = "";
    let i = 0;
    const speed = currentTheme === 'typewriter' ? 120 : 60;

    function type() {
        if (i < text.length) {
            el.innerHTML += text.charAt(i);
            i++;
            setTimeout(type, speed);
        }
    }
    type();
}

// --- History & Stats ---
function updateStats() {
    const text = document.getElementById('textInput').value.trim();
    const words = text ? text.split(/\s+/).length : 0;
    document.getElementById('wordCount').innerText = words;
}

function addToHistory(label, score, fullText) {
    const item = { 
        id: Date.now(),
        label, 
        score,
        text: fullText,
        date: new Date().toLocaleTimeString() 
    };
    history.unshift(item);
    if (history.length > 8) history.pop();
    localStorage.setItem('ai_history', JSON.stringify(history));
    renderHistory();
}

function loadHistoryItem(id) {
    const item = history.find(h => h.id === id);
    if (!item) return;
    
    document.getElementById('textInput').value = item.text;
    updateStats();
    displayResult(item.score);
    document.querySelector('.editor-area').scrollTop = 0;
    showToast("Scan Loaded");
}

function deleteHistoryItem(id, event) {
    event.stopPropagation();
    if (confirm("Delete this scan?")) {
        history = history.filter(item => item.id !== id);
        localStorage.setItem('ai_history', JSON.stringify(history));
        renderHistory();
        showToast("Scan Deleted");
    }
}

function renameHistoryItem(id, event) {
    event.stopPropagation();
    const item = history.find(h => h.id === id);
    if (!item) return;
    
    const newTitle = prompt("Rename scan:", item.label);
    if (newTitle && newTitle.trim()) {
        item.label = newTitle.trim();
        localStorage.setItem('ai_history', JSON.stringify(history));
        renderHistory();
        showToast("Scan Renamed");
    }
}

function renderHistory() {
    const list = document.getElementById('historyList');
    if (history.length === 0) {
        list.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 20px;">No scans yet</p>';
        return;
    }
    list.innerHTML = history.map(item => `
        <div class="history-item" onclick="loadHistoryItem(${item.id})">
            <div class="hist-info">
                <strong>${item.label}</strong>
                <small>${item.date}</small>
            </div>
            <div class="hist-actions">
                <span class="hist-score">${Math.round(item.score * 100)}%</span>
                <button class="hist-btn" onclick="renameHistoryItem(${item.id}, event)" title="Rename">✏️</button>
                <button class="hist-btn" onclick="deleteHistoryItem(${item.id}, event)" title="Delete">🗑️</button>
            </div>
        </div>
    `).join('');
}

function clearHistory() {
    if (confirm("Clear all scan history?")) {
        history = [];
        localStorage.setItem('ai_history', JSON.stringify(history));
        renderHistory();
        showToast("History Cleared");
    }
}

function clearText() {
    document.getElementById('textInput').value = "";
    document.getElementById('resultCard').style.display = "none";
    updateStats();
}

function showToast(msg) {
    const x = document.getElementById("toast");
    x.innerText = msg;
    x.className = "show";
    setTimeout(() => { x.className = x.className.replace("show", ""); }, 3000);
}