const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const main=fs.readFileSync(path.join(__dirname,'..','main.js'),'utf8');

test('one TypeScript file appears once in the pending counter after a playtest',()=>{
 const projectPath='C:\\ForgeProjects\\sample';
 const project={path:projectPath,language:'typescript',linkedStudio:{placeId:'42'},syncPaused:false};
 const start=main.indexOf('function getFileSyncSnapshot('),end=main.indexOf("\nipcMain.handle('get-file-sync-status'",start);
 const context={path,isPathAllowed:()=>true,loadProjectsRegistry:()=>[project],canonicalProjectPath:p=>p,
  savedSyncBuildState:()=>({}),currentSyncProjectPath:projectPath,
  pendingScriptSyncs:new Map([['ServerScriptService/main.server.luau',{source:'return {}'}]]),
  fileSyncStatus:{phase:'compile-error',pending:1},collectSourceScripts:()=>['ServerScriptService/main.server.ts'],
  candidateBuild:'candidate',lastValidBuild:'previous'};
 vm.createContext(context);vm.runInContext(main.slice(start,end),context);
 const snapshot=context.getFileSyncSnapshot(projectPath);
 assert.equal(snapshot.pending,1);
 assert.deepEqual([...snapshot.pendingFiles],['ServerScriptService/main.server.luau']);
});

test('playtest output and stop do not repeat the Edit place check',()=>{
 const start=main.indexOf("ipcMain.handle('quality-lab-playtest-output'");
 const end=main.indexOf('// ============================================\n// PROJETS',start);
 const section=main.slice(start,end);
 assert.match(section,/get_playtest_output', \{\}, 12000, false/);
 assert.match(section,/stop_playtest', \{\}, 15000, false/);
 assert.match(section,/code: 'mcp-connection'/);
});
