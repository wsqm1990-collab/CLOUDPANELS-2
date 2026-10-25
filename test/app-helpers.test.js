import test from 'node:test';
import assert from 'node:assert/strict';
import {searchComics,filterComics,sortComics,publicError,catalogAnswer,statusOf,normalizeFolderPath,folderContents,isInsideFolder,upNextComics,nextComicInFolder} from '../src/app-helpers.js';
const a={id:'a',name:'Alpha 010.cbz',metadata:{title:'Alpha 10',series:'Alpha',issue:'10',volume:'1',publisher:'Élan',characters:['Nova'],tags:['Space']},addedAt:'2026-01-01'};
const b={id:'b',name:'Alpha 002.cbz',metadata:{title:'Alpha 2',series:'Alpha',issue:'2',volume:'1',publisher:'Élan',characters:['Nova'],tags:[]},addedAt:'2026-01-02'};
const c={id:'c',name:'Beta.pdf',metadata:{title:'Beta',series:'Beta',issue:'1',volume:'1',publisher:'Other',characters:[],tags:[]},addedAt:'2026-01-03'};
test('library search combines title publisher character and accent-insensitive terms',()=>{assert.deepEqual(searchComics([a,b,c],'elan nova').map(c=>c.id),['a','b']);assert.deepEqual(searchComics([a,b,c],'Alpha 2').map(c=>c.id),['b']);assert.equal(searchComics([a,b,c],'unknown').length,0);});
test('filters combine progress and metadata without changing original catalog',()=>{const original=[a,b,c],progress={a:{status:'finished'},b:{status:'reading'}};assert.deepEqual(filterComics(original,progress,{status:'reading',publisher:'elan',character:'nova'}),[b]);assert.equal(original.length,3);assert.equal(statusOf(c,progress),'unread');});
test('issue sort orders numeric issues rather than lexicographic titles',()=>{assert.deepEqual(sortComics([a,b,c],{},'issue').map(c=>c.id),['b','a','c']);});
test('public errors never expose account/session URLs or addresses',()=>{assert.equal(publicError(new Error('failed https://mega.nz/#key'),'Safe'),'Safe');assert.equal(publicError(new Error('Bad password=user-secret'),'Safe'),'Safe');assert.equal(publicError(new Error('user@example.com refused'),'Safe'),'Safe');assert.equal(publicError(new DOMException('stop','AbortError')),'');assert.equal(publicError(new Error('Unsupported ZIP64.')),'Unsupported ZIP64.');});
test('catalog companion selects actual catalog entries and makes no story answers',()=>{const store={state:{comics:[a,b,c],progress:{a:{status:'finished'},b:{status:'reading'}}},recommendations:()=>[b,c]};assert.deepEqual(catalogAnswer(store,'What should I read next?').comics,[b,c]);assert.deepEqual(catalogAnswer(store,'O que eu já li?').comics,[a]);assert.deepEqual(catalogAnswer(store,'Continuar lendo').comics,[b]);assert.equal(catalogAnswer(store,'Where did I stop?').kind,'continue');assert.deepEqual(catalogAnswer(store,'Find stories with Nova').comics,[a,b]);assert.equal(catalogAnswer(store,'Explain the ending of an unknown comic').kind,'help');});
test('Portuguese and Spanish companion prompts choose the intended catalog action',()=>{const store={state:{comics:[a,b],progress:{a:{status:'finished'}}},recommendations:()=>[b]};assert.deepEqual(catalogAnswer(store,'O que devo ler em seguida?').comics,[b]);assert.deepEqual(catalogAnswer(store,'¿Qué debería leer después?').comics,[b]);assert.deepEqual(catalogAnswer(store,'¿Qué he leído ya?').comics,[a]);});
test('folder browsing mirrors three nested MEGA folders and direct books without flattening',()=>{
  const comics=[
    {...a,path:'Comics/Marvel/Avengers/Alpha 010.cbz'},
    {...b,path:'Comics/DC/Alpha 002.cbz'},
    {...c,path:'Comics/Image/Beta.pdf'},
    {...c,id:'direct',name:'Read me.pdf',path:'Comics/Read me.pdf'},
    {...c,id:'local',name:'Local.pdf',path:'Local.pdf',source:'local'}
  ];
  const root=folderContents(comics,[]);
  assert.deepEqual(root.folders.map(f=>f.name),['Comics']);
  assert.deepEqual(root.comics.map(c=>c.id),['local']);
  const folder=folderContents(comics,['Comics']);
  assert.deepEqual(folder.folders.map(f=>f.name),['DC','Image','Marvel']);
  assert.deepEqual(folder.comics.map(c=>c.id),['direct']);
  assert.equal(folder.descendants.length,4);
  assert.deepEqual(folderContents(comics,['Comics','Marvel']).folders.map(f=>f.name),['Avengers']);
  assert.deepEqual(folderContents(comics,['Comics','Marvel','Avengers']).comics.map(c=>c.id),['a']);
});
test('folder matching respects complete path segments and resumes the latest actual progress',()=>{
  const comics=[{...a,path:'Comics/Marvel/a.cbz'},{...b,path:'Comics/Marvel/b.cbz'},{...c,path:'Comicshop/Marvel/c.pdf'}];
  const progress={a:{status:'reading',updatedAt:'2026-01-01'},b:{status:'reading',updatedAt:'2026-01-02'}};
  assert.deepEqual(normalizeFolderPath('/Comics\\Marvel/./'),['Comics','Marvel']);
  assert.equal(isInsideFolder(comics[2],['Comics']),false);
  const folder=folderContents(comics,['Comics'],progress).folders[0];
  assert.equal(folder.count,2);assert.equal(folder.readingCount,2);assert.equal(folder.continueComic.id,'b');
  assert.deepEqual(filterComics(folder.comics,progress,{query:'alpha nova'}).map(c=>c.id),['a','b']);
});
test('up next uses saved progress and numeric issue order, never suggests finished stories',()=>{
  const series=issue=>({...a,id:'issue-'+issue,name:'Alpha '+issue+'.cbz',metadata:{...a.metadata,title:'Alpha '+issue,issue:String(issue)}});
  const comics=[series(10),series(2),series(3),series(1)],progress={'issue-2':{status:'finished',updatedAt:'2026-01-02'}};
  const result=upNextComics(comics,progress,3);
  assert.equal(result[0].id,'issue-3');assert.equal(result.length,3);assert.ok(!result.some(c=>c.id==='issue-2'));
  progress['issue-10']={status:'reading',updatedAt:'2026-01-03'};
  assert.equal(upNextComics(comics,progress,3)[0].id,'issue-10');
});
test('up next honors actual Read later order after current reading and excludes unknown or finished IDs',()=>{
  const comics=[a,b,c],progress={a:{status:'reading',updatedAt:'2026-01-03'},b:{status:'finished',updatedAt:'2026-01-02'}};
  assert.deepEqual(upNextComics(comics,progress,6,['unknown','b','c','a']).map(c=>c.id),['a','c']);
  assert.deepEqual(upNextComics(comics,{},3,['c','b']).map(c=>c.id),['c','b','a']);
});


