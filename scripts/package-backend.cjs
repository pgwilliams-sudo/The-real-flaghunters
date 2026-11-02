// Production/source packaging is deliberately an exact allowlist, never a glob.
const fs=require('node:fs'),path=require('node:path');
const destination=path.resolve(process.argv[2]||'work/backend-package');
if(fs.existsSync(destination)&&fs.readdirSync(destination).length)throw Error('Use an empty output directory');
fs.mkdirSync(destination,{recursive:true});
for(const name of ['Code.gs','Phase1.gs'])fs.copyFileSync(path.join(__dirname,'../backend',name),path.join(destination,name));
console.log('Packaged Code.gs and Phase1.gs only; no development utilities included.');
