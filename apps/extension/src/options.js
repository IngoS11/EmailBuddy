const SHORTCUT_KEY = 'shortcut';
const DEFAULT_SHORTCUT = 'Meta+Shift+E';
const API_BASE = 'http://127.0.0.1:48123';

const topTabs = ['tab-shortcut', 'tab-backend', 'tab-test']
  .map((id) => document.getElementById(id))
  .filter(Boolean);
const topPanels = ['panel-shortcut', 'panel-backend', 'panel-test']
  .map((id) => document.getElementById(id))
  .filter(Boolean);
const backendTabs = ['tab-model-order', 'tab-ollama', 'tab-cloud-apis']
  .map((id) => document.getElementById(id))
  .filter(Boolean);
const backendPanels = ['panel-model-order', 'panel-ollama', 'panel-cloud-apis']
  .map((id) => document.getElementById(id))
  .filter(Boolean);

const currentShortcutEl = document.getElementById('current-shortcut');
const recordBtn = document.getElementById('record-btn');
const resetBtn = document.getElementById('reset-btn');
const shortcutStatusEl = document.getElementById('shortcut-status');

const connectionEl = document.getElementById('backend-connection');
const enabledListEl = document.getElementById('enabled-models');
const disabledListEl = document.getElementById('disabled-models');
const timeoutEl = document.getElementById('timeout-ms');
const historyModeEl = document.getElementById('history-mode');
const saveConfigBtn = document.getElementById('save-config');
const openaiKeyEl = document.getElementById('openai-key');
const anthropicKeyEl = document.getElementById('anthropic-key');
const openaiModelEl = document.getElementById('openai-model');
const anthropicModelEl = document.getElementById('anthropic-model');
const remoteOllamaUrlEl = document.getElementById('remote-ollama-url');
const remoteOllamaModelEl = document.getElementById('remote-ollama-model');
const remoteOllamaModelHintEl = document.getElementById('remote-ollama-model-hint');
const localOllamaUrlEl = document.getElementById('local-ollama-url');
const localOllamaModelEl = document.getElementById('local-ollama-model');
const localOllamaModelHintEl = document.getElementById('local-ollama-model-hint');
const saveOpenAiBtn = document.getElementById('save-openai');
const saveAnthropicBtn = document.getElementById('save-anthropic');
const backendStatusEl = document.getElementById('backend-status');

let isRecording = false;
let backendConnected = false;
let endpointMap = new Map();
let enabledOrder = [];
let disabledOrder = [];
let modelCatalog = {
  cloud: { openai: [], anthropic: [] },
  ollama: {}
};

function setStatus(element, message, type = 'muted') {
  element.textContent = message;
  element.classList.remove('ok', 'error');
  if (type === 'ok') element.classList.add('ok');
  if (type === 'error') element.classList.add('error');
}

function activateTabGroup(tabs, panels, tabId) {
  tabs.forEach((tab) => {
    const selected = tab.id === tabId;
    tab.setAttribute('aria-selected', String(selected));
    tab.setAttribute('tabindex', selected ? '0' : '-1');
  });

  panels.forEach((panel) => {
    panel.hidden = panel.getAttribute('aria-labelledby') !== tabId;
  });
}

function bindTabs(tabs, panels) {
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => activateTabGroup(tabs, panels, tab.id));
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
      activateTabGroup(tabs, panels, tabs[next].id);
    });
  });
}

bindTabs(topTabs, topPanels);
bindTabs(backendTabs, backendPanels);

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
    historyModeEl,
    saveConfigBtn,
    openaiKeyEl,
    anthropicKeyEl,
    openaiModelEl,
    anthropicModelEl,
    remoteOllamaUrlEl,
    remoteOllamaModelEl,
    localOllamaUrlEl,
    localOllamaModelEl,
    saveOpenAiBtn,
    saveAnthropicBtn
  ];

  controls.forEach((el) => {
    el.disabled = !enabled;
  });

  [enabledListEl, disabledListEl].forEach((listEl) => {
    listEl.querySelectorAll('button').forEach((button) => {
      button.disabled = !enabled;
    });
  });
}

function endpointLabel(endpoint) {
  return `${endpoint.label} (${endpoint.type})`;
}

