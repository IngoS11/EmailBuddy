import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const SERVICE = 'emailbuddy';

export async function setSecret(account, value) {
  await execFileAsync('security', [
    'add-generic-password',
    '-U',
    '-a',
    account,
    '-s',
    SERVICE,
    '-w',
    value
  ]);
}

export async function getSecret(account) {
  try {
    const { stdout } = await execFileAsync('security', [
      'find-generic-password',
      '-a',
      account,
      '-s',
      SERVICE,
      '-w'
    ]);
    return stdout.trim();
  } catch {
    return '';
  }
}