test('folder read state includes all nested catalog entries and updates without a separate folder flag',()=>{
 const comics=[{...a,path:'Comics/DC/a.cbz'},{...b,path:'Comics/DC/Batman/b.cbz'},{...c,path:'Comics/DC/Batman/c.cbr',format:'cbr'},
  {...c,id:'sibling',path:'Comics/DC2/sibling.pdf'},{...c,id:'outside',path:'Comicshop/DC/outside.pdf'}];
 const progress={a:{status:'finished'},b:{status:'reading'},c:{status:'finished'}};
 let root=folderContents(comics,['Comics'],progress),dc=root.folders.find(f=>f.name==='DC');
 assert.equal(dc.count,3);assert.equal(dc.readCount,2);assert.equal(dc.readingCount,1);assert.equal(dc.unreadCount,0);assert.equal(dc.allRead,false);
 assert.equal(root.count,4);assert.equal(root.readCount,2);assert.equal(root.readingCount,1);assert.equal(root.unreadCount,1);assert.equal(root.allRead,false);
 progress.b={status:'finished'};root=folderContents(comics,['Comics'],progress);dc=root.folders.find(f=>f.name==='DC');
 assert.equal(dc.allRead,true);assert.equal(dc.readCount,3);assert.deepEqual(dc.comics.map(c=>c.id),['a','b','c']);assert.equal(root.folders.find(f=>f.name==='DC2').allRead,false);
 const nested=folderContents(comics,['Comics','DC','Batman'],progress);assert.equal(nested.allRead,true);assert.equal(nested.count,2);
 progress.c={status:'unread'};assert.equal(folderContents(comics,['Comics','DC'],progress).allRead,false);
 assert.equal(folderContents([],['Empty']).allRead,false);
});


