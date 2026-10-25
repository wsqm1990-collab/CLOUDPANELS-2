import { Inflate } from 'fflate';

// Only a small footer, the central directory and selected image entries are
// requested for CBZ. PDFs are a bounded, temporary in-memory edition.
const MiB = 1024 * 1024;
const LIMITS = Object.freeze({ entry: 48 * MiB, directory: 16 * MiB,
  entries: 10000, xml: MiB, pdf: 128 * MiB, archive: 300 * MiB, request: 4 * MiB,
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
export function crc32(bytes) {
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
    metadata: { pageNames: pages.map(page => page.name) }, pageSizes: pages.map(page => page.expanded),
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
    try { applyComicInfo(book, decoder.decode(await extract(comicInfo, signal))); }
    catch (error) { if (error?.name === 'AbortError') throw error; }
  }
  aborted(signal);
  return book;
}

async function readEdition(source, read, signal, onProgress) {
  const bytes = new Uint8Array(source.size);
  for (let start = 0; start < source.size; start += LIMITS.request) {
    aborted(signal);
    bytes.set(await read(start, Math.min(source.size, start + LIMITS.request), signal), start);
    try { onProgress?.({ phase: 'download', loaded: Math.min(source.size, start + LIMITS.request), total: source.size }); } catch {}
  }
  return bytes;
}

// Identify the real container from its first bytes. Many ".cbr" files are
// really ZIP archives and some ".cbz" files are really RAR archives.
export function containerKind(head) {
  if (!(head instanceof Uint8Array) || head.length < 4) return null;
  if (head[0] === 0x50 && head[1] === 0x4b && [3, 5, 7].includes(head[2]) && [4, 6, 8].includes(head[3])) return 'zip';
  if (head.length >= 7 && head[0] === 0x52 && head[1] === 0x61 && head[2] === 0x72 && head[3] === 0x21 && head[4] === 0x1a && head[5] === 0x07) return 'rar';
  if (head.length >= 6 && head[0] === 0x37 && head[1] === 0x7a && head[2] === 0xbc && head[3] === 0xaf && head[4] === 0x27 && head[5] === 0x1c) return '7z';
  if (decoder.decode(head.subarray(0, Math.min(head.length, 1024))).indexOf('%PDF-') >= 0) return 'pdf';
  if (head.length >= 262 && decoder.decode(head.subarray(257, 262)) === 'ustar') return 'tar';
  if (head[0] === 255 && head[1] === 216 && head[2] === 255) return 'image';
  if (head[0] === 137 && head[1] === 80 && head[2] === 78 && head[3] === 71) return 'image';
  if (head.length >= 12 && decoder.decode(head.subarray(0, 4)) === 'RIFF' && decoder.decode(head.subarray(8, 12)) === 'WEBP') return 'image';
  return null;
}

let archiveReady = false;
// RAR (v4/v5), 7z and TAR are decoded by libarchive compiled to WebAssembly in
// a worker. These formats cannot be read page by page from the cloud, so the
// edition is downloaded to temporary memory first and extracted once.
async function browserArchive() {
  const { Archive } = await import('libarchive.js/dist/libarchive.js');
  if (!archiveReady) {
    const base = typeof document !== 'undefined' ? document.baseURI : self.location.href;
    Archive.init({ workerUrl: new URL('vendor/libarchive/worker-bundle.js', base).href });
    archiveReady = true;
  }
  return Archive;
}
export const archiveExtractor = (loadArchive = browserArchive) => (blob, signal) => libarchiveExtract(blob, signal, loadArchive);
async function libarchiveExtract(blob, signal, loadArchive = browserArchive) {
  const Archive = await loadArchive();
  aborted(signal);
  const archive = await Archive.open(new File([blob], 'comic'));
  const stop = () => { try { archive.close(); } catch {} };
  signal?.addEventListener('abort', stop, { once: true });
  try {
    if (await archive.hasEncryptedData?.() === true) throw problem('Password-protected comics are not supported.');
    aborted(signal);
    const tree = await archive.extractFiles();
    aborted(signal);
    const entries = [];
    (function walk(node, prefix) {
      for (const [name, value] of Object.entries(node || {})) {
        if (entries.length > LIMITS.entries) throw problem('This archive exceeds the 10,000-file limit.');
        if (value instanceof Blob) entries.push({ path: prefix + name, file: value });
        else if (value && typeof value === 'object') walk(value, prefix + name + '/');
      }
    })(tree, '');
    return entries;
  } catch (error) {
    if (signal?.aborted) aborted(signal);
    if (/password/i.test(error?.message || '')) throw error;
    throw problem(error?.message?.startsWith('This archive') ? error.message : 'This comic archive could not be opened. It may be damaged or use an unsupported format.');
  } finally { signal?.removeEventListener('abort', stop); stop(); }
}

const LISTING_CACHE = 'cloudpanels-archive-listings-v2';
function cachedListing(key) { try { return JSON.parse(localStorage.getItem(LISTING_CACHE) || '{}')[key] || null; } catch { return null; } }
function rememberListing(key, value) {
  try {
    const all = JSON.parse(localStorage.getItem(LISTING_CACHE) || '{}'); all[key] = { ...value, savedAt: Date.now() };
    const keys = Object.keys(all).sort((a, b) => (all[b].savedAt || 0) - (all[a].savedAt || 0));
    for (const old of keys.slice(25)) delete all[old];
    localStorage.setItem(LISTING_CACHE, JSON.stringify(all));
  } catch {}
}

/**
 * Large RAR/TAR comics are read page by page, like CBZ: only the entry
 * headers are listed (and remembered), then each page is fetched on its own.
 * Stored pages are used as-is; compressed pages of non-solid RARs are decoded
 * from just their own bytes. Returns null when this is not possible.
 */
async function streamedArchiveComic(source, read, signal, closed, { kind, loadArchive = browserArchive, onProgress } = {}) {
  const key = `${source.name}:${source.size}`;
  let listing = cachedListing(key);
  if (!listing) {
    try { onProgress?.({ phase: 'index' }); } catch {}
    const result = await listArchive((start, end, s2) => read(start, end, s2 || signal), source.size, kind, { signal });
    if (result.encrypted || !result.entries.length) return null;
    listing = { solid: result.solid, preamble: result.preamble, entries: result.entries.filter(e => !e.directory && isPageName(e.name)).map(({ name, start, end, dataStart, stored, encrypted, size }) => ({ name, start, end, dataStart, stored, encrypted, size })) };
    if (listing.entries.length) rememberListing(key, listing);
  }
  const pages = listing.entries.filter(e => !e.encrypted).sort((a, b) => natural.compare(a.name, b.name));
  if (!pages.length) return null;
  if (listing.solid && pages.some(page => !page.stored)) return null;
  if (pages.some(page => page.end - page.start > LIMITS.entry)) throw problem('This page exceeds the 48 MB reading limit.');
  const cache = new Map();
  aborted(signal);
  return {
    type: kind, pageCount: pages.length, metadata: { pageNames: pages.map(p => p.name) }, pageSizes: pages.map(p => p.size),
    get bufferedBytes() { return [...cache.values()].reduce((sum, blob) => sum + blob.size, 0); },
    clearCache() { cache.clear(); },
    async page(index, { signal: requestSignal } = {}) {
      if (closed.signal.aborted) aborted(closed.signal);
      if (!Number.isInteger(index) || index < 0 || index >= pages.length) throw problem('This page does not exist.');
      if (cache.has(index)) return cache.get(index);
      const combined = joinedSignals(signal, closed.signal, requestSignal);
      try {
        const entry = pages[index];
        let bytes;
        if (entry.stored) bytes = await read(entry.dataStart, entry.end, combined.signal);
        else {
          const head = await read(0, listing.preamble, combined.signal), body = await read(entry.start, entry.end, combined.signal);
          const synthetic = new Uint8Array(head.length + body.length); synthetic.set(head); synthetic.set(body, head.length);
          const Archive = await loadArchive(); let archive;
          try { archive = await Archive.open(new File([synthetic], 'page')); const file = await archive.extractSingleFile(entry.name); bytes = new Uint8Array(await file.arrayBuffer()); }
          catch (error) { if (combined.signal.aborted) throw error; throw problem('This compressed page is damaged or unsupported.'); }
          finally { try { archive?.close(); } catch {} }
        }
        aborted(combined.signal);
        const blob = new Blob([bytes], { type: sniffImage(bytes) });
        cache.set(index, blob); while (cache.size > 3) cache.delete(cache.keys().next().value);
        return blob;
      } finally { combined.dispose(); }
    },
    close() { closed.abort(); cache.clear(); },
  };
}

async function archiveComic(source, read, signal, closed, { extract = libarchiveExtract, onProgress, kind = 'rar', loadArchive, streamAbove = LIMITS.archive } = {}) {
  if (source.size > streamAbove) {
    if (kind === 'rar' || kind === 'tar') {
      const streamed = await streamedArchiveComic(source, read, signal, closed, { kind, onProgress, ...(loadArchive ? { loadArchive } : {}) });
      if (streamed) return streamed;
    }
    throw problem('This comic is over 300 MB and packed in a way that can only be opened whole, which is too big for this device. Saving it as CBZ (or a normal, non-solid CBR) lets it open page by page.');
  }
  // A file already on the device is handed over directly, without a copy.
  const blob = source.blob instanceof Blob && source.blob.size === source.size ? source.blob : new Blob([await readEdition(source, read, signal, onProgress)]);
  aborted(signal);
  try { onProgress?.({ phase: 'extract' }); } catch {}
  let entries = await extract(blob, signal);
  aborted(signal);
  const files = [];
  let comicInfo;
  for (const { path, file } of entries) {
    const name = String(path).replaceAll('\\', '/');
    if (name.split('/').some(part => part === '__MACOSX' || part === '..' || part.startsWith('.'))) continue;
    if (IMAGE.test(name)) { if (file.size > LIMITS.entry) throw problem('This page exceeds the 48 MB reading limit.'); files.push({ name, file }); }
    else if (/(?:^|\/)ComicInfo\.xml$/i.test(name) && !comicInfo && file.size <= LIMITS.xml) comicInfo = file;
  }
  entries = null;
  if (!files.length) throw problem('No JPEG, PNG or WebP comic pages were found in this archive.');
  files.sort((a, b) => natural.compare(a.name, b.name));
  const cache = new Map();
  const book = {
    type: kind, pageCount: files.length,
    metadata: { pageNames: files.map(page => page.name) }, pageSizes: files.map(page => page.file.size),
    get bufferedBytes() { return closed.signal.aborted ? 0 : files.reduce((sum, page) => sum + page.file.size, 0); },
    clearCache() { cache.clear(); },
    async page(index, { signal: requestSignal } = {}) {
      if (closed.signal.aborted) aborted(closed.signal);
      if (!Number.isInteger(index) || index < 0 || index >= files.length) throw problem('This page does not exist.');
      aborted(requestSignal);
      if (cache.has(index)) return cache.get(index);
      const data = new Uint8Array(await files[index].file.arrayBuffer());
      aborted(requestSignal);
      const blob = new Blob([data], { type: sniffImage(data) });
      cache.set(index, blob); while (cache.size > 3) cache.delete(cache.keys().next().value);
      return blob;
    },
    close() { closed.abort(); cache.clear(); files.length = 0; },
  };
  if (comicInfo) book.comicInfoFile = comicInfo;
  if (comicInfo && typeof DOMParser !== 'undefined') {
    try { applyComicInfo(book, decoder.decode(new Uint8Array(await comicInfo.arrayBuffer()))); } catch {}
  }
  return book;
}

function applyComicInfo(book, xml) {
  if (/<!\s*(?:DOCTYPE|ENTITY)/i.test(xml)) return;
  const document = new DOMParser().parseFromString(xml, 'application/xml');
  if (document.querySelector('parsererror')) return;
  const fields = { title: 'Title', series: 'Series', publisher: 'Publisher', issue: 'Number', volume: 'Volume', writer: 'Writer', characters: 'Characters', summary: 'Summary', year: 'Year' };
  for (const [field, tag] of Object.entries(fields)) {
    const text = document.getElementsByTagName(tag)[0]?.textContent?.trim();
    if (text) book.metadata[field] = text.slice(0, field === 'summary' ? 4000 : 1000);
  }
}

async function pdfComic(source, read, signal, closed, onProgress) {
  if (source.size > LIMITS.pdf) throw problem('PDFs larger than 128 MB are not supported on this device. CBZ comics can be read page by page from the cloud.');
  if (typeof document === 'undefined') throw problem('PDF rendering requires a browser.');
  const bytes = await readEdition(source, read, signal, onProgress);
  if (decoder.decode(bytes.subarray(0, 1024)).indexOf('%PDF-') < 0) throw problem('This file is not a valid PDF.');
  aborted(signal);
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const vendor = path => new URL('vendor/' + path, document.baseURI).href;
  pdfjs.GlobalWorkerOptions.workerSrc = vendor('pdf.worker.mjs');
  const task = pdfjs.getDocument({ data: bytes, isEvalSupported: false, stopAtErrors: true,
    cMapUrl: vendor('cmaps/'), cMapPacked: true, standardFontDataUrl: vendor('standard_fonts/'), wasmUrl: vendor('wasm/') });
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
export async function openComic(source, { signal, onProgress, extractArchive, loadArchive, streamAbove } = {}) {
  aborted(signal);
  const closed = new AbortController();
  const session = joinedSignals(signal, closed.signal);
  const read = checkedSource(source, session.signal);
  const extension = (source.name || '').split('.').pop().toLowerCase();
  const archive = kind => archiveComic(source, read, session.signal, closed, { extract: extractArchive, onProgress, kind, loadArchive, ...(streamAbove != null ? { streamAbove } : {}) });
  const image = () => {
    if (source.size > LIMITS.entry) throw problem('This image exceeds the 48 MB reading limit.');
    let picture;
    return { type: 'image', pageCount: 1, metadata: {},
      get bufferedBytes() { return picture?.size || 0; }, clearCache() { picture = undefined; },
      async page(index, { signal: requestSignal } = {}) {
        aborted(session.signal); aborted(requestSignal);
        if (index !== 0) throw problem('This page does not exist.');
        if (!picture) { const bytes = await read(0, source.size, requestSignal); picture = new Blob([bytes], { type: sniffImage(bytes) }); }
        return picture;
      }, close() { closed.abort(); picture = undefined; } };
  };
  // ZIP comics are read page by page. Unusual ZIP variants (ZIP64, other
  // compression methods) fall back to the full-archive decoder.
  const zipOrFallback = async () => {
    try { return await zipComic(source, read, session.signal, closed); }
    catch (error) {
      if (error?.name === 'AbortError' || session.signal.aborted) throw error;
      if (!/ZIP64|compression method|directory could not be found/.test(error?.message || '')) throw error;
      const head = await read(0, Math.min(source.size, 1024));
      const kind = containerKind(head);
      if (kind === 'zip' || kind === 'rar' || kind === '7z' || kind === 'tar') return archive(kind);
      throw error;
    }
  };
  try {
    let book;
    if (extension === 'cbz' || extension === 'zip') book = await zipOrFallback();
    else if (extension === 'pdf') book = await pdfComic(source, read, session.signal, closed, onProgress);
    else if (['jpg', 'jpeg', 'png', 'webp'].includes(extension)) book = image();
    else if (/^(?:cbr|rar|cb7|7z|cbt|tar)$/.test(extension)) {
      if (!source.size) throw problem('This comic file is empty.');
      const kind = containerKind(await read(0, Math.min(source.size, 1024)));
      if (kind === 'zip') book = await zipOrFallback();
      else if (kind === 'pdf') book = await pdfComic(source, read, session.signal, closed, onProgress);
      else if (kind === 'rar' || kind === '7z' || kind === 'tar') book = await archive(kind);
      else throw problem('This file is not a recognizable comic archive.');
    } else throw problem('Choose a CBZ, CBR, CB7, CBT, PDF, JPEG, PNG or WebP comic.');
    const close = book.close.bind(book);
    book.close = () => { close(); session.dispose(); };
    return book;
  } catch (error) { closed.abort(); session.dispose(); throw error; }
}


// Parse one RAR/TAR header at `pos` within `bytes` (which starts at file
// offset `base`). Returns { next, entry?, solid?, stop? } or null if more bytes
// are needed.
function archiveHeaderAt(bytes, pos, base, kind, rar4) {
  const n = bytes.length, view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), abs = base + pos;
  if (kind === 'tar') {
    if (pos + 512 > n) return null;
    if (bytes.subarray(pos, pos + 512).every(b => b === 0)) return { stop: true };
    const field = (o, l) => { const raw = bytes.subarray(pos + o, pos + o + l); const z = raw.indexOf(0); return decoder.decode(z >= 0 ? raw.subarray(0, z) : raw); };
    const size = parseInt(field(124, 12).trim() || '0', 8) || 0, flag = bytes[pos + 156];
    const prefix = field(257, 6).startsWith('ustar') ? field(345, 155) : '';
    const next = abs + 512 + Math.ceil(size / 512) * 512;
    return { next, entry: flag === 48 || flag === 0 ? { name: (prefix ? prefix + '/' : '') + field(0, 100), start: abs, end: abs + 512 + size, dataStart: abs + 512, size, stored: true, padded: next, directory: false } : null };
  }
  if (rar4) {
    if (pos + 7 > n) return null;
    const type = bytes[pos + 2], flags = view.getUint16(pos + 3, true), size = view.getUint16(pos + 5, true);
    if (size < 7) return { stop: true };
    if (type === 0x73) { if (flags & 0x80) return { stop: true, encrypted: true }; return { next: abs + size, solid: Boolean(flags & 0x08) }; }
    if (type === 0x7b) return { stop: true };
    if (type === 0x74) {
      if (pos + 32 > n) return null;
      let data = view.getUint32(pos + 7, true), unpacked = view.getUint32(pos + 11, true);
      const nameSize = view.getUint16(pos + 26, true), high = flags & 0x100, nameAt = pos + (high ? 40 : 32);
      if (high) { if (pos + 40 > n) return null; data += view.getUint32(pos + 32, true) * 2 ** 32; unpacked += view.getUint32(pos + 36, true) * 2 ** 32; }
      if (nameAt + nameSize > n) return null;
      let raw = bytes.subarray(nameAt, nameAt + nameSize); const z = raw.indexOf(0); if (z >= 0) raw = raw.subarray(0, z);
      const name = (flags & 0x200 ? new TextDecoder('latin1') : decoder).decode(raw).replaceAll('\\', '/');
      return { next: abs + size + data, entry: { name, start: abs, end: abs + size + data, dataStart: abs + size, size: unpacked, stored: bytes[pos + 25] === 0x30, encrypted: Boolean(flags & 0x04), directory: (flags & 0xe0) === 0xe0, solidFile: Boolean(flags & 0x10) } };
    }
    if (flags & 0x8000) { if (pos + 11 > n) return null; return { next: abs + size + view.getUint32(pos + 7, true) }; }
    return { next: abs + size };
  }
  let p = pos + 4;
  const vint = () => { let value = 0, shift = 0; for (let i = 0; i < 10; i++) { if (p >= n) throw new RangeError('more'); const b = bytes[p++]; value += (b & 127) * 2 ** shift; shift += 7; if (!(b & 128)) return value; } throw new Error('vint'); };
  try {
    if (pos + 7 > n) return null;
    const headerSize = vint(), headerStart = p;
    if (headerStart + headerSize > n && headerSize < 65536) return null;
    const type = vint(), flags = vint();
    if (flags & 1) vint();
    const data = flags & 2 ? vint() : 0, next = base + headerStart + headerSize + data;
    if (type === 4) return { stop: true, encrypted: true };
    if (type === 5) return { stop: true };
    if (type === 1) { const archiveFlags = vint(); return { next, solid: Boolean(archiveFlags & 4) }; }
    if (type === 2) {
      const fileFlags = vint(), unpacked = vint(); vint();
      if (fileFlags & 2) p += 4;
      if (fileFlags & 4) p += 4;
      const compression = vint(); vint();
      const nameLength = vint();
      if (p + nameLength > n) return null;
      return { next, entry: { name: decoder.decode(bytes.subarray(p, p + nameLength)), start: abs, end: next, dataStart: base + headerStart + headerSize, size: unpacked, stored: ((compression >> 7) & 7) === 0, directory: Boolean(fileFlags & 1), solidFile: Boolean(compression & 0x40) } };
    }
    return { next };
  } catch (error) { if (error instanceof RangeError) return null; return { stop: true }; }
}

/** List every entry of a RAR (v4/v5) or TAR comic by reading only its headers. */
export async function listArchive(read, size, kind, { signal, maxReads = 4000 } = {}) {
  const firstBytes = await read(0, Math.min(size, 64 * 1024), signal);
  const rar4 = kind === 'rar' && firstBytes[6] === 0;
  const result = { entries: [], solid: false, preamble: 0, encrypted: false, complete: false };
  let base = 0, bytes = firstBytes, pos = kind === 'tar' ? 0 : rar4 ? 7 : 8, reads = 1;
  for (;;) {
    aborted(signal);
    if (base + pos >= size) { result.complete = true; break; }
    const parsed = archiveHeaderAt(bytes, pos, base, kind, rar4);
    if (!parsed) {
      if (reads++ > maxReads) break;
      const start = base + pos, end = Math.min(size, start + 16 * 1024);
      if (start >= end) break;
      bytes = await read(start, end, signal); base = start; pos = 0;
      const again = archiveHeaderAt(bytes, 0, base, kind, rar4);
      if (!again) break;
      continue;
    }
    if (parsed.encrypted) { result.encrypted = true; break; }
    if (parsed.stop) { result.complete = true; break; }
    if (parsed.solid) result.solid = true;
    if (parsed.entry) { if (!result.preamble) result.preamble = parsed.entry.start; if (parsed.entry.solidFile) result.solid = true; result.entries.push(parsed.entry); if (result.entries.length > LIMITS.entries) break; }
    if (!(parsed.next > base + pos)) break;
    const target = parsed.next;
    if (target - base < bytes.length - 64) pos = target - base;
    else { base = target; pos = 0; bytes = new Uint8Array(); }
  }
  return result;
}

/** Entries found in a prefix of the file (used by tests and quick checks). */
export function archiveHeadEntries(bytes, kind) {
  const rar4 = kind === 'rar' && bytes[6] === 0, entries = [];
  let pos = kind === 'tar' ? 0 : rar4 ? 7 : 8;
  while (pos < bytes.length && entries.length < 10000) {
    const parsed = archiveHeaderAt(bytes, pos, 0, kind, rar4);
    if (!parsed || parsed.stop || parsed.encrypted) break;
    if (parsed.entry) entries.push(parsed.entry);
    if (!(parsed.next > pos)) break;
    pos = parsed.next;
  }
  return entries;
}

const isPageName = name => IMAGE.test(name) && !name.split('/').some(part => part === '__MACOSX' || part.startsWith('.'));

/**
 * The cover (first page in reading order) of a RAR/TAR comic, downloading only
 * the headers and that one page. Archives often store pages out of order, so
 * every name is listed first and naturally sorted, exactly like the reader.
 */
export async function archiveCover(source, { signal, loadArchive = browserArchive, maxBytes = 48 * MiB } = {}) {
  aborted(signal);
  if (!source?.size) return null;
  const read = async (start, end) => source.blob instanceof Blob ? new Uint8Array(await source.blob.slice(start, end).arrayBuffer()) : await source.read(start, end, { signal });
  const kind = containerKind(await read(0, Math.min(source.size, 1024)));
  if (kind !== 'rar' && kind !== 'tar') return null;
  const list = await listArchive((start, end) => read(start, end), source.size, kind, { signal });
  if (list.encrypted) return null;
  const pages = list.entries.filter(entry => !entry.directory && isPageName(entry.name)).sort((a, b) => natural.compare(a.name, b.name));
  const cover = pages[0];
  if (!cover || cover.end > source.size) return null;
  let archiveBytes;
  if (kind === 'tar') {
    const body = await read(cover.start, cover.end);
    archiveBytes = new Uint8Array(Math.ceil(body.length / 512) * 512 + 1024); archiveBytes.set(body);
  } else if (!list.solid && list.preamble > 0 && list.preamble <= 1024 * 1024) {
    // Non-solid RAR: signature and archive header followed by just the cover entry.
    const head = await read(0, list.preamble), body = await read(cover.start, cover.end);
    archiveBytes = new Uint8Array(head.length + body.length); archiveBytes.set(head); archiveBytes.set(body, head.length);
  } else {
    // Solid RAR: pages depend on the earlier ones, so read from the start.
    if (cover.end > maxBytes) return null;
    archiveBytes = await read(0, cover.end);
  }
  aborted(signal);
  const Archive = await loadArchive();
  let archive;
  try {
    archive = await Archive.open(new File([archiveBytes], 'cover'));
    const file = await archive.extractSingleFile(cover.name);
    if (!(file instanceof Blob) || !file.size) return null;
    const bytes = new Uint8Array(await file.arrayBuffer());
    return new Blob([bytes], { type: sniffImage(bytes) });
  } catch (error) { if (signal?.aborted) throw error; return null; }
  finally { try { archive?.close(); } catch {} }
}

export const readerLimits = LIMITS;
