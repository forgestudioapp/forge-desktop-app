'use strict';
const settingsEnglish = localStorage.getItem('forge_lang') === 'en';
const label = (fr, en) => settingsEnglish ? en : fr;
document.documentElement.lang = settingsEnglish ? 'en' : 'fr';
document.querySelectorAll('[data-fr]').forEach(el => { el.textContent = label(el.dataset.fr, el.dataset.en); });
const prefs = forgePreferences();
const api = window.forgeAPI;
const saved = document.getElementById('savedToast');
function notice(message, error = false) { saved.textContent = message; saved.style.color = error ? 'var(--error)' : 'var(--ok)'; }
function preference(container, key, title, desc, options, fallback) {
  const row = document.createElement('div'); row.className = 'setting-row';
  const text = document.createElement('div'), name = document.createElement('label'), help = document.createElement('p');
  name.className='setting-label'; name.htmlFor=key; name.textContent=title;
  help.className='setting-desc'; help.id=key+'Help'; help.textContent=desc; text.append(name,help);
  const control = document.createElement(options ? 'select' : 'input'); control.id=key; control.setAttribute('aria-describedby',help.id);
  if(options) options.forEach(([value,title]) => { const o=document.createElement('option'); o.value=value; o.textContent=title; control.append(o); });
  else control.type='checkbox';
  const value = prefs[key] ?? fallback;
  if(options) control.value=String(value); else control.checked=!!value;
  control.addEventListener('change', () => {
    const next = forgePreferences(); next[key]=options?control.value:control.checked;
    if(key==='maxAgents'&&Object.values(next.startupAgents||{}).reduce((sum,n)=>sum+Number(n||0),0)>Number(next.maxAgents)){control.value=String(forgePreferences().maxAgents||3);notice(label('Réduis d’abord le nombre d’agents au démarrage.','Reduce startup agents first.'),true);return;}
    try { localStorage.setItem('forge_settings',JSON.stringify(next)); forgeApplyPreferences(); notice(label('Modifications enregistrées','Changes saved')); if(key==='maxAgents'||key==='preferLocalBlender')refreshSessionBudget(); }
    catch (_) { notice(label('Enregistrement impossible sur cet appareil.','Unable to save on this device.'),true); }
  });
  row.append(text,control); document.getElementById(container+'Rows').append(row);
}
preference('appearance','theme',label('Thème','Theme'),label('Suit ton choix, ou celui de ton système.','Use your choice or follow your system.'),[['dark',label('Sombre','Dark')],['light',label('Clair','Light')],['system',label('Système','System')]],'dark');
preference('appearance','interfaceScale',label('Taille de l’interface','Interface size'),label('Agrandit les textes et les commandes sur tous les écrans.','Scales text and controls across the app.'),[[100,'100 %'],[110,'110 %'],[125,'125 %']],100);
preference('appearance','density',label('Espacement','Spacing'),label('Ajuste l’espace entre les éléments.','Adjust spacing between items.'),[['comfortable',label('Confortable','Comfortable')],['compact',label('Compact','Compact')]],'comfortable');
preference('appearance','reduceMotion',label('Réduire les animations','Reduce motion'),label('Désactive les déplacements et les transitions décoratives.','Disable decorative movement and transitions.'),null,false);
preference('appearance','language',label('Langue','Language'),label('Langue des menus et des commandes.','Language for menus and controls.'),[['fr','Français'],['en','English']],settingsEnglish?'en':'fr');
document.getElementById('language').addEventListener('change', e => { localStorage.setItem('forge_lang',e.target.value); location.reload(); });
document.getElementById('language').value=settingsEnglish?'en':'fr';
preference('agents','preferredAgent',label('Agent préféré','Preferred agent'),label('Présélectionné lorsque tu ajoutes un agent.','Preselected when adding an agent.'),[['claude','Claude Code'],['codex','Codex']],'claude');
preference('agents','maxAgents',label('Agents simultanés','Concurrent agents'),label('Limite le nombre de panneaux ouverts par projet.','Limit the number of agent panels per project.'),Array.from({length:10},(_,i)=>[i+1,String(i+1)]),3);
preference('agents','terminalFontSize',label('Texte des terminaux','Terminal text'),label('Taille par défaut ; chaque terminal garde son zoom personnalisé.','Default size; individual terminal zoom is preserved.'),[10,12,14,16,18,20].map(n=>[n,n+' px']),12);
for(const [type,title] of [['claude','Claude Code'],['codex','Codex']]){
 const row=document.createElement('div');row.className='setting-row';const text=document.createElement('div'),name=document.createElement('label'),help=document.createElement('p'),input=document.createElement('input');
 name.className='setting-label';name.htmlFor='startup-'+type;name.textContent=title+label(' à l’ouverture du projet',' on project open');help.className='setting-desc';help.textContent=label('0 = aucun. Les panneaux existants sont conservés, sans doublons.','0 = none. Existing panels are kept without duplicates.');input.id=name.htmlFor;input.type='number';input.min='0';input.max='10';input.step='1';input.value=String(prefs.startupAgents?.[type]||0);
 input.addEventListener('change',()=>{
   const next=forgePreferences();const counts={claude:0,codex:0,...next.startupAgents};const n=Number(input.value);
   if(!Number.isInteger(n)||n<0||n>10){input.value=String(counts[type]);notice(label('Choisis un nombre entre 0 et 10.','Choose a number from 0 to 10.'),true);return;}
   counts[type]=n;const total=Object.values(counts).reduce((s,n)=>s+Number(n),0);
   if(total>10){input.value=String(next.startupAgents?.[type]||0);notice(label('Dix agents maximum au total.','Ten agents maximum in total.'),true);return;}
   next.startupAgents=counts;next.maxAgents=Math.max(Number(next.maxAgents)||3,total);
   try{localStorage.setItem('forge_settings',JSON.stringify(next));document.getElementById('maxAgents').value=String(next.maxAgents);notice(label('Agents de démarrage enregistrés.','Startup agents saved.'));refreshSessionBudget();}catch(e){notice(e.message,true);}
 });text.append(name,help);row.append(text,input);document.getElementById('agentsRows').append(row);
}
preference('budget','preferLocalBlender',label('Privilégier Blender local','Prefer local Blender'),label('Utilise Blender lorsqu’une action compatible peut être réalisée localement. Les conversions image vers 3D qui exigent Tripo restent clairement séparées.','Use Blender when a compatible action can run locally. Image-to-3D conversions that require Tripo remain clearly separated.'),null,true);

