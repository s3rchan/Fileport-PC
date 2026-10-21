const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
for(const gone of ['src/music.js','src/music-hub.js','src/musicport-protocol.js','src-tauri/src/musicport.rs']){
 assert.equal(fs.existsSync(path.join(root,gone)),false,'Retired component still present: '+gone);
}
for(const p of ['src/index.html','src/desktop.js','src/i18n.js','src/brand-v19.css','src-tauri/src/lib.rs']){
 assert.doesNotMatch(read(p),/MusicPort|FileportMusic|music-only|music-offer|data-view="music"|musicPortAdd/i,'Orphan music reference in '+p);
}
assert.match(read('src/app.js'),/Unsupported file metadata/);
assert.doesNotMatch(read('src/app.js'),/FileportMusicTransport|sendMusic\(/);
assert.match(read('src-tauri/src/github_update.rs'),/SignerCertificate\.Thumbprint/);
assert.match(read('package.json'),/"version": "1.9.6"/);
assert.match(read('README.md'),/Source version:\*\* v1\.9\.6/);
console.log('File-only Windows regression checks passed');
