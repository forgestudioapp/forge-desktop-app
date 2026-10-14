const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../main.js'),'utf8');
test('saving a link updates both the agent context and active project snapshot',()=>{
 const writes=new Map(),contexts=[];
 const ctx={fs:{writeFileSync:(name,value)=>writes.set(name,JSON.parse(value)),existsSync:()=>true,readFileSync:()=>'{"path":"/A","linkedStudio":null}'},getProjectsRegistryPath:()=>'/registry',userDataFile:()=>'/active',writeProjectAgentContext:p=>contexts.push(p),canonicalProjectPath:x=>x};
 vm.createContext(ctx);vm.runInContext(source.slice(source.indexOf('function saveProjectsRegistry('),source.indexOf('function projectAgentContextPath(')),ctx);
 const project={path:'/A',linkedStudio:{placeId:'42'},syncPaused:true};ctx.saveProjectsRegistry([project]);
 assert.equal(writes.get('/active').linkedStudio.placeId,'42');assert.equal(contexts[0],project);
});
function handler(name,values){let fn;const start=source.indexOf("ipcMain.handle('"+name+"'");assert.ok(start>=0);vm.runInNewContext(source.slice(start,source.indexOf('\n});',start)+4),{ipcMain:{handle:(_,cb)=>fn=cb},...values});return fn;}
test('opening a paused linked project neither probes Studio nor starts synchronization',async()=>{
 const project={name:'A',path:'/A',linkedStudio:{placeId:'42'},syncPaused:true};let starts=0,stops=0;
 const open=handler('set-active-project',{loadProjectsRegistry:()=>[project],isPathAllowed:()=>true,userDataFile:x=>x,fs:{writeFileSync(){}},stopFileSync:()=>stops++,startFileSync:()=>starts++,scheduleMediaTracking(){},writeProjectAgentContext(){}});
 assert.equal((await open(null,'/A')).success,true);assert.equal(starts,0);assert.equal(stops,1);
 project.syncPaused=false;await open(null,'/A');assert.equal(starts,1);
});
test('reading the current project is side effect free',async()=>{
 const project={path:'/A',linkedStudio:null};const read=handler('get-active-project',{readActiveProject:()=>project});assert.equal((await read()).project,project);
});
test('pause is persisted and a different project watcher is untouched',async()=>{
 let stopped=0,saved;const pause=handler('stop-file-sync',{setProjectSyncPaused:(p,v)=>saved=[p,v],currentSyncProjectPath:'/B',canonicalProjectPath:x=>x,stopFileSync:()=>stopped++});
 assert.equal((await pause(null,'/A')).success,true);assert.deepEqual(saved,['/A',true]);assert.equal(stopped,0);
});
test('a wrong Studio place cannot enable synchronization',async()=>{
 const start=handler('start-file-sync',{ensureProjectPlaceAssociation:async()=>({error:'wrong place',code:'project-linked-elsewhere'})});assert.equal((await start(null,'/A')).error,'wrong place');
});
test('failed trash operation preserves the registry',async()=>{
 let saved=0;const remove=handler('delete-project',{loadProjectsRegistry:()=>[{path:'/A',name:'A'}],projectHasRunningAgents:()=>false,fs:{existsSync:()=>true},isPathAllowed:()=>true,shell:{trashItem:async()=>{throw Error('busy')}},saveProjectsRegistry:()=>saved++});assert.equal((await remove(null,'/A',true)).error,'busy');assert.equal(saved,0);
});
test('removing from the list leaves project files intact',async()=>{
 let registry=[{path:'/A',name:'A'}],trashed=0;const remove=handler('delete-project',{loadProjectsRegistry:()=>registry,projectHasRunningAgents:()=>false,projectAgentContextPath:()=>'/context',fs:{existsSync:()=>false,writeFileSync(){}},shell:{trashItem:async()=>trashed++},saveProjectsRegistry:r=>registry=r,userDataFile:x=>x});assert.equal((await remove(null,'/A',false)).success,true);assert.equal(trashed,0);assert.equal(registry.length,0);
});
test('local creation renderer succeeds without any Studio API, and retries disk failures',async()=>{
 const elements=new Map();function el(id){if(!elements.has(id))elements.set(id,{value:'Tour été',disabled:false,hidden:true,events:{},addEventListener(n,f){this.events[n]=f}});return elements.get(id);}
 let count=0,fail=true;const api={createProject:async name=>{count++;assert.equal(name,'tour-ete');return fail?{error:'Disk full'}:{path:'/tour-ete'}}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'project-create.js'),'utf8'),{document:{documentElement:{},querySelectorAll:()=>[],getElementById:el},localStorage:{getItem:()=> 'fr'},window:{forgeAPI:api}});
 await el('createForm').events.submit({preventDefault(){}});assert.equal(el('creationStatus').textContent,'Disk full');assert.equal(el('createBtn').disabled,false);
 fail=false;await el('createForm').events.submit({preventDefault(){}});assert.equal(el('createdActions').hidden,false);assert.equal(el('createBtn').disabled,true);assert.equal(count,2);
});
test('startup counts add only missing providers and respect the overall limit',()=>{
 const {plan}=require('./agent-startup');assert.deepEqual(plan({maxAgents:4,startupAgents:{claude:2,codex:1}},[{agentType:'claude'}]),['claude','codex']);
 assert.deepEqual(plan({maxAgents:2,startupAgents:{claude:2,codex:2}},[{agentType:'codex'}]),['claude']);
 assert.deepEqual(plan({startupAgents:{claude:-1,codex:'bad'}}),[]);
 assert.deepEqual(plan({maxAgents:3,startupAgents:{claude:2,codex:1}},[{agentType:'claude'},{agentType:'claude'},{agentType:'codex'}]),[]);
});
test('automatic startup only selects requested providers while preserving other saved panels',()=>{
 const {targets}=require('./agent-startup');assert.deepEqual(targets({maxAgents:4,startupAgents:{codex:1}},[{id:'a',agentType:'claude'},{id:'b',agentType:'codex'},{id:'c',agentType:'codex'}]),['b']);
});
test('the real local creation handler produces a paused unlinked project and supports retry',async()=>{
 const root=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'ForgeLocalCreation-'));let registry=[];
 try{const create=handler('create-project',{fs,path,console:{log(){}},getUserProjectsRoot:()=>root,loadProjectsRegistry:()=>registry,saveProjectsRegistry:r=>registry=r,canonicalProjectPath:x=>path.resolve(x),userDataFile:n=>path.join(root,n),writeAdminScaffold:()=>({adminUserId:0}),stopFileSync(){},scheduleMediaTracking(){},writeProjectAgentContext(){}});
 const result=await create(null,'tourelle');assert.equal(result.success,true);assert.equal(registry[0].linkedStudio,null);assert.equal(registry[0].syncPaused,true);assert.ok(fs.existsSync(path.join(result.path,'src/ServerScriptService/main.lua')));
 assert.equal((await create(null,'tourelle')).resumed,true);assert.equal(registry.length,1);
 assert.equal((await create(null,'../escape')).code,'project-name-invalid');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