function budgetStat(title,value){
  const card=document.createElement('article');card.className='budget-stat';
  const number=document.createElement('strong');number.textContent=value;
  const caption=document.createElement('span');caption.textContent=title;
  card.append(number,caption);return card;
}
function budgetLevelName(level){
  const names={idle:label('Aucune consommation active','No active usage'),moderate:label('Modérée','Moderate'),high:label('Élevée','High'),very_high:label('Très élevée','Very high')};
  return names[level]||names.idle;
}
function sameProjectPath(left,right){return String(left||'').replace(/\\/g,'/').replace(/\/$/,'').toLowerCase()===String(right||'').replace(/\\/g,'/').replace(/\/$/,'').toLowerCase();}
async function refreshSessionBudget(){
  const container=document.getElementById('sessionBudgetSummary');if(!container||!window.ForgeSessionBudget)return;
  container.replaceChildren(budgetStat(label('État','Status'),label('Calcul…','Calculating…')));
  const current=forgePreferences();let project=null,sessions=[],state={agents:[]},activity={agents:[]},usage={availability:'unavailable',totals:null};
  try{
    const active=await call('getActiveProjectInfo');project=active?.project||null;
    const results=await Promise.allSettled([
      call('listAgentSessions'),
      project?.path?call('loadAgentState',project.path):Promise.resolve({agents:[]}),
      project?.path?call('listAgentActivity',project.path):Promise.resolve({agents:[]}),
      call('getAgentUsageSummary',project?.path||null),
    ]);
    if(results[0].status==='fulfilled'&&Array.isArray(results[0].value))sessions=results[0].value;
    if(results[1].status==='fulfilled')state=results[1].value||state;
    if(results[2].status==='fulfilled')activity=results[2].value||activity;
    if(results[3].status==='fulfilled')usage=results[3].value||usage;
  }catch(_){}
  const activeAgents=sessions.filter(session=>session?.running&&(!project?.path||sameProjectPath(session.projectPath,project.path))).length;
  const summary=window.ForgeSessionBudget.summarize({
    activeAgents,
    openPanels:Array.isArray(state?.agents)?state.agents.length:0,
    startupAgents:current.startupAgents,
    maxAgents:current.maxAgents,
    activities:activity?.agents,
    preferLocalBlender:current.preferLocalBlender,
  });
  container.replaceChildren(
    budgetStat(label('Agents actifs','Active agents'),String(summary.activeAgents)),
    budgetStat(label('Panneaux du projet','Project panels'),String(summary.openPanels)),
    budgetStat(label('Au prochain démarrage','On next startup'),summary.startupAgents+' / '+summary.maxAgents),
    budgetStat(label('Coût qualitatif','Qualitative cost'),budgetLevelName(summary.qualitativeCost)),
    budgetStat(label('Tokens mesurés','Measured tokens'),usage.availability==='available'
      ? String((usage.totals?.input||0)+(usage.totals?.output||0))
      : label('Indisponible','Unavailable')),
    budgetStat(label('Cache lu','Cache read'),usage.availability==='available'
      ? String(usage.totals?.cacheRead||0)
      : label('Indisponible','Unavailable')),
  );
  const warning=document.createElement('div');warning.className='budget-warning'+(summary.duplicateRisk?'':' ok');
  if(summary.conflicts>0)warning.textContent=label(
    `${summary.conflicts} conflit(s) de ressources détecté(s). Réattribue les fichiers ou objets avant de continuer.`,
    `${summary.conflicts} resource conflict(s) detected. Reassign files or objects before continuing.`
  );
  else if(summary.duplicateRisk)warning.textContent=label(
    'Plusieurs agents sont prévus ou actifs. Attribue une tâche et des ressources différentes à chacun pour éviter de payer deux fois le même travail.',
    'Several agents are planned or active. Give each one a distinct task and resources to avoid paying twice for the same work.'
  );
  else warning.textContent=label(
    'Aucun risque de travail dupliqué détecté. Le coût reste une indication qualitative ; Forge ne change jamais de modèle automatiquement.',
    'No duplicate-work risk detected. Cost remains a qualitative indication; Forge never switches models automatically.'
  );
  container.append(warning);
}
refreshSessionBudget();
preference('notifications','notifSound',label('Son des nouveaux résultats','New result sound'),label('Un signal sonore quand un agent envoie un résultat.','Play a sound when an agent sends a result.'),null,true);
preference('notifications','notifAutoOpen',label('Ouvrir le panneau automatiquement','Open the panel automatically'),label('Sinon, les résultats restent accessibles depuis la cloche.','Otherwise, results remain available from the bell.'),null,true);
const communitySharing = { model3d:false, image:false, audio:false };
function communityPreference(key, title, desc) {
  const row=document.createElement('div');row.className='setting-row';
  const text=document.createElement('div'),name=document.createElement('label'),help=document.createElement('p'),control=document.createElement('input');
  name.className='setting-label';name.htmlFor='community-'+key;name.textContent=title;
  help.className='setting-desc';help.id=name.htmlFor+'Help';help.textContent=desc;text.append(name,help);
  control.id=name.htmlFor;control.type='checkbox';control.disabled=true;control.checked=false;control.setAttribute('aria-describedby',help.id);
  control.addEventListener('change',async()=>{
    const previous=communitySharing[key];communitySharing[key]=control.checked;control.disabled=true;
    try{
      const result=await call('saveCommunitySharingSettings',{...communitySharing});
      if(!result?.success)throw new Error(result?.error||label('Enregistrement impossible.','Unable to save.'));
      Object.assign(communitySharing,result.settings||{});control.checked=!!communitySharing[key];
      notice(label('Choix de partage enregistré.','Sharing preference saved.'));
    }catch(error){communitySharing[key]=previous;control.checked=previous;notice(error.message,true);}
    finally{control.disabled=false;}
  });
  row.append(text,control);document.getElementById('communityRows').append(row);return control;
}
const communityControls={
  model3d:communityPreference('model3d',label('Partager automatiquement les modèles 3D','Automatically share 3D models'),label('Publie les nouveaux FBX, GLB, GLTF ou OBJ livrés par les agents.','Publish new FBX, GLB, GLTF or OBJ files delivered by agents.')),
  image:communityPreference('image',label('Partager automatiquement les images','Automatically share images'),label('Publie les nouvelles images ; les aperçus et fichiers QA des modèles restent privés.','Publish new images; model previews and QA files remain private.')),
  audio:communityPreference('audio',label('Partager automatiquement les sons','Automatically share sounds'),label('Publie les nouveaux fichiers audio détectés dans le projet.','Publish new audio files detected in the project.')),
};
async function loadCommunitySharing(){
  try{
    const result=await call('getCommunitySharingSettings');Object.assign(communitySharing,result||{});
    for(const [key,control] of Object.entries(communityControls)){control.checked=communitySharing[key]===true;control.disabled=false;}
  }catch(error){notice(error.message,true);}
}
loadCommunitySharing();
const API_SERVICES=[
  {id:'gemini',title:'Gemini',desc:label('Génération d’images avec Google Gemini.','Image generation with Google Gemini.'),url:'https://aistudio.google.com/app/apikey'},
  {id:'tripo',title:'Tripo3D',desc:label('Génération 3D externe optionnelle. Blender local reste disponible sans cette clé.','Optional external 3D generation. Local Blender remains available without this key.'),url:'https://platform.tripo3d.ai'},
  {id:'elevenlabs',title:'ElevenLabs',desc:label('Génération de sons et de voix.','Sound and voice generation.'),url:'https://elevenlabs.io/app/settings/api-keys'},
];
const apiServiceViews={};
function apiServiceRow(service){
  const row=document.createElement('div');row.className='setting-row api-key-row';
  const text=document.createElement('div'),name=document.createElement('span'),help=document.createElement('p');
  name.className='setting-label';name.textContent=service.title;help.className='setting-desc';help.textContent=service.desc;text.append(name,help);
  const summary=document.createElement('div');summary.className='api-key-summary';
  const status=document.createElement('span');status.className='status';status.textContent=label('Vérification…','Checking…');status.setAttribute('role','status');
  const configure=document.createElement('button');configure.type='button';configure.textContent=label('Configurer','Configure');
  const provider=document.createElement('button');provider.type='button';provider.className='api-key-provider';provider.textContent=label('Obtenir une clé','Get a key');provider.addEventListener('click',async()=>{try{await call('openExternal',service.url);}catch(error){notice(error.message,true);}});
  summary.append(status,configure,provider);row.append(text,summary);
  const editor=document.createElement('div');editor.className='api-key-editor';editor.hidden=true;
  const input=document.createElement('input');input.type='password';input.autocomplete='off';input.spellcheck=false;input.placeholder=label('Coller une nouvelle clé API','Paste a new API key');input.setAttribute('aria-label',label('Nouvelle clé API '+service.title,'New '+service.title+' API key'));
  const save=document.createElement('button');save.type='button';save.textContent=label('Vérifier et enregistrer','Verify and save');
  const remove=document.createElement('button');remove.type='button';remove.className='api-key-remove';remove.textContent=label('Supprimer la clé','Remove key');
  editor.append(input,save,remove);row.append(editor);
  configure.addEventListener('click',()=>{editor.hidden=!editor.hidden;if(!editor.hidden)input.focus();});
  save.addEventListener('click',async()=>{
    const key=input.value.trim();if(!key){status.textContent=label('Saisis une clé.','Enter a key.');status.className='status error';return;}
    save.disabled=true;input.disabled=true;status.textContent=label('Vérification…','Checking…');status.className='status';
    try{
      const verified=await call('verifyApiKey',service.id,key);if(!verified?.valid)throw new Error(verified?.error||label('Clé refusée.','Key rejected.'));
      const savedKey=await call('saveApiKey',service.id,key);if(!savedKey?.success)throw new Error(savedKey?.error||label('Enregistrement impossible.','Unable to save.'));
      input.value='';editor.hidden=true;status.textContent=label('Configurée','Configured');status.className='status ok';configure.textContent=label('Remplacer','Replace');remove.hidden=false;notice(label('Clé vérifiée et enregistrée.','Key verified and saved.'));
    }catch(error){status.textContent=error.message;status.className='status error';notice(error.message,true);}
    finally{save.disabled=false;input.disabled=false;}
  });
  remove.addEventListener('click',async()=>{
    if(!confirm(label('Supprimer cette clé de cet appareil ?','Remove this key from this device?')))return;
    remove.disabled=true;
    try{
      const result=await call('deleteApiKey',service.id);if(!result?.success)throw new Error(result?.error||label('Suppression impossible.','Unable to remove.'));
      input.value='';editor.hidden=true;status.textContent=label('Non configurée','Not configured');status.className='status';configure.textContent=label('Configurer','Configure');remove.hidden=true;notice(label('Clé supprimée de cet appareil.','Key removed from this device.'));
    }catch(error){status.textContent=error.message;status.className='status error';notice(error.message,true);}
    finally{remove.disabled=false;}
  });
  document.getElementById('apiServiceRows').append(row);apiServiceViews[service.id]={status,configure,remove};
}
API_SERVICES.forEach(apiServiceRow);
async function loadApiServiceStatus(){
  try{
    const states=await call('getApiKeys');if(states?.error)throw new Error(states.error);
    for(const service of API_SERVICES){
      const view=apiServiceViews[service.id],state=states?.[service.id];
      if(state?.readable){view.status.textContent=label('Configurée','Configured');view.status.className='status ok';view.configure.textContent=label('Remplacer','Replace');view.remove.hidden=false;}
      else if(state?.configured){view.status.textContent=label('Enregistrée mais illisible · remplace-la','Saved but unreadable · replace it');view.status.className='status error';view.configure.textContent=label('Remplacer','Replace');view.remove.hidden=false;}
      else{view.status.textContent=label('Non configurée','Not configured');view.status.className='status';view.remove.hidden=true;}
    }
  }catch(error){for(const view of Object.values(apiServiceViews)){view.status.textContent=error.message;view.status.className='status error';}}
}
loadApiServiceStatus();
const settingsSections=[...document.querySelectorAll('.settings-section')];
const settingsButtons=new Map();
const settingsCategories=[
  {id:'guide',title:label('Bien démarrer','Getting started'),sections:['guide']},
  {id:'general',title:label('Général','General'),sections:['appearance','notifications']},
  {id:'agents',title:label('Agents IA','AI agents'),sections:['agents','budget']},
  {id:'media',title:label('Médias et partage','Media and sharing'),sections:['community','api-services']},
  {id:'connections',title:label('Connexions','Connections'),sections:['connections']},
  {id:'projects',title:label('Projets','Projects'),sections:['projects']},
  {id:'help',title:label('Aide et diagnostic','Help and diagnostics'),sections:['diagnostics']},
  {id:'account',title:label('Compte Forge','Forge account'),sections:['account']},
];
function categoryFor(id){return settingsCategories.find(item=>item.id===id||item.sections.includes(id))||settingsCategories[0];}
function showSettingsSection(id, updateHash=true){
  const category=categoryFor(id);
  for(const item of settingsSections)item.hidden=!category.sections.includes(item.id);
  for(const [key,button] of settingsButtons)button.toggleAttribute('aria-current',key===category.id);
  if(updateHash&&location.hash!=='#'+category.id)history.replaceState(null,'','#'+category.id);
  document.getElementById('settingsContent').scrollTop=0;
}
for(const category of settingsCategories){
  const button=document.createElement('button');button.type='button';button.textContent=category.title;
  button.addEventListener('click',()=>showSettingsSection(category.id));
  document.getElementById('settingsNav').append(button);settingsButtons.set(category.id,button);
}
showSettingsSection(location.hash.slice(1)||'guide',false);
window.addEventListener('hashchange',()=>showSettingsSection(location.hash.slice(1),false));
document.getElementById('settingsBack').addEventListener('click',()=>{
  location.href=typeof forgeSettingsReturnTarget==='function'?forgeSettingsReturnTarget():'projects.html';
});
function statusRow(parent, title, message, state='') {
  const row=document.createElement('div');row.className='setting-row';const name=document.createElement('span');name.className='setting-label';name.textContent=title;
  const value=document.createElement('span');value.className='status '+state;value.textContent=message;value.setAttribute('role','status');row.append(name,value);parent.append(row);return value;
}
async function call(name,...args) { if(!api?.[name]) throw new Error(label('Ouvre cet écran dans Forge.','Open this screen in Forge.')); return api[name](...args); }
function connectionState(result) {
  const state=result?.state||(result?.connected?'valid':'missing');
  const messages={
    valid:[label('Session valide','Valid session'),true],
    expired:[label('Session expirée · reconnecte-toi','Session expired · reconnect'),false],
    offline:[label('Session enregistrée · service hors ligne','Session saved · service offline'),null],
    stored:[label('Session enregistrée · vérification nécessaire','Session saved · verification required'),null],
    invalid:[label('Session invalide · reconnecte-toi','Invalid session · reconnect'),false],
    unreadable:[label('Session illisible · reconnecte-toi','Unreadable session · reconnect'),false],
    missing:[label('À connecter','Not connected'),false]
  };
  return messages[state]||[label('État inconnu','Unknown status'),false];
}
async function checkConnections() {
  const button=document.getElementById('checkConnections');button.disabled=true;
  const rows=document.getElementById('connectionRows');rows.replaceChildren();
  const tasks=[[label('Compte Forge','Forge account'),'isForgeConnected',connectionState],
    ['Roblox','isRobloxConnected',connectionState],
    [label('Accès IA à Roblox','AI access to Roblox'),'verifyRobloxAiAccess',r=>[r.aiAccessReady?label('Accès vérifié','Access verified'):(r.error||label('À reconnecter','Reconnect required')),r.aiAccessReady]],
    ['GitHub','isGithubConnected',connectionState],
    ['Roblox Studio','checkPluginConnection',r=>[r.studioConnected?label('Plugin connecté','Plugin connected'):label('Ouvre Studio et active le plugin Forge','Open Studio and enable the Forge plugin'),r.studioConnected]]];
  await Promise.allSettled(tasks.map(async([title,method,read])=>{const el=statusRow(rows,title,label('Vérification…','Checking…'));try{const result=await call(method);const [message,ok]=read(result);el.textContent=message;el.className='status '+(ok===true?'ok':ok===false?'error':'');}catch(e){el.textContent=e.message;el.className='status error';}}));
  button.disabled=false;
}
document.getElementById('checkConnections').addEventListener('click',checkConnections);
statusRow(document.getElementById('connectionRows'),label('État des connexions','Connection status'),label('Clique sur « Tester les connexions ».','Select “Test connections”.'));
let diagnosticReport=null;
function safeDiagnosticMessage(error) {
  return String(error?.message||error||label('Erreur inconnue','Unknown error'))
    .replace(/[A-Z]:\\[^\s"']+/gi,'[path]')
    .replace(/\\\\[^\s"']+/g,'[path]')
    .replace(/file:\/\/\/[^\s"']+/gi,'[path]')
    .replace(/\/(?:Users|home)\/[^\s"']+/gi,'[path]')
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g,'[account]')
    .replace(/(?:Bearer\s+)?[A-Za-z0-9_-]{28,}/g,'[secret]')
    .slice(0,240);
}
function safeDiagnosticVersion(value) { return value?safeDiagnosticMessage(value).slice(0,80):null; }
function settledValue(result, fallback={}) { return result.status==='fulfilled'?(result.value||fallback):fallback; }
document.getElementById('runDiagnostics').addEventListener('click',async()=>{
  const button=document.getElementById('runDiagnostics'), rows=document.getElementById('diagnosticRows');button.disabled=true;rows.replaceChildren();diagnosticReport=null;document.getElementById('exportDiagnostics').disabled=true;
  statusRow(rows,label('Analyse','Checking'),label('Vérification des outils…','Checking tools…'));
  try{
    const names=['system','info','forge','roblox','github','studio','activeProject','updater'];
    const results=await Promise.allSettled([call('checkSystem'),call('getAppInfo'),call('isForgeConnected'),call('isRobloxConnected'),call('isGithubConnected'),call('checkPluginConnection'),call('getActiveProject'),call('getUpdaterStatus')]);
    const [system,info,forge,roblox,github,studio,activeResult,updater]=results.map(r=>settledValue(r));
    const lastErrors=[];
    results.forEach((result,index)=>{if(result.status==='rejected')lastErrors.push({component:names[index],message:safeDiagnosticMessage(result.reason)});});
    for(const [component,value] of [['system',system],['forge',forge],['roblox',roblox],['github',github],['studio',studio],['updater',updater]])if(value?.error)lastErrors.push({component,message:safeDiagnosticMessage(value.error)});
    const activeProject=activeResult?.project||null;
    let project={active:!!activeProject,linked:false,correctPlace:false,code:activeProject?'unchecked':'no-active-project'};
    if(activeProject?.path){
      try{const state=await call('projectStudioStatus',activeProject.path);project={active:true,linked:!!state?.project?.linkedStudio,correctPlace:!!state?.ready,code:state?.code||'unknown'};if(state?.error)lastErrors.push({component:'projectStudio',message:safeDiagnosticMessage(state.error)});}
      catch(error){lastErrors.push({component:'projectStudio',message:safeDiagnosticMessage(error)});}
    }
    const tools={
      node:{available:!!system.nodeOk,version:safeDiagnosticVersion(system.nodeVersion)},
      robloxStudio:{available:!!system.robloxInstalled},
      plugin:{available:!!system.pluginInstalled,version:safeDiagnosticVersion(system.pluginVersion)},
      backgroundRemoval:{available:!!system.rembgInstalled,version:safeDiagnosticVersion(system.rembgVersion)}
    };
    for(const key of ['claude','codex'])tools[key]={available:!!system.agents?.[key]?.installed,version:safeDiagnosticVersion(system.agents?.[key]?.version),authState:system.agents?.[key]?.auth?.state||null};
    diagnosticReport={createdAt:new Date().toISOString(),forgeVersion:safeDiagnosticVersion(info.version),platform:info.platform||null,connections:{forge:forge.state||'unknown',roblox:roblox.state||'unknown',github:github.state||'unknown'},studio:{mcpReady:!!studio.connected,studioConnected:!!studio.studioConnected},project,tools,updater:{status:updater.status||'unknown',lastCheckedAt:updater.lastCheckedAt||null,availableVersion:safeDiagnosticVersion(updater.availableVersion)},lastErrors};rows.replaceChildren();
    statusRow(rows,'Forge',info.version);
    statusRow(rows,label('Compte Forge','Forge account'),connectionState(forge)[0],forge.state==='valid'?'ok':forge.state==='offline'?'':'error');
    statusRow(rows,'Roblox',connectionState(roblox)[0],roblox.state==='valid'?'ok':roblox.state==='offline'?'':'error');
    statusRow(rows,'GitHub',connectionState(github)[0],github.state==='valid'?'ok':github.state==='offline'?'':'error');
    statusRow(rows,label('Pont Studio','Studio bridge'),studio.studioConnected?label('Studio connecté','Studio connected'):studio.connected?label('Serveur prêt · Studio absent','Server ready · Studio absent'):label('Serveur indisponible','Server unavailable'),studio.studioConnected?'ok':'error');
    statusRow(rows,label('Projet actif','Active project'),!project.active?label('Aucun projet actif','No active project'):project.correctPlace?label('Bonne place connectée','Correct place connected'):project.linked?label('Mauvaise place ou Studio absent','Wrong place or Studio unavailable'):label('Projet non lié','Project not linked'),project.correctPlace?'ok':project.active?'error':'');
    const toolNames={node:'Node.js',robloxStudio:'Roblox Studio',plugin:'Plugin Forge',backgroundRemoval:label('Détourage d’images','Background removal'),claude:'Claude Code',codex:'Codex'};
    Object.entries(tools).forEach(([key,value])=>{const needsLogin=value.authState==='disconnected';const text=!value.available?label('Non détecté','Not detected'):needsLogin?label('Installé · connexion requise','Installed · sign-in required'):value.version?`${label('Disponible','Available')} · ${value.version}`:label('Disponible','Available');statusRow(rows,toolNames[key],text,value.available&&!needsLogin?'ok':'error');});
    statusRow(rows,label('Dernière erreur utile','Last useful error'),lastErrors.length?`${lastErrors.at(-1).component} · ${lastErrors.at(-1).message}`:label('Aucune','None'),lastErrors.length?'error':'ok');
    document.getElementById('exportDiagnostics').disabled=false;
  }catch(e){rows.replaceChildren();statusRow(rows,label('Diagnostic','Diagnostics'),e.message,'error');}finally{button.disabled=false;}
});
document.getElementById('exportDiagnostics').addEventListener('click',()=>{
  if(!diagnosticReport)return;const url=URL.createObjectURL(new Blob([JSON.stringify(diagnosticReport,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='forge-diagnostic.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
const updaterRows=document.getElementById('updaterRows');
function renderUpdater(state={}) {
  updaterRows.replaceChildren();
  const messages={idle:label('Pas encore vérifiée','Not checked yet'),checking:label('Vérification…','Checking…'),'up-to-date':label('Forge est à jour','Forge is up to date'),available:label(`Version ${state.availableVersion||''} disponible`,`Version ${state.availableVersion||''} available`),downloading:label(`Téléchargement ${state.progress??0} %`,`Downloading ${state.progress??0}%`),downloaded:label('Mise à jour prête à installer','Update ready to install'),error:state.error||label('Échec de la vérification','Update check failed')};
  statusRow(updaterRows,label('Mises à jour','Updates'),messages[state.status]||state.status||'—',state.status==='up-to-date'||state.status==='downloaded'?'ok':state.status==='error'?'error':'');
  statusRow(updaterRows,label('Dernière vérification','Last checked'),state.lastCheckedAt?new Date(state.lastCheckedAt).toLocaleString():'—');
}
call('getUpdaterStatus').then(renderUpdater).catch(error=>renderUpdater({status:'error',error:safeDiagnosticMessage(error)}));
if(api?.onUpdaterStatus)api.onUpdaterStatus(renderUpdater);
document.getElementById('checkUpdates').addEventListener('click',async()=>{const button=document.getElementById('checkUpdates');button.disabled=true;try{renderUpdater(await call('checkForUpdates'));}catch(error){renderUpdater({status:'error',error:safeDiagnosticMessage(error),lastCheckedAt:new Date().toISOString()});}finally{button.disabled=false;}});
const locationCard=document.createElement('div');locationCard.className='settings-card';locationCard.style.marginTop='16px';
const locationText=document.createElement('p');locationText.textContent=label('Dossier des nouveaux projets…','New project directory…');
const locationHelp=document.createElement('p');locationHelp.className='settings-tip';locationHelp.textContent=label('Les nouveaux projets seront créés dans un sous-dossier propre à ton compte. Les projets existants restent à leur emplacement.','New projects will use an account-specific subfolder. Existing projects stay in their current location.');
const locationButton=document.createElement('button');locationButton.textContent=label('Choisir le dossier','Choose folder');locationButton.style.marginBottom='16px';
locationCard.append(locationText,locationHelp,locationButton);document.getElementById('projects').append(locationCard);
call('getProjectsLocation').then(r=>{locationText.textContent=r.path;}).catch(e=>{locationText.textContent=e.message;});
locationButton.addEventListener('click',async()=>{locationButton.disabled=true;try{const result=await call('chooseProjectsLocation');if(result.error)throw new Error(result.error);if(result.path){locationText.textContent=result.path;notice(label('Dossier enregistré','Folder saved'));}}catch(e){notice(e.message,true);}finally{locationButton.disabled=false;}});
call('isForgeConnected').then(r=>{document.getElementById('accountEmail').textContent=r.email||label('Non connecté','Not connected');}).catch(e=>{document.getElementById('accountEmail').textContent=e.message;});
document.getElementById('logoutBtn').addEventListener('click',async()=>{
  if(!confirm(label('Fermer la session Forge et déconnecter Roblox, GitHub et les clés API ? Tes projets restent sauvegardés.','Sign out of Forge and disconnect Roblox, GitHub and API keys? Your projects remain saved.')))return;
  const button=document.getElementById('logoutBtn');button.disabled=true;
  try{await call('logoutForge');sessionStorage.removeItem('forge-startup-checked');location.href='onboarding.html?setup=1';}catch(e){notice(e.message,true);button.disabled=false;}
});
