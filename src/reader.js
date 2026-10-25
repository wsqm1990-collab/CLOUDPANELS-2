import { Inflate } from 'fflate';

// Only a small footer, the central directory and selected image entries are
// requested for CBZ. PDFs are a bounded, temporary in-memory edition.
const MiB = 1024 * 1024;
const LIMITS = Object.freeze({ entry: 48 * MiB, directory: 16 * MiB,
  entries: 10000, xml: MiB, pdf: 128 * MiB, request: 4 * MiB,
  imagePixels: 24_000_000, imageDimension: 16384 });
const IMAGE = /\.(?:jpe?g|png|webp)$/i;
const decoder = new TextDecoder('utf-8');
const natural = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

function problem(message) { return new Error(message); }
function aborted(signal) {
  if (signal?.aborted) throw signal.reason instanceof Error ? signal.reason : new DOMException('Reading cancelled.', 'AbortError');
}
function joinedSignals(...signals) {
  const controller = new AbortController();
  const listeners = [];
  for (const signal of signals.filter(Boolean)) {
    if (signal.aborted) controller.abort(signal.reason);
    else { const fn = () => controller.abort(signal.reason); signal.addEventListener('abort', fn, { once: true }); listeners.push([signal, fn]); }
  }
  return { signal: controller.signal, dispose() { for (const [signal, fn] of listeners) signal.removeEventListener('abort', fn); } };
}
function u16(data, offset) { return data[offset] | (data[offset + 1] << 8); }
function u32(data, offset) { return (data[offset] | data[offset + 1] << 8 | data[offset + 2] << 16 | data[offset + 3] << 24) >>> 0; }
function equal(a, b) { return a.length === b.length && a.every((value, i) => value === b[i]); }
function concat(a, b) { const out = new Uint8Array(a.length + b.length); out.set(a); out.set(b, a.length); return out; }

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, n) => {
  for (let bit = 0; bit < 8; bit++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const value of bytes) crc = CRC_TABLE[(crc ^ value) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function checkedSource(source, sessionSignal) {
  if (!source || typeof source.read !== 'function' || !Number.isSafeInteger(source.size) || source.size < 0) throw problem('The comic source has an invalid size.');
  return async (start, end, signal = sessionSignal) => {
    aborted(sessionSignal); aborted(signal);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || end > source.size) throw problem('The comic contains an invalid byte range.');
    if (end - start > LIMITS.entry) throw problem('This comic needs a page larger than the 48 MB reading limit.');
    if (start === end) return new Uint8Array();
    const combined = joinedSignals(sessionSignal, signal);
    try {
      const result = await source.read(start, end, { signal: combined.signal });
      aborted(combined.signal);
      if (!(result instanceof Uint8Array) || result.length !== end - start) throw problem('The cloud returned an incomplete page. Please try again.');
      return result;
    } finally { combined.dispose(); }
  };
}

function safePath(raw) {
  const name = decoder.decode(raw).replaceAll('\\', '/');
  if (!name || /[\u0000-\u001f\u007f]/.test(name) || name.startsWith('/') || /^[a-z]:/i.test(name) || name.split('/').some(part => part === '..')) throw problem('This archive contains an unsafe file path.');
  return name;
}
function checkExtras(bytes) {
  for (let offset = 0; offset < bytes.length;) {
    if (offset + 4 > bytes.length) throw problem('The ZIP extra information is damaged.');
    const id = u16(bytes, offset), size = u16(bytes, offset + 2);
    if (id === 1) throw problem('ZIP64 comics are not supported in the web reader yet.');
    offset += 4 + size;
    if (offset > bytes.length) throw problem('The ZIP extra information is damaged.');
  }
}

// Incremental inflation keeps a false advertised size from allocating an
// unbounded output. At most 4 KiB of compressed input is pushed at a time.
function inflateBounded(compressed, expected, signal) {
  const output = new Uint8Array(expected);
  let count = 0;
  const inflater = new Inflate(chunk => {
    if (chunk.length > expected - count) throw problem('The page expands beyond its declared size.');
    output.set(chunk, count); count += chunk.length;
  });
  try {
    for (let offset = 0; offset < compressed.length; offset += 4096) {
      aborted(signal);
      inflater.push(compressed.subarray(offset, offset + 4096), offset + 4096 >= compressed.length);
    }
    if (!compressed.length) inflater.push(compressed, true);
  } catch (error) {
    if (error?.name === 'AbortError' || /declared size/.test(error?.message || '')) throw error;
    throw problem('This compressed page is damaged or unsupported.');
  }
  if (count !== expected) throw problem('The page size does not match its archive record.');
  return output;
}

function imageSize(width, height) {
  if (!width || !height || width > LIMITS.imageDimension || height > LIMITS.imageDimension || width * height > LIMITS.imagePixels) throw problem('This page image exceeds the 24-megapixel browser reading limit.');
}
function sniffImage(bytes) {
  if (bytes.length >= 24 && bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71 && bytes[4] === 13 && bytes[5] === 10 && bytes[6] === 26 && bytes[7] === 10) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (decoder.decode(bytes.subarray(12, 16)) !== 'IHDR') throw problem('The PNG page header is damaged.');
    imageSize(view.getUint32(16), view.getUint32(20));
    // Comic pages are static. Reject APNG rather than allowing animation to
    // allocate multiple decoded frames while the app promises bounded memory.
    for (let offset = 8, chunks = 0; offset + 12 <= bytes.length && chunks++ < 10000;) {
      if (decoder.decode(bytes.subarray(offset + 4, offset + 8)) === 'acTL') throw problem('Animated image pages are not supported.');
      const length = view.getUint32(offset); offset += 12 + length;
      if (offset > bytes.length) throw problem('The PNG page is incomplete.');
    }
    return 'image/png';
  }
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) {
    let offset = 2;
    for (let segments = 0; offset + 1 < bytes.length && segments < 10000; segments++) {
      if (bytes[offset++] !== 255) throw problem('The JPEG page header is damaged.');
      while (bytes[offset] === 255) offset++;
      const marker = bytes[offset++];
      if (marker === 0xd9 || marker === 0xda) break;
      if (marker === 1 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > bytes.length) break;
      const length = (bytes[offset] << 8) | bytes[offset + 1];
      if (length < 2 || offset + length > bytes.length) break;
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        if (length < 8) break;
        imageSize(bytes[offset + 5] << 8 | bytes[offset + 6], bytes[offset + 3] << 8 | bytes[offset + 4]);
        return 'image/jpeg';
      }
      offset += length;
    }
    throw problem('The JPEG page dimensions could not be read.');
  }
  if (bytes.length >= 30 && decoder.decode(bytes.subarray(0, 4)) === 'RIFF' && decoder.decode(bytes.subarray(8, 12)) === 'WEBP') {
    const kind = decoder.decode(bytes.subarray(12, 16));
    if (kind === 'VP8X') {
      if (bytes[20] & 2) throw problem('Animated image pages are not supported.');
      imageSize(1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16), 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16));
    } else if (kind === 'VP8 ') imageSize(u16(bytes, 26) & 0x3fff, u16(bytes, 28) & 0x3fff);
    else if (kind === 'VP8L' && bytes[20] === 0x2f) imageSize(1 + bytes[21] + ((bytes[22] & 0x3f) << 8), 1 + (bytes[22] >> 6) + (bytes[23] << 2) + ((bytes[24] & 15) << 10));
    else throw problem('The WebP page dimensions could not be read.');
    return 'image/webp';
  }
  throw problem('This page is not a supported JPEG, PNG or WebP image.');
}

