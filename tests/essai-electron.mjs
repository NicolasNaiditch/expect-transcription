// Essai dans le vrai Electron, sur des données fictives isolées (TRANSCRIRE_DONNEES), sans ouvrir le studio
// et sans réseau : reprise de la bibliothèque et des modèles de la version 0.1 (Transcrire), lecture par
// media://, transcription whisper.cpp, texte anonymisé, dépôt d'un M4A (conversion WebCodecs), d'un MP3
// (lu tel quel par le moteur) et, avec --long, d'une séance de deux heures (temps et mémoire).
//   node tests/essai-electron.mjs --donnees <dossier neuf> --audio <WAV fictif 16 kHz> --modeles <dossier des ggml vérifiés> --out <dossier> [--long <WAV long>]
// Mac seulement (afconvert, ffmpeg, ffprobe) ; playwright-core comme pour la recette navigateur.
// Angle mort : ni capture d'écran ou de son (autorisations et vrai bureau), ni paquet signé, ni Windows.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const app = path.resolve(import.meta.dirname, '..');
const args = process.argv.slice(2), get = name => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : null; };
const data = path.resolve(get('donnees')), out = path.resolve(get('out')), audio = path.resolve(get('audio')), models = path.resolve(get('modeles'));
const long = get('long') ? path.resolve(get('long')) : null;
if (fs.existsSync(data) && fs.readdirSync(data).length) throw new Error('Dossier de données non vide : en choisir un neuf.');
fs.mkdirSync(out, { recursive: true });
const catalog = JSON.parse(fs.readFileSync(path.join(app, 'modeles.json'), 'utf8'));
const small = catalog.modeles.find(model => model.id === 'rapide');

// Version 0.1 : un enregistrement dans Documents/Transcrire, les modèles dans …/Transcrire/modeles.
const id = '2026-11-02 15h00 — Essai fictif';
const oldFolder = path.join(data, 'Documents', 'Transcrire', id);
fs.mkdirSync(oldFolder, { recursive: true });
execFileSync('ffmpeg', ['-v', 'error', '-nostdin', '-t', '60', '-i', audio, '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', path.join(oldFolder, 'audio-16k.wav')]);
execFileSync('ffmpeg', ['-v', 'error', '-nostdin', '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=15', '-i', path.join(oldFolder, 'audio-16k.wav'), '-t', '60',
  '-c:v', 'libvpx', '-b:v', '600k', '-c:a', 'libopus', path.join(oldFolder, 'enregistrement.webm')]);
fs.writeFileSync(path.join(oldFolder, 'infos.json'), JSON.stringify({ id, titre: 'Essai fictif', cree: new Date().toISOString(), etat: 'enregistre', source: 'ecran', sons: { ordinateur: true, micro: true }, duree_s: 60 }, null, 2));
const oldModels = path.join(data, 'Transcrire', 'modeles');
fs.mkdirSync(oldModels, { recursive: true });
for (const item of [small, catalog.detection_parole]) {
  fs.copyFileSync(path.join(models, item.fichier), path.join(oldModels, item.fichier));
  fs.writeFileSync(path.join(oldModels, item.fichier + '.sha256'), item.sha256 + '\n');
}