function reorderEnabled(from, to) {
  if (from < 0 || to < 0 || from === to || from >= enabledOrder.length || to >= enabledOrder.length) {
    return;
  }

  const next = [...enabledOrder];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  enabledOrder = next;
  renderModelLists();
}

function disableModel(id) {
  enabledOrder = enabledOrder.filter((entry) => entry !== id);
  disabledOrder = disabledOrder.filter((entry) => entry !== id);
  disabledOrder.push(id);
  renderModelLists();
}

function enableModel(id) {
  disabledOrder = disabledOrder.filter((entry) => entry !== id);
  enabledOrder = enabledOrder.filter((entry) => entry !== id);
  enabledOrder.push(id);
  renderModelLists();
}

function renderEnabledList() {
  enabledListEl.innerHTML = '';

  enabledOrder.forEach((id, index) => {
    const endpoint = endpointMap.get(id);
    if (!endpoint) return;

    const li = document.createElement('li');
    li.className = 'provider-item';

    const label = document.createElement('span');
    label.className = 'provider-label';
    label.textContent = `${index + 1}. ${endpointLabel(endpoint)}`;

    const actions = document.createElement('div');
    actions.className = 'provider-actions';

    const up = document.createElement('button');
    up.type = 'button';
    up.className = 'secondary';
    up.textContent = 'Move up';
    up.disabled = index === 0;
    up.addEventListener('click', () => reorderEnabled(index, index - 1));

    const down = document.createElement('button');
    down.type = 'button';
    down.className = 'secondary';
    down.textContent = 'Move down';
    down.disabled = index === enabledOrder.length - 1;
    down.addEventListener('click', () => reorderEnabled(index, index + 1));

    const disableBtn = document.createElement('button');
    disableBtn.type = 'button';
    disableBtn.className = 'secondary';
    disableBtn.textContent = 'Disable';
    disableBtn.addEventListener('click', () => disableModel(id));

    actions.append(up, down, disableBtn);
    li.append(label, actions);
    enabledListEl.appendChild(li);
  });
}

function renderDisabledList() {
  disabledListEl.innerHTML = '';

  disabledOrder.forEach((id, index) => {
    const endpoint = endpointMap.get(id);
    if (!endpoint) return;

    const li = document.createElement('li');
    li.className = 'provider-item';

    const label = document.createElement('span');
    label.className = 'provider-label';
    label.textContent = `${index + 1}. ${endpointLabel(endpoint)}`;

    const actions = document.createElement('div');
    actions.className = 'provider-actions';

    const enableBtn = document.createElement('button');
    enableBtn.type = 'button';
    enableBtn.className = 'secondary';
    enableBtn.textContent = 'Enable';
    enableBtn.addEventListener('click', () => enableModel(id));

    actions.append(enableBtn);
    li.append(label, actions);
    disabledListEl.appendChild(li);
  });
}

function renderModelLists() {
  renderEnabledList();
  renderDisabledList();
}

function getEndpoint(id) {
  return endpointMap.get(id) ?? null;
}

function upsertEndpoint(nextEndpoint) {
  endpointMap.set(nextEndpoint.id, nextEndpoint);
}

function clearSelect(selectEl) {
  selectEl.innerHTML = '';
}

function appendOption(selectEl, value, label) {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = label;
  selectEl.appendChild(option);
}

function populateCloudModelSelect(selectEl, models, configuredModel) {
  clearSelect(selectEl);
  const normalizedModels = Array.isArray(models) ? models : [];
  for (const model of normalizedModels) {
    appendOption(selectEl, model, model);
  }

  if (!normalizedModels.length) {
    appendOption(selectEl, '', 'No models available');
    selectEl.value = '';
    return;
  }

  const fallback = normalizedModels[0];
  selectEl.value = normalizedModels.includes(configuredModel) ? configuredModel : fallback;
}

