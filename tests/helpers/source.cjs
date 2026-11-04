const fs=require('node:fs');
const path=require('node:path');
module.exports=function(){
 const root=path.resolve(__dirname,'../../src');
 const html=fs.readFileSync(path.join(root,'app.html'),'utf8');
 return [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)].map(([,attrs,body])=>{
   const src=attrs.match(/src="([^"]+)"/);
   if(!src)return body;
   if(/^https?:/.test(src[1]))return '';
   return fs.readFileSync(path.resolve(root,src[1]),'utf8');
 }).join('\n');
};
