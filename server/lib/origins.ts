export function normalizeOrigin(value: string): string {
  const parsed = new URL(value);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Origin must use http or https');
  }
  return parsed.origin;
}
