import { afterEach, describe, expect, it, vi } from 'vitest';
import { sha256Hex } from './hash';

describe('sha256Hex', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns the SHA-256 digest using Web Crypto when available', async () => {
    expect(await sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('falls back to a compatible SHA-256 implementation when Web Crypto is unavailable', async () => {
    vi.stubGlobal('crypto', undefined);

    expect(await sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});
