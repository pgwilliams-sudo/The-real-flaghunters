const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const [output, api, workbook] = process.argv.slice(2);
const projectId = 'appgprj_6b05660b49cc819183c9853a0a27a161';
const approvedApiHash = 'd74758847c2f3f8c79776e1287274abf42406515c2e9654e7c4a00b02b540b53';
const approvedWorkbookHash = '44def489d2304ccfce9db9db019ad03557bd0cf8d9faf9c4a4a2e4142bdc25a4';
const workerVersion = 'v2-live-stage47c-v2';
const assets = ['index.html', 'v2.css', 'v2-local.js', 'v2-sync.js', 'v2-recovery.js',
  'v2-offline.js', 'v2.js', 'app-icon.PNG', 'v2-app-sw.js'];
const digest = value => createHash('sha256').update(value || '').digest('hex');
if (!output || digest(api) !== approvedApiHash || digest(workbook) !== approvedWorkbookHash) {
  throw Error('Pass an empty output directory, the approved live API URL and the approved live workbook ID.');
}

const source = path.resolve(__dirname, '..');
const destination = path.resolve(output);
if (fs.existsSync(destination) && fs.readdirSync(destination).length) {
  throw Error('Use an empty Stage 47C package directory.');
}
const entry = fs.readFileSync(path.join(source, 'index.html'), 'utf8');
const worker = fs.readFileSync(path.join(source, 'v2-app-sw.js'), 'utf8');
const apiPlaceholder = 'data-v2-fixed-test-api=""';
const workerMarker = /const VERSION='[a-z0-9-]+';/g;
if (entry.split(apiPlaceholder).length !== 2 || [...worker.matchAll(workerMarker)].length !== 1) {
  throw Error('The Site entry binding or service-worker version is missing or ambiguous.');
}
function replaceOnce(source, marker, value) {
  if (source.split(marker).length !== 2) throw Error('The live backend packaging marker is missing or ambiguous.');
  return source.replace(marker, value);
}
const code = fs.readFileSync(path.join(source, 'backend', 'Code.gs'), 'utf8');
const boundCode = replaceOnce(
  replaceOnce(code, "const SPREADSHEET_ID = 'REPLACE_WITH_SPREADSHEET_ID';",
    `const SPREADSHEET_ID = '${workbook}';`),
  "  const id = PropertiesService.getScriptProperties().getProperty('V2_SPREADSHEET_ID') || SPREADSHEET_ID;\n" +
  "  if (id === 'REPLACE_WITH_SPREADSHEET_ID') throw new Error('Configure a separate test spreadsheet first');",
  "  const id = PropertiesService.getScriptProperties().getProperty('V2_SPREADSHEET_ID');\n" +
  "  if (id !== SPREADSHEET_ID) throw new Error('Live workbook binding does not match the approved release');"
);
const phase1 = fs.readFileSync(path.join(source, 'backend', 'Phase1.gs'), 'utf8');
const testInitializer = /\/\*\* Explicit administrator-run initializer;[^\n]*\nfunction initializeV2TestSchema\(\) \{[\s\S]*?\n\}\n/g;
if ([...phase1.matchAll(testInitializer)].length !== 1) throw Error('The test initializer could not be removed safely.');
const livePhase1 = phase1.replace(testInitializer, '');

const dist = path.join(destination, 'dist');
const manifest = path.join(destination, '.openai');
fs.mkdirSync(dist, {recursive: true});
fs.mkdirSync(manifest);
for (const asset of assets.filter(name => name !== 'index.html' && name !== 'v2-app-sw.js')) {
  fs.copyFileSync(path.join(source, asset), path.join(dist, asset));
}
fs.writeFileSync(path.join(dist, 'index.html'),
  entry.replace(apiPlaceholder, `data-v2-fixed-test-api="${api}"`));
fs.writeFileSync(path.join(dist, 'v2-app-sw.js'),
  worker.replace(workerMarker, `const VERSION='${workerVersion}';`));
fs.writeFileSync(path.join(manifest, 'hosting.json'),
  JSON.stringify({project_id: projectId, static: {directory: 'dist'}}, null, 2) + '\n');
const backend = path.join(destination, 'backend');
fs.mkdirSync(backend);
fs.writeFileSync(path.join(backend, 'Code.gs'), boundCode);
fs.writeFileSync(path.join(backend, 'Phase1.gs'), livePhase1);
console.log('Prepared the Stage 47C static bundle and dedicated live backend locally.');
