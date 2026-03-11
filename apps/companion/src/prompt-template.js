export const MAX_REWRITE_SYSTEM_TEMPLATE_LENGTH = 8000;

export const DEFAULT_REWRITE_SYSTEM_TEMPLATE = [
  'You are an email rewriting assistant.',
  'Mode: {{mode}}',
  'Rewrite the email naturally while preserving intent and facts.',
  'Respond in the same language as the input email.',
  'Do not translate unless the user explicitly asks for translation.',
  'Language preservation takes priority over style directives.',
  'Avoid introducing new commitments or changing meaning.',
  'Respect style directives below:',
  '{{rulesPrompt}}'
].join('\n');

export function renderRewriteSystemTemplate({ template, mode, rulesPrompt }) {
  const baseTemplate = String(template ?? '').trim() || DEFAULT_REWRITE_SYSTEM_TEMPLATE;
  return baseTemplate
    .replaceAll('{{mode}}', String(mode ?? '').trim())
    .replaceAll('{{rulesPrompt}}', String(rulesPrompt ?? '').trim());
}
