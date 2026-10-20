async function verifyTripo(key,fetch){
 try{
  const r=await fetch('https://api.tripo3d.ai/v2/openapi/user/balance',{headers:{Authorization:`Bearer ${key}`}},15000);
  if(r.status===401||r.status===403)return {valid:false,error:'Clé Tripo refusée. Vérifie les accès du compte.'};
  if(r.status===429)return {valid:false,error:'Limite Tripo atteinte. Réessaie plus tard.'};
  if(!r.ok)return {valid:false,error:'Service Tripo indisponible. Réessaie plus tard.'};
  const data=await r.json();
  if(data.code===0&&typeof data.data?.balance==='number'&&Number.isFinite(data.data.balance))return {valid:true};
  return {valid:false,error:'Réponse Tripo inattendue : clé non vérifiée.'};
 }catch{return {valid:false,error:'Connexion à Tripo impossible : clé non vérifiée.'};}
}
module.exports={verifyTripo};
