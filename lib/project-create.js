'use strict';
const en=localStorage.getItem('forge_lang')==='en',tr=(fr,eng)=>en?eng:fr;
document.documentElement.lang=en?'en':'fr';document.querySelectorAll('[data-fr]').forEach(e=>e.textContent=tr(e.dataset.fr,e.dataset.en));
const input=document.getElementById('projectNameInput'),button=document.getElementById('createBtn'),status=document.getElementById('creationStatus');
input.placeholder=tr('Mon nouveau jeu','My new game');
const slug=name=>name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,80);
input.addEventListener('input',()=>{document.getElementById('folderHint').textContent=tr('Nom du dossier : ','Folder name: ')+slug(input.value);});
document.getElementById('createForm').addEventListener('submit',async event=>{
 event.preventDefault();if(button.disabled)return;const name=slug(input.value);if(!name){status.textContent=tr('Choisis un nom contenant des lettres ou des chiffres.','Choose a name with letters or numbers.');return;}
 button.disabled=true;status.textContent=tr('Création des fichiers locaux…','Creating local files…');status.className='';
 try{if(!window.forgeAPI?.createProject)throw new Error(tr('Ouvre cet écran dans Forge.','Open this screen in Forge.'));const result=await window.forgeAPI.createProject(name);if(!result?.path||result.error)throw new Error(result?.error||tr('Création impossible.','Creation failed.'));
 status.textContent=tr('Projet local prêt. Aucun envoi vers Roblox n’a été effectué.','Local project ready. Nothing has been sent to Roblox.');document.getElementById('createdActions').hidden=false;input.disabled=true;button.textContent=tr('Projet créé','Project created');
 }catch(error){status.textContent=error.message;status.className='error-text';button.disabled=false;}
});
