// Zero-dependency static deployment / one-file distribution builder.
import {readFile,writeFile,mkdir,cp,rm} from 'node:fs/promises';
const root=new URL('../',import.meta.url),dist=new URL('../dist/',import.meta.url);
await rm(dist,{recursive:true,force:true});await mkdir(dist,{recursive:true});
for(const name of ['index.html','style.css','src','models','ar','NOTICE.md','LICENSE'])await cp(new URL(name,root),new URL(name,dist),{recursive:true});
await writeFile(new URL('.nojekyll',dist),'');
let combined="window.MOTRI_SINGLE_FILE=true;\nimport * as THREE from 'three';\nimport * as CANNON from 'cannon-es';\nimport { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';\nimport { DecalGeometry } from 'three/addons/geometries/DecalGeometry.js';\n";
for(const name of ['core','vehicle','visuals','world','gmc','tripo','models','choice','autopilot','flowers','paint','decor','input','app']) {
 const source=await readFile(new URL('src/'+name+'.js',root),'utf8');
 const names=[...source.matchAll(/^export\s+(?:async\s+)?(?:function|class|const)\s+(\w+)/gm)].map(m=>m[1]);
 const body=source.replace(/^import\s+[^;]+;\s*$/gm,'').replace(/^export\s+/gm,'');
 combined+=`\nconst {${names.join(',')}} = (()=>{\n${body}\nreturn {${names.join(',')}};\n})();\n`;
}
combined+=`try { await boot(); } catch(e) {console.error(e);document.getElementById('fatal').hidden=false;document.getElementById('fatalText').textContent=e.message;}\n`;
let html=await readFile(new URL('index.html',root),'utf8');
const css=await readFile(new URL('style.css',root),'utf8');
html=html.replace('<link rel="stylesheet" href="style.css">',()=>'<style>'+css+'</style>');
html=html.replace(/<script id="bootstrap" type="module">[\s\S]*?<\/script>/,()=>'<script type="module">\n'+combined.replaceAll('</script','<\\/script')+'\n</script>');
html=html.replace('</body>',`<script>window.addEventListener('error',function(e){document.getElementById('loadState').textContent='تعذر التحميل: '+e.message});setTimeout(function(){if(document.getElementById('start').disabled)document.getElementById('loadState').textContent='لم يكتمل تحميل المكتبات. افتح الصفحة عبر HTTPS وتحقق من الاتصال.';},20000);</script></body>`);
const notices=await readFile(new URL('NOTICE.md',root),'utf8'),license=await readFile(new URL('LICENSE',root),'utf8');
html=html.replace('<!doctype html>',()=> '<!doctype html>\n<!--\n'+(license+'\n'+notices).replaceAll('--','- -')+'\n-->');
await writeFile(new URL('../motri-single.html',import.meta.url),html);
console.log('Static site: dist/ (includes GMC); one-file variant uses the procedural fallback and needs CDN connectivity.');
