import { describe, expect, it } from 'vitest';
import { DEV_JWT_SECRET, loadConfig } from '../src/config.js';

describe('loadConfig', () => {
  it('falls back to the development secret outside production', () => {
    expect(loadConfig({}).JWT_SECRET).toBe(DEV_JWT_SECRET);
  });

  it('refuses to start in production without an explicit JWT secret', () => {
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow(/JWT_SECRET/);
    expect(() => loadConfig({ NODE_ENV: 'production', JWT_SECRET: DEV_JWT_SECRET })).toThrow(/JWT_SECRET/);
    expect(() => loadConfig({ NODE_ENV: 'production', JWT_SECRET: 'too-short' })).toThrow(/JWT_SECRET/);
  });

  it('accepts a strong secret in production', () => {
    const secret = 'x'.repeat(32);
    expect(loadConfig({ NODE_ENV: 'production', JWT_SECRET: secret }).JWT_SECRET).toBe(secret);
  });
});