// Fichiers à déposer : un M4A (AAC, comme un mémo vocal), un MP3, et la séance longue.
const media = path.join(data, 'à déposer');
fs.mkdirSync(media);
const m4a = path.join(media, 'Mémo vocal fictif.m4a'), mp3 = path.join(media, 'Interview fictive.mp3');
// L'encodeur AAC d'Apple (celui des mémos vocaux) veut un son à 44,1 kHz : on y passe d'abord.
const toAac = (input, output, rate) => {
  const wav = output + '.wav';
  execFileSync('ffmpeg', ['-v', 'error', '-nostdin', '-y', '-i', input, '-ar', '44100', '-ac', '2', wav]);
  execFileSync('afconvert', ['-f', 'm4af', '-d', 'aac', '-b', String(rate), wav, output]);
  fs.rmSync(wav);
};
toAac(audio, m4a, 96000);
execFileSync('ffmpeg', ['-v', 'error', '-nostdin', '-i', audio, '-c:a', 'libmp3lame', '-b:a', '64k', mp3]);
const seconds = file => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString());
let longM4a = null;
if (long) {
  const list = path.join(media, 'liste.txt'), wav = path.join(media, 'seance-2h.wav');
  const repeat = Math.ceil(7200 / seconds(long));
  fs.writeFileSync(list, Array.from({ length: repeat }, () => `file '${long.replace(/'/g, "'\\''")}'`).join('\n'));
  execFileSync('ffmpeg', ['-v', 'error', '-nostdin', '-f', 'concat', '-safe', '0', '-i', list, '-t', '7200', wav]);
  longM4a = path.join(media, 'Séance de deux heures.m4a');
  toAac(wav, longM4a, 96000);
  fs.rmSync(wav);
}

