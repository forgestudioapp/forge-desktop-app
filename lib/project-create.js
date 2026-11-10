'use strict';
const input=document.getElementById('projectNameInput');
const button=document.getElementById('createBtn');
const status=document.getElementById('creationStatus');
const details=document.getElementById('creationDetails');
const errorText=document.getElementById('creationError');
const slug=name=>name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,80);
const stages={prepare:'Préparation du projet',install:'Installation des outils',verify:'Vérification du code'};
const friendlyError=(error,stage)=>{
  if(stage==='dependencies')return 'Forge n’a pas réussi à préparer les outils du projet. Vérifie ta connexion puis réessaie.';
  if(stage==='compile')return 'Forge n’a pas réussi à vérifier le nouveau jeu. Réessaie; les détails sont disponibles ci-dessous.';
  if(/exist|déjà|already/i.test(error))return 'Un projet portant ce nom existe déjà. Choisis un autre nom.';
  if(/permission|access|EACCES|EPERM/i.test(error))return 'Forge ne peut pas écrire dans le dossier des projets. Vérifie son accès puis réessaie.';
  return 'Forge n’a pas pu créer le projet. Réessaie ou ouvre les détails ci-dessous.';
};
if(window.forgeAPI?.onProjectCreateStage)window.forgeAPI.onProjectCreateStage(stage=>{if(stages[stage])status.textContent=stages[stage];});
document.getElementById('createForm').addEventListener('submit',async event=>{
  event.preventDefault();
  if(button.disabled)return;
  const name=slug(input.value);
  if(!name){status.textContent='Choisis un nom contenant des lettres ou des chiffres.';return;}
  button.disabled=true;
  details.hidden=true;
  errorText.textContent='';
  status.textContent='Préparation du projet';
  let failedStage=null;
  try{
    if(!window.forgeAPI?.createProject)throw new Error('Ouvre cet écran dans Forge.');
    const result=await window.forgeAPI.createProject(name);
    if(!result?.success||result.error){
      failedStage=result?.templateSetup?.stage;
      const raw=result?.error||'Création impossible.';
      throw new Error(raw);
    }
    status.textContent='Connexion à Roblox Studio';
    localStorage.setItem('forge-new-project-setup',JSON.stringify({path:result.path}));
    window.location.replace('workspace.html');
  }catch(error){
    status.textContent=friendlyError(error.message,failedStage);
    details.hidden=false;
    errorText.textContent=error.message;
    button.disabled=false;
  }
});
