const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createKeyStore}=require('./protected-keys');
const registry=require('./project-registry');
const {verifyTripo}=require('./tripo-validation');
const {collectStartupChecks}=require('./startup-checks');
const {advanceRemoteJob}=require('./media-jobs');
function fixture(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'forge-audit-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return path.join(dir,'data.json');}
const crypto={isEncryptionAvailable:()=>true,encryptString:s=>Buffer.from('encrypted:'+s),decryptString:b=>{const s=b.toString();if(!s.startsWith('encrypted:'))throw Error('invalid');return s.slice(10);}};
test('secure keys: no plaintext fallback, migration, masked status and preserved unreadable entry',t=>{
 const file=fixture(t),store=createKeyStore(file,crypto);
 fs.writeFileSync(file,JSON.stringify({tripo:'tsk_legacy'}));assert.equal(store.read().tripo,'tsk_legacy');
 assert.equal(JSON.parse(fs.readFileSync(file)).version,1);assert.ok(!fs.readFileSync(file,'utf8').includes('tsk_legacy'));
 const data=JSON.parse(fs.readFileSync(file));data.entries.gemini='unreadable';fs.writeFileSync(file,JSON.stringify(data));
 store.replace('tripo','tsk_new');assert.equal(JSON.parse(fs.readFileSync(file)).entries.gemini,'unreadable');
 assert.deepEqual(store.status().gemini,{configured:true,readable:false});assert.throws(()=>store.read(),/illisible/);
 const before=fs.readFileSync(file,'utf8');assert.throws(()=>createKeyStore(file,{isEncryptionAvailable:()=>false}).replace('tripo','secret'),/indisponible/);assert.equal(fs.readFileSync(file,'utf8'),before);
 const errors=[];assert.equal(store.read(e=>errors.push(e)).tripo,'tsk_new');assert.equal(errors.length,1);
 assert.equal(store.remove('tripo'),true);assert.equal(store.remove('tripo'),false);assert.equal(store.status().tripo,undefined);
 assert.deepEqual(store.status().gemini,{configured:true,readable:false});
});
test('ambiguous legacy and malformed files are never overwritten',t=>{
 const file=fixture(t),store=createKeyStore(file,crypto);
 for(const value of ['{bad',JSON.stringify({elevenlabs:'ambiguous'})]){fs.writeFileSync(file,value);assert.throws(()=>store.replace('tripo','tsk_new'));assert.equal(fs.readFileSync(file,'utf8'),value);}
});
test('project registry recovers backup, preserves corrupt evidence and refuses an unrecoverable save',t=>{
 const file=fixture(t),projects=[{name:'A',path:'/A'}];registry.save(file,projects);fs.writeFileSync(file,'broken');
 assert.deepEqual(registry.load(file),projects);assert.match(registry.takeNotice(),/restauré/);assert.ok(fs.readdirSync(path.dirname(file)).some(n=>n.includes('.corrupt-')));
 fs.writeFileSync(file,'broken');fs.writeFileSync(file+'.bak','broken backup');assert.throws(()=>registry.save(file,[]),/conservés/);assert.equal(fs.readFileSync(file,'utf8'),'broken');
});
test('Tripo verification rejects HTTP and application errors without creating tasks',async()=>{
 for(const status of [401,403,404,429,500])assert.equal((await verifyTripo('key',async()=>({status,ok:false}))).valid,false);
 for(const data of [{code:1,data:{balance:100}},{code:0},{code:0,data:{balance:'100'}}])assert.equal((await verifyTripo('key',async()=>({ok:true,json:async()=>data}))).valid,false);
 assert.equal((await verifyTripo('key',async url=>{assert.ok(url.endsWith('/user/balance'));return {ok:true,json:async()=>({code:0,data:{balance:0}})};})).valid,true);
 assert.equal((await verifyTripo('key',async()=>{throw Error('network');})).valid,false);
});
test('startup timeout retains partial result and a later retry succeeds',async()=>{
 const result=await collectStartupChecks({checkSystem:()=>new Promise(()=>{}),checkPluginConnection:async()=>({studioConnected:true})},10);
 assert.equal(result[0].status,'rejected');assert.equal(result[1].value.studioConnected,true);
 assert.ok((await collectStartupChecks({checkSystem:async()=>({nodeOk:true}),checkPluginConnection:async()=>({studioConnected:true})},10)).every(r=>r.status==='fulfilled'));
});
test('remote tracking counts real polls, bounds retries and stops permanent failures',async()=>{
 let calls=0,job={id:'same-task',status:'pending'},clock=0;
 const deps={now:()=>clock,poll:async()=>{calls++;throw Error('network');},download:async()=>{throw Error('unexpected');}};
 for(let i=0;i<5;i++){job=await advanceRemoteJob(job,deps);const skipped=await advanceRemoteJob(job,deps);assert.equal(skipped.polls,job.polls);clock+=60000;}
 assert.equal(calls,5);assert.equal(job.polls,5);assert.equal(job.status,'failed');assert.equal(job.retryable,true);
 const denied=await advanceRemoteJob({id:'same-task',status:'pending'},{...deps,poll:async()=>{throw Object.assign(Error('denied'),{status:401});}});assert.equal(denied.status,'failed');assert.equal(denied.polls,1);
});
test('manual tracking retry preserves task identity and never creates a new task',async()=>{
 const source=fs.readFileSync(path.join(__dirname,'../main.js'),'utf8');
 const start=source.indexOf("ipcMain.handle('media-retry-tracking'");
 const job={id:'paid-existing-task',method:'tripo',status:'failed',retryable:true,retryCount:5,polls:5};
 const manifest={jobs:[job,{id:'provider-failed',method:'tripo',status:'failed'}]};let handler,schedules=0,saves=0;
 require('node:vm').runInNewContext(source.slice(start,source.indexOf('\n});',start)+4),{
  ipcMain:{handle:(_,cb)=>handler=cb},isPathAllowed:()=>true,canonicalExistingPath:p=>p,mediaPolls:new Map(),
  loadMediaManifest:()=>manifest,saveMediaManifest:()=>saves++,scheduleMediaTracking:()=>schedules++
 });
 assert.equal((await handler(null,'/project')).count,1);assert.equal(job.id,'paid-existing-task');assert.equal(job.polls,5);assert.equal(job.status,'retry_wait');assert.equal(job.retryCount,0);
 assert.equal(manifest.jobs[1].status,'failed');assert.equal(saves,1);assert.equal(schedules,1);
});
