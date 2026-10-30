/**
 * AURELIA COMMAND CENTER - CORE OPERATIONAL ENGINE
 * Milestone 1: Production Runtime
 * Client-Side BYOK Security | Single-Call Structured JSON | Web Speech | Blob Deliverables
 */

(function () {
  'use strict';

  // Storage Identifiers
  const STORAGE_KEY = 'aurelia_system_state';
  const API_KEY_STORAGE = 'aurelia_gemini_api_key';

  // Operational State
  let state = {
    missions: [],
    tasks: [],
    deliverables: [],
    model: 'gemini-1.5-flash'
  };

  let apiKey = '';
  let recognition = null;
  let isListening = false;

  // DOM Elements - Navigation & Status
  const keyIndicator = document.getElementById('key-indicator');
  const voiceIndicator = document.getElementById('voice-indicator');
  const systemReadout = document.getElementById('system-readout');
  const memoryStatusText = document.getElementById('memory-status-text');

  // DOM Elements - Agent Status Pills
  const pillWatch = document.getElementById('pill-watch');
  const pillResearch = document.getElementById('pill-research');
  const pillBusiness = document.getElementById('pill-business');
  const pillBuilder = document.getElementById('pill-builder');

  // DOM Elements - Panels & Lists
  const taskList = document.getElementById('task-list');
  const deliverablesList = document.getElementById('deliverables-list');
  const taskCounter = document.getElementById('task-counter');
  const deliverableCounter = document.getElementById('deliverable-counter');
  const terminalLog = document.getElementById('terminal-log');

  // DOM Elements - Command Bar
  const commandInput = document.getElementById('command-input');
  const sendBtn = document.getElementById('send-btn');
  const micBtn = document.getElementById('mic-btn');

  // DOM Elements - Configuration Modal
  const settingsToggleBtn = document.getElementById('settings-toggle-btn');
  const settingsModal = document.getElementById('settings-modal');
  const modalCloseBtn = document.getElementById('modal-close-btn');
  const apiKeyInput = document.getElementById('api-key-input');
  const modelSelect = document.getElementById('model-select');
  const saveKeyBtn = document.getElementById('save-key-btn');
  const deleteKeyBtn = document.getElementById('delete-key-btn');
  const exportMemoryBtn = document.getElementById('export-memory-btn');
  const importMemoryFile = document.getElementById('import-memory-file');

  // =========================================================================
  // 1. INITIALIZATION & STORAGE ENGINE
  // =========================================================================

  function init() {
    loadKey();
    loadState();
    setupSpeech();
    bindEvents();
    renderAll();
  }

  function loadKey() {
    apiKey = localStorage.getItem(API_KEY_STORAGE) || '';
    if (apiKey) {
      keyIndicator.textContent = 'API KEY: SECURED';
      keyIndicator.className = 'status-badge badge-ok';
      apiKeyInput.value = apiKey;
    } else {
      keyIndicator.textContent = 'API KEY: MISSING';
      keyIndicator.className = 'status-badge badge-warning';
    }
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          state.missions = Array.isArray(parsed.missions) ? parsed.missions : [];
          state.tasks = Array.isArray(parsed.tasks) ? parsed.tasks : [];
          state.deliverables = Array.isArray(parsed.deliverables) ? parsed.deliverables : [];
          state.model = parsed.model || 'gemini-1.5-flash';
          modelSelect.value = state.model;
        }
      }
    } catch (e) {
      logTerminal('SYS_WARN', 'Local memory check failed. Starting clean profile.');
    }
    updateMemoryReadout();
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      updateMemoryReadout();
    } catch (e) {
      logTerminal('SYS_ERR', 'Memory write failed: Local browser storage limit reached.');
    }
  }

  function updateMemoryReadout() {
    const missionCount = state.missions.length;
    memoryStatusText.textContent = `Local Storage: Active (${missionCount} mission${missionCount === 1 ? '' : 's'} recorded)`;
  }

  // =========================================================================
  // 2. EVENT BINDINGS
  // =========================================================================

  function bindEvents() {
    sendBtn.addEventListener('click', handleCommand);
    
    commandInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleCommand();
      }
    });

    micBtn.addEventListener('click', toggleSpeech);

    settingsToggleBtn.addEventListener('click', () => {
      settingsModal.classList.remove('hidden');
    });

    modalCloseBtn.addEventListener('click', () => {
      settingsModal.classList.add('hidden');
    });

    saveKeyBtn.addEventListener('click', () => {
      const inputVal = apiKeyInput.value.trim();
      if (!inputVal) {
        alert('Please enter a valid Gemini API key.');
        return;
      }
      apiKey = inputVal;
      state.model = modelSelect.value;
      localStorage.setItem(API_KEY_STORAGE, apiKey);
      saveState();
      loadKey();
      settingsModal.classList.add('hidden');
      logTerminal('SYS_AUTH', 'Gemini API credential locked in local browser memory.');
    });

    deleteKeyBtn.addEventListener('click', () => {
      if (confirm('Permanently delete the Gemini API Key from this browser?')) {
        apiKey = '';
        localStorage.removeItem(API_KEY_STORAGE);
        apiKeyInput.value = '';
        loadKey();
        settingsModal.classList.add('hidden');
        logTerminal('SYS_AUTH', 'API Key deleted from local browser storage.');
      }
    });

    exportMemoryBtn.addEventListener('click', exportMemory);
    importMemoryFile.addEventListener('change', importMemory);
  }

  // =========================================================================
  // 3. BROWSER WEB SPEECH ENGINE (STT & TTS)
  // =========================================================================

  function setupSpeech() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        isListening = true;
        micBtn.classList.add('btn-mic-active');
        voiceIndicator.textContent = 'VOICE: LISTENING...';
        voiceIndicator.className = 'status-badge badge-ok';
      };

      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        commandInput.value = transcript;
        handleCommand();
      };

      recognition.onerror = () => {
        stopSpeech();
      };

      recognition.onend = () => {
        stopSpeech();
      };
    } else {
      voiceIndicator.textContent = 'VOICE: UNSUPPORTED';
      micBtn.style.display = 'none';
    }
  }

  function toggleSpeech() {
    if (!recognition) return;
    if (isListening) {
      recognition.stop();
    } else {
      try {
        recognition.start();
      } catch (err) {
        stopSpeech();
      }
    }
  }

  function stopSpeech() {
    isListening = false;
    micBtn.classList.remove('btn-mic-active');
    voiceIndicator.textContent = 'VOICE: READY';
    voiceIndicator.className = 'status-badge';
  }

  function speakText(text) {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();
    const selectedVoice = voices.find(v => v.name.includes('Google') && v.lang.startsWith('en')) || voices[0];
    if (selectedVoice) utterance.voice = selectedVoice;
    utterance.rate = 1.05;
    utterance.pitch = 1.0;
    window.speechSynthesis.speak(utterance);
  }

  // =========================================================================
  // 4. PIPELINE: GEMINI DISPATCH & AGENT COORDINATION
  // =========================================================================

  async function handleCommand() {
    const prompt = commandInput.value.trim();
    if (!prompt) return;

    if (!apiKey) {
      logTerminal('SECURITY', 'Action halted. Configure your Gemini API key in Config first.', 'error-entry');
      settingsModal.classList.remove('hidden');
      return;
    }

    commandInput.value = '';
    logTerminal('LORD', prompt, 'user-entry');
    systemReadout.textContent = 'COORDINATING AGENTS...';
    systemReadout.className = 'readout-busy';
    sendBtn.disabled = true;

    try {
      const response = await callGeminiRouter(prompt);
      processResponse(response);
    } catch (error) {
      logTerminal('SYS_ERR', `Execution failed: ${error.message}`, 'error-entry');
    } finally {
      systemReadout.textContent = 'SYSTEM STANDING BY';
      systemReadout.className = 'readout-idle';
      sendBtn.disabled = false;
    }
  }

  async function callGeminiRouter(userDirective) {
    const selectedModel = state.model || 'gemini-1.5-flash';
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${apiKey}`;

    const systemPrompt = `You are AURELIA, an executive AI Command Center coordinating four specialized agents:
1. WATCH: Tracks tasks, schedules, deadlines, and operational risk.
2. RESEARCH: Investigates external questions, verifies data, and notes sources.
3. BUSINESS: Evaluates economics, unit profitability, expenses, and pricing logic.
   - Core pricing rule: Pre-Tax Quote = Total True Cost / (1 - Target Margin %).
   - Verified Estimator Breakdown:
     * Direct Labor = (Onsite Hours + Travel Hours) * Hourly Pay Rate
     * Expenses = Materials * (1 + Handling Markup) + Equipment + (Miles * Mileage Rate)
     * Overhead Burden = Total Hours * Hourly Overhead Rate
     * Contingency Reserve = (Direct Labor + Expenses + Overhead) * Contingency %
     * Total True Cost = Direct Labor + Expenses + Overhead + Contingency
     * Pre-Tax Quote = Total True Cost / (1 - Target Margin %)
     * Sales Tax = Pre-Tax Quote * Tax Rate
     * Total Client Quote = Pre-Tax Quote + Sales Tax
     * Net Business Profit = Pre-Tax Quote - Total True Cost
4. BUILDER: Generates tangible deliverables (CSV spreadsheets, Markdown documentation, JSON schemas, or web code).

CRITICAL REQUIREMENT:
You must respond ONLY with a raw, valid JSON object (no markdown formatting, no code fences, no backticks, no prefix or suffix text) conforming to this JSON structure:
{
  "spoken_summary": "1-2 concise, executive sentences read aloud via text-to-speech.",
  "executive_report": "Comprehensive status report directly addressing Lord.",
  "agent_contributions": {
    "watch": "Task logging and risk assessment notes.",
    "research": "Market context and validation details.",
    "business": "Reconciled numbers, cost floor, margins, and profit breakdown.",
    "builder": "Construction notes on the generated deliverable."
  },
  "task_updates": [
    {
      "id": "TASK-001",
      "title": "Clear task description",
      "status": "completed",
      "assigned_to": "BUILDER"
    }
  ],
  "deliverable": {
    "has_deliverable": true,
    "filename": "Contractor_Estimator.csv",
    "mime_type": "text/csv",
    "content": "Raw string content of the deliverable file"
  }
}
If no deliverable file is required by the directive, set "has_deliverable" to false, "filename" to "", "mime_type" to "", and "content" to "".`;

    const requestPayload = {
      contents: [
        {
          role: 'user',
          parts: [
            { text: systemPrompt },
            { text: `ACTIVE TASKS STATE:\n${JSON.stringify(state.tasks)}\n\nLORD'S DIRECTIVE: ${userDirective}` }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.15,
        responseMimeType: "application/json"
      }
    };

    let response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestPayload)
      });
    } catch (networkErr) {
      throw new Error('Network connection failed. Verify internet connectivity.');
    }

    if (!response.ok) {
      if (response.status === 400) throw new Error('HTTP 400: Bad Request or invalid model payload.');
      if (response.status === 403) throw new Error('HTTP 403: Authentication rejected. Gemini API key is invalid.');
      if (response.status === 429) throw new Error('HTTP 429: Quota exhausted on Gemini free tier. Please wait 60 seconds.');
      if (response.status >= 500) throw new Error(`HTTP ${response.status}: Google API service error.`);
      throw new Error(`Google API returned status ${response.status}`);
    }

    const data = await response.json();
    if (!data.candidates || !data.candidates[0].content || !data.candidates[0].content.parts[0].text) {
      throw new Error('Empty candidate response received from Gemini.');
    }

    let rawOutput = data.candidates[0].content.parts[0].text.trim();
    if (rawOutput.startsWith('```json')) rawOutput = rawOutput.substring(7);
    if (rawOutput.startsWith('```')) rawOutput = rawOutput.substring(3);
    if (rawOutput.endsWith('```')) rawOutput = rawOutput.substring(0, rawOutput.length - 3);

    try {
      return JSON.parse(rawOutput.trim());
    } catch (parseErr) {
      throw new Error('Model produced malformed JSON. Request could not be parsed.');
    }
  }

  function processResponse(res) {
    // 1. Spoken Audio Feedback
    if (res.spoken_summary) {
      speakText(res.spoken_summary);
    }

    // 2. Terminal Logging
    let formattedLog = `<strong>${res.executive_report}</strong>`;
    if (res.agent_contributions) {
      formattedLog += `<br><br><small style="color:var(--text-muted); line-height:1.6;">`;
      if (res.agent_contributions.watch) formattedLog += `&bull; <strong>WATCH:</strong> ${res.agent_contributions.watch}<br>`;
      if (res.agent_contributions.research) formattedLog += `&bull; <strong>RESEARCH:</strong> ${res.agent_contributions.research}<br>`;
      if (res.agent_contributions.business) formattedLog += `&bull; <strong>BUSINESS:</strong> ${res.agent_contributions.business}<br>`;
      if (res.agent_contributions.builder) formattedLog += `&bull; <strong>BUILDER:</strong> ${res.agent_contributions.builder}`;
      formattedLog += `</small>`;
    }
    logTerminal('AURELIA', formattedLog, 'aurelia-entry');

    // 3. Task State Reconciliation
    if (res.task_updates && Array.isArray(res.task_updates)) {
      res.task_updates.forEach(incoming => {
        const index = state.tasks.findIndex(t => t.id === incoming.id);
        if (index !== -1) {
          state.tasks[index] = incoming;
        } else {
          state.tasks.unshift(incoming);
        }
      });
      renderTasks();
    }

    // 4. Physical Deliverable Construction (Blob Engine)
    if (res.deliverable && res.deliverable.has_deliverable && res.deliverable.content) {
      registerDeliverable(res.deliverable.filename, res.deliverable.mime_type, res.deliverable.content);
    }

    // 5. Memory State Persistence
    state.missions.unshift({
      timestamp: new Date().toISOString(),
      report: res.executive_report
    });
    saveState();
  }

  // =========================================================================
  // 5. DELIVERABLE STORAGE & BLOB DOWNLOAD GENERATOR
  // =========================================================================

  function registerDeliverable(filename, mimeType, content) {
    const cleanMime = mimeType || 'text/plain';
    const blob = new Blob([content], { type: cleanMime });
    const downloadUrl = URL.createObjectURL(blob);

    const deliverable = {
      id: 'DELIV-' + Date.now(),
      filename: filename || 'aurelia_deliverable.txt',
      mimeType: cleanMime,
      size: (blob.size / 1024).toFixed(1) + ' KB',
      url: downloadUrl,
      createdAt: new Date().toLocaleTimeString()
    };

    state.deliverables.unshift(deliverable);
    renderDeliverables();

    logTerminal('BUILDER', `Artifact <strong>${deliverable.filename}</strong> (${deliverable.size}) produced and ready for download.`, 'aurelia-entry');
  }

  // =========================================================================
  // 6. UI RENDERING ENGINES
  // =========================================================================

  function renderAll() {
    renderTasks();
    renderDeliverables();
  }

  function renderTasks() {
    taskList.innerHTML = '';
    if (!state.tasks || state.tasks.length === 0) {
      taskList.innerHTML = '<div class="empty-state">No active missions. Awaiting Lord\'s command.</div>';
      taskCounter.textContent = '0 TASKS';
      return;
    }

    taskCounter.textContent = `${state.tasks.length} TASKS`;
    state.tasks.forEach(task => {
      const card = document.createElement('div');
      const statusClass = (task.status === 'completed') ? 'completed' : 'active';
      card.className = `task-card ${statusClass}`;
      card.innerHTML = `
        <div class="task-meta">
          <span>${task.id}</span>
          <span>${task.assigned_to}</span>
          <span style="color:${task.status === 'completed' ? 'var(--success)' : 'var(--warning)'}">${task.status.toUpperCase()}</span>
        </div>
        <div class="task-title">${task.title}</div>
      `;
      taskList.appendChild(card);
    });
  }

  function renderDeliverables() {
    deliverablesList.innerHTML = '';
    if (!state.deliverables || state.deliverables.length === 0) {
      deliverablesList.innerHTML = '<div class="empty-state">No deliverables generated yet.</div>';
      deliverableCounter.textContent = '0 FILES';
      return;
    }

    deliverableCounter.textContent = `${state.deliverables.length} FILES`;
    state.deliverables.forEach(item => {
      const card = document.createElement('div');
      card.className = 'deliverable-card';
      card.innerHTML = `
        <div class="deliverable-name">${item.filename}</div>
        <div class="deliverable-type">${item.mimeType} &bull; ${item.size} &bull; ${item.createdAt}</div>
        <a href="${item.url}" download="${item.filename}" class="btn btn-gold btn-small" style="text-align:center; text-decoration:none; display:block;">DOWNLOAD FILE</a>
      `;
      deliverablesList.appendChild(card);
    });
  }

  function logTerminal(sender, message, styleClass = '') {
    const entry = document.createElement('div');
    entry.className = `log-entry ${styleClass}`;
    const time = new Date().toLocaleTimeString();
    entry.innerHTML = `<span class="log-timestamp">[${time}]</span> <span class="log-agent-tag">${sender}:</span> ${message}`;
    terminalLog.appendChild(entry);
    terminalLog.scrollTop = terminalLog.scrollHeight;
  }

  // =========================================================================
  // 7. MEMORY EXPORT / IMPORT ENGINE
  // =========================================================================

  function exportMemory() {
    const memoryData = {
      system: 'AURELIA_COMMAND_CENTER',
      exportedAt: new Date().toISOString(),
      tasks: state.tasks,
      missions: state.missions,
      model: state.model
    };

    const blob = new Blob([JSON.stringify(memoryData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aurelia_memory_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    logTerminal('SYS_MEM', 'Core Memory backup snapshot exported to disk.');
  }

  function importMemory(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const imported = JSON.parse(e.target.result);
        if (Array.isArray(imported.tasks) && Array.isArray(imported.missions)) {
          state.tasks = imported.tasks;
          state.missions = imported.missions;
          if (imported.model) state.model = imported.model;
          saveState();
          renderAll();
          logTerminal('SYS_MEM', 'Core Memory snapshot successfully loaded into runtime.');
        } else {
          throw new Error('Structure does not conform to AURELIA memory schema.');
        }
      } catch (err) {
        logTerminal('SYS_ERR', `Import failed: ${err.message}`, 'error-entry');
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  }

  // Self-Bootstrap
  window.addEventListener('DOMContentLoaded', init);
})();
