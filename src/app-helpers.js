const fold = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();
export const statusOf = (comic, progress) => progress[comic.id]?.status || 'unread';
export function searchComics(comics, query = '') {
  const terms = fold(query).trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return comics.slice();
  return comics.filter(c => {
    const m = c.metadata || {};
    const text = fold([c.name, c.path, m.title, m.series, m.publisher, m.volume, m.issue, m.year, ...(m.characters || []), ...(m.tags || [])].join(' '));
    return terms.every(term => text.includes(term));
  });
}
export function filterComics(comics, progress, options = {}) {
  return searchComics(comics, options.query).filter(c =>
    (!options.status || options.status === 'all' || statusOf(c, progress) === options.status) &&
    (!options.publisher || fold(c.metadata?.publisher) === fold(options.publisher)) &&
    (!options.series || fold(c.metadata?.series) === fold(options.series)) &&
    (!options.character || c.metadata?.characters?.some(v => fold(v) === fold(options.character))));
}
// The same order as localeCompare, without setting it up again for every
// comparison (sorting thousands of comics that way took seconds on a phone).
const plainOrder = new Intl.Collator(), numericOrder = new Intl.Collator(undefined, {numeric: true});
export function sortComics(comics, progress, sort = 'title') {
  return comics.slice().sort((a, b) => {
    if (sort === 'recent') return plainOrder.compare(progress[b.id]?.updatedAt || b.addedAt || '', progress[a.id]?.updatedAt || a.addedAt || '');
    if (sort === 'added') return plainOrder.compare(b.addedAt || '', a.addedAt || '');
    if (sort === 'issue') {
      const series = numericOrder.compare(a.metadata?.series || '', b.metadata?.series || '');
      if (series) return series;
      const volume = numericOrder.compare(a.metadata?.volume || '', b.metadata?.volume || '');
      if (volume) return volume;
      const av = Number(a.metadata?.issue), bv = Number(b.metadata?.issue);
      if (a.metadata?.issue !== '' && b.metadata?.issue !== '' && Number.isFinite(av) && Number.isFinite(bv) && av !== bv) return av - bv;
    }
    return numericOrder.compare(a.metadata?.title || a.name, b.metadata?.title || b.name);
  });
}
export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  if (bytes < 1024) return Math.round(bytes) + ' B';
  if (bytes < 1024 ** 2) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 ** 3) return (bytes / 1024 ** 2).toFixed(1) + ' MB';
  return (bytes / 1024 ** 3).toFixed(2) + ' GB';
}
export function normalizeFolderPath(value) {
  const parts=Array.isArray(value)?value:String(value??'').replace(/\\/g,'/').split('/');
  return parts.map(part=>String(part).replace(/[\u0000-\u001f\u007f]/g,'').trim()).filter(part=>part&&part!=='.');
}
export function comicFolderParts(comic) {
  const parts=normalizeFolderPath(comic?.path);
  // Indexed paths include the file name. Local imports and samples have no
  // parent path, and remain at the root rather than becoming invented folders.
  return parts.slice(0,-1);
}
export function isInsideFolder(comic,path=[]) {
  const parents=comicFolderParts(comic),wanted=normalizeFolderPath(path);
  return wanted.length<=parents.length&&wanted.every((part,index)=>parents[index]===part);
}
export function folderContents(comics,path=[],progress={}) {
  const current=normalizeFolderPath(path),folders=new Map(),direct=[],descendants=[];
  let readCount=0,unreadCount=0,readingCount=0;
  for(const comic of comics) {
    if(!isInsideFolder(comic,current))continue;
    descendants.push(comic);const parents=comicFolderParts(comic),status=statusOf(comic,progress);
    if(status==='finished')readCount++;else if(status==='reading')readingCount++;else unreadCount++;
    if(parents.length===current.length){direct.push(comic);continue;}
    const name=parents[current.length];
    if(!folders.has(name))folders.set(name,{name,path:[...current,name],count:0,readCount:0,unreadCount:0,readingCount:0,allRead:false,comics:[],continueComic:null});
    const folder=folders.get(name);folder.count++;folder.comics.push(comic);
    if(status==='finished')folder.readCount++;else if(status!=='reading')folder.unreadCount++;
    if(status==='reading'){
      folder.readingCount++;
      if(!folder.continueComic||(progress[comic.id]?.updatedAt||'')>(progress[folder.continueComic.id]?.updatedAt||''))folder.continueComic=comic;
    }
  }
  for(const folder of folders.values())folder.allRead=folder.count>0&&folder.readCount===folder.count;
  return {folders:[...folders.values()].sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true})),comics:direct,descendants,
    count:descendants.length,readCount,unreadCount,readingCount,allRead:descendants.length>0&&readCount===descendants.length};
}
const readableComicFormats = new Set(['cbz', 'zip', 'pdf', 'jpg', 'jpeg', 'png', 'webp']);
const filenameOrder = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
/** The next readable direct sibling, regardless of library filters or read status. */
export function nextComicInFolder(comics, current) {
  if (!current?.id || typeof current.source !== 'string' || !Array.isArray(comics)) return null;
  const folder = comicFolderParts(current);
  const siblings = comics.filter(candidate => {
    if (!candidate || candidate.source !== current.source) return false;
    const parents = comicFolderParts(candidate);
    const format = String(candidate.format || candidate.name?.split('.').pop() || '').toLowerCase();
    return readableComicFormats.has(format) && parents.length === folder.length && parents.every((part, i) => part === folder[i]);
  }).sort((a, b) => filenameOrder.compare(String(a.name || ''), String(b.name || '')) ||
    (String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0));
  const index = siblings.findIndex(candidate => candidate.id === current.id);
  return index >= 0 ? siblings[index + 1] || null : null;
}
// "Up next": comics being read (latest first), "read later", the next issue of
// the series read most recently, then the rest in series order. The library is
// gone through once; looking through every comic again for each finished one
// took many seconds with thousands of comics read.
export function upNextComics(comics,progress={},limit=6,readLaterIds=[]) {
  const wanted=Math.max(0,limit);
  const chosen=[],seen=new Set(),add=comic=>{if(comic&&!seen.has(comic.id)&&statusOf(comic,progress)!=='finished'){chosen.push(comic);seen.add(comic.id);}};
  const reading=[],finished=[],open=[];
  for(const comic of comics){const status=statusOf(comic,progress);if(status==='finished')finished.push(comic);else{open.push(comic);if(status==='reading')reading.push(comic);}}
  sortComics(reading,progress,'recent').forEach(add);
  const byId=new Map(comics.map(comic=>[comic.id,comic]));
  for(const id of readLaterIds)add(byId.get(id));
  if(!(chosen.length<wanted))return chosen.slice(0,wanted);
  // Comics not finished yet, by series and volume, in issue order.
  const seriesKey=m=>fold(m.series)+'\u0000'+String(m.volume||''),issues=new Map();
  for(const comic of open){
    const n=comic.metadata||{};
    if(!n.series||n.issue===''||!Number.isFinite(Number(n.issue)))continue;
    const key=seriesKey(n);let list=issues.get(key);if(!list)issues.set(key,list=[]);list.push(comic);
  }
  for(const list of issues.values())list.sort((a,b)=>Number(a.metadata.issue)-Number(b.metadata.issue));
  for(const previous of sortComics(finished,progress,'recent')) {
    const m=previous.metadata||{},issue=Number(m.issue);
    if(!m.series||m.issue===''||!Number.isFinite(issue))continue;
    add(firstIssueAfter(issues.get(seriesKey(m)),issue));
    if(chosen.length>=limit)break;
  }
  if(!(chosen.length<wanted))return chosen.slice(0,wanted);
  sortComics(open.filter(comic=>!seen.has(comic.id)),progress,'issue').forEach(add);
  return chosen.slice(0,wanted);
}
function firstIssueAfter(list,issue){
  if(!list)return undefined;
  let low=0,high=list.length;
  while(low<high){const middle=(low+high)>>1;if(Number(list[middle].metadata.issue)>issue)high=middle;else low=middle+1;}
  return list[low];
}
// The covers that stand for a group of comics (a folder's stack, a shelf):
// `lead` first (the comic being read there), else the first one not read yet,
// else the first; then the ones that follow it by path (the next issues), and
// after the last, the first ones again. One pass, whatever the folder's size.
export function coverPicks(comics, progress = {}, count = 3, lead = null) {
  if (!Array.isArray(comics) || !comics.length || !(count > 0)) return [];
  const key = comic => String(comic?.path || comic?.name || '') + '\u0000' + String(comic?.id);
  let first = lead && comics.includes(lead) ? lead : null;
  if (!first) {
    let open = null, openKey = null, any = null, anyKey = null;
    for (const comic of comics) {
      const k = key(comic);
      if (anyKey === null || k < anyKey) { any = comic; anyKey = k; }
      if (statusOf(comic, progress) !== 'finished' && (openKey === null || k < openKey)) { open = comic; openKey = k; }
    }
    first = open || any;
  }
  const firstKey = key(first), after = [], before = [], room = count - 1;
  const keep = (list, comic, k) => {
    if (room <= 0) return;
    let index = list.length;
    while (index > 0 && list[index - 1][0] > k) index--;
    if (index >= room) return;
    list.splice(index, 0, [k, comic]);
    if (list.length > room) list.pop();
  };
  for (const comic of comics) { if (comic === first) continue; const k = key(comic); keep(k > firstKey ? after : before, comic, k); }
  return [first, ...after.map(([, comic]) => comic), ...before.map(([, comic]) => comic)].slice(0, count);
}
export function publicError(error, fallback = 'Something went wrong. Please try again.') {
  if (error?.name === 'AbortError') return '';
  const message = typeof error?.message === 'string' ? error.message : '';
  if (!message || /https?:\/\/|password\s*[:=]|token\s*[:=]|session\s*[:=]|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(message)) return fallback;
  return message.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 280);
}
export function catalogAnswer(store, question) {
  const query = fold(question);
  if (/\b(next|recommend|suggest|proxim[oa]|seguinte|seguid[ao]|siguiente|despues|recom[ei]nd|sugest)/.test(query)) return {kind: 'recommendations', comics: store.recommendations(6)};
  if (/\b(finished|already read|completed|terminei|concluid|ja li|leid[oa]s?|terminad)/.test(query)) return {kind: 'finished', comics: store.state.comics.filter(c => statusOf(c, store.state.progress) === 'finished').slice(0, 12)};
  if (/\b(continue|continuar|retomar|where|onde|parei|leyendo)/.test(query)) return {kind: 'continue', comics: sortComics(store.state.comics.filter(c => statusOf(c, store.state.progress) === 'reading'), store.state.progress, 'recent').slice(0, 6)};
  let found = searchComics(store.state.comics, question);
  if (!found.length) {
    const meaningful = query.split(/\s+/).filter(word => word.length >= 3 && !['the','and','for','are','can','you','that','this','why','how','que','uma','dos','das','por','los','las','una','what','which','about','with','read','show','find','have','tell','does','these','those','should','could','quais','sobre','para','com','qual','como','tenho','mostre','encontre','historia','historias','comic','comics','quadrinhos','quiero','sobre','cuales','tengo','leer'].includes(word));
    const ranked = store.state.comics.map(c => ({comic:c, score:meaningful.filter(word => searchComics([c],word).length).length})).filter(v=>v.score>0).sort((a,b)=>b.score-a.score);
    found = ranked.map(v=>v.comic);
  }
  return {kind: found.length ? 'matches' : 'help', comics: found.slice(0, 8)};
}
