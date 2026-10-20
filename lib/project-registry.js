const fs=require('node:fs');
const {writeAtomic}=require('./protected-keys');
let notice = null;
function parse(file){const value=JSON.parse(fs.readFileSync(file,'utf8'));if(!Array.isArray(value)||value.some(p=>!p||typeof p.path!=='string'||typeof p.name!=='string'))throw Error('Registre invalide');return value;}
function load(file){
 if(!fs.existsSync(file)&&!fs.existsSync(file+'.bak'))return [];
 try{return parse(file);}catch{
  let recovered;try{recovered=parse(file+'.bak');}catch{throw Error('Registre de projets illisible. Les fichiers sont conservés ; restaure projects-registry.json ou sa copie .bak avant de continuer.');}
  if(fs.existsSync(file))fs.copyFileSync(file,file+'.corrupt-'+require('node:crypto').randomUUID());
  writeAtomic(file,recovered);notice = 'Le registre de projets a été restauré depuis sa sauvegarde. Le fichier endommagé a été conservé.';return recovered;
 }
}
function save(file,projects){
 if(!Array.isArray(projects))throw Error('Registre invalide');
 // A bad primary cannot be overwritten by a subsequent empty save.
 if(fs.existsSync(file)||fs.existsSync(file+'.bak')){const current=load(file);writeAtomic(file+'.bak',current);}
 else writeAtomic(file+'.bak',projects);
 writeAtomic(file,projects);
}
module.exports={load,save,takeNotice(){const value=notice;notice=null;return value;}};