function setOllamaModelField({
  selectEl,
  hintEl,
  configuredModel,
  models,
  ok,
  error
}) {
  clearSelect(selectEl);
  const normalizedModels = Array.isArray(models) ? models : [];
  const hasConfigured = configuredModel && normalizedModels.includes(configuredModel);

  if (normalizedModels.length) {
    for (const model of normalizedModels) {
      appendOption(selectEl, model, model);
    }
    if (hasConfigured) {
      selectEl.value = configuredModel;
    } else if (configuredModel) {
      appendOption(selectEl, configuredModel, `${configuredModel} (current)`);
      selectEl.value = configuredModel;
    } else {
      selectEl.value = normalizedModels[0];
    }
    hintEl.textContent = ok ? '' : `Using discovered models (${error}).`;
    return;
  }

  if (configuredModel) {
    appendOption(selectEl, configuredModel, `${configuredModel} (current)`);
    selectEl.value = configuredModel;
  } else {
    appendOption(selectEl, '', 'No models available');
    selectEl.value = '';
  }
  hintEl.textContent = error ? `Model discovery unavailable: ${error}` : 'Model discovery unavailable.';
}

function getSelectedOllamaModel(selectEl) {
  return selectEl.value.trim();
}

function applyModelCatalogToForms() {
  const remote = getEndpoint('remote-ollama');
  const local = getEndpoint('local-ollama');
  const openai = getEndpoint('openai');
  const anthropic = getEndpoint('anthropic');

  populateCloudModelSelect(
    openaiModelEl,
    modelCatalog?.cloud?.openai ?? [],
    openai?.config?.model ?? ''
  );
  populateCloudModelSelect(
    anthropicModelEl,
    modelCatalog?.cloud?.anthropic ?? [],
    anthropic?.config?.model ?? ''
  );

  const remoteModelInfo = modelCatalog?.ollama?.['remote-ollama'] ?? {
    ok: false,
    models: [],
    error: 'No response from backend'
  };
  setOllamaModelField({
    selectEl: remoteOllamaModelEl,
    hintEl: remoteOllamaModelHintEl,
    configuredModel: remote?.config?.model ?? '',
    ...remoteModelInfo
  });

  const localModelInfo = modelCatalog?.ollama?.['local-ollama'] ?? {
    ok: false,
    models: [],
    error: 'No response from backend'
  };
  setOllamaModelField({
    selectEl: localOllamaModelEl,
    hintEl: localOllamaModelHintEl,
    configuredModel: local?.config?.model ?? '',
    ...localModelInfo
  });
}

function syncEndpointFormFields() {
  const remote = getEndpoint('remote-ollama');
  const local = getEndpoint('local-ollama');

  if (remote) {
    remoteOllamaUrlEl.value = remote.config?.baseUrl ?? '';
  }

  if (local) {
    localOllamaUrlEl.value = local.config?.baseUrl ?? '';
  }

  applyModelCatalogToForms();
}

