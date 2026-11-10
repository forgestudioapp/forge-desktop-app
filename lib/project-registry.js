const fs=require('node:fs');
const {writeAtomic}=require('./protected-keys');
const {canonicalProjectPath,linkedPlaceId}=require('./project-place-link');
const path=require('node:path');
let notice = null;
function parse(file){const value=JSON.parse(fs.readFileSync(file,'utf8'));if(!Array.isArray(value)||value.some(p=>!p||typeof p.path!=='string'||typeof p.name!=='string'))throw Error('Registre invalide');return value;}
function mergeProjects(projects){
 const byPath=new Map();
 for(const item of projects){
  const key=canonicalProjectPath(item.path);
  if(!key)throw Error('Chemin de projet invalide');
  const existing=byPath.get(key);
  if(!existing){byPath.set(key,{...item});continue;}
  const preferred=linkedPlaceId(item)&&!linkedPlaceId(existing)?item:existing;
  const other=preferred===item?existing:item;
  const merged={...other,...preferred};
  for(const [field,value] of Object.entries(other))if((merged[field]===null||merged[field]===undefined||merged[field]==='')&&value!==null&&value!==undefined)merged[field]=value;
  // A conflicting legacy link is retained in the migration archive, never silently discarded.
  if(!merged.createdAt||(other.createdAt&&other.createdAt<merged.createdAt))merged.createdAt=other.createdAt;
  try{merged.path=fs.realpathSync.native(item.path);}catch(_){try{merged.path=fs.realpathSync.native(existing.path);}catch(_){merged.path=preferred.path;}}
  byPath.set(key,merged);
 }
 return [...byPath.values()];
}
function migrate(file,projects){
 const merged=mergeProjects(projects);
 if(merged.length===projects.length)return merged;
 const archive=path.join(path.dirname(file),`projects-registry.pre-dedup-${require('node:crypto').randomUUID()}.json`);
 writeAtomic(archive,projects);
 writeAtomic(file+'.bak',projects);
 writeAtomic(file,merged);
 notice=`${projects.length-merged.length} entrée(s) en double fusionnée(s). Le registre original a été conservé dans ${path.basename(archive)}.`;
 return merged;
}
function load(file){
 if(!fs.existsSync(file)&&!fs.existsSync(file+'.bak'))return [];
 let projects;
 try{projects=parse(file);}catch{
  try{projects=parse(file+'.bak');}catch{throw Error('Registre de projets illisible. Les fichiers sont conservés ; restaure projects-registry.json ou sa copie .bak avant de continuer.');}
  if(fs.existsSync(file))fs.copyFileSync(file,file+'.corrupt-'+require('node:crypto').randomUUID());
  writeAtomic(file,projects);notice = 'Le registre de projets a été restauré depuis sa sauvegarde. Le fichier endommagé a été conservé.';
 }
 return migrate(file,projects);
}
function save(file,projects){
 if(!Array.isArray(projects))throw Error('Registre invalide');
 const merged=mergeProjects(projects);
 if(merged.length!==projects.length){
  const archive=path.join(path.dirname(file),`projects-registry.pre-dedup-${require('node:crypto').randomUUID()}.json`);
  writeAtomic(archive,projects);
  notice=`${projects.length-merged.length} entrée(s) en double fusionnée(s). Le registre original a été conservé dans ${path.basename(archive)}.`;
 }
 // A bad primary cannot be overwritten by a subsequent empty save.
 if(fs.existsSync(file)||fs.existsSync(file+'.bak')){const current=load(file);writeAtomic(file+'.bak',current);}
 else writeAtomic(file+'.bak',projects);
 writeAtomic(file,merged);
}
module.exports={load,save,mergeProjects,takeNotice(){const value=notice;notice=null;return value;}};
