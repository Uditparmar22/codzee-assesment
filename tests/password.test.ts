import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../src/modules/auth/password.js';

describe('password hashing', () => {
  it('verifies the right password and rejects a wrong one', async () => {
    const hash = await hashPassword('correct horse battery');
    expect(await verifyPassword('correct horse battery', hash)).toBe(true);
    expect(await verifyPassword('wrong', hash)).toBe(false);
  });

  it('salts each hash', async () => {
    expect(await hashPassword('same')).not.toBe(await hashPassword('same'));
  });

  it('returns false instead of throwing for malformed or truncated hashes', async () => {
    const hash = await hashPassword('pw');
    expect(await verifyPassword('pw', 'not-a-hash')).toBe(false);
    expect(await verifyPassword('pw', hash.slice(0, -2))).toBe(false);
  });
});