async function zipFooter(size, read, signal) {
  if (size < 22) throw problem('This ZIP comic is incomplete.');
  if (size > 0xffffffff) throw problem('ZIP64 comics are not supported in the web reader yet.');
  let start = size - 22;
  let tail = await read(start, size, signal);
  const earliest = Math.max(0, size - 65557);
  for (;;) {
    for (let i = tail.length - 22; i >= 0; i--) {
      if (u32(tail, i) === 0x06054b50 && i + 22 + u16(tail, i + 20) === tail.length) return { data: tail.subarray(i, i + 22), offset: start + i };
    }
    if (start === earliest) throw problem('The ZIP directory could not be found.');
    const nextStart = Math.max(earliest, start - 4096);
    tail = concat(await read(nextStart, start, signal), tail); start = nextStart;
  }
}

async function zipComic(source, read, signal, closed) {
  const footer = await zipFooter(source.size, read, signal);
  const end = footer.data;
  if (u16(end, 4) !== 0 || u16(end, 6) !== 0 || u16(end, 8) !== u16(end, 10)) throw problem('Split ZIP comics are not supported.');
  const count = u16(end, 10), directorySize = u32(end, 12), directoryOffset = u32(end, 16);
  if (count === 65535 || directorySize === 0xffffffff || directoryOffset === 0xffffffff) throw problem('ZIP64 comics are not supported in the web reader yet.');
  if (!count || count > LIMITS.entries) throw problem('This archive exceeds the 10,000-file limit or is empty.');
  if (directorySize > LIMITS.directory || directorySize < count * 46 || directoryOffset + directorySize > footer.offset) throw problem('The ZIP directory is damaged or exceeds the 16 MB limit.');
  const directory = await read(directoryOffset, directoryOffset + directorySize, signal);
  const pages = [], names = new Set();
  let comicInfo;
  let offset = 0;
  for (let i = 0; i < count; i++) {
    aborted(signal);
    if (offset + 46 > directory.length || u32(directory, offset) !== 0x02014b50) throw problem('The ZIP directory is damaged.');
    const flags = u16(directory, offset + 8), method = u16(directory, offset + 10), crc = u32(directory, offset + 16);
    const compressed = u32(directory, offset + 20), expanded = u32(directory, offset + 24), nameSize = u16(directory, offset + 28), extraSize = u16(directory, offset + 30), commentSize = u16(directory, offset + 32);
    const disk = u16(directory, offset + 34), attributes = u32(directory, offset + 38), local = u32(directory, offset + 42);
    const recordEnd = offset + 46 + nameSize + extraSize + commentSize;
    if (recordEnd > directory.length || !nameSize) throw problem('The ZIP filename information is damaged.');
    if (flags & 0x0041) throw problem('Password-protected ZIP comics are not supported.');
    if (disk) throw problem('Split ZIP comics are not supported.');
    if ([compressed, expanded, local].includes(0xffffffff)) throw problem('ZIP64 comics are not supported in the web reader yet.');
    const rawName = directory.slice(offset + 46, offset + 46 + nameSize);
    const name = safePath(rawName);
    checkExtras(directory.subarray(offset + 46 + nameSize, offset + 46 + nameSize + extraSize));
    if (names.has(name)) throw problem('This archive contains duplicate filenames.');
    names.add(name);
    const isPage = IMAGE.test(name) && !name.split('/').some(part => part === '__MACOSX' || part.startsWith('.'));
    const isMetadata = /(?:^|\/)ComicInfo\.xml$/i.test(name);
    if (isPage || isMetadata) {
      if (method !== 0 && method !== 8) throw problem('This ZIP uses a compression method the web reader does not support.');
      const limit = isMetadata ? LIMITS.xml : LIMITS.entry;
      if (compressed > limit || expanded > limit || local + 30 > directoryOffset) throw problem(isMetadata ? 'ComicInfo metadata exceeds the 1 MB limit.' : 'This page exceeds the 48 MB reading limit or has an invalid location.');
      if ((attributes >>> 16 & 0xf000) === 0xa000) throw problem('Symbolic links cannot be read as comic pages.');
      const entry = { name, rawName, flags, method, crc, compressed, expanded, local };
      if (isPage) pages.push(entry); else if (!comicInfo) comicInfo = entry;
    }
    offset = recordEnd;
  }
  if (offset !== directory.length) throw problem('The ZIP directory has unexpected trailing records.');
  if (!pages.length) throw problem('No JPEG, PNG or WebP comic pages were found in this archive.');
  pages.sort((a, b) => natural.compare(a.name, b.name));

  async function extract(entry, requestSignal) {
    aborted(requestSignal);
    const header = await read(entry.local, entry.local + 30, requestSignal);
    if (u32(header, 0) !== 0x04034b50 || u16(header, 6) !== entry.flags || u16(header, 8) !== entry.method) throw problem('The page header does not match its ZIP directory.');
    const nameSize = u16(header, 26), extraSize = u16(header, 28);
    const payload = entry.local + 30 + nameSize + extraSize;
    if (payload + entry.compressed > directoryOffset || payload < entry.local) throw problem('The page data lies outside the ZIP content area.');
    // Usually one contiguous request can fetch the filename/extra information
    // and the compressed image together, avoiding a cloud round trip per page.
    // A maximum-sized page retains separate requests to respect provider limits.
    const combinedLength = nameSize + extraSize + entry.compressed;
    const combined = combinedLength <= LIMITS.entry
      ? await read(entry.local + 30, payload + entry.compressed, requestSignal) : undefined;
    const extra = combined ? combined.subarray(0, nameSize + extraSize) : await read(entry.local + 30, payload, requestSignal);
    if (!equal(extra.subarray(0, nameSize), entry.rawName)) throw problem('The page filename does not match its ZIP directory.');
    checkExtras(extra.subarray(nameSize));
    if (!(entry.flags & 8) && (u32(header, 14) !== entry.crc || u32(header, 18) !== entry.compressed || u32(header, 22) !== entry.expanded)) throw problem('The page size does not match its ZIP directory.');
    const bytes = combined ? combined.subarray(nameSize + extraSize) : await read(payload, payload + entry.compressed, requestSignal);
    const expanded = entry.method === 0 ? bytes : inflateBounded(bytes, entry.expanded, requestSignal);
    if (expanded.length !== entry.expanded || crc32(expanded) !== entry.crc) throw problem('This page failed its ZIP integrity check.');
    aborted(requestSignal);
    return expanded;
  }

  const cache = new Map();
  const book = {
    type: 'cbz', pageCount: pages.length,
    metadata: { pageNames: pages.map(page => page.name) },
    get bufferedBytes() { return [...cache.values()].reduce((sum, blob) => sum + blob.size, 0); },
    clearCache() { cache.clear(); },
    async page(index, { signal: requestSignal } = {}) {
      if (closed.signal.aborted) aborted(closed.signal);
      if (!Number.isInteger(index) || index < 0 || index >= pages.length) throw problem('This page does not exist.');
      const combined = joinedSignals(signal, closed.signal, requestSignal);
      try {
        aborted(combined.signal);
        if (cache.has(index)) { const value = cache.get(index); cache.delete(index); cache.set(index, value); return value; }
        const bytes = await extract(pages[index], combined.signal);
        const blob = new Blob([bytes], { type: sniffImage(bytes) });
        cache.set(index, blob);
        while (cache.size > 2) cache.delete(cache.keys().next().value);
        return blob;
      } finally { combined.dispose(); }
    },
    close() { closed.abort(); cache.clear(); },
  };

  // A missing or malformed optional metadata file never blocks otherwise valid
  // pages. External entities and DTDs are explicitly rejected before parsing.
  if (comicInfo && typeof DOMParser !== 'undefined') {
    try {
      const xml = decoder.decode(await extract(comicInfo, signal));
      if (!/<!\s*(?:DOCTYPE|ENTITY)/i.test(xml)) {
        const document = new DOMParser().parseFromString(xml, 'application/xml');
        if (!document.querySelector('parsererror')) {
          const fields = { title: 'Title', series: 'Series', publisher: 'Publisher', issue: 'Number', volume: 'Volume', writer: 'Writer', characters: 'Characters', summary: 'Summary' };
          for (const [field, tag] of Object.entries(fields)) {
            const text = document.getElementsByTagName(tag)[0]?.textContent?.trim();
            if (text) book.metadata[field] = text.slice(0, field === 'summary' ? 4000 : 1000);
          }
        }
      }
    } catch (error) { if (error?.name === 'AbortError') throw error; }
  }
  aborted(signal);
  return book;
}

