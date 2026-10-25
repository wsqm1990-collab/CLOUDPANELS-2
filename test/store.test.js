import test from 'node:test';
import assert from 'node:assert/strict';
import {LibraryStore, createBrowserLibraryStore, clearLegacyBrowserLibrary, STORAGE_KEY, MAX_BACKUP_BYTES, parseMetadata} from '../src/store.js';
const memory = () => {const data = new Map(); return {getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),data};};
const comic = (id='mega:abc', issue='1') => ({id,name:`Night Watch #${issue}.cbz`,size:500000,path:'Publisher/Night Watch',source:'mega',format:'cbz',metadata:{title:`Night Watch #${issue}`,series:'Night Watch',volume:'2',issue,publisher:'Original',characters:['Nora'],year:'2026',tags:['Noir']}});
test('library, exact page/panel, collections and settings survive reopen',()=>{
 const storage=memory(), s=new LibraryStore({storage}); s.upsertComics([comic()]); s.setProgress('mega:abc',{page:12,panel:3,pageCount:24,status:'reading',updatedAt:'2026-10-24T00:00:00Z'});
 s.setPanels('mega:abc',12,[{x:0.1,y:0.2,width:0.7,height:0.3}]); s.setSettings({language:'pt-BR',cacheMiB:128,readingDirection:'rtl',readerFitMode:'fill',readerGuided:true});
 const collection=s.createCollection('My favourites'); s.setCollectionComics(collection.id,['mega:abc','unknown']);
 const next=new LibraryStore({storage}); next.load(); assert.equal(next.state.comics.length,1); assert.equal(next.state.progress['mega:abc'].page,12); assert.equal(next.state.progress['mega:abc'].panel,3); assert.equal(next.state.progress['mega:abc'].status,'reading'); assert.deepEqual(next.getPanels('mega:abc',12),[{x:0.1,y:0.2,width:0.7,height:0.3}]); assert.equal(next.state.settings.language,'pt-BR'); assert.equal(next.state.settings.readerFitMode,'fill'); assert.equal(next.state.settings.readerGuided,true); assert.deepEqual(next.state.collections[0].comicIds,['mega:abc']);
});
test('re-index preserves edited metadata; caller credentials and blob never persist',()=>{
 const storage=memory(),s=new LibraryStore({storage}); s.upsertComics([{...comic(),password:'secret-password',sid:'secret-sid',key:'secret-key',blob:new Blob(['secret-bytes'])}]); s.updateComic('mega:abc',{series:'Corrected',volume:'7',issue:'12',password:'do-not-save'});
 s.upsertComics([{id:'mega:abc',name:'Changed.cbz',source:'mega',size:123,path:'Folder',format:'cbz'}]);
 const text=storage.getItem(STORAGE_KEY); assert.equal(s.state.comics[0].metadata.series,'Corrected'); assert.equal(s.state.comics[0].metadata.volume,'7'); assert.equal(s.state.comics[0].metadata.issue,'12'); assert.doesNotMatch(text,/secret-|do-not-save|blob|password|sid/);
});
test('backup validates before merge and rejects prototype identifiers and invalid panels',()=>{
 const s=new LibraryStore({storage:memory()}); s.upsertComics([comic()]); const initial=s.exportBackup();
 assert.throws(()=>s.importBackup('{'),/valid JSON/); assert.equal(s.exportBackup(),initial);
 const bad=JSON.parse(initial); bad.comics[0].id='__proto__'; assert.throws(()=>s.importBackup(JSON.stringify(bad)),/invalid/i);
 const badRect=JSON.parse(initial); badRect.panels={'mega:abc':{'0':[{x:0,y:0,width:2,height:1}]}}; assert.throws(()=>s.importBackup(JSON.stringify(badRect)),/inside/); assert.equal(s.exportBackup(),initial); assert.equal({}.polluted,undefined);
});
test('import merges newer reading progress, keeps earlier existing books, drops unknown secret fields',()=>{
 const a=new LibraryStore({storage:memory()}); a.upsertComics([comic('a','1')]); a.setProgress('a',{page:4,panel:2,pageCount:20,status:'reading',updatedAt:'2026-10-24T10:00:00Z'});
 const b=new LibraryStore({storage:memory()}); b.upsertComics([comic('b','2'),comic('a','1')]); b.setProgress('a',{page:1,pageCount:20,status:'reading',updatedAt:'2026-10-23T10:00:00Z'});
 const data=JSON.parse(b.exportBackup()); data.password='secret'; data.comics[0].sessionId='secret-session'; a.importBackup(JSON.stringify(data));
 assert.equal(a.state.comics.length,2); assert.equal(a.state.progress.a.page,4); assert.doesNotMatch(a.exportBackup(),/secret/);
});
test('finished state explicit, progress clamped and storage failures do not throw',()=>{
 const s=new LibraryStore({storage:{getItem(){throw Error('denied')},setItem(){throw Error('quota')}}}); s.load(); assert.ok(s.lastError); s.upsertComics([comic('a')]); assert.ok(s.lastError);
 s.setProgress('a',{page:999,panel:-1,pageCount:20,status:'reading'}); assert.equal(s.state.progress.a.page,19); assert.equal(s.state.progress.a.panel,0); assert.equal(s.state.progress.a.status,'reading');
 s.setProgress('a',{status:'finished'}); assert.equal(s.state.progress.a.status,'finished'); assert.equal(s.save(),false);
});
test('metadata inference keeps volume separate from issue and year',()=>{
 const m=parseMetadata('Night_Watch v02 #012 (2026).cbz'); assert.equal(m.volume,'2'); assert.equal(m.issue,'12'); assert.equal(m.year,'2026'); assert.equal(m.series,'Night Watch');
 assert.equal(parseMetadata('Night Watch 003 (2026).cbz').issue,'3'); assert.equal(parseMetadata('Night Watch (2026).cbz').issue,'');
});
test('recommendations use existing next issue in same volume, and continue reading first',()=>{
 const s=new LibraryStore({storage:memory()}); s.upsertComics([comic('one','1'),comic('ten','10'),comic('two','2'),{...comic('other','2'),metadata:{...comic('other','2').metadata,volume:'1'}}]);
 s.setProgress('one',{page:19,pageCount:20,status:'finished'}); assert.equal(s.recommendations()[0].id,'two');
 s.setProgress('ten',{page:3,pageCount:20,status:'reading'}); assert.equal(s.recommendations()[0].id,'ten'); assert.equal(s.related('one')[0].id,'two');
});
test('cache bounds and destructive library removal affect metadata only',()=>{
 const s=new LibraryStore({storage:memory()}); s.upsertComics([comic('a'),comic('b')]); s.setSettings({cacheMiB:99999,language:'xx',readingDirection:'evil',readerFitMode:'crop-unknown'}); assert.equal(s.state.settings.cacheMiB,256); assert.equal(s.state.settings.language,'en'); assert.equal(s.state.settings.readerFitMode,'whole');
 const c=s.createCollection('Set'); s.setCollectionComics(c.id,['a','b']); s.setProgress('a',{page:1,pageCount:20,status:'reading'}); s.removeComic('a'); assert.equal(s.state.progress.a,undefined); assert.deepEqual(s.state.collections[0].comicIds,['b']); assert.equal(s.state.comics.length,1);
});
test('IndexedDB bridge persists metadata beyond localStorage capacity and reopens it',async()=>{
 let persisted=null; const backend={async read(){return persisted},async write(text){persisted=text}};
 const s=await createBrowserLibraryStore({metadataStore:backend,fallbackStorage:{getItem(){return null},setItem(){throw Error('5 MB quota')}}});
 const entries=Array.from({length:6000},(_,i)=>({...comic(`mega:large-${i}`,String(i)),path:'Library/'+'Long comic folder '.repeat(55)}));
 s.upsertComics(entries); assert.equal(await s.flush(),true); assert.equal(s.persistence,'indexedDB'); assert.ok(persisted.length>5*1024*1024); assert.equal(MAX_BACKUP_BYTES,64*1024*1024);
 const reopened=await createBrowserLibraryStore({metadataStore:backend,fallbackStorage:memory()}); assert.equal(reopened.state.comics.length,6000); assert.equal(reopened.state.comics[5999].id,'mega:large-5999');
});
test('rapid updates commit the latest exact page after a slow earlier transaction',async()=>{
 let persisted=null,release,started; const gate=new Promise(resolve=>{release=resolve}); const firstStarted=new Promise(resolve=>{started=resolve}); let writes=0;
 const backend={async read(){return persisted},async write(text){writes++; if(writes===1){started(); await gate;} persisted=text}};
 const s=await createBrowserLibraryStore({metadataStore:backend,fallbackStorage:memory()}); s.upsertComics([comic('a')]); await firstStarted;
 s.setProgress('a',{page:2,panel:1,pageCount:50,status:'reading'}); s.setProgress('a',{page:12,panel:3,pageCount:50,status:'reading'}); const flushed=s.flush(); release(); assert.equal(await flushed,true);
 assert.equal(JSON.parse(persisted).progress.a.page,12); assert.equal(JSON.parse(persisted).progress.a.panel,3); assert.equal(writes,2);
});
test('asynchronous quota failure is reported and explicit flush can recover without lost progress',async()=>{
 let persisted=null,fail=true; const notices=[]; const backend={async read(){return persisted},async write(text){if(fail)throw Error('quota');persisted=text}};
 const s=await createBrowserLibraryStore({metadataStore:backend,fallbackStorage:memory(),onPersistenceError:message=>notices.push(message)}); s.upsertComics([comic('a')]); s.setProgress('a',{page:9,panel:2,pageCount:24,status:'reading'});
 assert.equal(await s.flush(),false); assert.match(s.lastError,/could not be saved/); assert.ok(notices.length>=1); assert.equal(s.state.progress.a.page,9);
 fail=false; assert.equal(await s.flush(),true); assert.equal(JSON.parse(persisted).progress.a.page,9); assert.equal(s.lastError,null);
});
test('browser storage fallback is explicit and legacy metadata migrates once into IndexedDB',async()=>{
 const local=memory(),old=new LibraryStore({storage:local});old.upsertComics([comic('migrated')]);old.setProgress('migrated',{page:5,pageCount:20,status:'reading'});
 let persisted=null; const backend={async read(){return persisted},async write(text){persisted=text}};
 const migrated=await createBrowserLibraryStore({metadataStore:backend,fallbackStorage:local}); assert.equal(migrated.persistence,'indexedDB'); assert.equal(JSON.parse(persisted).progress.migrated.page,5);
 const notices=[]; const fallback=await createBrowserLibraryStore({indexedDB:null,fallbackStorage:local,onPersistenceError:message=>notices.push(message)}); assert.equal(fallback.persistence,'localStorage'); assert.equal(fallback.state.comics[0].id,'migrated'); assert.match(notices[0],/limited browser storage/);
 fallback.setProgress('migrated',{page:6,pageCount:20,status:'reading'}); assert.equal(await fallback.flush(),true); assert.equal(JSON.parse(local.getItem(STORAGE_KEY)).progress.migrated.page,6);
});

