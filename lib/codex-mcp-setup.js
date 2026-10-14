const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function resolveCodex(nodeCommand, env = process.env) {
  const directories = [...Object.entries(env).filter(([k])=>k.toLowerCase()==='path').flatMap(([,v])=>String(v).split(path.delimiter)), env.APPDATA && path.join(env.APPDATA,'npm')].filter(Boolean);
  for (const dir of directories) {
    const script=path.join(dir,'node_modules','@openai','codex','bin','codex.js');
    if(fs.existsSync(script))return {command:nodeCommand,prefix:[script]};
    const binary=path.join(dir,process.platform==='win32'?'codex.exe':'codex');
    if(fs.existsSync(binary))return {command:binary,prefix:[]};
  }
  throw new Error('Codex introuvable. Installe-le depuis Connexions → Agents IA.');
}
function ensureCodexMcp({nodeCommand,serverPath,env,run=spawnSync,cli=resolveCodex(nodeCommand)}) {
  const options={shell:false,timeout:15000,windowsHide:true,encoding:'utf8'};
  const invoke=args=>{const result=run(cli.command,[...cli.prefix,...args],options);if(result.error||result.status!==0)throw new Error('Configuration MCP Codex impossible : '+(result.error?.message||String(result.stderr||'échec du CLI').slice(0,400)));return result.stdout;};
  // add replaces this named entry atomically; never remove a working entry first.
  invoke(['mcp','add','forge_roblox',...Object.entries(env).flatMap(([k,v])=>['--env',`${k}=${v}`]),'--',nodeCommand,serverPath]);
  const config=JSON.parse(invoke(['mcp','get','forge_roblox','--json']));
  if(config.enabled===false||config.transport?.command!==nodeCommand||!config.transport?.args?.includes(serverPath)||Object.entries(env).some(([k,v])=>config.transport?.env?.[k]!==v))throw new Error('La configuration MCP Codex enregistrée ne correspond pas à Forge.');
  return true;
}
module.exports={resolveCodex,ensureCodexMcp};
