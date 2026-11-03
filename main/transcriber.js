// whisper.cpp tourne dans un processus séparé : la mémoire est rendue à la fin, l'arrêt est immédiat.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { app } = require('electron');

let job = null;

// Dans l'app installée, le moteur est celui du paquet, et lui seul ; l'environnement ne peut pas le changer.
function binary() {
  const name = process.platform === 'win32' ? 'whisper-cli.exe' : 'whisper-cli';
  if (app.isPackaged) {
    const packaged = path.join(process.resourcesPath, 'bin', name);
    if (!fs.existsSync(packaged)) throw new Error('Le moteur de transcription est absent de cette installation. Réinstallez l’application.');
    return packaged;
  }
  const candidates = [
    process.env.TRANSCRIRE_WHISPER_CLI,
    // En développement : là où scripts/preparer-moteur.mjs dépose le moteur vérifié.
    path.join(__dirname, '..', 'vendor', process.platform === 'win32' ? 'win' : 'mac', 'bin', name)
  ].filter(Boolean);
  const found = candidates.find(candidate => fs.existsSync(candidate));
  if (!found) throw new Error('Le moteur de transcription est absent de cette installation. Réinstallez l’application.');
  return found;
}

function threads() {
  return Math.max(2, Math.min(8, os.cpus().length - 1));
}

function seconds(stamp) {
  const [h, m, s] = stamp.replace(',', '.').split(':');
  return Number(h) * 3600 + Number(m) * 60 + Number(s);
}

function plainText(segments) {
  return segments.map(segment => segment.texte).join('\n') + '\n';
}

// Environnement réduit au nécessaire : rien de ce que l'utilisateur ou un autre programme aurait mis
// (GGML_*, DYLD_*, NODE_*…) n'atteint le moteur.
function environment() {
  const keep = process.platform === 'win32' ? ['SystemRoot', 'windir', 'TEMP', 'TMP', 'USERPROFILE'] : ['HOME', 'TMPDIR', 'LANG'];
  return Object.fromEntries(keep.filter(name => process.env[name]).map(name => [name, process.env[name]]));
}

// Le moteur tourne dans le dossier de l'enregistrement et reçoit des chemins relatifs : sous Windows, un
// titre ou un nom d'utilisateur hors de la page de code du système resterait sinon illisible pour lui.
function run({ audio, base, model, vad, onProgress }) {
  if (job) throw new Error('Une transcription est déjà en cours.');
  const cwd = path.dirname(audio), rel = file => path.relative(cwd, file);
  const args = ['-m', rel(model), '-f', rel(audio), '-l', 'fr', '-t', String(threads()), '-pp', '-oj', '-of', rel(base), '-np'];
  if (vad) args.push('--vad', '-vm', rel(vad));
  return new Promise((resolve, reject) => {
    const child = spawn(binary(), args, { cwd, env: environment(), stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
    job = { child, cancelled: false };
    let tail = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', text => {
      tail = (tail + text).slice(-4000);
      for (const match of text.matchAll(/progress\s*=\s*(\d+)%/g)) onProgress(Math.min(99, Number(match[1])));
    });
    child.on('error', error => { job = null; reject(error); });
    child.on('close', code => {
      const cancelled = job?.cancelled;
      job = null;
      if (cancelled) return reject(Object.assign(new Error('Transcription arrêtée. Vous pourrez la relancer.'), { cancelled: true }));
      if (code !== 0 || !fs.existsSync(base + '.json')) {
        const memory = /out of memory|failed to allocate|bad_alloc/i.test(tail);
        // Windows : 0xC0000135, une bibliothèque du moteur manque (runtime Visual C++ retiré ou bloqué).
        const missingLibrary = process.platform === 'win32' && (code === 0xC0000135 || code === -0x3FFFFECB);
        return reject(new Error(memory
          ? 'La mémoire de l’ordinateur ne suffit pas pour ce modèle. Fermez d’autres applications ou choisissez le modèle Rapide.'
          : missingLibrary
            ? 'Un composant Windows du moteur de transcription manque. Réinstallez Expect Transcription ; le fichier audio est conservé.'
            : 'La transcription n’a pas abouti. Le fichier audio est conservé ; vous pouvez réessayer.'));
      }
      const raw = JSON.parse(fs.readFileSync(base + '.json', 'utf8'));
      fs.rmSync(base + '.json', { force: true });
      const segments = (raw.transcription || [])
        .map(item => ({ debut: item.offsets ? item.offsets.from / 1000 : seconds(item.timestamps.from),
          fin: item.offsets ? item.offsets.to / 1000 : seconds(item.timestamps.to), texte: item.text.trim() }))
        .filter(segment => segment.texte);
      resolve({ segments, text: plainText(segments) });
    });
  });
}

function cancel() {
  if (!job) return false;
  job.cancelled = true;
  job.child.kill();
  return true;
}

function active() { return Boolean(job); }

module.exports = { run, cancel, active, plainText };
