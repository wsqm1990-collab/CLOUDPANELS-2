// Repackage a comic as CBZ without touching the images: every page keeps its
// exact bytes and file name; the ZIP uses "store" (no recompression).
import { openComic, crc32 } from './reader.js';

const encoder = new TextEncoder();
const MAX_ZIP = 4 * 1024 * 1024 * 1024 - 1;

function dosTime(date = new Date()) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}

/** Build a stored (uncompressed) ZIP from [{ name, bytes }]. */
export function storedZip(files) {
  const { time, day } = dosTime();
  const locals = [], centrals = [];
  let offset = 0;
  for (const { name, bytes } of files) {
    const nameBytes = encoder.encode(name), crc = crc32(bytes);
    const local = new Uint8Array(30 + nameBytes.length), lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(6, 0x0800, true); lv.setUint16(8, 0, true);
    lv.setUint16(10, time, true); lv.setUint16(12, day, true); lv.setUint32(14, crc, true);
    lv.setUint32(18, bytes.length, true); lv.setUint32(22, bytes.length, true); lv.setUint16(26, nameBytes.length, true); lv.setUint16(28, 0, true);
    local.set(nameBytes, 30);
    const central = new Uint8Array(46 + nameBytes.length), cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x0800, true); cv.setUint16(10, 0, true);
    cv.setUint16(12, time, true); cv.setUint16(14, day, true); cv.setUint32(16, crc, true);
    cv.setUint32(20, bytes.length, true); cv.setUint32(24, bytes.length, true); cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true); central.set(nameBytes, 46);
    locals.push(local, bytes); centrals.push(central);
    offset += local.length + bytes.length;
    if (offset > MAX_ZIP) throw new Error('This comic is too large to convert (over 4 GB).');
  }
  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22), ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true); ev.setUint32(16, offset, true);
  const total = offset + centralSize + 22, out = new Uint8Array(total);
  let position = 0;
  for (const part of [...locals, ...centrals, end]) { out.set(part, position); position += part.length; }
  return out;
}

const u16 = (view, at, value) => view.setUint16(at, value, true), u32 = (view, at, value) => view.setUint32(at, value, true);

/**
 * Convert a comic to CBZ page by page, streaming the result into `createUpload`
 * so even very large comics never sit in memory at once. Pages keep their exact
 * bytes, names and order. Returns { result, pageCount, checks } where checks
 * holds the CRC of the first and last pages for verification after upload.
 *
 * createUpload(totalBytes) must return { write(Uint8Array) → Promise, end() → Promise<result>, abort() }.
 */
