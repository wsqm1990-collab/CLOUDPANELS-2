import { build } from 'esbuild';
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import './patch-megajs.mjs';

const root = process.cwd();
const dist = path.join(root, 'dist');
// Android packages assets locally and does not register or publish a Site.
const manifest = { project_id: 'android-local', static: { directory: 'dist' } };
await mkdir(dist, {recursive: true});
for (const name of await readdir(dist)) await rm(path.join(dist, name), {recursive: true, force: true});
await mkdir(path.join(dist, 'vendor'), {recursive: true});
await build({entryPoints: { app: 'src/app.js', 'panel-worker': 'src/panel-worker.js' }, bundle: true, splitting: true, format: 'esm', platform: 'browser', target: ['safari15.4'], outdir: dist, entryNames: '[name]', chunkNames: 'vendor/[name]-[hash]', minify: true, legalComments: 'eof', logLevel: 'warning', define: {'process.env.NODE_ENV': '"production"'}});
for (const file of ['index.html', 'styles.css', 'brand-emblem.png', 'favicon-32.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'manifest.webmanifest', 'THIRD_PARTY_NOTICES.txt']) await cp(path.join('src', file), path.join(dist, file));
await cp('src/samples', path.join(dist, 'samples'), {recursive: true});
await cp('node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs', path.join(dist, 'vendor/pdf.worker.mjs'));
await mkdir(path.join(dist, 'vendor/libarchive'), {recursive: true});
for (const file of ['worker-bundle.js', 'libarchive.wasm']) await cp(path.join('node_modules/libarchive.js/dist', file), path.join(dist, 'vendor/libarchive', file));
for (const folder of ['cmaps', 'standard_fonts', 'wasm', 'iccs']) await cp(path.join('node_modules/pdfjs-dist', folder), path.join(dist, 'vendor', folder), {recursive: true});
const meta = await readFile('src/index.html', 'utf8');
const policy = meta.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1];
await writeFile(path.join(dist, '_headers'), '/*\n  Referrer-Policy: no-referrer\n  X-Content-Type-Options: nosniff\n  Permissions-Policy: camera=(), microphone=(), geolocation=()\n  Content-Security-Policy: ' + policy + '\n/index.html\n  Cache-Control: no-store\n/app.js\n  Cache-Control: no-cache\n/styles.css\n  Cache-Control: no-cache\n/panel-worker.js\n  Cache-Control: no-cache\n/sw.js\n  Cache-Control: no-cache\n');
async function list(dir, prefix = '') { const out = []; for (const e of await readdir(dir, {withFileTypes: true})) { const rel = prefix + e.name; if (e.isDirectory()) out.push(...await list(path.join(dir, e.name), rel + '/')); else out.push(rel); } return out; }
// Everything needed to start and read offline is cached by the service
// worker. PDF character maps are fetched on demand and cached as used.
const appAssets = ['./', ...(await list(dist)).filter(f => !/^(?:_headers|sw\.js|vendor\/(?:cmaps|iccs|standard_fonts)\/)/.test(f))];
const digest = createHash('sha256').update(await readFile(path.join(dist, 'app.js'))).update(await readFile(path.join(dist, 'styles.css'))).update(JSON.stringify(appAssets)).digest('hex').slice(0,12);
const worker = "const CACHE='cloudpanels-shell-" + digest + "';\nconst FILES=" + JSON.stringify(appAssets) + ";\nconst SCOPE=new URL('./', self.location.href);\nconst URLS=new Set(FILES.map(f=>new URL(f, SCOPE).href));\n" +
"self.addEventListener('install',e=>e.waitUntil((async()=>{const c=await caches.open(CACHE);await Promise.allSettled([...URLS].map(async u=>{const r=await fetch(u,{cache:'reload'});if(r.ok&&new URL(r.url).origin===location.origin)await c.put(u,r);}));self.skipWaiting();})()));\n" +
"self.addEventListener('activate',e=>e.waitUntil((async()=>{for(const k of await caches.keys())if(k.startsWith('cloudpanels-shell-')&&k!==CACHE)await caches.delete(k);await self.clients.claim();})()));\n" +
"self.addEventListener('fetch',e=>{const u=new URL(e.request.url);u.hash='';if(e.request.method!=='GET'||u.origin!==location.origin||u.search)return;const key=(e.request.mode==='navigate'?SCOPE.href:u.href);const known=URLS.has(key)||u.pathname.includes('/vendor/');if(!known)return;\n" +
"e.respondWith((async()=>{const c=await caches.open(CACHE);try{const r=await fetch(e.request.mode==='navigate'?key:e.request,{cache:'no-cache'});if(r.ok&&r.type==='basic')c.put(key,r.clone());return r;}catch{const r=await c.match(key);if(r)return r;throw new Error('Offline');}})());});\n";
await writeFile(path.join(dist, 'sw.js'), worker);
async function files(dir) { let count=0,bytes=0;for(const e of await readdir(dir,{withFileTypes:true})){if(e.isDirectory()){const v=await files(path.join(dir,e.name));count+=v.count;bytes+=v.bytes;}else{count++;bytes+=(await readFile(path.join(dir,e.name))).length;}}return {count,bytes};}
console.log(JSON.stringify({built:true,project_id:manifest.project_id,...await files(dist),native:false}));