function collectEndpointsForSave() {
  const remote = getEndpoint('remote-ollama');
  const local = getEndpoint('local-ollama');
  const openai = getEndpoint('openai');
  const anthropic = getEndpoint('anthropic');

  if (!remote || !local || !openai || !anthropic) {
    throw new Error('Missing required endpoint configuration. Reload the options page.');
  }

  upsertEndpoint({
    ...remote,
    config: {
      ...remote.config,
      baseUrl: remoteOllamaUrlEl.value.trim(),
      model: getSelectedOllamaModel(remoteOllamaModelEl)
    }
  });

  upsertEndpoint({
    ...local,
    config: {
      ...local.config,
      baseUrl: localOllamaUrlEl.value.trim(),
      model: getSelectedOllamaModel(localOllamaModelEl)
    }
  });

  upsertEndpoint({
    ...openai,
    config: {
      ...openai.config,
      model: openaiModelEl.value.trim()
    }
  });

  upsertEndpoint({
    ...anthropic,
    config: {
      ...anthropic.config,
      model: anthropicModelEl.value.trim()
    }
  });

  const orderedIds = [...enabledOrder, ...disabledOrder];
  const orderedSet = new Set(orderedIds);
  const extras = Array.from(endpointMap.values())
    .map((endpoint) => endpoint.id)
    .filter((id) => !orderedSet.has(id));

  const allIds = [...orderedIds, ...extras];
  return allIds.map((id) => {
    const endpoint = endpointMap.get(id);
    const { enabled, ...rest } = endpoint;
    return rest;
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

function deriveRouting(config) {
  const routing = config.routing ?? {};
  if (Array.isArray(routing.enabled) || Array.isArray(routing.disabled)) {
    return {
      enabled: [...(routing.enabled ?? [])],
      disabled: [...(routing.disabled ?? [])]
    };
  }

  return {
    enabled: [...(routing.primary ?? []), ...(routing.fallback ?? [])],
    disabled: []
  };
}

async function refreshModelCatalog() {
  try {
    modelCatalog = await callApi('/v1/models');
  } catch {
    modelCatalog = {
      cloud: {
        openai: ['gpt-4.1-mini'],
        anthropic: ['claude-3-5-haiku-latest']
      },
      ollama: {}
    };
  }
}

async function refreshBackendState() {
  try {
    const [config, schema, secretsStatus] = await Promise.all([
      callApi('/v1/config'),
      callApi('/v1/config/schema'),
      callApi('/v1/secrets/status')
    ]);
    await refreshModelCatalog();

    backendConnected = true;
    setStatus(connectionEl, 'Connected to companion service.', 'ok');

    endpointMap = new Map((config.endpoints ?? []).map((endpoint) => [endpoint.id, endpoint]));
    const routing = deriveRouting(config);
    enabledOrder = routing.enabled;
    disabledOrder = routing.disabled;

    const known = new Set([...enabledOrder, ...disabledOrder]);
    for (const endpoint of endpointMap.values()) {
      if (!known.has(endpoint.id)) {
        disabledOrder.push(endpoint.id);
      }
    }

    timeoutEl.min = String(schema.constraints.timeoutMs.min);
    timeoutEl.max = String(schema.constraints.timeoutMs.max);
    timeoutEl.value = String(config.timeoutMs);
    historyModeEl.value = config.history.enabled ? 'enabled' : 'disabled';

    syncEndpointFormFields();
    renderModelLists();

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

  setBackendEnabled(backendConnected);
}

async function saveBackendConfig() {
  if (!backendConnected) return;

  setStatus(backendStatusEl, 'Saving backend config...');
  saveConfigBtn.disabled = true;

  try {
    const endpoints = collectEndpointsForSave();
    const updated = await callApi('/v1/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        endpoints,
        routing: {
          enabled: enabledOrder,
          disabled: disabledOrder
        },
        timeoutMs: Number(timeoutEl.value),
        history: { enabled: historyModeEl.value === 'enabled' }
      })
    });
    endpointMap = new Map((updated.endpoints ?? []).map((endpoint) => [endpoint.id, endpoint]));
    const routing = deriveRouting(updated);
    enabledOrder = routing.enabled;
    disabledOrder = routing.disabled;
    const known = new Set([...enabledOrder, ...disabledOrder]);
    for (const endpoint of endpointMap.values()) {
      if (!known.has(endpoint.id)) {
        disabledOrder.push(endpoint.id);
      }
    }
    timeoutEl.value = String(updated.timeoutMs);
    historyModeEl.value = updated.history.enabled ? 'enabled' : 'disabled';
    await refreshModelCatalog();
    syncEndpointFormFields();
    renderModelLists();
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

  try {
    await saveShortcut(shortcut);
  } catch (error) {
    setStatus(shortcutStatusEl, `Could not save shortcut: ${error.message}`, 'error');
  }
});

recordBtn.addEventListener('click', () => {
  isRecording = true;
  updateRecordingUi();
  setStatus(shortcutStatusEl, 'Press your shortcut. Esc to cancel.');
});

resetBtn.addEventListener('click', async () => {
  const shortcut = parseShortcut(DEFAULT_SHORTCUT);
  try {
    await saveShortcut(shortcut);
  } catch (error) {
    setStatus(shortcutStatusEl, `Could not reset shortcut: ${error.message}`, 'error');
  }
});

saveConfigBtn.addEventListener('click', saveBackendConfig);
saveOpenAiBtn.addEventListener('click', onSaveOpenAiKey);
saveAnthropicBtn.addEventListener('click', onSaveAnthropicKey);

Promise.all([renderCurrentShortcut(), refreshBackendState()]).catch((error) => {
  setStatus(shortcutStatusEl, error.message, 'error');
});

activateTabGroup(topTabs, topPanels, 'tab-shortcut');
activateTabGroup(backendTabs, backendPanels, 'tab-model-order');
updateRecordingUi();