test('saved shelves and annotated page/panel bookmarks survive reopen and re-index without credentials',()=>{
 const storage=memory(),s=new LibraryStore({storage});s.upsertComics([comic('a'),comic('b')]);
 s.setFavorite('a',true);s.setReadLater('b',true);s.setReadLater('a',true);s.setReadLater('b',true);
 assert.deepEqual(s.state.readLater,['b','a']);
 const first=s.setBookmark('a',{page:12,panel:3,pageCount:30,guided:true,label:'Important reveal',note:'First line\nSecond line',sid:'secret-session',password:'secret-password'});
 const updated=s.setBookmark('a',{page:12,panel:3,pageCount:30,guided:true,label:'Revisit',note:'My note'});
 assert.equal(updated.id,first.id);assert.equal(updated.createdAt,first.createdAt);assert.equal(s.getBookmarks('a').length,1);
 s.upsertComics([{id:'a',name:'Renamed.cbz',source:'mega',size:500000,path:'Other folder'}]);
 const reopened=new LibraryStore({storage});reopened.load();assert.deepEqual(reopened.state.favorites,['a']);assert.deepEqual(reopened.state.readLater,['b','a']);
 assert.equal(reopened.getBookmarks('a')[0].panel,3);assert.equal(reopened.getBookmarks('a')[0].guided,true);assert.equal(reopened.getBookmarks('a')[0].label,'Revisit');
 const copy=reopened.getBookmarks('a');copy[0].label='Changed outside';assert.equal(reopened.getBookmarks('a')[0].label,'Revisit');
 assert.doesNotMatch(reopened.exportBackup(),/secret-session|secret-password/);
 reopened.removeComic('a');assert.deepEqual(reopened.state.favorites,[]);assert.deepEqual(reopened.state.readLater,['b']);assert.deepEqual(reopened.getBookmarks('a'),[]);
});

