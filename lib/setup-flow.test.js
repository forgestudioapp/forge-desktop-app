const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const flow=require('./setup-flow');
test('signed-out setup follows all five requested steps, then projects',()=>{
  let page='onboarding.html';const visited=[page];
  for(let i=0;i<5;i++){const url=flow.next(page,'?setup=1');page=url.split('?')[0];visited.push(page);}
  assert.deepEqual(visited,['onboarding.html','roblox-studio.html','login.html','agents.html','api-keys.html','projects.html']);
  assert.equal(flow.next('agents.html',''),'projects.html');assert.equal(flow.next('api-keys.html',''),'settings.html#connections');
});
test('saved Forge session skips setup; absent session starts prerequisite checks',()=>{
  const main=fs.readFileSync(path.join(__dirname,'../main.js'),'utf8');
  const source=main.slice(main.indexOf('function getStartPage()'),main.indexOf('function createWindow()'));
  for(const [session,expected] of [[null,'onboarding.html'],[{},'onboarding.html'],[{access_token:'test',user:{id:'user'}},'projects.html']]){
    const ctx={loadForgeSession:()=>session};vm.createContext(ctx);vm.runInContext(source,ctx);assert.equal(ctx.getStartPage(),expected);
  }
});
