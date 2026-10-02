const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const config = require('../desktop/steam-config.json');
const appId = Number(config.appId);
const dll = path.join(root, 'steamworks_sdk/redistributable_bin/win64/steam_api64.dll');
const problems = [];
if (!Number.isSafeInteger(appId) || appId < 1 || appId > 0xffffffff) problems.push('Set appId in desktop/steam-config.json to your Steam App ID.');
if (appId === 480) problems.push('App ID 480 is for development only. Set your own App ID before making a Steam release.');
if (!fs.existsSync(dll)) problems.push('Copy the SDK runtime to steamworks_sdk/redistributable_bin/win64/steam_api64.dll.');
if (problems.length) { console.error(problems.join('\n')); process.exitCode = 1; }
else console.log(`Steam release configuration is ready for App ID ${appId}. Run the two-account checklist in docs/steam-coop.md before publishing.`);
