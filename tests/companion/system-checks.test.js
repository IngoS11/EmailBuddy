import test from 'node:test';
import assert from 'node:assert/strict';
import { parseOllamaModelList } from '../../apps/companion/src/system-checks.js';

test('parseOllamaModelList handles ollama list output', () => {
  const output = [
    'NAME                ID              SIZE      MODIFIED',
    'llama3.1:8b         abc123          4.7 GB    2 days ago',
    'qwen2.5:14b         def456          9.0 GB    1 day ago'
  ].join('\n');

  assert.deepEqual(parseOllamaModelList(output), ['llama3.1:8b', 'qwen2.5:14b']);
});

test('parseOllamaModelList ignores empty input', () => {
  assert.deepEqual(parseOllamaModelList(''), []);
});
