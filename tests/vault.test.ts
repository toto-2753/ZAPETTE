import { describe, expect, it } from 'vitest';
// @ts-expect-error module Node en JavaScript (pas de types)
import { encryptCatalog, playlistToken as nodeToken, saltFor } from '../scripts/lib/vault.mjs';
import { decryptCatalog, deriveKey, playlistToken, WrongPassword } from '../src/lib/vault';

const catalog = { v: 1, channels: [{ id: 'A.fr', n: 'Alpha', g: [], s: [{ u: 'https://a/1.m3u8' }] }] };

describe('Zapette privée', () => {
  const salt: Buffer = saltFor('antoine/zapette');
  const info = { name: 'PBKDF2-SHA256', iterations: 2000, salt: salt.toString('base64') };

  it('le catalogue chiffré par la CI se déchiffre dans l’app avec le bon mot de passe', async () => {
    const file: Buffer = await encryptCatalog(JSON.stringify(catalog), 'tartiflette', salt, 2000);
    expect(file.subarray(0, 4).toString()).toBe('ZAP1');
    expect(file.includes(Buffer.from('Alpha'))).toBe(false);
    const key = await deriveKey('tartiflette', info);
    const buf = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
    expect(await decryptCatalog(buf, key)).toEqual(catalog);
  });

  it('refuse un mauvais mot de passe', async () => {
    const file: Buffer = await encryptCatalog(JSON.stringify(catalog), 'tartiflette', salt, 2000);
    const buf = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
    await expect(decryptCatalog(buf, await deriveKey('raclette', info))).rejects.toBeInstanceOf(WrongPassword);
  });

  it('chaque chiffrement utilise un vecteur différent', async () => {
    const a: Buffer = await encryptCatalog('{}', 'x', salt, 2000);
    const b: Buffer = await encryptCatalog('{}', 'x', salt, 2000);
    expect(a.subarray(4, 16).equals(b.subarray(4, 16))).toBe(false);
  });

  it('le dossier secret des playlists est le même côté CI et côté app', async () => {
    expect(await playlistToken('tartiflette')).toBe(nodeToken('tartiflette'));
    expect(nodeToken('tartiflette')).toHaveLength(24);
  });

  it('le sel dépend du dépôt mais reste stable', () => {
    expect(saltFor('a/b').equals(saltFor('a/b'))).toBe(true);
    expect(saltFor('a/b').equals(saltFor('c/d'))).toBe(false);
  });
});
