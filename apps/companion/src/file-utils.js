import os from 'node:os';
import path from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

export const EMAILBUDDY_DIR = path.join(os.homedir(), '.emailbuddy');
export const STYLE_PATH = path.join(EMAILBUDDY_DIR, 'STYLE.md');
export const CONFIG_PATH = path.join(EMAILBUDDY_DIR, 'config.json');
export const PROFILE_PATH = path.join(EMAILBUDDY_DIR, 'profile.json');
export const HISTORY_PATH = path.join(EMAILBUDDY_DIR, 'history.jsonl');

export async function ensureEmailBuddyDir() {
  await mkdir(EMAILBUDDY_DIR, { recursive: true });
}

export async function readJson(filePath, fallback) {
  try {
    const raw = await readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export async function writeJson(filePath, value) {
  await ensureEmailBuddyDir();
  await writeFile(filePath, JSON.stringify(value, null, 2), 'utf8');
}

export async function readText(filePath, fallback) {
  try {
    return await readFile(filePath, 'utf8');
  } catch {
    return fallback;
  }
}