test('appearance settings and bookmark coordinates stay bounded; old backups retain reading history',()=>{
 const storage=memory(),s=new LibraryStore({storage});s.upsertComics([comic('a')]);s.setProgress('a',{page:7,panel:2,pageCount:20,status:'reading'});
 s.setSettings({readerFitMode:'width',readerBackground:'sepia',readerBrightness:999,readerContrast:-12});
 assert.equal(s.state.settings.readerBrightness,1.2);assert.equal(s.state.settings.readerContrast,.6);assert.equal(s.state.settings.readerFitMode,'width');
 const entry=s.setBookmark('a',{page:999,panel:-4,pageCount:20,label:'x'.repeat(500),note:'first\nsecond\nhttps://mega.nz/folder/example#secretkey',guided:true});
 assert.equal(entry.page,19);assert.equal(entry.panel,0);assert.equal(entry.label.length,160);assert.match(entry.note,/first\nsecond/);assert.doesNotMatch(entry.note,/secretkey/);
 assert.throws(()=>s.setBookmark('missing',{page:0,pageCount:1}),/bookmark/);assert.throws(()=>s.setFavorite('missing',true),/library/);
 const legacy=JSON.parse(s.exportBackup());delete legacy.favorites;delete legacy.readLater;delete legacy.bookmarks;
 for(const key of ['readerBackground','readerBrightness','readerContrast'])delete legacy.settings[key];
 storage.setItem(STORAGE_KEY,JSON.stringify(legacy));const reopened=new LibraryStore({storage});reopened.load();
 assert.equal(reopened.state.progress.a.page,7);assert.equal(reopened.state.progress.a.panel,2);assert.deepEqual(reopened.state.bookmarks,[]);assert.equal(reopened.state.settings.readerBrightness,1);
});

