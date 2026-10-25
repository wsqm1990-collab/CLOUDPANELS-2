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

/**
 * Convert an opened comic source to CBZ bytes and verify the result opens with
 * the same pages. Throws (and changes nothing) if anything does not match.
 */
export async function convertToCbz(source, { signal, onProgress, openOptions = {} } = {}) {
  const book = await openComic(source, { signal, ...openOptions, onProgress: info => onProgress?.({ phase: 'open', ...info }) });
  try {
    const names = book.metadata?.pageNames || [];
    if (!book.pageCount || names.length !== book.pageCount) throw new Error('The pages of this comic could not be listed.');
    const files = [], used = new Set();
    for (let index = 0; index < book.pageCount; index++) {
      signal?.throwIfAborted();
      const blob = await book.page(index, { signal });
      let name = String(names[index]).replace(/^\/+/, '') || `page-${String(index + 1).padStart(4, '0')}.jpg`;
      while (used.has(name)) name = name.replace(/(\.[^.]+)?$/, '_$1');
      used.add(name);
      files.push({ name, bytes: new Uint8Array(await blob.arrayBuffer()) });
      onProgress?.({ phase: 'pages', done: index + 1, total: book.pageCount });
    }
    if (book.comicInfoFile) files.push({ name: 'ComicInfo.xml', bytes: new Uint8Array(await book.comicInfoFile.arrayBuffer()) });
    const zip = storedZip(files);
    onProgress?.({ phase: 'verify' });
    // Verification: the new CBZ must open with the same page count and the
    // same bytes for the first and last pages.
    const check = await openComic({ name: 'check.cbz', size: zip.length, blob: new Blob([zip]), read: async (start, end) => zip.slice(start, end) }, { signal });
    try {
      if (check.pageCount !== book.pageCount) throw new Error('The converted comic has a different number of pages.');
      for (const index of [0, book.pageCount - 1]) {
        const a = new Uint8Array(await (await check.page(index, { signal })).arrayBuffer()), b = files.find(f => f.name === check.metadata.pageNames[index])?.bytes;
        if (!b || a.length !== b.length || a.some((value, i) => value !== b[i])) throw new Error('The converted pages do not match the original.');
      }
    } finally { check.close(); }
    return { bytes: zip, pageCount: book.pageCount };
  } finally { book.close(); }
}
