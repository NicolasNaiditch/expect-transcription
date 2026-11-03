// Les enregistrements sont des dossiers lisibles dans Documents/Expect Transcription : rien n'est caché.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { app, shell } = require('electron');

const INFO = 'infos.json';
const FILES = { video: 'enregistrement.webm', audio: 'audio-16k.wav', json: 'transcription.json', text: 'transcription.txt' };
const FOLDER = 'Expect Transcription';
// Fichiers qu'on peut déposer. Tous passent par l'interface (décodeurs de Chromium, isolés) qui en écrit
// le WAV 16 kHz : le moteur ne lit jamais un fichier venu d'ailleurs. Les types servent aussi à la lecture.
const IMPORTS = {
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.flac': 'audio/flac', '.ogg': 'audio/ogg', '.opus': 'audio/ogg',
  '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm'
};
const VIDEO = new Set(['.mp4', '.mov', '.webm']);
// Premiers octets attendus pour chaque type : un fichier renommé n'entre pas.
const SIGNATURES = {
  '.mp3': head => head.startsWith('ID3') || (head.charCodeAt(0) === 0xff && (head.charCodeAt(1) & 0xe0) === 0xe0),
  '.wav': head => head.startsWith('RIFF') && head.slice(8, 12) === 'WAVE',
  '.flac': head => head.startsWith('fLaC'),
  '.ogg': head => head.startsWith('OggS'), '.opus': head => head.startsWith('OggS'),
  '.m4a': head => head.slice(4, 8) === 'ftyp', '.mp4': head => head.slice(4, 8) === 'ftyp', '.mov': head => ['ftyp', 'moov', 'mdat', 'wide', 'free'].includes(head.slice(4, 8)),
  '.webm': head => head.startsWith('\x1a\x45\xdf\xa3'),
  '.aac': head => head.startsWith('ID3') || (head.charCodeAt(0) === 0xff && (head.charCodeAt(1) & 0xf6) === 0xf0)
};

function root() {
  const folder = path.join(app.getPath('documents'), FOLDER);
  fs.mkdirSync(folder, { recursive: true });
  return folder;
}

// Version 0.1 : l'app s'appelait Transcrire et rangeait tout dans Documents/Transcrire. Le dossier est
// renommé une fois, s'il est seul et s'il vient bien de l'app (un enregistrement avec son infos.json) ;
// jamais fusionné ni écrasé.
function migrate() {
  const old = path.join(app.getPath('documents'), 'Transcrire'), current = path.join(app.getPath('documents'), FOLDER);
  if (!fs.existsSync(old) || fs.existsSync(current)) return;
  try {
    const ours = fs.readdirSync(old, { withFileTypes: true }).some(entry => entry.isDirectory() && fs.existsSync(path.join(old, entry.name, INFO)));
    if (ours) fs.renameSync(old, current);
  } catch {}
}

// Documents est souvent synchronisé (OneDrive sous Windows, iCloud sur Mac) : les fichiers partent alors
// dans un nuage. On ne peut pas l'empêcher d'ici, mais on le dit.
function synchro() {
  const documents = app.getPath('documents');
  let real = documents;
  try { real = fs.realpathSync(documents); } catch {}
  if (/onedrive/i.test(real)) return 'OneDrive';
  if (/Mobile Documents|CloudDocs/i.test(real) || (process.platform === 'darwin' && fs.existsSync(path.join(os.homedir(), 'Library', 'Mobile Documents', 'com~apple~CloudDocs', 'Documents')))) return 'iCloud';
  return null;
}

// Un identifiant est le nom d'un dossier direct de la bibliothèque, jamais un chemin.
function folderOf(id) {
  if (typeof id !== 'string' || !id || id !== path.basename(id) || id.startsWith('.')) throw new Error('Enregistrement inconnu.');
  const folder = path.join(root(), id);
  if (!fs.existsSync(path.join(folder, INFO))) throw new Error('Enregistrement introuvable : il a peut-être été déplacé ou supprimé.');
  return folder;
}

function readInfo(folder) {
  return JSON.parse(fs.readFileSync(path.join(folder, INFO), 'utf8'));
}

function writeInfo(folder, value) {
  const target = path.join(folder, INFO), temporary = target + '.tmp';
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n');
  fs.renameSync(temporary, target);
  return value;
}

function slug(title) {
  return title.replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) || 'Enregistrement';
}

