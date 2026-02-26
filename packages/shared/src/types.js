export const MODES = ['casual', 'polished', 'concise'];

export function normalizeMode(mode) {
  if (!mode || typeof mode !== 'string') {
    return 'casual';
  }

  return mode.trim().toLowerCase();
}
