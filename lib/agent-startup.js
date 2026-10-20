(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.ForgeAgentStartup=factory();})(typeof window==='object'?window:globalThis,function(){
  const types=['claude','codex'];
  function limit(value){const n=Number(value);return Number.isFinite(n)?Math.max(1,Math.min(10,Math.floor(n))):3;}
  function plan(preferences,existing=[]){
    const max=limit(preferences.maxAgents??3),wanted=preferences.startupAgents||{};
    let room=Math.max(0,max-existing.length);const result=[];
    for(const type of types){
      const n=Number(wanted[type]);const count=Number.isFinite(n)?Math.max(0,Math.min(10,Math.floor(n))):0;
      const missing=Math.max(0,count-existing.filter(a=>a.agentType===type).length);
      for(let i=0;i<Math.min(missing,room);i++)result.push(type);
      room=Math.max(0,max-existing.length-result.length);
    }
    return result;
  }
  function targets(preferences,existing=[]){
    const selected=[];
    for(const type of types){
      const n=Number(preferences.startupAgents?.[type]);
      const count=Number.isFinite(n)?Math.max(0,Math.min(10,Math.floor(n))):0;
      selected.push(...existing.filter(a=>a.agentType===type).slice(0,count).map(a=>a.id));
    }
    return selected.slice(0,limit(preferences.maxAgents??3));
  }
  return {types,plan,limit,targets};
});
