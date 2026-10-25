// Decodes single RAR entries with RARLab's official unrar code (libunrar-js,
// Emscripten build). Receives a small archive (archive header + one entry).
var ready = false, queue = [];
var Module = { onRuntimeInitialized: function () { ready = true; queue.splice(0).forEach(handle); }, print: function () {}, printErr: function () {} };
console.log = function () {};
importScripts('libunrar.js');
function firstFile(entry) {
  if (!entry) return null;
  if (entry.type === 'file') return entry;
  var keys = Object.keys(entry.ls || {});
  for (var i = 0; i < keys.length; i++) { var found = firstFile(entry.ls[keys[i]]); if (found) return found; }
  return null;
}
function handle(message) {
  var id = message.id;
  try {
    var out = readRARContent([{ name: 'entry.rar', content: new Uint8Array(message.bytes) }], null);
    var file = firstFile(out);
    if (!file) throw new Error('No file in archive');
    var data = file.fileContent;
    var copy = data.byteOffset === 0 && data.byteLength === data.buffer.byteLength ? data.buffer : data.slice().buffer;
    postMessage({ id: id, ok: true, data: copy }, [copy]);
  } catch (error) { postMessage({ id: id, ok: false, error: String(error && error.message || error) }); }
}
onmessage = function (event) { if (ready) handle(event.data); else queue.push(event.data); };
