import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const DEFAULT_LOCAL_MODEL = process.env.EMAILBUDDY_DEFAULT_MODEL || 'llama3.1:8b';

export function parseOllamaModelList(output) {
  const lines = String(output || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) {
    return [];
  }

  const withoutHeader = lines[0].toUpperCase().startsWith('NAME') ? lines.slice(1) : lines;
  return withoutHeader
    .map((line) => line.split(/\s+/)[0])
    .filter(Boolean);
}

async function checkOllamaVersion() {
  try {
    const { stdout, stderr } = await execFileAsync('ollama', ['--version']);
    const raw = `${stdout || ''}${stderr || ''}`.trim();
    return { installed: true, version: raw || null };
  } catch {
    return { installed: false, version: null };
  }
}

async function checkOllamaServeReachable() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1200);
  try {
    const response = await fetch('http://127.0.0.1:11434/api/tags', {
      method: 'GET',
      signal: controller.signal
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function checkModelPulled(model) {
  try {
    const { stdout } = await execFileAsync('ollama', ['list']);
    const models = parseOllamaModelList(stdout);
    return models.includes(model);
  } catch {
    return false;
  }
}

export async function getSystemChecks() {
  const model = DEFAULT_LOCAL_MODEL;
  const versionCheck = await checkOllamaVersion();

  if (!versionCheck.installed) {
    return {
      defaultLocalModel: model,
      ollamaInstalled: false,
      ollamaVersion: null,
      ollamaServeReachable: false,
      ollamaModelPulled: false
    };
  }

  const [reachable, modelPulled] = await Promise.all([
    checkOllamaServeReachable(),
    checkModelPulled(model)
  ]);

  return {
    defaultLocalModel: model,
    ollamaInstalled: true,
    ollamaVersion: versionCheck.version,
    ollamaServeReachable: reachable,
    ollamaModelPulled: modelPulled
  };
}
