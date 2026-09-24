import {readdir,readFile} from 'node:fs/promises';import {execFileSync} from 'node:child_process';
for(const folder of ['src','scripts','tests'])for(const name of await readdir(folder))if(/\.m?js$/.test(name))execFileSync(process.execPath,['--check',`${folder}/${name}`],{stdio:'inherit'});
const html=await readFile('index.html','utf8'),ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
if(new Set(ids).size!==ids.length)throw new Error('Duplicate HTML ids');
for(const name of ['app','input']){const s=await readFile(`src/${name}.js`,'utf8');for(const m of s.matchAll(/\$\('([^']+)'\)/g))if(!ids.includes(m[1]))throw new Error('Missing element '+m[1]);}
console.log('JavaScript syntax, duplicate ids and named UI bindings: OK');
