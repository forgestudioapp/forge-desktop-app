const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const vm=require('node:vm');
const registry=require('./project-registry');
const {canonicalProjectPath}=require('./project-place-link');
const main=fs.readFileSync(path.join(__dirname,'..','main.js'),'utf8');

function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'forge-active-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return root;}

function extractFunction(source,name){
 let start=source.indexOf(`async function ${name}(`);
 if(start===-1)start=source.indexOf(`function ${name}(`);
 assert.notEqual(start,-1,`${name} is present`);
 const open=source.indexOf('{',start);let depth=0;
 for(let index=open;index<source.length;index++){
  if(source[index]==='{')depth++;
  else if(source[index]==='}'&&--depth===0)return source.slice(start,index+1);
 }
 throw new Error(`Unable to extract ${name}`);
}

test('Windows path spelling, case, separators and trailing slash identify one project',()=>{
 const a='C:\\Users\\Maxen\\OneDrive\\Documents\\test-forge';
 const b='c:/users/maxen/onedrive/documents/test-forge/';
 assert.equal(canonicalProjectPath(a),canonicalProjectPath(b));
 assert.equal(canonicalProjectPath(a),canonicalProjectPath('C:/USERS/MAXEN/OneDrive/Documents/test-forge\\'));
});

test('registry migration retains the linked place and archives every original entry',t=>{
 const root=fixture(t),projectDir=path.join(root,'test-forge');fs.mkdirSync(projectDir);
 const file=path.join(root,'projects-registry.json');
 const original=[{name:'test-forge',path:projectDir,linkedStudio:null,createdAt:'2026-01-01'},
  {name:'test-forge',path:projectDir+path.sep,linkedStudio:{placeId:'222',placeName:'Place2'},syncPaused:false,createdAt:'2026-02-01'}];
 fs.writeFileSync(file,JSON.stringify(original));
 const projects=registry.load(file);
 assert.equal(projects.length,1);assert.equal(projects[0].linkedStudio.placeName,'Place2');
 assert.equal(projects[0].createdAt,'2026-01-01');assert.ok(fs.existsSync(projectDir));
 const archive=fs.readdirSync(root).find(name=>name.startsWith('projects-registry.pre-dedup-'));
 assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root,archive),'utf8')),original);
 assert.equal(registry.load(file).length,1);
 registry.save(file,[...projects,{...original[0],path:projectDir+path.sep}]);
 assert.equal(registry.load(file).length,1);
});

test('active project survives restart and supplies the same path to Asset Toolbox',t=>{
 const root=fixture(t),projectDir=path.join(root,'test-forge');fs.mkdirSync(projectDir);
 const file=path.join(root,'projects-registry.json'),activeFile=path.join(root,'active-project.json');
 registry.save(file,[{name:'test-forge',path:projectDir,linkedStudio:{placeId:'222',placeName:'Place2'}}]);
 fs.writeFileSync(activeFile,JSON.stringify({path:projectDir+path.sep,name:'stale'}));
 const start=main.indexOf('function readActiveProject()');
 const end=main.indexOf('\nfunction setProjectSyncPaused(',start);
 const source=main.slice(start,end);
 const read=()=>{const context={fs,userDataFile:()=>activeFile,loadProjectsRegistry:()=>registry.load(file),canonicalProjectPath,isPathAllowed:p=>fs.existsSync(p)};vm.createContext(context);vm.runInContext(source,context);return context.readActiveProject();};
 assert.equal(read().name,'test-forge');assert.equal(read().path,projectDir);
 assert.equal(read().linkedStudio.placeName,'Place2');
 assert.equal(read().path,read().path);
 const assets=fs.readFileSync(path.join(__dirname,'..','assets-page.html'),'utf8');
 assert.match(assets,/getActiveProject\(\)/);assert.match(assets,/assetCatalogList\(project\.path\)/);
 const workspace=fs.readFileSync(path.join(__dirname,'..','workspace.html'),'utf8');
 assert.match(workspace,/project-loading/);assert.match(workspace,/if\(res\?\.error\)throw new Error\(res\.error\)/);
 fs.rmSync(projectDir,{recursive:true});
 assert.throws(read,/introuvable ou inaccessible/);
});

