const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const flow=require('./setup-flow');
test('signed-out setup includes connections before agents, then projects',()=>{
  let page='onboarding.html';const visited=[page];
  for(let i=0;i<6;i++){const url=flow.next(page,'?setup=1');page=url.split('?')[0];visited.push(page);}
  assert.deepEqual(visited,['onboarding.html','roblox-studio.html','login.html','accounts.html','agents.html','api-keys.html','projects.html']);
  assert.equal(flow.next('agents.html',''),'projects.html');assert.equal(flow.next('api-keys.html',''),'settings.html#connections');
});
test('saved Forge session skips setup; absent session starts prerequisite checks',()=>{
  const main=fs.readFileSync(path.join(__dirname,'../main.js'),'utf8');
  const source=main.slice(main.indexOf('function getStartPage()'),main.indexOf('function createWindow()'));
  for(const [session,expected] of [[null,'onboarding.html'],[{},'onboarding.html'],[{access_token:'test',user:{id:'user'}},'projects.html'],[{refresh_token:'refresh',user:{id:'user'}},'projects.html']]){
    const ctx={loadForgeSession:()=>session,canRestoreSession:s=>Boolean((s?.user?.id||s?.user?.email)&&(s?.access_token||s?.refresh_token))};vm.createContext(ctx);vm.runInContext(source,ctx);assert.equal(ctx.getStartPage(),expected);
  }
});
