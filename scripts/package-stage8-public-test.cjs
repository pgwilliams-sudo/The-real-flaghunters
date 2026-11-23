const fs = require('node:fs');
const path = require('node:path');

const projectId = 'appgprj_6ae88c84e7388191804ce879ca000a02';
const testApi = 'https://script.google.com/macros/s/AKfycbzygKEHMYWvZPYZjdEjCcFaG4VkYqqxRTnjckv3Y053PDUbejl8YQ6-MCEaNjVyIiEP/exec';
const assets = ['v2.css', 'v2-local.js', 'v2-sync.js', 'v2-recovery.js',
  'v2-offline.js', 'v2.js', 'app-icon.PNG'];
const source = path.resolve(__dirname, '..');
const destination = path.resolve(process.argv[2] || 'work/stage8-public-test');
const staticDirectory = path.join(destination, 'dist');
const manifestDirectory = path.join(destination, '.openai');

if (fs.existsSync(destination) && fs.readdirSync(destination).length) {
  throw Error('Use an empty Stage 8 package directory.');
}

const entry = fs.readFileSync(path.join(source, 'index.html'), 'utf8');
const worker = fs.readFileSync(path.join(source, 'v2-app-sw.js'), 'utf8');
const apiPlaceholder = 'data-v2-fixed-test-api=""';
const workerVersion = "const VERSION='stage8-dev-v1';";
if (entry.split(apiPlaceholder).length !== 2 || worker.split(workerVersion).length !== 2) {
  throw Error('Stage 8 entry binding or worker version marker is missing or ambiguous.');
}

fs.mkdirSync(staticDirectory, { recursive: true });
fs.mkdirSync(manifestDirectory);
for (const asset of assets) {
  fs.copyFileSync(path.join(source, asset), path.join(staticDirectory, asset));
}
fs.writeFileSync(path.join(staticDirectory, 'index.html'),
  entry.replace(apiPlaceholder, `data-v2-fixed-test-api="${testApi}"`));
fs.writeFileSync(path.join(staticDirectory, 'v2-app-sw.js'),
  worker.replace(workerVersion, "const VERSION='stage8-public-v1';"));
fs.writeFileSync(path.join(manifestDirectory, 'hosting.json'),
  JSON.stringify({ project_id: projectId, static: { directory: 'dist' } }, null, 2) + '\n');
console.log('Packaged Stage 8 for the isolated test Site. No hosting actions were performed.');