test('workspace Asset Toolbox restores the persisted project after renderer restart',async t=>{
 const root=fixture(t),projectDir=path.join(root,'test-forge');fs.mkdirSync(projectDir);
 const persisted={name:'test-forge',path:projectDir,linkedStudio:{placeId:'222',placeName:'Place2'}};
 const workspace=fs.readFileSync(path.join(__dirname,'..','workspace.html'),'utf8');
 const source=[extractFunction(workspace,'resolveWorkspaceActiveProject'),extractFunction(workspace,'workspaceProjectCacheKey'),extractFunction(workspace,'refreshToolbox')].join('\n');
 const requested=[];
 const grid={innerHTML:''};
 const context={
  activeProject:null,tbMainTab:'mine',tbCache:null,tbCacheProjectKey:null,toolboxLoadGeneration:0,tbGrid:grid,
  window:{forgeAPI:{
   getActiveProject:async()=>({project:persisted}),
   listProjectFiles:async(projectPath,folder)=>{requested.push({projectPath,folder});return{files:[],tree:[]};},
  }},
  document:{getElementById:()=>grid},
  flattenTree:()=>[],renderToolbox:()=>{},t:key=>key,
  console,Set,Promise,
 };
 vm.createContext(context);vm.runInContext(source,context);
 await context.refreshToolbox();
 assert.equal(context.activeProject.path,projectDir);
 assert.equal(requested.length,8);
 assert.deepEqual([...new Set(requested.map(item=>item.projectPath))],[projectDir]);
 assert.deepEqual(requested.map(item=>item.folder),['assets','sounds','models','src','thumbnails','icons','gui-icons','conversions']);
 assert.doesNotMatch(grid.innerHTML,/no_active_project/);
});

test('Asset Toolbox invalidates project A cache before loading project B',async t=>{
 const root=fixture(t),projectA=path.join(root,'Project-A'),projectB=path.join(root,'Project-B');
 fs.mkdirSync(projectA);fs.mkdirSync(projectB);
 const workspace=fs.readFileSync(path.join(__dirname,'..','workspace.html'),'utf8');
 const source=[extractFunction(workspace,'resolveWorkspaceActiveProject'),extractFunction(workspace,'workspaceProjectCacheKey'),extractFunction(workspace,'refreshToolbox')].join('\n');
 const requested=[];const rendered=[];const grid={innerHTML:''};
 const context={
  activeProject:{name:'A',path:projectA},tbMainTab:'mine',tbCache:null,tbCacheProjectKey:null,toolboxLoadGeneration:0,tbGrid:grid,
  window:{forgeAPI:{
   getActiveProject:async()=>({project:context.activeProject}),
   listProjectFiles:async(projectPath,folder)=>{requested.push({projectPath,folder});return{files:folder==='assets'?[path.basename(projectPath)+'.png']:[],tree:[]};},
  }},
  document:{getElementById:()=>grid},flattenTree:()=>[],renderToolbox:()=>rendered.push(context.tbCache),t:key=>key,console,Set,Promise,
 };
 vm.createContext(context);vm.runInContext(source,context);
 await context.refreshToolbox();
 const cacheA=context.tbCache;
 assert.match(cacheA.images[0].fullPath,/Project-A[\\/]assets[\\/]Project-A\.png$/);
 context.activeProject={name:'B',path:projectB+path.sep};
 await context.refreshToolbox();
 assert.notEqual(context.tbCache,cacheA);
 assert.match(context.tbCache.images[0].fullPath.replace(/[\\/]+/g,'/'),/Project-B\/assets\/Project-B\.png$/);
 assert.equal(context.tbCacheProjectKey,projectB.replace(/\\/g,'/').toLowerCase());
 assert.deepEqual([...new Set(requested.slice(8).map(item=>item.projectPath))],[projectB+path.sep]);
 assert.equal(rendered.length,2);
});

test('opening a project by an equivalent path selects the registered card',async()=>{
 const registered={name:'test-forge',path:'C:\\ForgeProjects\\test-forge',linkedStudio:{placeId:'222',placeName:'Place2'},syncPaused:true};
 const start=main.indexOf("ipcMain.handle('set-active-project'");
 const source=main.slice(start,main.indexOf('\n});',start)+4);
 let open;let saved;
 vm.runInNewContext(source,{ipcMain:{handle:(_,callback)=>open=callback},loadProjectsRegistry:()=>[registered],canonicalProjectPath,isPathAllowed:()=>true,userDataFile:()=>'/active',fs:{writeFileSync:(_,contents)=>saved=JSON.parse(contents)},writeProjectAgentContext(){},stopFileSync(){},scheduleMediaTracking(){},startFileSync(){}});
 const result=await open(null,'c:/forgeprojects/TEST-FORGE/');
 assert.equal(result.success,true);assert.equal(result.project,registered);
 assert.equal(saved.path,registered.path);assert.equal(saved.linkedStudio.placeName,'Place2');
});
