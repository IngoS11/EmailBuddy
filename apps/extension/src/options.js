const SHORTCUT_KEY = 'shortcut';
const DEFAULT_SHORTCUT = 'Meta+Shift+E';
const API_BASE = 'http://127.0.0.1:48123';

const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
const panels = Array.from(document.querySelectorAll('[role="tabpanel"]'));

const currentShortcutEl = document.getElementById('current-shortcut');
const recordBtn = document.getElementById('record-btn');
const resetBtn = document.getElementById('reset-btn');
const shortcutStatusEl = document.getElementById('shortcut-status');

const connectionEl = document.getElementById('backend-connection');
const providerListEl = document.getElementById('provider-order');
const timeoutEl = document.getElementById('timeout-ms');
const historyEl = document.getElementById('history-enabled');
const saveConfigBtn = document.getElementById('save-config');
const openaiKeyEl = document.getElementById('openai-key');
const anthropicKeyEl = document.getElementById('anthropic-key');
const saveOpenAiBtn = document.getElementById('save-openai');
const saveAnthropicBtn = document.getElementById('save-anthropic');
const backendStatusEl = document.getElementById('backend-status');

let isRecording = false;
let providerOrder = [];
let backendConnected = false;
let draggedIndex = -1;

function setStatus(element, message, type = 'muted') {
  element.textContent = message;
  element.classList.remove('ok', 'error');
  if (type === 'ok') element.classList.add('ok');
  if (type === 'error') element.classList.add('error');
}

function activateTab(tabId) {
  tabs.forEach((tab) => {
    const selected = tab.id === tabId;
    tab.setAttribute('aria-selected', String(selected));
    tab.setAttribute('tabindex', selected ? '0' : '-1');
  });

  panels.forEach((panel) => {
    panel.hidden = panel.getAttribute('aria-labelledby') !== tabId;
  });
}

tabs.forEach((tab, index) => {
  tab.addEventListener('click', () => activateTab(tab.id));
  tab.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      return;
    }
    event.preventDefault();
    let next = index;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = tabs.length - 1;
    tabs[next].focus();
    activateTab(tabs[next].id);
  });
});

function normalizeKey(key) {
  if (!key) return '';
  if (key === ' ') return 'Space';
  if (key.length === 1) return key.toUpperCase();
  if (key.startsWith('Arrow')) return key;
  return key[0].toUpperCase() + key.slice(1);
}

function parseShortcut(shortcutString) {
  const tokens = String(shortcutString || '')
    .split('+')
    .map((t) => t.trim())
    .filter(Boolean);

  const shortcut = {
    meta: false,
    ctrl: false,
    alt: false,
    shift: false,
    key: 'E'
  };

  for (const token of tokens) {
    const lower = token.toLowerCase();
    if (lower === 'meta' || lower === 'cmd' || lower === 'command') shortcut.meta = true;
    else if (lower === 'ctrl' || lower === 'control') shortcut.ctrl = true;
    else if (lower === 'alt' || lower === 'option') shortcut.alt = true;
    else if (lower === 'shift') shortcut.shift = true;
    else shortcut.key = normalizeKey(token);
  }

  return shortcut;
}

function serializeShortcut(shortcut) {
  const parts = [];
  if (shortcut.meta) parts.push('Meta');
  if (shortcut.ctrl) parts.push('Ctrl');
  if (shortcut.alt) parts.push('Alt');
  if (shortcut.shift) parts.push('Shift');
  parts.push(normalizeKey(shortcut.key));
  return parts.join('+');
}

function formatShortcutLabel(shortcut) {
  const parts = [];
  if (shortcut.meta) parts.push('Cmd');
  if (shortcut.ctrl) parts.push('Ctrl');
  if (shortcut.alt) parts.push('Alt');
  if (shortcut.shift) parts.push('Shift');
  parts.push(normalizeKey(shortcut.key));
  return parts.join('+');
}

function updateRecordingUi() {
  recordBtn.textContent = isRecording ? 'Press keys now...' : 'Record shortcut';
  resetBtn.disabled = isRecording;
}

function hasModifier(event) {
  return event.metaKey || event.ctrlKey || event.altKey || event.shiftKey;
}

function isModifierKey(key) {
  return key === 'Meta' || key === 'Control' || key === 'Alt' || key === 'Shift';
}

