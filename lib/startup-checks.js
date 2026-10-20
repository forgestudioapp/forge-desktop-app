// Bound each check independently so partial diagnostics remain available.
function startupDeadline(call, timeoutMs) {
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('Diagnostic expiré')),timeoutMs);
    Promise.resolve().then(call).then(resolve,reject).finally(()=>clearTimeout(timer));
  });
}
async function collectStartupChecks(api, timeoutMs=20000) {
  return Promise.allSettled([startupDeadline(()=>api.checkSystem(),timeoutMs),startupDeadline(()=>api.checkPluginConnection(),timeoutMs)]);
}
if(typeof module!=='undefined') module.exports={collectStartupChecks};
if(typeof document!=='undefined') (function() {
  document.addEventListener('DOMContentLoaded', async () => {
    if(!window.forgeAPI?.checkSystem || sessionStorage.getItem('forge-startup-checked')) return;
    const status=document.createElement('p');status.id='startupCheckStatus';status.setAttribute('role','status');
    status.style.cssText='margin:12px 32px;padding:12px 16px;border:1px solid var(--border);border-radius:10px;color:var(--smoke);font-size:13px';
    const en=localStorage.getItem('forge_lang')==='en';
    async function run(){
    status.textContent=en?'Checking tools in the background…':'Vérification des outils en arrière-plan…';
    const results=await collectStartupChecks(window.forgeAPI);
    const system=results[0].status==='fulfilled'?results[0].value:null;
    const bridge=results[1].status==='fulfilled'?results[1].value:null;
    const issues=[];
    if(!system||system.error) issues.push(en?'tool check unavailable':'vérification des outils indisponible');
    else {
      if(!system.nodeOk) issues.push(en?'Node unavailable':'Node indisponible');
      if(!system.robloxInstalled) issues.push(en?'Studio missing':'Studio non installé');
      if(!system.pluginInstalled) issues.push(en?'plugin missing':'plugin absent');
      if(!Object.values(system.agents||{}).some(agent=>agent.installed)) issues.push(en?'no AI agent installed':'aucun agent IA installé');
    }
    if(!bridge?.studioConnected) issues.push(en?'Studio not connected':'Studio non connecté');
    status.textContent=issues.length?(en?'Checks: ':'Vérifications : ')+issues.join(' · ')+'. ':(en?'Tools checked. ':'Outils vérifiés. ');
    const link=document.createElement('a');link.href='settings.html#diagnostics';link.textContent=en?'View diagnostics':'Voir le diagnostic';status.append(link);
    const retry=document.createElement('button');retry.textContent=en?'Check again':'Réessayer';retry.style.marginLeft='12px';retry.addEventListener('click',run);status.append(retry);
    if(system&&!system.error&&bridge&&!bridge.error) sessionStorage.setItem('forge-startup-checked','1');
    else sessionStorage.removeItem('forge-startup-checked');
    sessionStorage.setItem('forge-startup-report',JSON.stringify({checkedAt:Date.now(),issues}));
    }
    (document.querySelector('.forge-navigation')||document.body.firstElementChild)?.after(status);
    await run();
  });
})();
