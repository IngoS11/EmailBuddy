const SUPPORTED_KEYS = new Set([
  'do',
  'avoid',
  'signature_style',
  'preferred_phrases',
  'forbidden_phrases'
]);

function emptyRuleSet() {
  return {
    do: [],
    avoid: [],
    signature_style: [],
    preferred_phrases: [],
    forbidden_phrases: []
  };
}

export function parseStyleMarkdown(markdown) {
  const lines = markdown.split(/\r?\n/);
  const rules = {
    global: emptyRuleSet(),
    modes: {}
  };

  let section = 'global';

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('# ') || line.startsWith('###')) {
      continue;
    }

    if (line.startsWith('## ')) {
      const header = line.slice(3).trim().toLowerCase();
      if (header === 'global') {
        section = 'global';
      } else if (header.startsWith('mode:')) {
        section = header.slice(5).trim();
        if (!rules.modes[section]) {
          rules.modes[section] = emptyRuleSet();
        }
      }
      continue;
    }

    const idx = line.indexOf(':');
    if (idx === -1) {
      continue;
    }

    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (!SUPPORTED_KEYS.has(key) || !value) {
      continue;
    }

    const target = section === 'global' ? rules.global : (rules.modes[section] ??= emptyRuleSet());
    target[key].push(value);
  }

  return rules;
}

export function mergeStyleRules({ rules, mode, profile }) {
  const modeRules = rules.modes[mode] ?? emptyRuleSet();
  const merged = emptyRuleSet();

  for (const key of Object.keys(merged)) {
    merged[key] = [
      ...(profile?.[key] ?? []),
      ...rules.global[key],
      ...modeRules[key]
    ];
  }

  return merged;
}

export function styleRulesToPrompt(rules) {
  const parts = [];
  for (const [key, values] of Object.entries(rules)) {
    if (!values.length) {
      continue;
    }

    const label = key.replace('_', ' ');
    parts.push(`${label}: ${values.join('; ')}`);
  }

  return parts.join('\n');
}