test('backup merge retains saved shelves, resolves newer bookmark edits and explicit read-later suggestions',()=>{
 const a=new LibraryStore({storage:memory()}),b=new LibraryStore({storage:memory()});a.upsertComics([comic('a','1'),comic('b','2'),comic('c','3')]);b.upsertComics([comic('d','4')]);
 const marker=a.setBookmark('a',{page:1,panel:0,pageCount:20,note:'Old'});a.setFavorite('a',true);a.setReadLater('c',true);b.setFavorite('d',true);b.setReadLater('d',true);
 const imported=JSON.parse(b.exportBackup());imported.comics.push(comic('a','1'));imported.bookmarks=[{...marker,note:'New',updatedAt:'2099-01-01T00:00:00Z'}];
 a.importBackup(JSON.stringify(imported));assert.deepEqual(a.state.favorites,['a','d']);assert.deepEqual(a.state.readLater,['c','d']);assert.equal(a.getBookmarks('a')[0].note,'New');
 a.setProgress('b',{page:2,pageCount:20,status:'reading'});assert.equal(a.recommendations()[0].id,'b');assert.equal(a.recommendations()[1].id,'c');
 a.setProgress('c',{status:'finished',pageCount:20});assert.ok(!a.recommendations().some(value=>value.id==='c'));assert.ok(a.state.readLater.includes('c'));
 a.removeBookmark(marker.id);assert.equal(a.getBookmarks('a').length,0);
});

test('panel detection, reader settings and progress do not traverse the catalog before a coalesced flush',async()=>{
 let persisted=null,writes=0,visits=0;
 const backend={async read(){return persisted},async write(text){writes++;persisted=text}};
 const s=await createBrowserLibraryStore({metadataStore:backend,fallbackStorage:memory()});s.upsertComics([comic('a')]);await s.flush();writes=0;
 const title=s.state.comics[0].metadata.title;
 Object.defineProperty(s.state.comics[0].metadata,'title',{enumerable:true,configurable:true,get(){visits++;return title;}});
 s.setSettings({readerGuided:true});s.setPanels('a',4,[{x:0,y:0,width:.5,height:1},{x:.5,y:0,width:.5,height:1}]);
 s.setProgress('a',{page:4,panel:1,pageCount:20,status:'reading'});
 assert.equal(visits,0,'small reading mutations must not sanitize the whole catalog inline');
 assert.equal(s.state.progress.a.panel,1);assert.equal(s.getPanels('a',4).length,2);assert.equal(s.state.settings.readerGuided,true);
 assert.equal(await s.flush(),true);assert.ok(visits>0);assert.equal(writes,1);
 const saved=JSON.parse(persisted);assert.equal(saved.progress.a.panel,1);assert.equal(saved.panels.a['4'].length,2);assert.equal(saved.settings.readerGuided,true);
});


