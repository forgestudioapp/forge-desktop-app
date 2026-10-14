'use strict';
const en=localStorage.getItem('forge_lang')==='en',tr=(fr,eng)=>en?eng:fr;document.documentElement.lang=en?'en':'fr';document.querySelectorAll('[data-fr]').forEach(e=>e.textContent=tr(e.dataset.fr,e.dataset.en));
const api=window.forgeAPI,status=document.getElementById('projectStatus');let project=null,paused=true;
const phases={synced:tr('fichiers synchronisés','files synchronized'),syncing:tr('envoi en cours','sending files'),scanning:tr('analyse des fichiers','scanning files'),compiling:tr('compilation en cours','compiling'), 'compile-error':tr('erreur de compilation','compilation error'),'waiting-studio':tr('en attente de Studio','waiting for Studio'),stopped:tr('arrêtée','stopped')};
function message(text,error=false){status.textContent=text;status.className='project-status'+(error?' error-text':'');}
async function load(){
 try{if(!api?.getActiveProjectInfo)throw new Error(tr('Ouvre cet écran dans Forge.','Open this screen in Forge.'));const r=await api.getActiveProjectInfo();if(r.error)throw new Error(r.error);project=r.project;
 if(!project){location.replace('projects.html?choose=1');return;}document.getElementById('projectName').textContent=project.name;
 const link=project.linkedStudio;document.getElementById('placeInfo').textContent=link?(link.placeName||tr('Place associée','Linked place'))+' · '+(link.placeId||link):tr('Projet local : aucune place associée.','Local project: no place linked.');
 const sync=await api.getFileSyncStatus(project.path);if(sync.error)throw new Error(sync.error);paused=project.syncPaused!==false||['local','paused','stopped'].includes(sync.phase);
 document.getElementById('syncStatus').textContent=!link?tr('Disponible après la liaison à Studio.','Available after linking Studio.'):paused?tr('En pause — reprise manuelle.','Paused — resume manually.'):tr('Activée · ','Enabled · ')+(phases[sync.phase]||tr('état indisponible','status unavailable'));
 document.getElementById('syncAction').textContent=paused?tr('Reprendre la synchronisation','Resume synchronization'):tr('Mettre en pause','Pause synchronization');document.getElementById('syncAction').disabled=!link;
 }catch(e){message(e.message,true);}
}
async function action(button,fn){button.disabled=true;try{await fn();}catch(e){message(e.message,true);}finally{button.disabled=false;await load();}}
document.getElementById('linkPlace').addEventListener('click',e=>action(e.currentTarget,async()=>{
 if(!project)return;let result=await api.linkProjectStudio(project.path);
 if(result.code==='place-linked-elsewhere'&&result.conflictingProject&&confirm(tr('Transférer cette place depuis le projet ','Transfer this place from project ')+result.conflictingProject.name+tr(' ? Ses fichiers seront conservés.','? Its files will be preserved.')))result=await api.linkProjectStudio(project.path,{allowReassign:true,reassignFromProjectPath:result.conflictingProject.path});
 if(result.error)throw new Error(result.error);message(tr('Place associée. La synchronisation reste en pause.','Place linked. Synchronization remains paused.'));
}));
document.getElementById('checkPlace').addEventListener('click',e=>action(e.currentTarget,async()=>{if(!project)return;message(tr('Vérification…','Checking…'));const r=await api.projectStudioStatus(project.path);message(r.error||r.message,!r.ready);}));
document.getElementById('syncAction').addEventListener('click',e=>action(e.currentTarget,async()=>{if(!project)return;const r=await (paused?api.startFileSync(project.path):api.stopFileSync(project.path));if(r.error)throw new Error(r.error);message(paused?tr('Synchronisation reprise.','Synchronization resumed.'):tr('Synchronisation en pause.','Synchronization paused.'));}));
load();
