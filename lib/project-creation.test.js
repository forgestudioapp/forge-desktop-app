const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
test('Studio probe rejects MCP tool errors and exposes both connection fields',async()=>{
 const source=fs.readFileSync(path.join(__dirname,'../main.js'),'utf8');const start=source.indexOf('async function isStudioConnected()');const end=source.indexOf("ipcMain.handle('check-plugin-connection'",start);
 const ctx={mcpInitialize:async()=>{},mcpSend:async(_method,args)=>{assert.equal(args.name,'get_place_info');return{content:[{text:'{"placeId":0}'}]}},mcpToolResultError:require('./file-sync').mcpToolResultError};vm.createContext(ctx);vm.runInContext(source.slice(start,end),ctx);
 assert.equal((await ctx.isStudioConnected()).open,true);
 ctx.mcpSend=async()=>({isError:true,content:[]});assert.equal((await ctx.isStudioConnected()).connected,false);
 ctx.mcpSend=async()=>({content:[{text:'{"error":"Plugin absent"}'}]});assert.equal((await ctx.isStudioConnected()).error,'Plugin absent');
});