test('navigation timing is optional, persists and migrates without losing a reading position',()=>{
 const storage=memory(),s=new LibraryStore({storage});s.upsertComics([comic('timed')]);
 s.setProgress('timed',{page:12,panel:4,pageCount:34,status:'reading'});
 assert.equal(s.state.settings.readerNavigationSeconds,3);
 s.setSettings({readerNavigationSeconds:0});
 const reopened=new LibraryStore({storage});reopened.load();assert.equal(reopened.state.settings.readerNavigationSeconds,0);
 for(const invalid of [-1,1,4,999,Infinity,'5',false,null]){
  reopened.setSettings({readerNavigationSeconds:invalid});assert.equal(reopened.state.settings.readerNavigationSeconds,0);
 }
 reopened.setSettings({readerNavigationSeconds:8});
 const backup=JSON.parse(reopened.exportBackup());assert.equal(backup.settings.readerNavigationSeconds,8);
 const restored=new LibraryStore({storage:memory()});restored.importBackup(JSON.stringify(backup));
 assert.equal(restored.state.settings.readerNavigationSeconds,8);assert.equal(restored.state.progress.timed.page,12);assert.equal(restored.state.progress.timed.panel,4);
 delete backup.settings.readerNavigationSeconds;storage.setItem(STORAGE_KEY,JSON.stringify(backup));
 const legacy=new LibraryStore({storage});legacy.load();assert.equal(legacy.state.settings.readerNavigationSeconds,3);
 assert.equal(legacy.state.progress.timed.page,12);assert.equal(legacy.state.progress.timed.panel,4);
});


test('marking an opened comic unread clears its reading position while keeping the library and saved shelves',()=>{
 const storage=memory(),s=new LibraryStore({storage});s.upsertComics([comic('accidental'),comic('other')]);
 s.setProgress('accidental',{page:12,panel:4,pageCount:34,status:'reading'});s.setProgress('other',{page:5,panel:1,pageCount:20,status:'reading'});
 s.setFavorite('accidental',true);s.setReadLater('accidental',true);s.setPanels('accidental',12,[{x:0,y:0,width:1,height:1}]);
 const bookmark=s.setBookmark('accidental',{page:12,panel:4,pageCount:34,note:'Keep this note'});
 s.markUnread('accidental');
 const reopened=new LibraryStore({storage});reopened.load();
 assert.equal(reopened.state.progress.accidental.status,'unread');assert.equal(reopened.state.progress.accidental.page,0);assert.equal(reopened.state.progress.accidental.panel,0);assert.equal(reopened.state.progress.accidental.pageCount,34);
 assert.equal(reopened.state.comics.length,2);assert.equal(reopened.state.progress.other.status,'reading');assert.equal(reopened.state.progress.other.page,5);
 assert.ok(reopened.state.favorites.includes('accidental'));assert.ok(reopened.state.readLater.includes('accidental'));assert.equal(reopened.getBookmarks('accidental')[0].id,bookmark.id);assert.equal(reopened.getPanels('accidental',12).length,1);
 assert.throws(()=>reopened.markUnread('missing'),/library/);
});

test('five swipe resistance levels persist and older libraries default to balanced without changing progress',()=>{
 const storage=memory(),s=new LibraryStore({storage});s.upsertComics([comic('a')]);s.setProgress('a',{page:8,panel:2,pageCount:20,status:'reading'});
 assert.equal(s.state.settings.readerSwipeResistance,3);
 for(const level of [1,2,3,4,5]){s.setSettings({readerSwipeResistance:level});const reopened=new LibraryStore({storage});reopened.load();assert.equal(reopened.state.settings.readerSwipeResistance,level);}
 for(const invalid of [0,6,-1,'2',true,NaN]){s.setSettings({readerSwipeResistance:invalid});assert.equal(s.state.settings.readerSwipeResistance,5);}
 const backup=JSON.parse(s.exportBackup());delete backup.settings.readerSwipeResistance;storage.setItem(STORAGE_KEY,JSON.stringify(backup));
 const old=new LibraryStore({storage});old.load();assert.equal(old.state.settings.readerSwipeResistance,3);assert.equal(old.state.progress.a.page,8);assert.equal(old.state.progress.a.panel,2);
});


