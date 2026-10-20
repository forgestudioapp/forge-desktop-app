const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {refreshProjectIndex}=require('./project-index'),{queryContext}=require('./context-query');
test('local context search pages bounded excerpts and flags stale files',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'forge-query-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));fs.mkdirSync(path.join(root,'src'));
 for(let i=0;i<8;i++)fs.writeFileSync(path.join(root,'src',`shop${i}.ts`),'export function purchase() {}\n'+ '// context\n'.repeat(100));
 await refreshProjectIndex(root);
 const first=queryContext(root,'purchase');assert.equal(first.results.length,5);assert.equal(first.nextOffset,5);assert.equal(first.staleCount,0);assert.equal(first.results[0].excerpt.split('\n').length,30);
 assert.equal(queryContext(root,'purchase',5).results.length,3);
 fs.appendFileSync(path.join(root,'src','shop0.ts'),'\nexport function newFunction() {}');assert.equal(queryContext(root,'purchase').staleCount,1);
 const file=path.join(root,'.forge-context','files.ndjson');fs.appendFileSync(file,'\n'+JSON.stringify({path:'src/../../outside.ts',symbols:[{name:'purchase',line:1}]}));
 assert.equal(queryContext(root,'purchase').totalMatches,8);
 assert.throws(()=>queryContext(root,'x'));assert.throws(()=>queryContext(root,'purchase',-1));
});
