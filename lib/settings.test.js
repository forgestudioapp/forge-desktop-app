const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../main.js'), 'utf8');
function handler(name, values) {
  let callback;
  const start=source.indexOf("ipcMain.handle('"+name+"'");
  assert.ok(start>=0);
  vm.runInNewContext(source.slice(start,source.indexOf('\n});',start)+4),{ipcMain:{handle:(_name,fn)=>{callback=fn;}},...values});
  return callback;
}
test('settings read the active project without starting sync or contacting Studio',async()=>{
  const read=handler('get-active-project-info',{readActiveProject:()=>({name:'A',path:'/projects/A'})});
  assert.equal((await read()).project.name,'A');
  const missing=handler('get-active-project-info',{readActiveProject:()=>null});
  assert.equal((await missing()).project,null);
});
test('project folder cancellation and disallowed paths never write preferences',async()=>{
  let writes=0;
  const values={dialog:{showOpenDialog:async()=>({canceled:true})},isPathAllowed:()=>false,loadAppSettings:()=>({}),userDataFile:()=>'/settings.json',fs:{writeFileSync:()=>{writes++;}},getUserProjectsRoot:()=>'/default'};
  assert.equal((await handler('choose-projects-location',values)()).canceled,true);
  values.dialog.showOpenDialog=async()=>({canceled:false,filePaths:['/outside']});
  assert.ok((await handler('choose-projects-location',values)()).error);
  assert.equal(writes,0);
});
test('changing the project folder preserves other preferences and reports disk failure',async()=>{
  let stored;
  const values={dialog:{showOpenDialog:async()=>({canceled:false,filePaths:['/allowed']})},isPathAllowed:()=>true,loadAppSettings:()=>({autoRemoveBg:true}),userDataFile:()=>'/settings.json',fs:{writeFileSync:(_p,s)=>{stored=JSON.parse(s);}},getUserProjectsRoot:()=>'/allowed/account'};
  assert.equal((await handler('choose-projects-location',values)()).path,'/allowed/account');
  assert.deepEqual(stored,{autoRemoveBg:true,projectsDirectory:'/allowed'});
  values.fs.writeFileSync=()=>{throw new Error('Disk full');};
  await assert.rejects(handler('choose-projects-location',values)(),/Disk full/);
});
test('custom project folders retain account isolation and reject invalid saved roots',()=>{
  const start=source.indexOf('function getUserProjectsRoot()');const snippet=source.slice(start,source.indexOf('\nfunction removeIfExists',start));
  const context={getCurrentUserKey:()=> 'user-123',loadAppSettings:()=>({projectsDirectory:'/custom'}),isPathAllowed:()=>true,path,FORGE_PROJECTS_ROOT:'/default'};
  vm.createContext(context);vm.runInContext(snippet,context);
  assert.equal(context.getUserProjectsRoot(),path.join('/custom','user-123'));
  context.isPathAllowed=()=>false;
  assert.equal(context.getUserProjectsRoot(),path.join('/default','user-123'));
});