async function readEdition(source, read, signal) {
  const bytes = new Uint8Array(source.size);
  for (let start = 0; start < source.size; start += LIMITS.request) {
    aborted(signal);
    bytes.set(await read(start, Math.min(source.size, start + LIMITS.request), signal), start);
  }
  return bytes;
}

async function pdfComic(source, read, signal, closed) {
  if (source.size > LIMITS.pdf) throw problem('PDFs larger than 128 MB are not supported in this browser version. CBZ comics can be read page by page from the cloud.');
  if (typeof document === 'undefined') throw problem('PDF rendering requires a browser.');
  const bytes = await readEdition(source, read, signal);
  if (decoder.decode(bytes.subarray(0, 1024)).indexOf('%PDF-') < 0) throw problem('This file is not a valid PDF.');
  aborted(signal);
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = '/vendor/pdf.worker.mjs';
  const task = pdfjs.getDocument({ data: bytes, isEvalSupported: false, stopAtErrors: true,
    cMapUrl: '/vendor/cmaps/', cMapPacked: true, standardFontDataUrl: '/vendor/standard_fonts/', wasmUrl: '/vendor/wasm/' });
  const onAbort = () => { task.destroy().catch(() => {}); };
  signal?.addEventListener('abort', onAbort, { once: true });
  closed.signal.addEventListener('abort', onAbort, { once: true });
  let pdf;
  try { pdf = await task.promise; aborted(signal); }
  catch (error) {
    signal?.removeEventListener('abort', onAbort);
    if (signal?.aborted || closed.signal.aborted) aborted(signal?.aborted ? signal : closed.signal);
    if (error?.name === 'PasswordException') throw problem('Password-protected PDFs are not supported in the web reader yet.');
    throw problem('This PDF could not be opened. It may be damaged or unsupported.');
  }
  if (!pdf.numPages || pdf.numPages > LIMITS.entries) { await task.destroy(); throw problem('This PDF exceeds the 10,000-page limit or is empty.'); }
  const cache = new Map();
  const pending = new Set();
  return {
    type: 'pdf', pageCount: pdf.numPages, metadata: {},
    get bufferedBytes() { return (closed.signal.aborted ? 0 : source.size) + [...cache.values()].reduce((sum, blob) => sum + blob.size, 0); },
    clearCache() { cache.clear(); },
    async page(index, { signal: requestSignal } = {}) {
      const combined = joinedSignals(signal, closed.signal, requestSignal);
      let page, canvas, render;
      try {
        aborted(combined.signal);
        if (!Number.isInteger(index) || index < 0 || index >= pdf.numPages) throw problem('This page does not exist.');
        if (cache.has(index)) { const value = cache.get(index); cache.delete(index); cache.set(index, value); return value; }
        page = await pdf.getPage(index + 1); aborted(combined.signal);
        const unscaled = page.getViewport({ scale: 1 });
        if (!Number.isFinite(unscaled.width) || !Number.isFinite(unscaled.height) || unscaled.width <= 0 || unscaled.height <= 0) throw problem('This PDF page has invalid dimensions.');
        const scale = Math.min(2, 4096 / unscaled.width, 4096 / unscaled.height, Math.sqrt(12_000_000 / (unscaled.width * unscaled.height)));
        const viewport = page.getViewport({ scale });
        canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.ceil(viewport.width)); canvas.height = Math.max(1, Math.ceil(viewport.height));
        const context = canvas.getContext('2d', { alpha: false });
        if (!context) throw problem('The browser could not create a page image.');
        render = page.render({ canvasContext: context, canvas, viewport, background: '#ffffff' });
        pending.add(render);
        const cancel = () => render.cancel();
        combined.signal.addEventListener('abort', cancel, { once: true });
        try { await render.promise; } finally { combined.signal.removeEventListener('abort', cancel); pending.delete(render); }
        aborted(combined.signal);
        const blob = await new Promise((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(problem('The PDF page image could not be created.')), 'image/png'));
        aborted(combined.signal);
        cache.set(index, blob); while (cache.size > 2) cache.delete(cache.keys().next().value);
        return blob;
      } catch (error) {
        if (combined.signal.aborted) aborted(combined.signal);
        throw error;
      } finally {
        if (canvas) { canvas.width = 0; canvas.height = 0; }
        page?.cleanup(); combined.dispose();
      }
    },
    close() {
      closed.abort(); cache.clear();
      for (const render of pending) render.cancel(); pending.clear();
      signal?.removeEventListener('abort', onAbort);
      task.destroy().catch(() => {});
    },
  };
}

