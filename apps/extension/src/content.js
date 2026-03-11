const API_URL = 'http://127.0.0.1:48123/v1/rewrite';
const CONFIG_URL = 'http://127.0.0.1:48123/v1/config';
const DEFAULT_MODE = 'casual';
const SHORTCUT_KEY = 'shortcut';
const DEFAULT_SHORTCUT = 'Meta+Shift+E';
const THEME_PREFERENCE_KEY = 'emailbuddy.themePreference';
const THEME_SYNC_INTERVAL_MS = 60000;
let activeShortcut = parseShortcut(DEFAULT_SHORTCUT);
let themePreference = 'system';
let activeTheme = 'light';
const prefersDarkMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

function activeCompose() {
  return document.querySelector('div[aria-label="Message Body"][contenteditable="true"]')
    || document.querySelector('div[role="textbox"][contenteditable="true"]');
}

function getSelectedTextWithin(element) {
  const selection = window.getSelection();
  if (!selection || !selection.rangeCount) {
    return '';
  }

  const range = selection.getRangeAt(0);
  if (!element.contains(range.commonAncestorContainer)) {
    return '';
  }

  return selection.toString();
}

function replaceSelectionWithin(element, text) {
  const selection = window.getSelection();
  if (selection && selection.rangeCount) {
    const range = selection.getRangeAt(0);
    if (element.contains(range.commonAncestorContainer) && !range.collapsed) {
      range.deleteContents();
      range.insertNode(document.createTextNode(text));
      selection.removeAllRanges();
      return;
    }
  }

  element.focus();
  document.execCommand('selectAll', false);
  document.execCommand('insertText', false, text);
}

