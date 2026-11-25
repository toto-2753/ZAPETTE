// Chiffrement du catalogue pour une Zapette privée (mot de passe partagé avec les personnes invitées).
// AES-GCM 256 bits, clé dérivée du mot de passe par PBKDF2-SHA256. Le catalogue est compressé
// (gzip) avant chiffrement pour rester léger.
import { createHash, webcrypto } from 'node:crypto';
import { gzipSync } from 'node:zlib';

const { subtle } = webcrypto;
export const ITERATIONS = 600_000;
export const MAGIC = 'ZAP1';

/** Sel stable pour un dépôt donné : la clé dérivée reste valable d'une vérification à l'autre. */
export function saltFor(seed) {
  return createHash('sha256').update(`zapette-salt:${seed}`).digest().subarray(0, 16);
}

export async function deriveKey(password, salt, iterations = ITERATIONS) {
  const base = await subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return subtle.deriveKey({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
  ]);
}

/** Retourne le fichier chiffré : « ZAP1 » + IV (12 octets) + données chiffrées. */
export async function encryptCatalog(json, password, salt, iterations = ITERATIONS) {
  const key = await deriveKey(password, salt, iterations);
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const plain = gzipSync(Buffer.from(json, 'utf8'), { level: 9 });
  const ct = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv }, key, plain));
  return Buffer.concat([Buffer.from(MAGIC, 'ascii'), Buffer.from(iv), Buffer.from(ct)]);
}

/** Dossier secret des playlists pour les apps TV (calculé aussi par l'app à partir du mot de passe). */
export function playlistToken(password) {
  return createHash('sha256').update(`zapette-playlists:${password}`).digest('hex').slice(0, 24);
}
