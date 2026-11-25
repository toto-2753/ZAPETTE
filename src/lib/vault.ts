// Ouverture d'une Zapette privée : dérive la clé depuis le mot de passe, déchiffre le catalogue,
// et mémorise la clé sur l'appareil (le mot de passe lui-même n'est jamais stocké).

export interface LockInfo {
  name: string;
  iterations: number;
  /** sel en base64 */
  salt: string;
}

interface Saved {
  salt: string;
  key: string;
  pl: string;
}

const STORE = 'zp.vault';
const MAGIC = 'ZAP1';

const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const toB64 = (b: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(b)));

export const vaultSupported = () => typeof crypto !== 'undefined' && !!crypto.subtle && typeof DecompressionStream !== 'undefined';

export async function deriveKey(password: string, info: LockInfo): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: fromB64(info.salt), iterations: info.iterations, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    true,
    ['decrypt'],
  );
}

export class WrongPassword extends Error {}

/** Déchiffre puis décompresse le fichier produit par scripts/lib/vault.mjs. */
export async function decryptCatalog<T = unknown>(buf: ArrayBuffer, key: CryptoKey): Promise<T> {
  const bytes = new Uint8Array(buf);
  if (String.fromCharCode(...bytes.slice(0, 4)) !== MAGIC) throw new Error('Fichier chiffré illisible');
  let plain: ArrayBuffer;
  try {
    plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(4, 16) }, key, bytes.slice(16));
  } catch {
    throw new WrongPassword('Mot de passe incorrect');
  }
  const stream = new Blob([plain]).stream().pipeThrough(new DecompressionStream('gzip'));
  return JSON.parse(await new Response(stream).text()) as T;
}

export async function playlistToken(password: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`zapette-playlists:${password}`));
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 24);
}

export function readSaved(): Saved | null {
  try {
    const raw = localStorage.getItem(STORE);
    return raw ? (JSON.parse(raw) as Saved) : null;
  } catch {
    return null;
  }
}

export async function saveKey(info: LockInfo, key: CryptoKey, pl: string) {
  const raw = await crypto.subtle.exportKey('raw', key);
  try {
    localStorage.setItem(STORE, JSON.stringify({ salt: info.salt, key: toB64(raw), pl } satisfies Saved));
  } catch {
    /* stockage interdit : le mot de passe sera redemandé au prochain lancement */
  }
}

export async function importSavedKey(saved: Saved): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', fromB64(saved.key), { name: 'AES-GCM' }, true, ['decrypt']);
}

export function forgetKey() {
  try {
    localStorage.removeItem(STORE);
  } catch {
    /* rien */
  }
}