const { _electron } = await import(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const electron = await _electron.launch({
  executablePath: path.join(app, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'), args: [app], cwd: app,
  env: { ...process.env, TRANSCRIRE_DONNEES: data, TRANSCRIRE_PAGE: 'modeles' }
});
const page = await electron.firstWindow();
const checks = [], errors = [], measures = {};
const check = (ok, label, detail = '') => { checks.push({ ok: Boolean(ok), label, detail }); console.log(ok ? 'ok  ' : 'ÉCHEC', label, detail); };
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
await page.setViewportSize({ width: 1180, height: 820 });
await page.evaluate(() => localStorage.setItem('conditions', '1'));
if (await page.locator('#conditions[open]').count()) await page.click('#conditions-yes');

const library = path.join(data, 'Documents', 'Expect Transcription'), folder = path.join(library, id), modelDir = path.join(data, 'Application Support', 'modeles');
check(fs.existsSync(path.join(folder, 'infos.json')) && !fs.existsSync(path.join(data, 'Documents', 'Transcrire')), 'bibliothèque de la version 0.1 reprise sous Documents/Expect Transcription');
await page.waitForSelector('[data-model="rapide"]');
check(fs.existsSync(path.join(modelDir, small.fichier + '.sha256')) && await page.locator('[data-model="rapide"] [name="default-model"]').count() === 1, 'modèle déjà reçu repris, sans téléchargement');
const computer = await page.evaluate(() => ({ facts: document.querySelector('.computer-facts')?.textContent || '', advice: document.querySelector('.advice')?.textContent || '' }));
check(/Go/.test(computer.facts) && /cœurs/.test(computer.facts) && /utilisée par le moteur/.test(computer.facts) && /Précis/.test(computer.advice), 'mémoire, processeur, puce graphique lus et conseil donné', computer.facts.replace(/\s+/g, ' ').trim());
await page.screenshot({ path: path.join(out, 'electron-01-modeles.png') });

await page.evaluate(() => { location.hash = '#/enregistrements'; });
await page.waitForSelector('.record');
await page.click('.record-row');
await page.waitForSelector('#video');
await page.waitForFunction(() => document.querySelector('#video').readyState >= 1, null, { timeout: 15000 });
check(await page.evaluate(() => document.querySelector('#video').duration) > 55, 'vidéo de la version 0.1 lue par media://');
let started = Date.now();
await page.click('#transcribe');
await page.waitForSelector('#segments li', { timeout: 180000 });
check(await page.locator('#segments li').count() > 3, 'transcription whisper.cpp réelle', `${((Date.now() - started) / 1000).toFixed(1)} s pour 60 s de son`);
await page.click('[data-vue="anonyme"]');
const anon = await page.evaluate(() => ({ note: document.querySelector('.anon-note')?.textContent || '', ok: Boolean(document.querySelector('#segments.anonymous')) }));
check(anon.ok && /masqué/.test(anon.note), 'version anonymisée calculée sur une vraie transcription', anon.note.split('.')[0]);
await page.screenshot({ path: path.join(out, 'electron-02-anonymise.png') });

// Dépôt d'un fichier par le même chemin que la fenêtre : un M4A converti, puis un MP3 lu tel quel.
async function deposit(file) {
  await page.evaluate(() => { location.hash = '#/fichier'; });
  await page.waitForSelector('#file-input', { state: 'attached' });
  const start = Date.now();
  await page.setInputFiles('#file-input', file);
  await page.waitForURL(/termine$/, { timeout: 30 * 60000 });
  const elapsed = (Date.now() - start) / 1000;
  const recordId = decodeURIComponent(page.url().split('/enregistrement/')[1].replace(/\/termine$/, ''));
  return { elapsed, dir: path.join(library, recordId) };
}
const expected = seconds(audio);
const first = await deposit(m4a);
const wavBytes = fs.existsSync(path.join(first.dir, 'audio-16k.wav')) ? fs.statSync(path.join(first.dir, 'audio-16k.wav')).size - 44 : 0;
check(fs.existsSync(path.join(first.dir, 'source.m4a')) && Math.abs(wavBytes / 32000 - expected) < 0.5, 'M4A copié puis converti en WAV 16 kHz de la bonne durée', `${(wavBytes / 32000).toFixed(2)} s pour ${expected.toFixed(2)} s, en ${first.elapsed.toFixed(1)} s`);
await page.waitForSelector('#segments li', { timeout: 180000 });
check(await page.locator('#segments li').count() > 3, 'le M4A déposé est transcrit');
await page.screenshot({ path: path.join(out, 'electron-03-m4a-transcrit.png') });
const second = await deposit(mp3);
const mp3Bytes = fs.existsSync(path.join(second.dir, 'audio-16k.wav')) ? fs.statSync(path.join(second.dir, 'audio-16k.wav')).size - 44 : 0;
check(fs.existsSync(path.join(second.dir, 'source.mp3')) && Math.abs(mp3Bytes / 32000 - expected) < 0.6, 'MP3 copié puis préparé par l’app (le moteur ne lit que son WAV)', `${(mp3Bytes / 32000).toFixed(2)} s en ${second.elapsed.toFixed(1)} s`);
await page.waitForSelector('#segments li', { timeout: 180000 });
check(await page.locator('#segments li').count() > 3, 'le MP3 déposé est transcrit');

if (longM4a) {
  // Mémoire de toute l'app relevée pendant la conversion de la séance de deux heures.
  let peak = 0;
  const watch = setInterval(async () => {
    try { const total = await electron.evaluate(({ app }) => app.getAppMetrics().reduce((sum, item) => sum + item.memory.workingSetSize, 0)); peak = Math.max(peak, total); } catch {}
  }, 500);
  await page.evaluate(() => { localStorage.setItem('modele', 'rapide'); });
  const third = await deposit(longM4a);
  clearInterval(watch);
  const bytes = fs.statSync(path.join(third.dir, 'audio-16k.wav')).size - 44;
  measures.longue = { duree_s: bytes / 32000, conversion_s: third.elapsed, memoire_max_mo: Math.round(peak / 1024) };
  check(Math.abs(bytes / 32000 - 7200) < 2, 'séance de deux heures convertie en entier', `${(bytes / 32000 / 60).toFixed(1)} min en ${third.elapsed.toFixed(0)} s, mémoire max de l’app ${Math.round(peak / 1024)} Mo`);
  await page.click('#cancel-transcription').catch(() => {});
}

check(!errors.length, 'aucune erreur JavaScript', errors.join(' | '));
await electron.close();
const report = { portee: 'Electron 45.2.1 réel, données fictives isolées, sans réseau ; capture non exercée.', checks, measures, passed: checks.filter(item => item.ok).length, total: checks.length };
fs.writeFileSync(path.join(out, 'electron.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`${report.passed}/${report.total}`);
process.exit(report.passed === report.total ? 0 : 1);