test('bulk reading status saves one snapshot, deduplicates and retains metadata, bookmarks and precise read positions',()=>{
 const storage=memory(),s=new LibraryStore({storage});s.upsertComics([comic('a'),comic('b'),comic('untouched')]);
 s.setProgress('a',{page:8,panel:3,pageCount:34,status:'reading'});s.setProgress('untouched',{page:2,panel:1,pageCount:10,status:'reading'});
 s.setFavorite('a',true);s.setReadLater('a',true);const bookmark=s.setBookmark('a',{page:8,panel:3,pageCount:34,note:'Retain'});
 let writes=0;const save=storage.setItem;storage.setItem=(...args)=>{writes++;save(...args);};
 assert.equal(s.setReadStatusBatch(['a','a','b','stale-but-valid'],'finished'),2);assert.equal(writes,1);
 assert.equal(s.state.progress.a.page,8);assert.equal(s.state.progress.a.panel,3);assert.equal(s.state.progress.a.pageCount,34);
 assert.equal(s.state.progress.b.status,'finished');assert.equal(s.state.progress.untouched.status,'reading');
 assert.equal(s.setReadStatusBatch(['a','b'],'finished'),0);assert.equal(writes,1);
 assert.equal(s.setReadStatusBatch(['a','b'],'unread'),2);assert.equal(writes,2);
 const reopened=new LibraryStore({storage});reopened.load();
 assert.equal(reopened.state.progress.a.status,'unread');assert.equal(reopened.state.progress.a.page,0);assert.equal(reopened.state.progress.a.panel,0);assert.equal(reopened.state.progress.a.pageCount,34);
 assert.equal(reopened.state.comics.length,3);assert.equal(reopened.state.progress.untouched.page,2);assert.ok(reopened.state.favorites.includes('a'));assert.ok(reopened.state.readLater.includes('a'));assert.equal(reopened.getBookmarks('a')[0].id,bookmark.id);
});

test('invalid bulk selections are atomic, while empty or stale selections perform no storage writes',()=>{
 const storage=memory(),s=new LibraryStore({storage});s.upsertComics([comic('a'),comic('not-opened')]);s.setProgress('a',{page:3,panel:2,pageCount:9,status:'reading'});
 const before=s.exportBackup();let writes=0;const save=storage.setItem;storage.setItem=(...args)=>{writes++;save(...args);};
 for(const ids of [['a','__proto__'],['a',null],['a','https://mega.nz/x'],['a',''],new Array(50001).fill('a'),'a'])assert.throws(()=>s.setReadStatusBatch(ids,'finished'),/selection|identifier/);
 assert.throws(()=>s.setReadStatusBatch(['a'],'reading'),/selection/);
 assert.equal(s.exportBackup(),before);assert.equal(writes,0);
 assert.equal(s.setReadStatusBatch([],'finished'),0);assert.equal(s.setReadStatusBatch(['removed-id'],'unread'),0);assert.equal(s.setReadStatusBatch(['not-opened'],'unread'),0);assert.equal(s.state.progress['not-opened'],undefined);assert.equal(writes,0);
});

test('page transition preferences persist, reject malformed choices and migrate old libraries',()=>{
 const storage=memory(),s=new LibraryStore({storage});s.upsertComics([comic('a')]);
 assert.equal(s.state.settings.readerPageAnimation,'slide');assert.equal(s.state.settings.readerPageDuration,420);
 s.setSettings({readerPageAnimation:'fade',readerPageDuration:650});
 for(const readerPageAnimation of ['curl','',true,null,{},['slide']])s.setSettings({readerPageAnimation});
 for(const readerPageDuration of [-1,0,421,Infinity,'240',true,null])s.setSettings({readerPageDuration});
 assert.equal(s.state.settings.readerPageAnimation,'fade');assert.equal(s.state.settings.readerPageDuration,650);
 const reopened=new LibraryStore({storage});reopened.load();
 assert.equal(reopened.state.settings.readerPageAnimation,'fade');assert.equal(reopened.state.settings.readerPageDuration,650);
 reopened.setSettings({readerPageAnimation:'none',readerPageDuration:240});
 const restored=new LibraryStore({storage:memory()});restored.importBackup(reopened.exportBackup());
 assert.equal(restored.state.settings.readerPageAnimation,'none');assert.equal(restored.state.settings.readerPageDuration,240);
 const old=JSON.parse(restored.exportBackup());delete old.settings.readerPageAnimation;delete old.settings.readerPageDuration;
 const migrated=new LibraryStore({storage:memory()});migrated.importBackup(JSON.stringify(old));
 assert.equal(migrated.state.settings.readerPageAnimation,'slide');assert.equal(migrated.state.settings.readerPageDuration,420);
});