/**
 * Open a comic without storing edition/page bytes on disk. A source read uses
 * an end-exclusive interval. Call close() when leaving the reader.
 */
export async function openComic(source, { signal } = {}) {
  aborted(signal);
  const closed = new AbortController();
  const session = joinedSignals(signal, closed.signal);
  const read = checkedSource(source, session.signal);
  const extension = (source.name || '').split('.').pop().toLowerCase();
  try {
    let book;
    if (extension === 'cbz' || extension === 'zip') book = await zipComic(source, read, session.signal, closed);
    else if (extension === 'pdf') book = await pdfComic(source, read, session.signal, closed);
    else if (['jpg', 'jpeg', 'png', 'webp'].includes(extension)) {
      if (source.size > LIMITS.entry) throw problem('This image exceeds the 48 MB reading limit.');
      let image;
      book = { type: 'image', pageCount: 1, metadata: {},
        get bufferedBytes() { return image?.size || 0; }, clearCache() { image = undefined; },
        async page(index, { signal: requestSignal } = {}) {
        aborted(session.signal); aborted(requestSignal);
        if (index !== 0) throw problem('This page does not exist.');
        if (!image) { const bytes = await read(0, source.size, requestSignal); image = new Blob([bytes], { type: sniffImage(bytes) }); }
        return image;
      }, close() { closed.abort(); image = undefined; } };
    } else throw problem(/^(?:cbr|rar|cb7|7z|cbt|tar)$/.test(extension)
      ? 'This web version reads CBZ, PDF and images. CBR, 7z and TAR reading is available in the native app.'
      : 'Choose a CBZ, ZIP, PDF, JPEG, PNG or WebP comic.');
    const close = book.close.bind(book);
    book.close = () => { close(); session.dispose(); };
    return book;
  } catch (error) { closed.abort(); session.dispose(); throw error; }
}

export const readerLimits = LIMITS;
