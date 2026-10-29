import { withScheme } from './url';

export function isValidProfileEmail(value: string): boolean {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function isLinkedInUrl(value: string): boolean {
  try {
    const url = new URL(withScheme(value.trim()));
    return (
      (url.hostname === 'linkedin.com' || url.hostname.endsWith('.linkedin.com')) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}
