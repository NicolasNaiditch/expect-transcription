// Processus principal sous Node, sur Mac comme sous Windows : node --test tests/principal.test.cjs
// Le substitut remplace toujours le vrai paquet `electron`, même installé dans node_modules.
const Module = require('node:module');
const stub = require('./stubs/electron');
const load = Module._load;
Module._load = function (request, ...rest) { return request === 'electron' ? stub : load.call(this, request, ...rest); };
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const test = require('node:test');
const electron = require('electron');
const recorder = require('../main/recorder');
const library = require('../main/library');
const models = require('../main/models');

test('un enregistrement coupé net garde un WAV lisible et passe « interrompu »', () => {
  const info = library.create({ title: 'Cours / coupé : test', source: 'ecran', sounds: { ordinateur: true, micro: true } });
  assert.ok(!info.id.includes('/') && info.id.includes('Cours'));
  recorder.start(info.id, library.file(info.id, 'video'), library.file(info.id, 'audio'));
  recorder.appendVideo(info.id, new Uint8Array([1, 2, 3]).buffer);
  recorder.appendAudio(info.id, new Int16Array(16000 * 3).buffer);
  // Pas de finish : on simule l'arrêt brutal puis le redémarrage.
  library.repair(recorder.fixWav);
  const item = library.get(info.id);
  assert.equal(item.etat, 'interrompu');
  assert.equal(item.duree_s, 3);
  const header = fs.readFileSync(library.file(info.id, 'audio')).subarray(0, 44);
  assert.equal(header.toString('ascii', 0, 4), 'RIFF');
  assert.equal(header.readUInt32LE(40), 16000 * 3 * 2);
  // Le processus « redémarré » n'existe pas ici : on ferme la session laissée ouverte par l'arrêt simulé.
  recorder.finish(info.id);
});

test('un identifiant qui sort de la bibliothèque est refusé', () => {
  assert.throws(() => library.get('../secret'), /inconnu/);
  assert.throws(() => library.file('..', 'video'), /inconnu/);
});

test('la corbeille déplace le dossier sans l’effacer', async () => {
  const info = library.create({ title: 'À jeter', source: 'fenetre', sounds: {} });
  await library.trash(info.id);
  assert.ok(electron.__trashed.some(item => item.endsWith(info.id) && fs.existsSync(item)));
  assert.ok(!library.list().some(item => item.id === info.id));
});

test('fichier déposé : copié, cherché dans le texte, profil sonore ; ancien dossier repris', () => {
  const documents = electron.app.getPath('documents');
  // Version 0.1 : un dossier Documents/Transcrire est renommé une fois, s'il est seul.
  const current = path.join(documents, 'Expect Transcription'), old = path.join(documents, 'Transcrire');
  const kept = fs.existsSync(current) ? current + '.essai' : null;
  if (kept) fs.renameSync(current, kept);
  fs.mkdirSync(path.join(old, 'ancien'), { recursive: true });
  fs.writeFileSync(path.join(old, 'ancien', 'infos.json'), '{}');
  library.migrate();
  assert.ok(fs.existsSync(path.join(current, 'ancien')) && !fs.existsSync(old));
  fs.rmSync(current, { recursive: true });
  if (kept) fs.renameSync(kept, current);
  const source = path.join(electron.__base, 'Mémo du jour.m4a');
  const m4a = Buffer.alloc(2048, 1);
  m4a.write('ftypM4A ', 4, 'latin1');
  fs.writeFileSync(source, m4a);
  const renamed = path.join(electron.__base, 'faux.mp3');
  fs.writeFileSync(renamed, Buffer.alloc(64, 7));
  fs.writeFileSync(path.join(electron.__base, 'notes.docx'), 'x');
  assert.throws(() => library.importFile(path.join(electron.__base, 'notes.docx')), /pas pris en charge/);
  assert.throws(() => library.importFile(renamed), /ne correspond pas à son extension/);
  assert.throws(() => library.importFile('\\\\serveur\\partage\\cours.mp3'), /pas sur cet ordinateur/);
  assert.throws(() => library.importFile('relatif/cours.mp3'), /pas sur cet ordinateur/);
  const info = library.importFile(source);
  assert.equal(info.etat, 'preparation');
  assert.equal(fs.readFileSync(library.file(info.id, 'source')).length, 2048);
  assert.equal(info.titre, 'Mémo du jour');
  recorder.start(info.id, null, library.file(info.id, 'audio'));
  const tone = new Int16Array(16000 * 2).map((_, i) => Math.round(8000 * Math.sin(i / 8) * (i < 16000 ? 1 : 0.2)));
  recorder.appendAudio(info.id, tone.buffer);
  recorder.finish(info.id);
  assert.equal(library.forEngine(info.id), library.file(info.id, 'audio'));
  const peaks = library.peaks(info.id, 10);
  assert.equal(peaks.length, 10);
  assert.ok(peaks[0] > peaks[9]);
  fs.writeFileSync(library.file(info.id, 'text'), 'Mémo du jour\n\nLa prévalence augmente quand la durée de la maladie s’allonge.\n');
  const found = library.search('PREVALENCE');
  assert.equal(found.length, 1);
  assert.match(found[0].extrait, /prévalence augmente/);
});

test('téléchargement : reprise par plages d’octets, empreinte vérifiée, fichier faux écarté', async () => {
  const payload = crypto.randomBytes(300_000), good = crypto.createHash('sha256').update(payload).digest('hex');
  const requests = [];
  const server = http.createServer((request, response) => {
    requests.push(request.headers.range || 'complet');
    const match = /bytes=(\d+)-/.exec(request.headers.range || '');
    const start = match ? Number(match[1]) : 0;
    response.writeHead(match ? 206 : 200, { 'Content-Length': payload.length - start, ...(match ? { 'Content-Range': `bytes ${start}-${payload.length - 1}/${payload.length}` } : {}) });
    response.end(payload.subarray(start));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
  const url = `http://127.0.0.1:${server.address().port}/modele.bin`;
  const vad = models.catalog.detection_parole, rapide = models.catalog.modeles[0];
  Object.assign(vad, { url, octets: payload.length, sha256: good, fichier: 'vad-test.bin' });
  Object.assign(rapide, { url, octets: payload.length, sha256: good, fichier: 'rapide-test.bin' });
  // Un fichier partiel existe déjà : seule la suite est demandée.
  const folder = (await models.status()).dossier;
  fs.writeFileSync(path.join(folder, 'rapide-test.bin.part'), payload.subarray(0, 100_000));
  const steps = [];
  const status = await models.download('rapide', progress => steps.push(progress.etape));
  assert.ok(requests.includes('bytes=100000-'), requests.join(','));
  assert.ok(status.modeles.find(model => model.id === 'rapide').installe);
  assert.ok(steps.includes('verification') && steps.at(-1) === 'installe');
  assert.ok(models.vadPath());
  // Une empreinte attendue différente : le fichier reçu est écarté, rien n'est installé.
  const precis = models.catalog.modeles[1];
  Object.assign(precis, { url, octets: payload.length, sha256: '0'.repeat(64), fichier: 'precis-test.bin' });
  await assert.rejects(models.download('precis', () => {}), /ne correspond pas/);
  assert.ok(!fs.existsSync(path.join(folder, 'precis-test.bin')) && !fs.existsSync(path.join(folder, 'precis-test.bin.part')));
  } finally { server.close(); }
});
