
/**
 * AURELIA COMMAND CENTER
 * Corrected Gemini connection, model discovery, memory, voice,
 * agent coordination, task tracking, and downloadable deliverables.
 */

(function () {
  'use strict';

  // ============================================================
  // 1. CONFIGURATION AND STATE
  // ============================================================

  const STORAGE_KEY = 'aurelia_system_state';
  const API_KEY_STORAGE = 'aurelia_gemini_api_key';
  const API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

  const DEFAULT_MODEL = 'gemini-2.5-flash';

  let state = {
    missions: [],
    tasks: [],
    deliverables: [],
    model: DEFAULT_MODEL
  };

  let apiKey = '';
  let recognition = null;
  let isListening = false;
  let availableModels = [];
  let isBusy = false;

  // ============================================================
  // 2. DOM REFERENCES
  // ============================================================

  const $ = id => document.getElementById(id);

  const keyIndicator = $('key-indicator');
  const voiceIndicator = $('voice-indicator');
  const systemReadout = $('system-readout');
  const memoryStatusText = $('memory-status-text');

  const pillWatch = $('pill-watch');
  const pillResearch = $('pill-research');
  const pillBusiness = $('pill-business');
  const pillBuilder = $('pill-builder');

  const taskList = $('task-list');
  const deliverablesList = $('deliverables-list');
  const taskCounter = $('task-counter');
  const deliverableCounter = $('deliverable-counter');
  const terminalLog = $('terminal-log');

  const commandInput = $('command-input');
  const sendBtn = $('send-btn');
  const micBtn = $('mic-btn');

  const settingsToggleBtn = $('settings-toggle-btn');
  const settingsModal = $('settings-modal');
  const modalCloseBtn = $('modal-close-btn');
  const apiKeyInput = $('api-key-input');
  const modelSelect = $('model-select');
  const saveKeyBtn = $('save-key-btn');
  const deleteKeyBtn = $('delete-key-btn');
  const exportMemoryBtn = $('export-memory-btn');
  const importMemoryFile = $('import-memory-file');

  // ============================================================
  // 3. INITIALIZATION
  // ============================================================

  async function init() {
    loadKey();
    loadState();
    setupSpeech();
    bindEvents();
    renderAll();

    logTerminal('SYS_INIT', 'AURELIA core initialized.');

    if (apiKey) {
      await discoverModels();
    }
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

        state.missions = Array.isArray(parsed.missions)
          ? parsed.missions : [];

        state.tasks = Array.isArray(parsed.tasks)
          ? parsed.tasks : [];

        // Do not trust an old saved model identifier.
        // The available model list will determine the active model.
        state.model = DEFAULT_MODEL;
      }
    } catch (error) {
      logTerminal('SYS_WARN', 'Saved memory could not be loaded.');
    }

    updateMemoryReadout();
  }

  function saveState() {
    try {
      const saved = {
        missions: state.missions,
        tasks: state.tasks,
        model: state.model
      };

      localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
      updateMemoryReadout();
    } catch (error) {
      logTerminal('SYS_ERR', 'Unable to save local memory.');
    }
  }

  function updateMemoryReadout() {
    if (!memoryStatusText) return;

    const count = state.missions.length;

    memoryStatusText.textContent =
      `Local Storage: Active (${count} mission${count === 1 ? '' : 's'} recorded)`;
  }

  // ============================================================
  // 4. GEMINI MODEL DISCOVERY
  // ============================================================

  async function discoverModels() {
    if (!apiKey) return;

    try {
      const response = await fetch(`${API_BASE}/models`, {
        method: 'GET',
        headers: {
          'x-goog-api-key': apiKey
        }
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error?.message || `Model discovery failed: HTTP ${response.status}`
        );
      }

      availableModels = (data.models || [])
        .filter(model =>
          Array.isArray(model.supportedGenerationMethods) &&
          model.supportedGenerationMethods.includes('generateContent')
        )
        .map(model => model.name.replace(/^models\//, ''));

      if (!availableModels.length) {
        throw new Error('Google returned no models supporting generateContent.');
      }

      populateModelSelect();

      logTerminal(
        'SYS_MODEL',
        `${availableModels.length} compatible Gemini models discovered.`
      );

    } catch (error) {
      logTerminal(
        'SYS_WARN',
        `Model discovery unavailable: ${error.message}`,
        'error-entry'
      );

      // Keep a fallback. The actual request will report whether it works.
      if (modelSelect && modelSelect.options.length === 0) {
        addModelOption(DEFAULT_MODEL);
      }
    }
  }

  function populateModelSelect() {
    if (!modelSelect) return;

    const previousValue = modelSelect.value;
    modelSelect.innerHTML = '';

    const preferred = [
      'gemini-2.5-flash',
      'gemini-2.0-flash',
      'gemini-2.5-flash-lite',
      'gemini-2.0-flash-lite'
    ];

    const ordered = [
      ...preferred.filter(name => availableModels.includes(name)),
      ...availableModels
        .filter(name => !preferred.includes(name))
        .filter(name => /flash/i.test(name))
    ];

    const uniqueModels = [...new Set(ordered)];

    uniqueModels.forEach(addModelOption);

    const chosen =
      uniqueModels.includes(previousValue) ? previousValue :
      uniqueModels.includes(state.model) ? state.model :
      uniqueModels[0];

    if (chosen) {
      modelSelect.value = chosen;
      state.model = chosen;
      saveState();
    }
  }

  function addModelOption(modelName) {
    if (!modelSelect) return;

    const option = document.createElement('option');
    option.value = modelName;
    option.textContent = modelName;
    modelSelect.appendChild(option);
  }

  // ============================================================
  // 5. EVENT BINDINGS
  // ============================================================

  function bindEvents() {
    sendBtn.addEventListener('click', handleCommand);

    commandInput.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
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

    saveKeyBtn.addEventListener('click', async () => {
      const inputValue = apiKeyInput.value.trim();

      if (!inputValue) {
        alert('Please enter a valid Gemini API key.');
        return;
      }

      apiKey = inputValue;
      localStorage.setItem(API_KEY_STORAGE, apiKey);

      keyIndicator.textContent = 'API KEY: SECURED';
      keyIndicator.className = 'status-badge badge-ok';

      settingsModal.classList.add('hidden');

      logTerminal('SYS_AUTH', 'API key saved in browser storage.');

      await discoverModels();
    });

    deleteKeyBtn.addEventListener('click', () => {
      if (!confirm('Delete the Gemini API key from this browser?')) return;

      apiKey = '';
      localStorage.removeItem(API_KEY_STORAGE);
      apiKeyInput.value = '';

      keyIndicator.textContent = 'API KEY: MISSING';
      keyIndicator.className = 'status-badge badge-warning';

      settingsModal.classList.add('hidden');

      logTerminal('SYS_AUTH', 'API key deleted.');
    });

    if (exportMemoryBtn) {
      exportMemoryBtn.addEventListener('click', exportMemory);
    }

    if (importMemoryFile) {
      importMemoryFile.addEventListener('change', importMemory);
    }
  }

  // ============================================================
  // 6. VOICE ENGINE
  // ============================================================

  function setupSpeech() {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      voiceIndicator.textContent = 'VOICE: UNSUPPORTED';
      micBtn.style.display = 'none';
      return;
    }

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

    recognition.onresult = event => {
      commandInput.value = event.results[0][0].transcript;
      handleCommand();
    };

    recognition.onerror = stopSpeech;
    recognition.onend = stopSpeech;
  }

  function toggleSpeech() {
    if (!recognition) return;

    if (isListening) {
      recognition.stop();
    } else {
      try {
        recognition.start();
      } catch (error) {
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

  function speakText(message) {
    if (!('speechSynthesis' in window)) return;

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(message);
    const voices = window.speechSynthesis.getVoices();

    const selectedVoice =
      voices.find(voice =>
        voice.name.includes('Google') &&
        voice.lang.startsWith('en')
      ) || voices[0];

    if (selectedVoice) utterance.voice = selectedVoice;

    utterance.rate = 1.05;
    utterance.pitch = 1;

    window.speechSynthesis.speak(utterance);
  }

  // ============================================================
  // 7. COMMAND HANDLING
  // ============================================================

  async function handleCommand() {
    const prompt = commandInput.value.trim();

    if (!prompt || isBusy) return;

    if (!apiKey) {
      logTerminal(
        'SECURITY',
        'Configure the Gemini API key before sending commands.',
        'error-entry'
      );

      settingsModal.classList.remove('hidden');
      return;
    }

    commandInput.value = '';
    logTerminal('LORD', escapeHTML(prompt), 'user-entry');

    systemReadout.textContent = 'COORDINATING AGENTS...';
    systemReadout.className = 'readout-busy';

    isBusy = true;
    sendBtn.disabled = true;

    try {
      const result = await callGeminiRouter(prompt);
      processResponse(result);
    } catch (error) {
      logTerminal(
        'SYS_ERR',
        escapeHTML(error.message),
        'error-entry'
      );
    } finally {
      isBusy = false;
      systemReadout.textContent = 'SYSTEM STANDING BY';
      systemReadout.className = 'readout-idle';
      sendBtn.disabled = false;
    }
  }

  // ============================================================
  // 8. GEMINI API REQUEST
  // ============================================================

  function buildSystemPrompt() {
    return `You are AURELIA, an executive AI Command Center coordinating four specialized agents.

AGENTS:

1. WATCH:
Tracks tasks, deadlines, schedules, progress, and operational risks.

2. RESEARCH:
Investigates questions, validates information, and distinguishes verified facts from assumptions.

3. BUSINESS:
Evaluates costs, revenue, margins, pricing, and business economics.

Pricing rules:
Pre-Tax Quote = Total True Cost / (1 - Target Margin)

Direct Labor = (Onsite Hours + Travel Hours) * Hourly Pay Rate

Expenses = Materials * (1 + Handling Markup) + Equipment + (Miles * Mileage Rate)

Overhead = Total Hours * Hourly Overhead Rate

Contingency = (Direct Labor + Expenses + Overhead) * Contingency Percentage

Total True Cost = Direct Labor + Expenses + Overhead + Contingency

Sales Tax = Pre-Tax Quote * Tax Rate

Client Quote = Pre-Tax Quote + Sales Tax

Net Business Profit = Pre-Tax Quote - Total True Cost

Never invent missing financial inputs. State assumptions.

4. BUILDER:
Creates practical deliverables including CSV files, spreadsheets, documentation, JSON, and website code.

OPERATING RULES:

- Address the owner as Lord.
- Respect a $0 budget unless explicitly authorized otherwise.
- Never claim an action succeeded unless it actually did.
- Never claim a task is completed unless the work was produced.
- Ask for approval before paid, irreversible, or external actions.
- Explain uncertainty and assumptions.
- Keep the four agent roles distinct.
- You are one coordinated AI system, not four independent AI services.

RESPONSE FORMAT:

Return ONLY valid JSON matching this structure:

{
  "spoken_summary": "One or two concise sentences.",
  "executive_report": "Detailed report addressing Lord.",
  "agent_contributions": {
    "watch": "Watch agent findings.",
    "research": "Research agent findings.",
    "business": "Business agent findings.",
    "builder": "Builder agent findings."
  },
  "task_updates": [
    {
      "id": "TASK-001",
      "title": "Task description",
      "status": "active",
      "assigned_to": "BUILDER"
    }
  ],
  "deliverable": {
    "has_deliverable": false,
    "filename": "",
    "mime_type": "",
    "content": ""
  }
}

For tasks without a deliverable, use false and empty strings.

For a requested deliverable, include its complete contents as a string and use an appropriate MIME type.

Valid task statuses are active, pending, and completed.

Do not claim a deliverable was created unless its full contents are included.`;
  }

  async function callGeminiRouter(userDirective) {
    const selectedModel =
      modelSelect?.value ||
      (availableModels.includes(state.model) ? state.model : '') ||
      availableModels[0] ||
      DEFAULT_MODEL;

    state.model = selectedModel;
    saveState();

    const endpoint =
      `${API_BASE}/models/${encodeURIComponent(selectedModel)}:generateContent`;

    const requestPayload = {
      systemInstruction: {
        parts: [{ text: buildSystemPrompt() }]
      },
      contents: [{
        role: 'user',
        parts: [{
          text:
            `ACTIVE TASKS:\n${JSON.stringify(state.tasks)}\n\n` +
            `RECENT MISSIONS:\n${JSON.stringify(state.missions.slice(0, 5))}\n\n` +
            `LORD'S DIRECTIVE:\n${userDirective}`
        }]
      }],
      generationConfig: {
        temperature: 0.15,
        responseMimeType: 'application/json'
      }
    };

    let response;

    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey
        },
        body: JSON.stringify(requestPayload)
      });
    } catch (error) {
      throw new Error(
        'Network connection failed. Check your internet connection.'
      );
    }

    const responseText = await response.text();

    let data;

    try {
      data = JSON.parse(responseText);
    } catch (error) {
      throw new Error(
        `Google returned an unreadable response (HTTP ${response.status}).`
      );
    }

    if (!response.ok) {
      const googleMessage =
        data.error?.message || 'No additional error details supplied.';

      const googleStatus =
        data.error?.status || 'UNKNOWN';

      throw new Error(
        `Google API HTTP ${response.status} (${googleStatus}): ${googleMessage}`
      );
    }

    const output =
      data.candidates?.[0]?.content?.parts
        ?.map(part => part.text || '')
        .join('')
        .trim();

    if (!output) {
      const reason =
        data.promptFeedback?.blockReason ||
        data.candidates?.[0]?.finishReason ||
        'No text returned';

      throw new Error(`Gemini returned no usable text: ${reason}`);
    }

    let cleanOutput = output
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    try {
      return JSON.parse(cleanOutput);
    } catch (error) {
      throw new Error(
        'Gemini responded, but its output was not valid JSON.'
      );
    }
  }

  // ============================================================
  // 9. PROCESS GEMINI RESPONSE
  // ============================================================

  function processResponse(result) {
    if (!result || typeof result !== 'object') {
      throw new Error('Invalid response structure.');
    }

    if (result.spoken_summary) {
      speakText(result.spoken_summary);
    }

    const report = result.executive_report || 'No executive report supplied.';

    logTerminal(
      'AURELIA',
      `<strong>${escapeHTML(report)}</strong>`,
      'aurelia-entry'
    );

    const contributions = result.agent_contributions || {};

    const agents = [
      ['WATCH', contributions.watch, pillWatch],
      ['RESEARCH', contributions.research, pillResearch],
      ['BUSINESS', contributions.business, pillBusiness],
      ['BUILDER', contributions.builder, pillBuilder]
    ];

    agents.forEach(([name, contribution, pill]) => {
      if (contribution) {
        logTerminal(
          name,
          escapeHTML(contribution),
          'aurelia-entry'
        );
      }

      if (pill) {
        pill.classList.add('agent-active');
        setTimeout(() => pill.classList.remove('agent-active'), 1800);
      }
    });

    if (Array.isArray(result.task_updates)) {
      result.task_updates.forEach(incoming => {
        if (!incoming || !incoming.id || !incoming.title) return;

        const index = state.tasks.findIndex(
          task => task.id === incoming.id
        );

        if (index >= 0) {
          state.tasks[index] = incoming;
        } else {
          state.tasks.unshift(incoming);
        }
      });

      renderTasks();
    }

    if (
      result.deliverable?.has_deliverable === true &&
      result.deliverable.content
    ) {
      registerDeliverable(
        result.deliverable.filename,
        result.deliverable.mime_type,
        result.deliverable.content
      );
    }

    state.missions.unshift({
      timestamp: new Date().toISOString(),
      report: report
    });

    saveState();
  }

  // ============================================================
  // 10. DOWNLOADABLE DELIVERABLES
  // ============================================================

  function registerDeliverable(filename, mimeType, content) {
    const cleanMime = mimeType || 'text/plain';

    const blob = new Blob([content], { type: cleanMime });
    const url = URL.createObjectURL(blob);

    const item = {
      id: 'DELIV-' + Date.now(),
      filename: filename || 'aurelia_deliverable.txt',
      mimeType: cleanMime,
      size: (blob.size / 1024).toFixed(1) + ' KB',
      url: url,
      createdAt: new Date().toLocaleTimeString()
    };

    state.deliverables.unshift(item);
    renderDeliverables();

    logTerminal(
      'BUILDER',
      `Artifact ${escapeHTML(item.filename)} generated and ready for download.`
    );
  }

  // ============================================================
  // 11. SAFE DISPLAY HELPERS
  // ============================================================

  function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, character => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[character]);
  }

  function renderAll() {
    renderTasks();
    renderDeliverables();
  }

  function renderTasks() {
    taskList.innerHTML = '';

    if (!state.tasks.length) {
      taskList.textContent =
        "No active missions. Awaiting Lord's command.";

      taskCounter.textContent = '0 TASKS';
      return;
    }

    taskCounter.textContent = `${state.tasks.length} TASKS`;

    state.tasks.forEach(task => {
      const card = document.createElement('div');
      card.className =
        `task-card ${task.status === 'completed' ? 'completed' : 'active'}`;

      const meta = document.createElement('div');
      meta.className = 'task-meta';

      [task.id, task.assigned_to, task.status?.toUpperCase() || 'ACTIVE']
        .forEach(value => {
          const span = document.createElement('span');
          span.textContent = value || '';
          meta.appendChild(span);
        });

      const title = document.createElement('div');
      title.className = 'task-title';
      title.textContent = task.title || 'Untitled task';

      card.append(meta, title);
      taskList.appendChild(card);
    });
  }

  function renderDeliverables() {
    deliverablesList.innerHTML = '';

    if (!state.deliverables.length) {
      deliverablesList.textContent = 'No deliverables generated yet.';
      deliverableCounter.textContent = '0 FILES';
      return;
    }

    deliverableCounter.textContent =
      `${state.deliverables.length} FILES`;

    state.deliverables.forEach(item => {
      const card = document.createElement('div');
      card.className = 'deliverable-card';

      const name = document.createElement('div');
      name.className = 'deliverable-name';
      name.textContent = item.filename;

      const details = document.createElement('div');
      details.className = 'deliverable-type';
      details.textContent =
        `${item.mimeType} • ${item.size} • ${item.createdAt}`;

      const link = document.createElement('a');
      link.href = item.url;
      link.download = item.filename;
      link.className = 'btn btn-gold btn-small';
      link.style.cssText =
        'text-align:center;text-decoration:none;display:block;';
      link.textContent = 'DOWNLOAD FILE';

      card.append(name, details, link);
      deliverablesList.appendChild(card);
    });
  }

  function logTerminal(sender, message, styleClass = '') {
    if (!terminalLog) return;

    const entry = document.createElement('div');
    entry.className = `log-entry ${styleClass}`;

    const timestamp = document.createElement('span');
    timestamp.className = 'log-timestamp';
    timestamp.textContent = `[${new Date().toLocaleTimeString()}] `;

    const tag = document.createElement('span');
    tag.className = 'log-agent-tag';
    tag.textContent = `${sender}: `;

    const body = document.createElement('span');
    body.innerHTML = message;

    entry.append(timestamp, tag, body);
    terminalLog.appendChild(entry);
    terminalLog.scrollTop = terminalLog.scrollHeight;
  }

  // ============================================================
  // 12. MEMORY EXPORT AND IMPORT
  // ============================================================

  function exportMemory() {
    const memoryData = {
      system: 'AURELIA_COMMAND_CENTER',
      exportedAt: new Date().toISOString(),
      tasks: state.tasks,
      missions: state.missions,
      model: state.model
    };

    const blob = new Blob(
      [JSON.stringify(memoryData, null, 2)],
      { type: 'application/json' }
    );

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = `aurelia_memory_${Date.now()}.json`;

    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(url);

    logTerminal('SYS_MEM', 'Memory backup exported.');
  }

  function importMemory(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = () => {
      try {
        const imported = JSON.parse(reader.result);

        if (
          !Array.isArray(imported.tasks) ||
          !Array.isArray(imported.missions)
        ) {
          throw new Error('Invalid AURELIA memory file.');
        }

        state.tasks = imported.tasks;
        state.missions = imported.missions;

        // Model is selected from Google's current available model list.
        saveState();
        renderAll();

        logTerminal('SYS_MEM', 'Memory successfully imported.');
      } catch (error) {
        logTerminal(
          'SYS_ERR',
          escapeHTML(`Memory import failed: ${error.message}`),
          'error-entry'
        );
      }
    };

    reader.readAsText(file);
    event.target.value = '';
  }

  // ============================================================
  // 13. STARTUP
  // ============================================================

  window.addEventListener('DOMContentLoaded', () => {
    init().catch(error => {
      logTerminal(
        'SYS_FATAL',
        escapeHTML(error.message),
        'error-entry'
      );
    });
  });

})();
