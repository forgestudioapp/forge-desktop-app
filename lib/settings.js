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
    try { localStorage.setItem('forge_settings',JSON.stringify(next)); forgeApplyPreferences(); notice(label('Modifications enregistrées','Changes saved')); }
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
preference('agents','preferredAgent',label('Agent préféré','Preferred agent'),label('Présélectionné lorsque tu ajoutes un agent.','Preselected when adding an agent.'),[['claude','Claude Code'],['codex','Codex'],['antigravity','Antigravity']],'claude');
preference('agents','maxAgents',label('Agents simultanés','Concurrent agents'),label('Limite le nombre de panneaux ouverts par projet.','Limit the number of agent panels per project.'),Array.from({length:10},(_,i)=>[i+1,String(i+1)]),3);
preference('agents','terminalFontSize',label('Texte des terminaux','Terminal text'),label('Taille par défaut ; chaque terminal garde son zoom personnalisé.','Default size; individual terminal zoom is preserved.'),[10,12,14,16,18,20].map(n=>[n,n+' px']),12);
preference('notifications','notifSound',label('Son des nouveaux résultats','New result sound'),label('Un signal sonore quand un agent envoie un résultat.','Play a sound when an agent sends a result.'),null,true);
preference('notifications','notifAutoOpen',label('Ouvrir le panneau automatiquement','Open the panel automatically'),label('Sinon, les résultats restent accessibles depuis la cloche.','Otherwise, results remain available from the bell.'),null,true);
document.querySelectorAll('.settings-section').forEach(section => {
  const a=document.createElement('a'); a.href='#'+section.id; a.textContent=section.querySelector('h2').textContent; document.getElementById('settingsNav').append(a);
});
const search=document.getElementById('settingsSearch'); search.placeholder=label('Rechercher…','Search…');
search.addEventListener('input',()=>{let count=0;const query=search.value.toLocaleLowerCase().trim();document.querySelectorAll('.settings-section').forEach(s=>{s.hidden=!s.textContent.toLocaleLowerCase().includes(query);if(!s.hidden)count++;});document.getElementById('noSettings').hidden=count>0;});
document.getElementById('settingsNav').addEventListener('click',()=>{search.value='';search.dispatchEvent(new Event('input'));});
function statusRow(parent, title, message, state='') {
  const row=document.createElement('div');row.className='setting-row';const name=document.createElement('span');name.className='setting-label';name.textContent=title;
  const value=document.createElement('span');value.className='status '+state;value.textContent=message;value.setAttribute('role','status');row.append(name,value);parent.append(row);return value;
}
async function call(name,...args) { if(!api?.[name]) throw new Error(label('Ouvre cet écran dans Forge.','Open this screen in Forge.')); return api[name](...args); }
async function checkConnections() {
  const button=document.getElementById('checkConnections');button.disabled=true;
  const rows=document.getElementById('connectionRows');rows.replaceChildren();
  const tasks=[['Roblox','isRobloxConnected',r=>[r.connected?label('Compte connecté','Account connected'):label('À connecter','Not connected'),r.connected]],
    [label('Accès IA à Roblox','AI access to Roblox'),'verifyRobloxAiAccess',r=>[r.aiAccessReady?label('Accès vérifié','Access verified'):(r.error||label('À reconnecter','Reconnect required')),r.aiAccessReady]],
    ['GitHub','isGithubConnected',r=>[r.connected?label('Session enregistrée · gérer pour reconnecter','Saved session · manage to reconnect'):label('À connecter','Not connected'),r.connected]],
    ['Roblox Studio','checkPluginConnection',r=>[r.studioConnected?label('Plugin connecté','Plugin connected'):label('Ouvre Studio et active le plugin Forge','Open Studio and enable the Forge plugin'),r.studioConnected]]];
  await Promise.allSettled(tasks.map(async([title,method,read])=>{const el=statusRow(rows,title,label('Vérification…','Checking…'));try{const result=await call(method);const [message,ok]=read(result);el.textContent=message;el.className='status '+(ok?'ok':'error');}catch(e){el.textContent=e.message;el.className='status error';}}));
  button.disabled=false;
}
document.getElementById('checkConnections').addEventListener('click',checkConnections);
statusRow(document.getElementById('connectionRows'),label('État des connexions','Connection status'),label('Clique sur « Tester les connexions ».','Select “Test connections”.'));
let diagnosticReport=null;
document.getElementById('runDiagnostics').addEventListener('click',async()=>{
  const button=document.getElementById('runDiagnostics'), rows=document.getElementById('diagnosticRows');button.disabled=true;rows.replaceChildren();diagnosticReport=null;document.getElementById('exportDiagnostics').disabled=true;
  statusRow(rows,label('Analyse','Checking'),label('Vérification des outils…','Checking tools…'));
  try{
    const system=await call('checkSystem'); if(system.error)throw new Error(system.error);
    const info=await call('getAppInfo');
    const tools={node:!!system.nodeOk,roblox:!!system.robloxInstalled,plugin:!!system.pluginInstalled,backgroundRemoval:!!system.rembgInstalled};
    for(const key of ['claude','codex','antigravity'])tools[key]=!!system.agents?.[key]?.installed;
    diagnosticReport={createdAt:new Date().toISOString(),forgeVersion:info.version,platform:info.platform,tools};rows.replaceChildren();
    statusRow(rows,'Forge',info.version);
    const names={node:'Node.js',roblox:'Roblox Studio',plugin:'Plugin Forge',backgroundRemoval:label('Détourage d’images','Background removal'),claude:'Claude Code',codex:'Codex',antigravity:'Antigravity'};
    Object.entries(tools).forEach(([key,ok])=>statusRow(rows,names[key],ok?label('Disponible','Available'):label('Non détecté','Not detected'),ok?'ok':'error'));
    document.getElementById('exportDiagnostics').disabled=false;
  }catch(e){rows.replaceChildren();statusRow(rows,label('Diagnostic','Diagnostics'),e.message,'error');}finally{button.disabled=false;}
});
document.getElementById('exportDiagnostics').addEventListener('click',()=>{
  if(!diagnosticReport)return;const url=URL.createObjectURL(new Blob([JSON.stringify(diagnosticReport,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='forge-diagnostic.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
let currentProject=null,syncRunning=false;
async function projectStatus(){
  const info=document.getElementById('projectInfo'),button=document.getElementById('syncToggle');button.disabled=true;
  try{const result=await call('getActiveProjectInfo');if(result.error)throw new Error(result.error);currentProject=result.project;if(!currentProject){info.textContent=label('Aucun projet actif. Ouvre un projet pour gérer sa synchronisation.','No active project. Open a project to manage synchronization.');button.textContent=label('Aucun projet','No project');return;}
    const status=await call('getFileSyncStatus',currentProject.path);syncRunning=status.phase!=='stopped'&&!!status.phase;
    info.textContent=currentProject.name+' · '+(status.error||label('Synchronisation : ','Synchronization: ')+(status.phase||'stopped'));
    button.textContent=syncRunning?label('Arrêter la synchronisation','Stop synchronization'):label('Démarrer la synchronisation','Start synchronization');button.disabled=false;
  }catch(e){info.textContent=e.message;}
}
document.getElementById('syncToggle').addEventListener('click',async()=>{
  if(!currentProject)return;document.getElementById('syncToggle').disabled=true;
  try{const result=await call(syncRunning?'stopFileSync':'startFileSync',currentProject.path);if(result?.error)throw new Error(result.error);notice(label('Synchronisation mise à jour','Synchronization updated'));}catch(e){notice(e.message,true);}finally{await projectStatus();}
});
projectStatus();
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
  try{await call('logoutForge');location.href='login.html';}catch(e){notice(e.message,true);button.disabled=false;}
});
