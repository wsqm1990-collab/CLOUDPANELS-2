// MEGA encrypts every file with AES-128 in counter mode (CTR). The bundled
// MEGA library decrypts downloads in plain JavaScript, on the same thread that
// draws the reader and follows the finger: roughly a tenth of a second for
// every megabyte on a computer, several times more on an iPad in Low Power
// Mode. While a comic loaded in the background this froze scrolling and page
// turns for seconds at a time. The browser's own Web Crypto performs exactly
// the same decryption natively, away from that thread. Same key, same counter,
// same bytes: test/mega-fast-read.test.js checks it against the library.

const BLOCK = 16;

/** The AES key and counter prefix of a 32-byte MEGA file key, derived the way
 * the MEGA library does (key = first half XOR second half, nonce = bytes 16-23). */
export function megaFileCipher(fileKey) {
  if (!(fileKey instanceof Uint8Array) || fileKey.length !== 32) return null;
  const key = new Uint8Array(16);
  for (let i = 0; i < 16; i++) key[i] = fileKey[i] ^ fileKey[16 + i];
  return { key, nonce: fileKey.slice(16, 24) };
}

/** The counter block of the 16-byte block starting at `offset` (a multiple of 16):
 * the nonce followed by the block number as a 64-bit big-endian integer. */
export function megaCounter(nonce, offset) {
  if (!Number.isSafeInteger(offset) || offset < 0 || offset % BLOCK) throw new RangeError('MEGA ranges start on a 16-byte boundary.');
  const counter = new Uint8Array(16); counter.set(nonce.subarray(0, 8), 0);
  let block = offset / BLOCK;
  for (let i = 15; i >= 8 && block > 0; i--) { counter[i] = block % 256; block = Math.floor(block / 256); }
  return counter;
}

export function webCryptoAvailable(subtle = globalThis.crypto?.subtle) {
  return Boolean(subtle && typeof subtle.importKey === 'function' && typeof subtle.decrypt === 'function');
}

// One imported key per file key object (the MEGA library keeps it per file).
const imported = new WeakMap();
function importKey(fileKey, subtle) {
  let entry = imported.get(fileKey);
  if (!entry) {
    const cipher = megaFileCipher(fileKey);
    if (!cipher) return Promise.reject(new Error('Not a MEGA file key.'));
    entry = Promise.resolve(subtle.importKey('raw', cipher.key, { name: 'AES-CTR' }, false, ['decrypt']))
      .then(cryptoKey => ({ cryptoKey, nonce: cipher.nonce }));
    entry.catch(() => { if (imported.get(fileKey) === entry) imported.delete(fileKey); });
    imported.set(fileKey, entry);
  }
  return entry;
}

/** Decrypt `data`, the encrypted bytes of a file starting at byte `offset`
 * (a multiple of 16). Resolves with an ArrayBuffer of the same length. */
export async function decryptMegaRange(fileKey, offset, data, subtle = globalThis.crypto?.subtle) {
  if (!webCryptoAvailable(subtle)) throw new Error('Web Crypto is not available.');
  const { cryptoKey, nonce } = await importKey(fileKey, subtle);
  return subtle.decrypt({ name: 'AES-CTR', counter: megaCounter(nonce, offset), length: 64 }, cryptoKey, data);
}
