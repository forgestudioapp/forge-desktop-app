// Standalone: copied into the project so every supported CLI can run it locally.
const fs=require('node:fs'),path=require('node:path');
function queryContext(root,query,offset=0,limit=5){
  if(typeof query!=='string'||query.trim().length<2||query.length>200)throw Error('Recherche : 2 à 200 caractères requis.');
  if(!Number.isInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>10)throw Error('Pagination invalide.');
  root=fs.realpathSync(root);const index=path.join(root,'.forge-context','files.ndjson');
  if(fs.statSync(index).size>32*1024*1024)throw Error('Index trop volumineux.');
  const [header,...rows]=fs.readFileSync(index,'utf8').trim().split('\n').filter(line=>line.trim()).map(line=>JSON.parse(line));
  if(header.version!==1||path.resolve(header.root)!==root)throw Error('Index d’un autre projet ou version inconnue.');
  const needle=query.toLowerCase(),matches=[],stale=[];
  for(const row of rows.slice(0,5000)){
    if(typeof row.path!=='string'||!row.path.startsWith('src/'))continue;
    const file=path.resolve(root,row.path),relative=path.relative(root,file);
    if(relative.startsWith('..')||path.isAbsolute(relative))continue;
    let stat;try{const resolved=fs.realpathSync(file);if(path.relative(root,resolved).startsWith('..'))continue;stat=fs.statSync(resolved);if(!stat.isFile())continue;}catch{stale.push(row.path);continue;}
    const fresh=`${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}:${stat.ino}`===row.signature;
    if(!fresh)stale.push(row.path);
    const symbols=(row.symbols||[]).filter(s=>typeof s.name==='string'&&s.name.toLowerCase().includes(needle));
    if(row.path.toLowerCase().includes(needle)||symbols.length)matches.push({path:row.path,fresh,symbols:symbols.slice(0,10),bytes:stat.size});
  }
  const results=matches.slice(offset,offset+limit).map(match=>{
    if(match.bytes>256*1024)return {...match,note:'Fichier trop volumineux : lecture ciblée requise.'};
    const lines=fs.readFileSync(path.join(root,match.path),'utf8').split('\n');
    const center=match.fresh?(match.symbols[0]?.line||1):1,start=Math.max(1,center-5),end=Math.min(lines.length,start+29);
    const excerpt=lines.slice(start-1,end).map((line,i)=>`${start+i}: ${line}`).join('\n');
    return {...match,startLine:start,endLine:end,excerpt:excerpt.slice(0,4000),excerptTruncated:excerpt.length>4000};
  });
  return {query,scope:header.scope,approximate:true,incomplete:Boolean(header.incomplete),staleCount:stale.length,stalePaths:stale.slice(0,10),totalMatches:matches.length,results,nextOffset:offset+limit<matches.length?offset+limit:null,note:'Vérifie le fichier et ses instructions avant modification. Une absence de résultat ne prouve pas une absence de code ; utilise rg si l’index est incomplet ou périmé.'};
}
if(require.main===module){try{const args=process.argv.slice(2),get=(name,def)=>{const i=args.indexOf(name);return i<0?def:args[i+1];};console.log(JSON.stringify(queryContext(process.cwd(),get('--query',''),Number(get('--offset',0)),Number(get('--limit',5)))));}catch(error){console.error(JSON.stringify({error:error.message}));process.exitCode=1;}}
module.exports={queryContext};
