import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mergeStyleRules,
  parseStyleMarkdown,
  styleRulesToPrompt
} from '../../packages/shared/src/style-parser.js';

const STYLE_MD = `
## global

do: be clear
avoid: buzzwords

## mode: casual

do: be warm
`;

test('parseStyleMarkdown parses global and mode sections', () => {
  const parsed = parseStyleMarkdown(STYLE_MD);
  assert.deepEqual(parsed.global.do, ['be clear']);
  assert.deepEqual(parsed.global.avoid, ['buzzwords']);
  assert.deepEqual(parsed.modes.casual.do, ['be warm']);
});

test('mergeStyleRules applies profile then global then mode precedence', () => {
  const parsed = parseStyleMarkdown(STYLE_MD);
  const merged = mergeStyleRules({
    rules: parsed,
    mode: 'casual',
    profile: {
      do: ['use contractions'],
      avoid: ['legalese'],
      signature_style: [],
      preferred_phrases: [],
      forbidden_phrases: []
    }
  });

  assert.deepEqual(merged.do, ['use contractions', 'be clear', 'be warm']);
  assert.deepEqual(merged.avoid, ['legalese', 'buzzwords']);
});

test('styleRulesToPrompt renders only populated directives', () => {
  const prompt = styleRulesToPrompt({
    do: ['be clear'],
    avoid: [],
    signature_style: ['short close'],
    preferred_phrases: [],
    forbidden_phrases: []
  });

  assert.match(prompt, /do: be clear/);
  assert.match(prompt, /signature style: short close/);
  assert.doesNotMatch(prompt, /avoid:/);
});
