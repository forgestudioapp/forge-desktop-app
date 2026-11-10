const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../main.js'),'utf8');
test('saving a link updates both the agent context and active project snapshot',()=>{
 const writes=new Map(),contexts=[];
 const ctx={require:()=>({save:(name,value)=>writes.set(name,value)}),fs:{writeFileSync:(name,value)=>writes.set(name,JSON.parse(value)),existsSync:()=>true,readFileSync:()=>'{"path":"/A","linkedStudio":null}'},getProjectsRegistryPath:()=>'/registry',userDataFile:()=>'/active',writeProjectAgentContext:p=>contexts.push(p),canonicalProjectPath:x=>x};
 const project={path:'/A',linkedStudio:{placeId:'42'},syncPaused:true};ctx.loadProjectsRegistry=()=>[project];
 vm.createContext(ctx);vm.runInContext(source.slice(source.indexOf('function saveProjectsRegistry('),source.indexOf('function projectAgentContextPath(')),ctx);
 ctx.saveProjectsRegistry([project]);
 assert.equal(writes.get('/active').linkedStudio.placeId,'42');assert.equal(contexts[0],project);
});
function handler(name,values){let fn;const start=source.indexOf("ipcMain.handle('"+name+"'");assert.ok(start>=0);vm.runInNewContext(source.slice(start,source.indexOf('\n});',start)+4),{ipcMain:{handle:(_,cb)=>fn=cb},...values});return fn;}
test('opening a paused linked project neither probes Studio nor starts synchronization',async()=>{
 const project={name:'A',path:'/A',linkedStudio:{placeId:'42'},syncPaused:true};let starts=0,stops=0;
 const open=handler('set-active-project',{loadProjectsRegistry:()=>[project],canonicalProjectPath:x=>x,isPathAllowed:()=>true,userDataFile:x=>x,fs:{writeFileSync(){}},stopFileSync:()=>stops++,startFileSync:()=>starts++,scheduleMediaTracking(){},writeProjectAgentContext(){}});
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
test('place changed after confirmation cannot be linked',async()=>{
 const project={path:'/A',linkedStudio:null};let saved=0;
 const link=handler('link-project-studio',{loadProjectsRegistry:()=>[project],canonicalProjectPath:x=>x,isPathAllowed:()=>true,projectHasRunningAgents:()=>false,getCurrentStudioPlaceInfo:async()=>({place:{placeId:'43',gameId:'7',placeName:'Other'}}),saveProjectsRegistry:()=>saved++});
 assert.equal((await link(null,'/A')).code,'place-confirmation-required');
 const result=await link(null,'/A',{expectedPlaceId:'42'});
 assert.equal(result.code,'place-changed');assert.equal(saved,0);assert.equal(project.linkedStudio,null);
});
test('first project synchronization records a Studio-confirmed build before ready',async()=>{
 const project={path:'/A',language:'lua',templateSetup:{status:'waiting-studio'}};let starts=0,saved;
 const start=handler('start-file-sync',{ensureProjectPlaceAssociation:async()=>({link:{placeId:'42'}}),readActiveProject:()=>project,canonicalProjectPath:x=>x,setProjectSyncPaused(){},startFileSync:()=>starts++,waitForFirstProjectSync:async()=>({status:'confirmed',buildId:'build-1'}),getFileSyncSnapshot:()=>({phase:'synced'}),loadProjectsRegistry:()=>[project],saveProjectsRegistry:r=>saved=r});
 const result=await start(null,'/A');assert.equal(result.success,true);assert.equal(starts,1);assert.equal(saved[0].templateSetup.status,'ready');assert.equal(saved[0].templateSetup.firstSync.buildId,'build-1');
});
test('failed trash operation preserves the registry',async()=>{
 let saved=0;const remove=handler('delete-project',{loadProjectsRegistry:()=>[{path:'/A',name:'A'}],canonicalProjectPath:x=>x,projectHasRunningAgents:()=>false,fs:{existsSync:()=>true},isPathAllowed:()=>true,shell:{trashItem:async()=>{throw Error('busy')}},saveProjectsRegistry:()=>saved++});assert.equal((await remove(null,'/A',true)).error,'busy');assert.equal(saved,0);
});
test('removing from the list leaves project files intact',async()=>{
 let registry=[{path:'/A',name:'A'}],trashed=0;const remove=handler('delete-project',{loadProjectsRegistry:()=>registry,canonicalProjectPath:x=>x,projectHasRunningAgents:()=>false,projectAgentContextPath:()=>'/context',fs:{existsSync:()=>false,writeFileSync(){}},shell:{trashItem:async()=>trashed++},saveProjectsRegistry:r=>registry=r,userDataFile:x=>x});assert.equal((await remove(null,'/A',false)).success,true);assert.equal(trashed,0);assert.equal(registry.length,0);
});
test('local creation renderer succeeds without any Studio API, and retries disk failures',async()=>{
 const elements=new Map();function el(id){if(!elements.has(id))elements.set(id,{value:'Tour été',disabled:false,hidden:true,events:{},addEventListener(n,f){this.events[n]=f}});return elements.get(id);}
 let count=0,fail=true,navigated='',saved;const api={createProject:async(name,options)=>{count++;assert.equal(name,'tour-ete');assert.equal(options,undefined);return fail?{error:'Disk full'}:{success:true,path:'/tour-ete'}}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'project-create.js'),'utf8'),{document:{getElementById:el},localStorage:{setItem:(key,value)=>saved=[key,JSON.parse(value)]},window:{forgeAPI:api,location:{replace:page=>navigated=page}}});
 await el('createForm').events.submit({preventDefault(){}});assert.match(el('creationStatus').textContent,/Forge n’a pas pu créer/);assert.equal(el('creationError').textContent,'Disk full');assert.equal(el('createBtn').disabled,false);
 fail=false;await el('createForm').events.submit({preventDefault(){}});assert.equal(navigated,'workspace.html');assert.equal(el('createBtn').disabled,true);assert.equal(saved[1].path,'/tour-ete');assert.equal(count,2);
});
test('startup counts add only missing providers and respect the overall limit',()=>{
 const {plan}=require('./agent-startup');assert.deepEqual(plan({maxAgents:4,startupAgents:{claude:2,codex:1}},[{agentType:'claude'}]),['claude','codex']);
 assert.deepEqual(plan({maxAgents:2,startupAgents:{claude:2,codex:2}},[{agentType:'codex'}]),['claude']);
 assert.deepEqual(plan({startupAgents:{claude:-1,codex:'bad'}}),[]);
 assert.deepEqual(plan({maxAgents:4,startupAgents:{antigravity:3,codex:1}}),['codex']);
 assert.deepEqual(plan({maxAgents:3,startupAgents:{claude:2,codex:1}},[{agentType:'claude'},{agentType:'claude'},{agentType:'codex'}]),[]);
});
test('automatic startup only selects requested providers while preserving other saved panels',()=>{
 const {targets}=require('./agent-startup');assert.deepEqual(targets({maxAgents:4,startupAgents:{codex:1}},[{id:'a',agentType:'claude'},{id:'b',agentType:'codex'},{id:'c',agentType:'codex'}]),['b']);
 assert.deepEqual(targets({maxAgents:4,startupAgents:{antigravity:2}},[{id:'legacy',agentType:'antigravity'}]),[]);
});
test('the real local creation handler produces a paused unlinked project and supports retry',async()=>{
 const root=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'ForgeLocalCreation-'));let registry=[];
 try{const create=handler('create-project',{fs,path,__dirname:path.join(__dirname,'..'),console:{log(){}},STARTER_EXAMPLES:{object:{}},selectProjectModules:require('./project-template').selection,writeProjectTemplate:require('./project-template').writeProjectTemplate,getUserProjectsRoot:()=>root,loadProjectsRegistry:()=>registry,saveProjectsRegistry:r=>registry=r,canonicalProjectPath:x=>path.resolve(x),userDataFile:n=>path.join(root,n),writeStarterExample:()=>({created:false,exampleId:null,files:[]}),prepareNewTypeScriptProject:async()=>({status:'compiled',firstSync:'waiting-place'}),spawn:()=>{const proc=new (require('node:events').EventEmitter)();queueMicrotask(()=>proc.emit('close',0));return proc;},stopFileSync(){},scheduleMediaTracking(){},writeProjectAgentContext(){}});
 const result=await create(null,'tourelle');assert.equal(result.success,true);assert.equal(result.language,'typescript');assert.deepEqual(Array.from(result.template.modules),['config','data','network','notifications','ui','tests','admin']);assert.equal(registry[0].linkedStudio,null);assert.equal(registry[0].syncPaused,true);assert.ok(fs.existsSync(path.join(result.path,'src/ServerScriptService/ForgeModules/PlayerData.server.ts')));assert.equal(fs.existsSync(path.join(result.path,'src/ServerScriptService/ForgeModules/Currency.ts')),false);
 assert.equal((await create(null,'tourelle')).resumed,true);assert.equal(registry.length,1);
 assert.equal((await create(null,'../escape')).code,'project-name-invalid');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('new project handler creates empty and complete Luau/TypeScript projects without changing existing ones',async()=>{
 const root=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'ForgeNewPresets-'));let registry=[];
 const {EventEmitter}=require('node:events');
 const create=handler('create-project',{fs,path,__dirname:path.join(__dirname,'..'),console:{log(){}},STARTER_EXAMPLES:{},selectProjectModules:require('./project-template').selection,writeProjectTemplate:require('./project-template').writeProjectTemplate,getUserProjectsRoot:()=>root,loadProjectsRegistry:()=>registry,saveProjectsRegistry:r=>registry=r,canonicalProjectPath:x=>path.resolve(x),userDataFile:n=>path.join(root,n),writeStarterExample:()=>({created:false,exampleId:null,files:[]}),prepareNewTypeScriptProject:async()=>({status:'compiled',firstSync:'waiting-place'}),spawn:()=>{const proc=new EventEmitter();queueMicrotask(()=>proc.emit('close',0));return proc;},stopFileSync(){},scheduleMediaTracking(){},writeProjectAgentContext(){}});
 try{
  for(const language of ['lua','typescript'])for(const preset of ['empty','base','complete']){
   const name=`${language}-${preset}`;const result=await create(null,name,language,{preset});
   assert.equal(result.success,true,name);assert.equal(result.language,language);
   assert.equal(result.template.modules.length,preset==='empty'?0:preset==='base'?5:9);
   assert.equal(fs.existsSync(path.join(result.path,'src/ServerScriptService/ForgeAdmin.server.lua')),preset==='complete');
   assert.equal(registry.at(-1).syncPaused,true);
   assert.equal(registry.at(-1).linkedStudio,null);
  }
  const previous=registry[0],snapshot=fs.readFileSync(path.join(previous.path,'.forge/template.json'),'utf8');
  assert.equal((await create(null,previous.name,'typescript',{preset:'complete'})).resumed,true);
  assert.equal(fs.readFileSync(path.join(previous.path,'.forge/template.json'),'utf8'),snapshot);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('automatic TypeScript creation retries a broken setup without replacing project files',async()=>{
 const root=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'ForgeAutoRetry-'));let registry=[],attempt=0;
 const {EventEmitter}=require('node:events');
 const create=handler('create-project',{fs,path,__dirname:path.join(__dirname,'..'),console:{log(){}},STARTER_EXAMPLES:{},selectProjectModules:require('./project-template').selection,writeProjectTemplate:require('./project-template').writeProjectTemplate,getUserProjectsRoot:()=>root,loadProjectsRegistry:()=>registry,saveProjectsRegistry:r=>registry=r,canonicalProjectPath:x=>path.resolve(x),userDataFile:n=>path.join(root,n),writeStarterExample:()=>({created:false,exampleId:null,files:[]}),prepareNewTypeScriptProject:async()=>++attempt===1?{status:'error',stage:'compile',error:'broken source'}:{status:'compiled',stage:'compile',firstSync:'waiting-place'},spawn:()=>{const proc=new EventEmitter();queueMicrotask(()=>proc.emit('close',0));return proc;},stopFileSync(){},scheduleMediaTracking(){},writeProjectAgentContext(){}});
 try{
  const first=await create(null,'automatic');assert.equal(first.error,'broken source');assert.equal(first.templateSetup.status,'error');
  const template=fs.readFileSync(path.join(first.path,'.forge/template.json'),'utf8');
  const resumed=await create(null,'automatic');assert.equal(resumed.resumed,true);assert.equal(resumed.error,null);
  assert.equal(registry.length,1);assert.equal(attempt,2);assert.equal(fs.readFileSync(path.join(first.path,'.forge/template.json'),'utf8'),template);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