function setBackendEnabled(enabled) {
  const controls = [
    timeoutEl,
    historyEl,
    saveConfigBtn,
    openaiKeyEl,
    anthropicKeyEl,
    saveOpenAiBtn,
    saveAnthropicBtn
  ];

  controls.forEach((el) => {
    el.disabled = !enabled;
  });

  providerListEl.querySelectorAll('button').forEach((button) => {
    button.disabled = !enabled;
  });
}

function reorderProviders(from, to) {
  if (from < 0 || to < 0 || from === to || from >= providerOrder.length || to >= providerOrder.length) {
    return;
  }

  const next = [...providerOrder];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  providerOrder = next;
  renderProviderOrder();
}

function clearDropTargets() {
  providerListEl.querySelectorAll('.drop-target').forEach((el) => el.classList.remove('drop-target'));
}

function renderProviderOrder() {
  providerListEl.innerHTML = '';

  providerOrder.forEach((provider, index) => {
    const li = document.createElement('li');
    li.className = 'provider-item';
    li.draggable = backendConnected;
    li.dataset.index = String(index);

    li.addEventListener('dragstart', (event) => {
      if (!backendConnected) return;
      draggedIndex = index;
      li.classList.add('dragging');
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', String(index));
    });

    li.addEventListener('dragend', () => {
      draggedIndex = -1;
      li.classList.remove('dragging');
      clearDropTargets();
    });

    li.addEventListener('dragover', (event) => {
      if (!backendConnected) return;
      event.preventDefault();
      clearDropTargets();
      li.classList.add('drop-target');
    });

    li.addEventListener('drop', (event) => {
      if (!backendConnected) return;
      event.preventDefault();
      clearDropTargets();
      const targetIndex = Number(li.dataset.index);
      const from = draggedIndex === -1 ? Number(event.dataTransfer.getData('text/plain')) : draggedIndex;
      reorderProviders(from, targetIndex);
    });

    const handle = document.createElement('span');
    handle.className = 'drag-handle';
    handle.title = 'Drag to reorder';
    handle.textContent = '::';

    const name = document.createElement('span');
    name.className = 'provider-label';
    name.textContent = `${index + 1}. ${provider}`;

    const actions = document.createElement('div');
    actions.className = 'provider-actions';

    const up = document.createElement('button');
    up.type = 'button';
    up.className = 'secondary';
    up.textContent = 'Move up';
    up.disabled = !backendConnected || index === 0;
    up.setAttribute('aria-label', `Move ${provider} up`);
    up.addEventListener('click', () => reorderProviders(index, index - 1));

    const down = document.createElement('button');
    down.type = 'button';
    down.className = 'secondary';
    down.textContent = 'Move down';
    down.disabled = !backendConnected || index === providerOrder.length - 1;
    down.setAttribute('aria-label', `Move ${provider} down`);
    down.addEventListener('click', () => reorderProviders(index, index + 1));

    actions.append(up, down);
    li.append(handle, name, actions);
    providerListEl.appendChild(li);
  });
}

async function callApi(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error || `${path} failed`);
  }
  return body;
}

async function refreshBackendState() {
  try {
    const [config, schema, secretsStatus] = await Promise.all([
      callApi('/v1/config'),
      callApi('/v1/config/schema'),
      callApi('/v1/secrets/status')
    ]);

    backendConnected = true;
    setStatus(connectionEl, 'Connected to companion service.', 'ok');

    providerOrder = [...config.providerOrder];
    timeoutEl.min = String(schema.constraints.timeoutMs.min);
    timeoutEl.max = String(schema.constraints.timeoutMs.max);
    timeoutEl.value = String(config.timeoutMs);
    historyEl.checked = config.history.enabled;

    setStatus(
      backendStatusEl,
      `OpenAI key: ${secretsStatus.openaiConfigured ? 'configured' : 'missing'} | Anthropic key: ${secretsStatus.anthropicConfigured ? 'configured' : 'missing'}`,
      'ok'
    );
  } catch (error) {
    backendConnected = false;
    setStatus(connectionEl, `Companion unreachable: ${error.message}`, 'error');
    setStatus(backendStatusEl, 'Backend settings unavailable until companion is running.', 'error');
  }

  renderProviderOrder();
  setBackendEnabled(backendConnected);
}