function stamp(date) {
  const pad = value => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}h${pad(date.getMinutes())}`;
}

function create({ title, source, sounds, image = true, origine = 'enregistrement', extra = {} }) {
  const now = new Date();
  const base = `${stamp(now)} — ${slug(title)}`;
  let id = base;
  for (let index = 2; fs.existsSync(path.join(root(), id)); index += 1) id = `${base} (${index})`;
  const folder = path.join(root(), id);
  fs.mkdirSync(folder);
  return writeInfo(folder, { id, titre: title, cree: now.toISOString(), etat: 'enregistrement', origine, source, sons: sounds, image, duree_s: 0, ...extra });
}

function size(file) {
  try { return fs.statSync(file).size; } catch { return 0; }
}

function describe(folder) {
  const info = readInfo(folder);
  if (typeof info.cree !== 'string' || typeof info.titre !== 'string') throw new Error('infos.json incomplet');
  const files = Object.fromEntries(Object.entries(FILES).map(([key, name]) => [key, size(path.join(folder, name))]));
  if (info.fichier_source) files.source = size(path.join(folder, info.fichier_source));
  // Avant la version 0.2, toute capture gardait l'image.
  return { origine: 'enregistrement', image: true, ...info, dossier: folder, fichiers: files, octets: Object.values(files).reduce((a, b) => a + b, 0) };
}

// Un dossier abîmé (infos.json illisible ou incomplet) est ignoré, jamais bloquant.
function list() {
  return fs.readdirSync(root(), { withFileTypes: true })
    .filter(entry => entry.isDirectory() && !entry.name.startsWith('.') && fs.existsSync(path.join(root(), entry.name, INFO)))
    .map(entry => { try { return describe(path.join(root(), entry.name)); } catch { return null; } })
    .filter(Boolean)
    .sort((a, b) => b.cree.localeCompare(a.cree));
}

function get(id) { return describe(folderOf(id)); }

function update(id, changes) {
  const folder = folderOf(id);
  return writeInfo(folder, { ...readInfo(folder), ...changes });
}

function file(id, key) {
  const folder = folderOf(id);
  if (key === 'source') {
    // Le nom vient d'infos.json : seul un « source.<extension connue> » du dossier est accepté.
    const name = readInfo(folder).fichier_source;
    if (typeof name !== 'string' || !/^source\.[a-z0-9]{2,4}$/.test(name) || !IMPORTS[path.extname(name)]) throw new Error('Fichier inconnu.');
    return path.join(folder, name);
  }
  if (!FILES[key]) throw new Error('Fichier inconnu.');
  return path.join(folder, FILES[key]);
}


// Ce que lit le moteur : toujours le WAV 16 kHz écrit par l'app elle-même.
function forEngine(id) {
  const wav = file(id, 'audio');
  if (size(wav) <= 44) throw new Error('Le son de cet enregistrement n’est pas prêt. Pour un fichier déposé, déposez-le de nouveau.');
  return wav;
}

function transcript(id) {
  const target = file(id, 'json');
  return fs.existsSync(target) ? JSON.parse(fs.readFileSync(target, 'utf8')) : null;
}

// Un fichier déposé est copié dans son dossier : l'original ne bouge pas. Le chemin vient de la fenêtre :
// fichier local seulement (pas de partage réseau), réel, et dont les premiers octets disent le bon type.
function importFile(chemin) {
  if (typeof chemin !== 'string' || !path.isAbsolute(chemin) || /^(\\\\|\/\/)/.test(chemin)) throw new Error('Ce fichier n’est pas sur cet ordinateur. Copiez-le d’abord dans un dossier local.');
  let source;
  try { source = fs.realpathSync(chemin); } catch { throw new Error('Fichier introuvable.'); }
  const extension = path.extname(source).toLowerCase();
  if (!IMPORTS[extension]) throw new Error('Ce type de fichier n’est pas pris en charge. Formats acceptés : MP3, M4A, WAV, MP4, MOV, WEBM, OGG, OPUS, FLAC, AAC.');
  const stats = fs.statSync(source);
  if (!stats.isFile() || !stats.size) throw new Error('Ce fichier est vide ou illisible.');
  const head = Buffer.alloc(12), handle = fs.openSync(source, 'r');
  try { fs.readSync(handle, head, 0, 12, 0); } finally { fs.closeSync(handle); }
  if (!SIGNATURES[extension](head.toString('latin1'))) throw new Error('Ce fichier ne ressemble pas à un fichier ' + extension.slice(1).toUpperCase() + ' : son contenu ne correspond pas à son extension.');
  const title = path.basename(source, path.extname(source)).slice(0, 120) || 'Fichier';
  const info = create({ title, source: 'fichier', sounds: null, image: VIDEO.has(extension), origine: 'fichier',
    extra: { fichier_source: 'source' + extension, nom_origine: path.basename(source), etat: 'preparation', duree_s: 0 } });
  try {
    fs.copyFileSync(source, path.join(folderOf(info.id), info.fichier_source));
  } catch (error) {
    shell.trashItem(folderOf(info.id)).catch(() => {});
    throw new Error('La copie du fichier a échoué : ' + (error.code === 'ENOSPC' ? 'place insuffisante sur le disque.' : 'le fichier n’a pas pu être lu.'));
  }
  return get(info.id);
}

// Recherche dans les textes : sans accents ni casse, avec un extrait autour de la première occurrence.
function fold(value) {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function search(query) {
  const needle = fold(String(query || '').trim());
  if (needle.length < 2) return [];
  const found = [];
  for (const item of list()) {
    const target = path.join(item.dossier, FILES.text);
    if (!fs.existsSync(target)) continue;
    const text = fs.readFileSync(target, 'utf8'), folded = fold(text);
    const at = folded.indexOf(needle);
    if (at < 0) continue;
    const start = Math.max(0, at - 60), end = Math.min(text.length, at + needle.length + 80);
    found.push({ id: item.id, extrait: (start ? '…' : '') + text.slice(start, end).replace(/\s+/g, ' ').trim() + (end < text.length ? '…' : '') });
  }
  return found;
}

// Profil du son pour le lecteur : niveau moyen de chaque tranche du WAV, lu par blocs.
function peaks(id, count = 600) {
  const wav = file(id, 'audio');
  const total = Math.floor((size(wav) - 44) / 2);
  if (total < count) return [];
  const per = Math.floor(total / count), handle = fs.openSync(wav, 'r'), buffer = Buffer.alloc(per * 2), values = [];
  try {
    for (let index = 0; index < count; index += 1) {
      fs.readSync(handle, buffer, 0, buffer.length, 44 + index * per * 2);
      let sum = 0;
      for (let offset = 0; offset < buffer.length; offset += 8) { const sample = buffer.readInt16LE(offset) / 32768; sum += sample * sample; }
      values.push(Math.sqrt(sum / (buffer.length / 8)));
    }
  } finally { fs.closeSync(handle); }
  const top = Math.max(...values, 1e-4);
  return values.map(value => Math.round(Math.min(1, value / top) * 100) / 100);
}

// Corbeille du système : récupérable, jamais un effacement définitif.
async function trash(id) {
  await shell.trashItem(folderOf(id));
}

function reveal(id) {
  const folder = folderOf(id);
  const info = readInfo(folder);
  const shown = [FILES.video, info.fichier_source, FILES.audio].filter(Boolean).map(name => path.join(folder, name)).find(fs.existsSync);
  shell.showItemInFolder(shown || folder);
}

// Après un arrêt brutal : l'en-tête WAV reprend la taille réelle, l'état dit « interrompu ».
function repair(fixWav) {
  for (const item of list()) {
    if (!['enregistrement', 'finalisation', 'transcription', 'preparation'].includes(item.etat)) continue;
    try { repairOne(item, fixWav); } catch {}
  }
}

function repairOne(item, fixWav) {
  const folder = item.dossier;
  if (item.etat === 'preparation') {
    // Préparation d'un fichier déposé interrompue : le WAV partiel (dérivé) est retiré, la copie reste.
    fs.rmSync(path.join(folder, FILES.audio), { force: true });
    update(item.id, { etat: 'interrompu', note: 'La préparation du son a été interrompue. Déposez de nouveau le fichier pour la reprendre.' });
  } else if (item.etat !== 'transcription') {
    const samples = fixWav(path.join(folder, FILES.audio));
    update(item.id, { etat: 'interrompu', duree_s: Math.round(samples / 16000), note: 'Enregistrement arrêté de façon inattendue. Le fichier conservé peut être relu et transcrit.' });
  } else {
    update(item.id, { etat: 'enregistre', note: 'La transcription a été interrompue. Relancez-la quand vous voulez.' });
  }
}

module.exports = { root, migrate, synchro, create, list, get, update, file, forEngine, transcript, importFile, search, peaks, trash, reveal, repair, FILES, IMPORTS };
