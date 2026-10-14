const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const {attachWindowNavigation,navigationKind}=require('./window-navigation');
test('internal popup links navigate the existing window; web links leave Forge',()=>{
 const root=path.resolve(__dirname,'..'),external=[],internal=[];let open,navigate;
 const win={loadURL:url=>internal.push(url),webContents:{setWindowOpenHandler:fn=>open=fn,on:(_,fn)=>navigate=fn}};
 attachWindowNavigation(win,{root,openExternal:url=>external.push(url)});
 const local=pathToFileURL(path.join(root,'project-create.html')).href;
 assert.equal(open({url:local}).action,'deny');assert.deepEqual(internal,[local]);
 assert.equal(open({url:'https://example.com/docs'}).action,'deny');assert.equal(external.length,1);
 let prevented=false;navigate({preventDefault:()=>prevented=true},'https://example.com/docs');assert.equal(prevented,true);
 assert.equal(navigationKind(pathToFileURL(path.join(root,'../private.html')).href,root),'deny');
 assert.equal(open({url:'javascript:alert(1)'}).action,'deny');assert.equal(internal.length,1);
});