test('guided overview resumes at its saved page and panel through reopen and a newer backup merge',()=>{
 const storage=memory(),s=new LibraryStore({storage});s.upsertComics([comic('a')]);
 s.setProgress('a',{page:8,panel:5,pageCount:20,overview:true,status:'reading',updatedAt:'2026-10-25T12:00:00Z'});
 const reopened=new LibraryStore({storage});reopened.load();
 assert.equal(reopened.state.progress.a.overview,true);assert.equal(reopened.state.progress.a.page,8);assert.equal(reopened.state.progress.a.panel,5);
 const restored=new LibraryStore({storage:memory()});restored.upsertComics([comic('a'),comic('retained')]);
 restored.setProgress('a',{page:2,panel:1,pageCount:20,status:'reading',updatedAt:'2026-10-24T12:00:00Z'});
 restored.importBackup(reopened.exportBackup());assert.equal(restored.state.comics.length,2);
 assert.equal(restored.state.progress.a.overview,true);assert.equal(restored.state.progress.a.page,8);assert.equal(restored.state.progress.a.panel,5);
 restored.setProgress('a',{status:'finished'});assert.equal(restored.state.progress.a.overview,true);
 restored.setProgress('a',{page:9,panel:0});assert.equal(restored.state.progress.a.overview,false);
 restored.setProgress('a',{overview:'true'});assert.equal(restored.state.progress.a.overview,false);
 const legacy=JSON.parse(restored.exportBackup());delete legacy.progress.a.overview;
 const old=new LibraryStore({storage:memory()});old.importBackup(JSON.stringify(legacy));assert.equal(old.state.progress.a.overview,false);
});

test('single and batch unread reset guided overview while finished retains the current overview',()=>{
 const s=new LibraryStore({storage:memory()});s.upsertComics([comic('single'),comic('batch')]);
 for(const id of ['single','batch'])s.setProgress(id,{page:3,panel:5,pageCount:20,overview:true,status:'reading'});
 s.setReadStatusBatch(['batch'],'finished');assert.equal(s.state.progress.batch.overview,true);
 s.markUnread('single');s.setReadStatusBatch(['batch'],'unread');
 for(const id of ['single','batch']){assert.equal(s.state.progress[id].overview,false);assert.equal(s.state.progress[id].page,0);assert.equal(s.state.progress[id].panel,0);assert.equal(s.state.progress[id].pageCount,20);}
 s.setProgress('single',{overview:true,status:'unread'});assert.equal(s.state.progress.single.overview,false);
});

test('old balloon preferences are ignored without changing the library, guided progress or panel layouts',()=>{
 const source=new LibraryStore({storage:memory()});source.upsertComics([comic('a')]);
 source.setSettings({readerGuided:true,readerSwipeResistance:4,readerPageAnimation:'fade'});
 source.setProgress('a',{page:8,panel:5,pageCount:20,status:'reading'});
 source.setPanels('a',9,[{x:.1,y:.1,width:.8,height:.3},{x:.1,y:.5,width:.8,height:.4}]);
 const old=JSON.parse(source.exportBackup());old.settings.readerBalloonSize=5;
 const storage=memory(),restored=new LibraryStore({storage});restored.importBackup(JSON.stringify(old));
 assert.equal(restored.state.settings.readerBalloonSize,undefined);
 assert.equal(restored.state.settings.readerGuided,true);assert.equal(restored.state.settings.readerSwipeResistance,4);assert.equal(restored.state.settings.readerPageAnimation,'fade');
 assert.equal(restored.state.comics.length,1);assert.equal(restored.state.progress.a.page,8);assert.equal(restored.state.progress.a.panel,5);
 assert.equal(restored.getPanels('a',9).length,2);
 const reopened=new LibraryStore({storage});reopened.load();
 assert.equal(reopened.state.settings.readerBalloonSize,undefined);assert.equal(reopened.state.progress.a.page,8);assert.equal(reopened.getPanels('a',9).length,2);
 reopened.setSettings({readerBalloonSize:3});assert.equal(reopened.state.settings.readerBalloonSize,undefined);
});

