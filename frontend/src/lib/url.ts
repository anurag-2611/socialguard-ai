import type { Platform } from './types';

const HOSTS: Record<Platform, string[]> = {
  INSTAGRAM: ['instagram.com'],
  FACEBOOK: ['facebook.com'],
  X: ['x.com', 'twitter.com'],
};

const RESERVED = new Set(['p', 'reel', 'reels', 'explore', 'stories', 'accounts', 'home', 'login', 'i', 'share']);

export type ParsedProfile = { ok: true; handle: string } | { ok: false; error: string };

/**
 * Only profile URLs on the selected platform's own domain are accepted
 * (an allowlist, so the app can never be pointed at arbitrary hosts).
 */
export function parseProfileUrl(platform: Platform, raw: string): ParsedProfile {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, error: 'Enter a full URL, for example https://instagram.com/username' };
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { ok: false, error: 'Only http(s) URLs are accepted.' };
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  if (!HOSTS[platform].includes(host)) {
    return { ok: false, error: `URL must be on ${HOSTS[platform].join(' or ')} for this platform.` };
  }
  const first = url.pathname.split('/').filter(Boolean)[0];
  if (!first || RESERVED.has(first.toLowerCase())) {
    return { ok: false, error: 'This does not look like a profile URL.' };
  }
  const handle = first.replace(/^@/, '');
  if (!/^[A-Za-z0-9._]{1,64}$/.test(handle)) {
    return { ok: false, error: 'The profile handle contains unsupported characters.' };
  }
  return { ok: true, handle };
}