test('next issue uses direct same-folder numeric filename order without changing the catalog',()=>{
 const make=(id,name,path='Comics/DC/Batman/'+name,source='mega',format='cbz')=>({id,name,path,source,format});
 const first=make('first','Batman 1.cbz'),second=make('second','Batman 2.cbz'),tenth=make('tenth','Batman 10.cbz');
 const catalog=[tenth,make('nested','Batman 3.cbz','Comics/DC/Batman/Event/Batman 3.cbz'),second,
  make('sibling','Batman 3.cbz','Comics/DC/Batman2/Batman 3.cbz'),make('source','Batman 3.cbz',undefined,'local'),first];
 const original=structuredClone(catalog);
 assert.equal(nextComicInFolder(catalog,first),second);
 assert.equal(nextComicInFolder(catalog,second),tenth);
 assert.equal(nextComicInFolder(catalog,tenth),null);
 assert.deepEqual(catalog,original);
 assert.equal(nextComicInFolder(catalog,{...first,id:'missing'}),null);
});
test('next issue skips unsupported files, keeps read issues, and has a stable ID tiebreak',()=>{
 const make=(id,name,format='cbz')=>({id,name,path:'Comics/'+name,source:'mega',format});
 const first=make('one','Story 1.cbz'),unsupported=make('two','Story 2.cbr','cbr');
 const third=make('a','Story 3.cbz'),thirdDuplicate=make('b','Story 3.cbz');
 third.status='finished';
 const catalog=[thirdDuplicate,unsupported,third,first];
 assert.equal(nextComicInFolder(catalog,first),third);
 assert.equal(nextComicInFolder(catalog,third),thirdDuplicate);
 assert.equal(nextComicInFolder(catalog,thirdDuplicate),null);
 assert.equal(nextComicInFolder(catalog,unsupported),null);
});
test('next issue normalizes separators but never leaves the root or enters another source',()=>{
 const first={id:'first',name:'Issue 1.cbz',path:'Issue 1.cbz',source:'local',format:'cbz'};
 const second={id:'second',name:'Issue 2.pdf',path:'./Issue 2.pdf',source:'local',format:'pdf'};
 const catalog=[first,{...second,id:'mega',source:'mega'},
  {...second,id:'nested',path:'Folder/Issue 2.pdf'},second];
 assert.equal(nextComicInFolder(catalog,first),second);
 assert.equal(nextComicInFolder(catalog,second),null);
 const cloudFirst={...first,source:'mega',path:'Comics\\DC/./Issue 1.cbz'};
 const cloudSecond={...second,source:'mega',path:'Comics/DC/Issue 2.pdf'};
 assert.equal(nextComicInFolder([cloudSecond,cloudFirst],cloudFirst),cloudSecond);
 assert.equal(nextComicInFolder([],first),null);
 assert.equal(nextComicInFolder(catalog,null),null);
});