async function saveBackendConfig() {
  if (!backendConnected) return;

  setStatus(backendStatusEl, 'Saving backend config...');
  saveConfigBtn.disabled = true;

  try {
    const updated = await callApi('/v1/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        providerOrder,
        timeoutMs: Number(timeoutEl.value),
        history: { enabled: historyEl.checked }
      })
    });

    providerOrder = [...updated.providerOrder];
    timeoutEl.value = String(updated.timeoutMs);
    historyEl.checked = updated.history.enabled;
    renderProviderOrder();
    setStatus(backendStatusEl, 'Backend config saved.', 'ok');
  } catch (error) {
    setStatus(backendStatusEl, error.message, 'error');
  } finally {
    saveConfigBtn.disabled = false;
  }
}

async function saveSecret(account, value) {
  await callApi('/v1/secrets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account, value })
  });
}

async function onSaveOpenAiKey() {
  if (!backendConnected) return;

  const value = openaiKeyEl.value.trim();
  if (!value) {
    setStatus(backendStatusEl, 'OpenAI key is empty.', 'error');
    return;
  }

  saveOpenAiBtn.disabled = true;
  try {
    await saveSecret('openai_api_key', value);
    openaiKeyEl.value = '';
    await refreshBackendState();
  } catch (error) {
    setStatus(backendStatusEl, error.message, 'error');
  } finally {
    saveOpenAiBtn.disabled = false;
  }
}

async function onSaveAnthropicKey() {
  if (!backendConnected) return;

  const value = anthropicKeyEl.value.trim();
  if (!value) {
    setStatus(backendStatusEl, 'Anthropic key is empty.', 'error');
    return;
  }

  saveAnthropicBtn.disabled = true;
  try {
    await saveSecret('anthropic_api_key', value);
    anthropicKeyEl.value = '';
    await refreshBackendState();
  } catch (error) {
    setStatus(backendStatusEl, error.message, 'error');
  } finally {
    saveAnthropicBtn.disabled = false;
  }
}

async function renderCurrentShortcut() {
  const stored = await chrome.storage.sync.get([SHORTCUT_KEY]);
  const shortcut = parseShortcut(stored[SHORTCUT_KEY] ?? DEFAULT_SHORTCUT);
  currentShortcutEl.textContent = formatShortcutLabel(shortcut);
}

async function saveShortcut(shortcut) {
  const serialized = serializeShortcut(shortcut);
  await chrome.storage.sync.set({ [SHORTCUT_KEY]: serialized });
  currentShortcutEl.textContent = formatShortcutLabel(shortcut);
  setStatus(shortcutStatusEl, `Saved: ${formatShortcutLabel(shortcut)}`, 'ok');
}

window.addEventListener('keydown', async (event) => {
  if (!isRecording) {
    return;
  }

  event.preventDefault();

  if (event.key === 'Escape') {
    isRecording = false;
    updateRecordingUi();
    setStatus(shortcutStatusEl, 'Recording canceled.', 'error');
    return;
  }

  if (isModifierKey(event.key)) {
    setStatus(shortcutStatusEl, 'Press at least one non-modifier key.', 'error');
    return;
  }

  if (!hasModifier(event)) {
    setStatus(shortcutStatusEl, 'Include at least one modifier (Cmd/Ctrl/Alt/Shift).', 'error');
    return;
  }

  const shortcut = {
    meta: event.metaKey,
    ctrl: event.ctrlKey,
    alt: event.altKey,
    shift: event.shiftKey,
    key: normalizeKey(event.key)
  };

  isRecording = false;
  updateRecordingUi();
  await saveShortcut(shortcut);
});

recordBtn.addEventListener('click', () => {
  isRecording = true;
  updateRecordingUi();
  setStatus(shortcutStatusEl, 'Recording... press your preferred shortcut (Esc to cancel).');
});

resetBtn.addEventListener('click', async () => {
  const shortcut = parseShortcut(DEFAULT_SHORTCUT);
  await chrome.storage.sync.set({ [SHORTCUT_KEY]: DEFAULT_SHORTCUT });
  currentShortcutEl.textContent = formatShortcutLabel(shortcut);
  setStatus(shortcutStatusEl, `Reset to default: ${formatShortcutLabel(shortcut)}`, 'ok');
});

saveConfigBtn.addEventListener('click', saveBackendConfig);
saveOpenAiBtn.addEventListener('click', onSaveOpenAiKey);
saveAnthropicBtn.addEventListener('click', onSaveAnthropicKey);

Promise.all([renderCurrentShortcut(), refreshBackendState()])
  .then(() => {
    updateRecordingUi();
    activateTab('tab-settings');
  })
  .catch((error) => {
    setStatus(shortcutStatusEl, `Initialization error: ${error.message}`, 'error');
    updateRecordingUi();
    activateTab('tab-settings');
  });
