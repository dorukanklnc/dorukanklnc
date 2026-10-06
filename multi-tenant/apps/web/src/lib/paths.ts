/** Only relative in-app paths are accepted as post-login targets (prevents open redirects). */
export function safeNextPath(value: string | null | undefined): string | null {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
    return null;
  }
  if (/^\/(login|logout)(\/|\?|$)/.test(value)) return null;
  return value;
}
