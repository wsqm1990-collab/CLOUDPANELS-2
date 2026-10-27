import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

// MEGAJS 1.3.10, MIT licensed. Keep cryptography and request formats unchanged.
// These narrow lifecycle fixes address browser-body errors and late downloads
// after cancellation. A dependency update must be deliberately reviewed.
const directory = new URL('../node_modules/megajs/', import.meta.url);
const sourcePath = new URL('dist/main.browser-es.mjs', directory);
const outputPath = new URL('dist/cloudpanels.browser-es.mjs', directory);
const expectedHash = '57987252115acc4200cb6b9e4d8bb24cef467d2c52ede8954920e1d70e2da287';
const metadata = JSON.parse(await readFile(new URL('package.json', directory), 'utf8'));
const original = await readFile(sourcePath, 'utf8');
if (metadata.version !== '1.3.10' || createHash('sha256').update(original).digest('hex') !== expectedHash) {
  throw new Error('MEGAJS browser source changed. Review the lifecycle patch before building.');
}
let patched = original;
function replaceOnce(before, after) {
  if (patched.split(before).length !== 2) throw new Error('MEGAJS lifecycle patch no longer matches exactly once.');
  patched = patched.replace(before, after);
}
replaceOnce(
  '    const handleRetries = options.handleRetries || _File.defaultHandleRetries;\n    this.api.request(req, (err, response) => {\n      if (err) return stream.emit("error", err);',
  '    const handleRetries = options.handleRetries || _File.defaultHandleRetries;\n    this.api.request(req, (err, response) => {\n      if (stream.destroyed) {\n        if (decryptStream !== stream && !decryptStream.destroyed) decryptStream.destroy();\n        return;\n      }\n      if (err) return stream.emit("error", err);'
);
replaceOnce(
  '      function handleError(err2) {\n        stream.emit("error", err2);\n      }',
  '      function handleError(err2) {\n        if (!stream.destroyed) stream.destroy(err2);\n        if (decryptStream !== stream && !decryptStream.destroyed) decryptStream.destroy();\n      }'
);
replaceOnce(
  '        stream.on("close", () => {\n          controller.abort();\n        });\n        this.api.fetch(response.g + "/" + apiStart + "-" + end, {',
  '        stream.on("close", () => {\n          controller.abort();\n          if (decryptStream !== stream && !decryptStream.destroyed) decryptStream.destroy();\n        });\n        this.api.fetch(response.g + "/" + apiStart + "-" + end, {'
);
replaceOnce(
  '            const read = ({ done, value }) => {\n              if (done) {',
  '            const read = ({ done, value }) => {\n              if (stream.destroyed) return reader.cancel().catch(() => {});\n              if (done) {'
);
replaceOnce(
  '            };\n            reader.read().then(read);\n          } else {\n            throw Error("Single connection streaming not supported by fetch");',
  '            };\n            return reader.read().then(read);\n          } else {\n            throw Error("Single connection streaming not supported by fetch");'
);
// Upstream bug: a combined piece shorter than one AES block was stored with the
// previous remainder twice, shifting every following byte of the download.
replaceOnce(
  '      if (!end) {\n        last = last ? import_buffer.Buffer.concat([last, chunk]) : chunk;',
  '      if (!end) {\n        last = chunk;'
);
// MEGA does not promise to list a folder before what is inside it (its own SDK
// links "dangling" nodes after reading the whole tree). Upstream drops such a
// node: a folder moved into a newer folder vanished from the tree. Remember
// nodes whose folder has not arrived yet and attach them once all are read.
replaceOnce(
  '      if (f.p) {\n        const parent = this.files[f.p];\n        if (parent) {\n          parent.children.push(file);\n          file.parent = parent;\n        }\n      }',
  '      if (f.p) {\n        const parent = this.files[f.p];\n        if (parent) {\n          parent.children.push(file);\n          file.parent = parent;\n        } else {\n          (this._waitingForParent ||= []).push([file, f.p]);\n        }\n      }'
);
replaceOnce(
  '    this.api.request({ a: "f", c: 1 }, (err, response) => {\n      if (err) return cb(err);',
  '    this.api.request({ a: "f", c: 1 }, (err, response) => {\n      if (err) return cb(err);\n      this._waitingForParent = [];'
);
replaceOnce(
  '      cb(null, this.mounts);',
  '      for (const [node, parentId] of this._waitingForParent || []) {\n        const parent = this.files[parentId];\n        if (parent && !node.parent && Array.isArray(parent.children)) {\n          parent.children.push(node);\n          node.parent = parent;\n        }\n      }\n      this._waitingForParent = [];\n      cb(null, this.mounts);'
);
const banner = '// CloudPanels: reviewed lifecycle-only patch of MEGAJS 1.3.10 (MIT).\n';
await writeFile(outputPath, banner + patched);
console.log(JSON.stringify({ sdk: 'megajs', version: metadata.version, lifecyclePatch: true,
  sourceSHA256: expectedHash, output: fileURLToPath(outputPath) }));