export async function streamToCbz(source, { signal, onProgress, openOptions = {}, createUpload } = {}) {
  const book = await openComic(source, { signal, ...openOptions, onProgress: info => onProgress?.({ phase: 'open', ...info }) });
  let upload;
  try {
    const names = book.metadata?.pageNames || [], sizes = book.pageSizes || [];
    if (!book.pageCount || names.length !== book.pageCount || sizes.length !== book.pageCount || sizes.some(size => !Number.isSafeInteger(size) || size <= 0))
      throw new Error('The pages of this comic could not be listed.');
    const used = new Set(), plan = names.map((raw, index) => {
      let name = String(raw).replace(/^\/+/, '') || `page-${String(index + 1).padStart(4, '0')}.jpg`;
      while (used.has(name)) name = name.replace(/(\.[^.]+)?$/, '_$1');
      used.add(name); return { name, nameBytes: encoder.encode(name), size: sizes[index] };
    });
    const info = book.comicInfoFile instanceof Blob && book.comicInfoFile.size ? book.comicInfoFile : null;
    if (info && !used.has('ComicInfo.xml')) plan.push({ name: 'ComicInfo.xml', nameBytes: encoder.encode('ComicInfo.xml'), size: info.size, info });
    let total = 22;
    for (const entry of plan) total += 30 + entry.nameBytes.length + entry.size + 16 + 46 + entry.nameBytes.length;
    if (total > MAX_ZIP) throw new Error('This comic is too large to convert (over 4 GB).');
    upload = await createUpload(total);
    const { time, day } = dosTime(), centrals = [];
    let offset = 0;
    const checks = {};
    for (let index = 0; index < plan.length; index++) {
      signal?.throwIfAborted();
      const entry = plan[index];
      const bytes = new Uint8Array(await (entry.info || await book.page(index, { signal })).arrayBuffer());
      if (bytes.length !== entry.size) throw new Error('A page has an unexpected size.');
      const crc = crc32(bytes);
      if (!entry.info && (index === 0 || index === book.pageCount - 1)) checks[index] = crc;
      const local = new Uint8Array(30 + entry.nameBytes.length), lv = new DataView(local.buffer);
      u32(lv, 0, 0x04034b50); u16(lv, 4, 20); u16(lv, 6, 0x0808); u16(lv, 8, 0); u16(lv, 10, time); u16(lv, 12, day);
      u32(lv, 14, 0); u32(lv, 18, entry.size); u32(lv, 22, entry.size); u16(lv, 26, entry.nameBytes.length); u16(lv, 28, 0); local.set(entry.nameBytes, 30);
      const descriptor = new Uint8Array(16), dv = new DataView(descriptor.buffer);
      u32(dv, 0, 0x08074b50); u32(dv, 4, crc); u32(dv, 8, entry.size); u32(dv, 12, entry.size);
      await upload.write(local); await upload.write(bytes); await upload.write(descriptor);
      const central = new Uint8Array(46 + entry.nameBytes.length), cv = new DataView(central.buffer);
      u32(cv, 0, 0x02014b50); u16(cv, 4, 20); u16(cv, 6, 20); u16(cv, 8, 0x0808); u16(cv, 10, 0); u16(cv, 12, time); u16(cv, 14, day);
      u32(cv, 16, crc); u32(cv, 20, entry.size); u32(cv, 24, entry.size); u16(cv, 28, entry.nameBytes.length); u32(cv, 42, offset); central.set(entry.nameBytes, 46);
      centrals.push(central);
      offset += local.length + bytes.length + descriptor.length;
      onProgress?.({ phase: 'pages', done: Math.min(index + 1, book.pageCount), total: book.pageCount });
    }
    const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
    for (const central of centrals) await upload.write(central);
    const end = new Uint8Array(22), ev = new DataView(end.buffer);
    u32(ev, 0, 0x06054b50); u16(ev, 8, plan.length); u16(ev, 10, plan.length); u32(ev, 12, centralSize); u32(ev, 16, offset);
    await upload.write(end);
    if (offset + centralSize + 22 !== total) throw new Error('The converted size does not match.');
    onProgress?.({ phase: 'upload' });
    const result = await upload.end();
    return { result, pageCount: book.pageCount, checks, total };
  } catch (error) { try { upload?.abort(); } catch {} throw error; }
  finally { book.close(); }
}

/** Open a converted CBZ (for example the uploaded copy) and confirm it matches. */
export async function verifyCbz(source, { pageCount, checks, signal } = {}) {
  const book = await openComic(source, { signal });
  try {
    if (book.type !== 'cbz' || book.pageCount !== pageCount) throw new Error('The converted comic has a different number of pages.');
    for (const [index, crc] of Object.entries(checks || {})) {
      const bytes = new Uint8Array(await (await book.page(Number(index), { signal })).arrayBuffer());
      if (crc32(bytes) !== crc) throw new Error('The converted pages do not match the original.');
    }
    return true;
  } finally { book.close(); }
}

/** Convenience for small comics and tests: returns the CBZ bytes in memory. */
export async function convertToCbz(source, { signal, onProgress, openOptions = {} } = {}) {
  const parts = [];
  const { pageCount, checks, total } = await streamToCbz(source, { signal, onProgress, openOptions, createUpload: async () => ({ async write(chunk) { parts.push(chunk.slice()); }, async end() { return null; }, abort() { parts.length = 0; } }) });
  const bytes = new Uint8Array(total); let at = 0; for (const part of parts) { bytes.set(part, at); at += part.length; }
  onProgress?.({ phase: 'verify' });
  await verifyCbz({ name: 'check.cbz', size: bytes.length, read: async (a, b) => bytes.slice(a, b) }, { pageCount, checks, signal });
  return { bytes, pageCount };
}