function showToast(message, isError = false) {
  const existing = document.getElementById('emailbuddy-toast');
  if (existing) {
    existing.remove();
  }

  const toast = document.createElement('div');
  toast.id = 'emailbuddy-toast';
  const errorClass = isError ? ' error' : '';
  const darkClass = activeTheme === 'dark' ? ' theme-dark' : '';
  toast.className = `emailbuddy-toast${errorClass}${darkClass}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 2200);
}

function normalizeThemePreference(theme) {
  const value = String(theme ?? '').trim().toLowerCase();
  if (value === 'light' || value === 'dark' || value === 'system') {
    return value;
  }
  return 'system';
}

function resolveEffectiveTheme(theme) {
  if (theme === 'light' || theme === 'dark') {
    return theme;
  }
  return prefersDarkMediaQuery.matches ? 'dark' : 'light';
}

function applyTheme(theme) {
  themePreference = normalizeThemePreference(theme);
  activeTheme = resolveEffectiveTheme(themePreference);
}

async function loadCachedThemePreference() {
  try {
    const stored = await chrome.storage.local.get([THEME_PREFERENCE_KEY]);
    return normalizeThemePreference(stored[THEME_PREFERENCE_KEY]);
  } catch {
    return 'system';
  }
}

async function cacheThemePreference(theme) {
  try {
    await chrome.storage.local.set({ [THEME_PREFERENCE_KEY]: normalizeThemePreference(theme) });
  } catch {
    // Ignore storage write failures and continue with in-memory theme.
  }
}

async function syncThemeFromBackend() {
  try {
    const response = await fetch(CONFIG_URL);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body.error || 'Could not load config');
    }
    const nextTheme = normalizeThemePreference(body?.appearance?.theme);
    applyTheme(nextTheme);
    await cacheThemePreference(nextTheme);
  } catch {
    applyTheme(await loadCachedThemePreference());
  }
}

function parseShortcut(shortcutString) {
  const tokens = String(shortcutString || '')
    .split('+')
    .map((t) => t.trim())
    .filter(Boolean);

  const result = {
    meta: false,
    ctrl: false,
    alt: false,
    shift: false,
    key: ''
  };

  for (const token of tokens) {
    const lower = token.toLowerCase();
    if (lower === 'meta' || lower === 'cmd' || lower === 'command') {
      result.meta = true;
    } else if (lower === 'ctrl' || lower === 'control') {
      result.ctrl = true;
    } else if (lower === 'alt' || lower === 'option') {
      result.alt = true;
    } else if (lower === 'shift') {
      result.shift = true;
    } else if (!result.key) {
      result.key = normalizeKey(token);
    }
  }

  if (!result.key) {
    return parseShortcut(DEFAULT_SHORTCUT);
  }

  return result;
}

function shortcutToLabel(shortcut) {
  const parts = [];
  if (shortcut.meta) parts.push('Cmd');
  if (shortcut.ctrl) parts.push('Ctrl');
  if (shortcut.alt) parts.push('Alt');
  if (shortcut.shift) parts.push('Shift');
  parts.push(shortcut.key.length === 1 ? shortcut.key.toUpperCase() : shortcut.key);
  return parts.join('+');
}

function normalizeKey(key) {
  if (!key) {
    return '';
  }

  if (key === ' ') {
    return 'space';
  }

  if (key.length === 1) {
    return key.toLowerCase();
  }

  return key.toLowerCase();
}

function matchesShortcut(event, shortcut) {
  return event.metaKey === shortcut.meta
    && event.ctrlKey === shortcut.ctrl
    && event.altKey === shortcut.alt
    && event.shiftKey === shortcut.shift
    && normalizeKey(event.key) === normalizeKey(shortcut.key);
}

async function loadShortcut() {
  const stored = await chrome.storage.sync.get([SHORTCUT_KEY]);
  activeShortcut = parseShortcut(stored[SHORTCUT_KEY] ?? DEFAULT_SHORTCUT);
}

async function beautifyFromShortcut() {
  const composeEl = activeCompose();
  if (!composeEl) {
    showToast('No active Gmail compose found.', true);
    return;
  }

  const selected = getSelectedTextWithin(composeEl);
  const sourceText = selected || composeEl.innerText;
  if (!sourceText.trim()) {
    showToast('No text found in compose box.', true);
    return;
  }

  showToast('Rewriting...');

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: sourceText,
        mode: DEFAULT_MODE
      })
    });

    const body = await response.json();
    if (!response.ok) {
      throw new Error(body.error || 'Rewrite failed');
    }

    replaceSelectionWithin(composeEl, body.rewrittenText);
    showToast(`Done via ${body.providerUsed}.`);
  } catch (error) {
    showToast(`EmailBuddy error: ${error.message}`, true);
  }
}

function onShortcutKeydown(event) {
  if (!matchesShortcut(event, activeShortcut)) {
    return;
  }

  const composeEl = activeCompose();
  if (!composeEl) {
    showToast('No active Gmail compose found.', true);
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  beautifyFromShortcut();
}

// Capture phase is more reliable in Gmail, which may stop bubbling key events.
document.addEventListener('keydown', onShortcutKeydown, true);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes[SHORTCUT_KEY]) {
    activeShortcut = parseShortcut(changes[SHORTCUT_KEY].newValue ?? DEFAULT_SHORTCUT);
    showToast(`EmailBuddy shortcut updated: ${shortcutToLabel(activeShortcut)}`);
  }

  if (area === 'local' && changes[THEME_PREFERENCE_KEY]) {
    applyTheme(changes[THEME_PREFERENCE_KEY].newValue);
  }
});

if (typeof prefersDarkMediaQuery.addEventListener === 'function') {
  prefersDarkMediaQuery.addEventListener('change', () => {
    if (themePreference === 'system') {
      applyTheme('system');
    }
  });
} else if (typeof prefersDarkMediaQuery.addListener === 'function') {
  prefersDarkMediaQuery.addListener(() => {
    if (themePreference === 'system') {
      applyTheme('system');
    }
  });
}

loadShortcut().catch(() => {
  activeShortcut = parseShortcut(DEFAULT_SHORTCUT);
});

(async () => {
  applyTheme(await loadCachedThemePreference());
  await syncThemeFromBackend();
  window.setInterval(() => {
    syncThemeFromBackend().catch(() => {});
  }, THEME_SYNC_INTERVAL_MS);
})().catch(() => {
  applyTheme('system');
});
