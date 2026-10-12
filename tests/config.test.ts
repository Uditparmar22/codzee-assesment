import { describe, expect, it } from 'vitest';
import { DEV_JWT_SECRET, loadConfig } from '../src/config.js';

describe('loadConfig', () => {
  it('falls back to the development secret in development and test', () => {
    expect(loadConfig({ NODE_ENV: 'development' }).JWT_SECRET).toBe(DEV_JWT_SECRET);
    expect(loadConfig({ NODE_ENV: 'test' }).JWT_SECRET).toBe(DEV_JWT_SECRET);
  });

  it('treats a missing NODE_ENV as production (fails closed)', () => {
    expect(() => loadConfig({})).toThrow(/JWT_SECRET/);
    expect(loadConfig({ JWT_SECRET: 'x'.repeat(32) }).NODE_ENV).toBe('production');
  });

  it('refuses to start in production without a strong JWT secret', () => {
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow(/JWT_SECRET/);
    expect(() => loadConfig({ NODE_ENV: 'production', JWT_SECRET: DEV_JWT_SECRET })).toThrow(/JWT_SECRET/);
    expect(() => loadConfig({ NODE_ENV: 'production', JWT_SECRET: 'too-short' })).toThrow(/JWT_SECRET/);
  });

  it('accepts a strong secret in production', () => {
    const secret = 'x'.repeat(32);
    expect(loadConfig({ NODE_ENV: 'production', JWT_SECRET: secret }).JWT_SECRET).toBe(secret);
  });
});
