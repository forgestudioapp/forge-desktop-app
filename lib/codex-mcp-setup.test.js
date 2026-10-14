const test=require('node:test'),assert=require('node:assert/strict');
const {ensureCodexMcp}=require('./codex-mcp-setup');
const options={nodeCommand:'C:/Node/node.exe',serverPath:'C:/Forge App/mcp.js',env:{FORGE_PROJECT_CONTEXT_DIR:'C:/Forge Data/context'},cli:{command:'C:/Node/node.exe',prefix:['C:/Tools/codex.js']}};
test('Codex MCP setup uses explicit executable arguments, never removes first, and verifies saved config',()=>{
 const calls=[];
 const run=(cmd,args,opts)=>{calls.push({cmd,args,opts});return{status:0,stdout:JSON.stringify({enabled:true,transport:{command:options.nodeCommand,args:[options.serverPath],env:options.env}})}};
 assert.equal(ensureCodexMcp({...options,run}),true);assert.equal(calls.length,2);assert.equal(calls[0].opts.shell,false);assert.ok(calls[0].args.includes('FORGE_PROJECT_CONTEXT_DIR=C:/Forge Data/context'));assert.ok(!calls.some(c=>c.args.includes('remove')));
});
test('missing CLI, failed registration and stale configuration cannot silently launch a disconnected agent',()=>{
 assert.throws(()=>ensureCodexMcp({...options,run:()=>({status:null,error:new Error('ENOENT')})}),/ENOENT/);
 assert.throws(()=>ensureCodexMcp({...options,run:()=>({status:1,stderr:'No access'})}),/No access/);
 assert.throws(()=>ensureCodexMcp({...options,run:()=>({status:0,stdout:'{"transport":{}}'})}),/ne correspond pas/);
});