test('strict encrypted metadata read failure never reads or writes a browser fallback',async()=>{
 let reads=0,writes=0,closes=0;
 const fallback={getItem(){reads++;throw Error('must not read')},setItem(){writes++;throw Error('must not write')}};
 const backend={async read(){throw Error('decrypt key secret-value failed')},async write(){writes++},close(){closes++}};
 await assert.rejects(()=>createBrowserLibraryStore({metadataStore:backend,strictPersistence:true,fallbackStorage:fallback}),error=>error.message==='Your saved library could not be loaded.');
 assert.equal(reads,0);assert.equal(writes,0);assert.equal(closes,1);
});

test('an empty strict native profile does not inspect global legacy library storage',async()=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'localStorage');let legacyReads=0,persisted=null,closed=0;
 Object.defineProperty(globalThis,'localStorage',{configurable:true,get(){legacyReads++;throw Error('legacy must be isolated')}});
 try {
  const s=await createBrowserLibraryStore({strictPersistence:true,metadataStore:{async read(){return null},async write(text){persisted=text},close(){closed++}}});
  assert.equal(legacyReads,0);assert.equal(s.state.comics.length,0);assert.equal(persisted,null);
  s.upsertComics([comic('private')]);assert.equal(await s.flush(),true);assert.equal(JSON.parse(persisted).comics[0].id,'private');
  s.close();s.close();assert.equal(closed,1);assert.equal(legacyReads,0);
 } finally {if(previous)Object.defineProperty(globalThis,'localStorage',previous);else delete globalThis.localStorage;}
});

test('strict malformed encrypted libraries fail closed without overwriting the original',async()=>{
 for(const initial of ['', '{', JSON.stringify({version:1,comics:[{id:'bad'}]})]){
  let writes=0,closes=0,legacyReads=0;
  await assert.rejects(()=>createBrowserLibraryStore({strictPersistence:true,metadataStore:{async read(){return initial},async write(){writes++},close(){closes++}},fallbackStorage:{getItem(){legacyReads++;return null},setItem(){writes++}}}),/saved library could not be loaded/);
  assert.equal(writes,0);assert.equal(legacyReads,0);assert.equal(closes,1);
 }
});

test('closing a metadata store releases it without flushing deferred reading changes',async()=>{
 let persisted=null,writes=0,closes=0;
 const s=await createBrowserLibraryStore({metadataStore:{async read(){return persisted},async write(text){writes++;persisted=text},close(){closes++}},strictPersistence:true});
 s.upsertComics([comic('a')]);await s.flush();assert.equal(writes,1);
 s.setProgress('a',{page:5,panel:1,pageCount:20});s.close();s.close();
 await new Promise(resolve=>setTimeout(resolve,380));
 assert.equal(writes,1);assert.equal(closes,1);assert.equal(JSON.parse(persisted).progress.a,undefined);assert.equal(await s.flush(),false);
});

test('legacy cleanup removes only metadata and clears local storage only after database deletion succeeds',async()=>{
 const deleted=[],removed=[];
 const indexedDB={deleteDatabase(name){deleted.push(name);const request={};queueMicrotask(()=>request.onsuccess());return request;}};
 const storage={removeItem(key){removed.push(key)}};
 assert.equal(await clearLegacyBrowserLibrary({indexedDB,storage}),true);assert.deepEqual(deleted,['cloudpanels-metadata']);assert.deepEqual(removed,[STORAGE_KEY]);
 assert.equal(await clearLegacyBrowserLibrary({indexedDB,storage:null}),false);
 for(const outcome of ['onerror','onblocked']){
  let removedOnFailure=false;
  const failing={deleteDatabase(){const request={};queueMicrotask(()=>request[outcome]());return request;}};
  assert.equal(await clearLegacyBrowserLibrary({indexedDB:failing,storage:{removeItem(){removedOnFailure=true}}}),false);assert.equal(removedOnFailure,false);
 }
});
