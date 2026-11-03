// Modèles de transcription : téléchargement explicite, reprise par plages d'octets, empreinte vérifiée.
// Après installation, tout fonctionne hors ligne ; aucun enregistrement ne quitte l'ordinateur.
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { app, net, shell } = require('electron');

const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'modeles.json'), 'utf8'));
let current = null;

function folder() {
  const value = path.join(app.getPath('userData'), 'modeles');
  // Version 0.1 (Transcrire) : modèles déjà reçus repris tels quels, pour ne pas les retélécharger.
  // Cherché à côté du dossier de l'app, jamais ailleurs : un essai à données isolées ne touche rien du vrai système.
  const old = path.join(path.dirname(app.getPath('userData')), 'Transcrire', 'modeles');
  if (!fs.existsSync(value) && fs.existsSync(old) && fs.readdirSync(old).some(name => /^ggml-.*\.bin\.sha256$/.test(name))) {
    fs.mkdirSync(path.dirname(value), { recursive: true });
    try { fs.renameSync(old, value); } catch {}
  }
  fs.mkdirSync(value, { recursive: true });
  return value;
}

function entry(id) {
  const model = id === catalog.detection_parole.id ? catalog.detection_parole : catalog.modeles.find(item => item.id === id);
  if (!model) throw new Error('Modèle inconnu.');
  return model;
}

function paths(model) {
  const final = path.join(folder(), model.fichier);
  return { final, part: final + '.part', marker: final + '.sha256' };
}

function size(file) {
  try { return fs.statSync(file).size; } catch { return 0; }
}

function installed(model) {
  const { final, marker } = paths(model);
  return size(final) === model.octets && fs.existsSync(marker) && fs.readFileSync(marker, 'utf8').trim() === model.sha256;
}

// Ce que l'ordinateur offre au moteur. Sur Mac à puce Apple, whisper.cpp calcule avec la puce graphique,
// qui partage la mémoire de l'ordinateur ; ailleurs (Windows, Mac Intel), le moteur livré calcule avec le
// processeur seul : la carte graphique est nommée, mais sa mémoire ne compte pas.
let gpuName = null;
async function graphics() {
  if (gpuName !== null) return gpuName;
  try {
    const info = await app.getGPUInfo('complete');
    const renderer = info?.auxAttributes?.glRenderer || '';
    // « ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11) » → « NVIDIA GeForce RTX 3060 »
    const inner = /ANGLE \(([^,]+),\s*([^,(]+)/.exec(renderer);
    gpuName = (inner ? inner[2] : renderer).replace(/ANGLE Metal Renderer:\s*/i, '').replace(/\s+(Direct3D|OpenGL|vs_|D3D).*$/i, '').trim();
  } catch { gpuName = ''; }
  return gpuName;
}

// Conseil tiré du banc du 2 novembre (ADR 0029) : Précis demande 1,3 Go avec la puce graphique d'un Mac,
// 1,5 Go sur processeur seul, où il prend environ 1,7 fois le temps de Rapide (1,0 Go).
function recommendation({ memoire_go, coeurs, puce_apple }) {
  if (puce_apple) {
    return memoire_go >= 8
      ? { id: 'precis', raison: `La puce de ce Mac calcule aussi la transcription, avec ses ${memoire_go} Go de mémoire partagée : Précis reste rapide et fait deux fois moins d’erreurs.` }
      : { id: 'rapide', raison: `Avec ${memoire_go} Go de mémoire, Rapide laisse de la place aux autres applications.` };
  }
  if (memoire_go < 8) return { id: 'rapide', raison: `Avec ${memoire_go} Go de mémoire, Rapide est le plus sûr : Précis demande environ 1,5 Go pendant la transcription et peut manquer de place.` };
  if (memoire_go >= 16 && coeurs >= 8) return { id: 'precis', raison: `${memoire_go} Go de mémoire et ${coeurs} cœurs de processeur : Précis tient sans peine. Il prend environ 1,7 fois le temps de Rapide, pour deux fois moins d’erreurs.` };
  return { id: 'rapide', raison: `Le moteur calcule ici avec le processeur (${coeurs} cœurs, ${memoire_go} Go de mémoire) : Rapide garde des temps raisonnables. Précis reste possible, environ 1,7 fois plus long.` };
}

async function computer() {
  const cpus = os.cpus();
  const value = {
    memoire_go: Math.round(os.totalmem() / 2 ** 30), coeurs: cpus.length,
    processeur: (cpus[0]?.model || '').replace(/\(R\)|\(TM\)|CPU|@.*$/gi, '').replace(/\s+/g, ' ').trim(),
    puce_apple: process.platform === 'darwin' && process.arch === 'arm64', plateforme: process.platform,
    carte_graphique: await graphics()
  };
  value.carte_utilisee = value.puce_apple;
  return { ...value, conseil: recommendation(value) };
}

async function status() {
  const ordinateur = await computer();
  return {
    dossier: folder(),
    recommande: ordinateur.conseil.id,
    ordinateur,
    memoire_go: ordinateur.memoire_go,
    telechargement: current ? { id: current.id, recu: current.received, total: current.total } : null,
    detection_parole: { ...catalog.detection_parole, installe: installed(catalog.detection_parole) },
    modeles: catalog.modeles.map(model => ({ ...model, installe: installed(model), partiel: size(paths(model).part) }))
  };
}

async function sha256(file) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

async function verifyAndPlace(model, source, onProgress) {
  onProgress({ id: model.id, etape: 'verification', recu: model.octets, total: model.octets });
  const { final, part, marker } = paths(model);
  if (size(source) !== model.octets || (await sha256(source)) !== model.sha256) {
    if (source === part) fs.rmSync(part, { force: true });
    throw new Error('Le fichier reçu ne correspond pas au modèle attendu. Il a été écarté ; relancez le téléchargement.');
  }
  if (source === part) fs.renameSync(part, final); else fs.copyFileSync(source, final);
  fs.writeFileSync(marker, model.sha256 + '\n');
}

async function freeSpace(bytes) {
  const stats = await fs.promises.statfs(folder());
  const available = stats.bavail * stats.bsize;
  if (available < bytes + 300 * 2 ** 20) {
    throw new Error(`Place insuffisante : il faut ${Math.ceil(bytes / 2 ** 20)} Mo libres, plus une marge de 300 Mo.`);
  }
}

async function fetchInto(model, onProgress, signal) {
  const { part } = paths(model);
  let offset = size(part);
  if (offset > model.octets) { fs.rmSync(part); offset = 0; }
  if (offset === model.octets) return;
  await freeSpace(model.octets - offset);
  // L'adresse est redemandée à chaque reprise : la redirection vers le CDN expire.
  const response = await net.fetch(model.url, { headers: offset ? { Range: `bytes=${offset}-` } : {}, signal });
  // Une redirection ne peut pas faire passer d'https à http (les adresses du catalogue sont en https).
  if (new URL(response.url || model.url).protocol !== new URL(model.url).protocol) throw new Error('Le serveur de modèles a redirigé vers une adresse non sécurisée : téléchargement arrêté.');
  if (response.status === 416) { fs.rmSync(part, { force: true }); throw new Error('Le fichier partiel ne correspondait plus au modèle : il a été écarté. Relancez le téléchargement.'); }
  if (offset && response.status === 200) offset = 0;
  else if (!response.ok) throw new Error(`Le serveur de modèles a répondu ${response.status}. Réessayez plus tard ; le fichier partiel est conservé.`);
  else if (offset && !(response.headers.get('content-range') || '').startsWith(`bytes ${offset}-`)) {
    // Une reprise dont la plage n'est pas celle demandée ne s'ajoute pas au partiel : on repart de zéro.
    await response.body?.cancel();
    fs.rmSync(part, { force: true });
    return fetchInto(model, onProgress, signal);
  }
  const stream = fs.createWriteStream(part, { flags: offset ? 'a' : 'w' });
  let failure = null;
  stream.on('error', error => { failure = error; });
  const reader = response.body.getReader();
  let received = offset, last = 0;
  try {
    for (;;) {
      if (failure) throw new Error(failure.code === 'ENOSPC' ? 'Le disque est plein : téléchargement arrêté, le fichier partiel est conservé.' : 'L’écriture du modèle a échoué : téléchargement arrêté.');
      const { done, value } = await reader.read();
      if (done) break;
      received += value.length;
      // Jamais plus que la taille attendue : un serveur ou un intermédiaire qui en envoie davantage est arrêté.
      if (received > model.octets) throw new Error('Le serveur envoie plus que la taille du modèle : téléchargement arrêté, fichier écarté.');
      if (!stream.write(value)) await new Promise(resolve => { stream.once('drain', resolve); stream.once('error', resolve); });
      if (current) current.received = received;
      if (Date.now() - last > 250) { last = Date.now(); onProgress({ id: model.id, etape: 'telechargement', recu: received, total: model.octets }); }
    }
  } catch (error) {
    if (received > model.octets) { await new Promise(resolve => stream.end(resolve)); fs.rmSync(part, { force: true }); throw error; }
    throw error;
  } finally {
    if (!stream.closed) await new Promise(resolve => stream.end(resolve));
  }
}

async function download(id, onProgress) {
  if (current) throw new Error('Un téléchargement est déjà en cours.');
  const model = entry(id);
  const controller = new AbortController();
  current = { id, controller, received: size(paths(model).part), total: model.octets };
  try {
    for (const item of [catalog.detection_parole, model]) {
      if (installed(item)) continue;
      await fetchInto(item, item === model ? onProgress : () => {}, controller.signal);
      await verifyAndPlace(item, paths(item).part, item === model ? onProgress : () => {});
    }
    onProgress({ id, etape: 'installe', recu: model.octets, total: model.octets });
  } catch (error) {
    if (controller.signal.aborted) {
      onProgress({ id, etape: 'pause', recu: size(paths(model).part), total: model.octets });
      return status();
    }
    throw error;
  } finally {
    current = null;
  }
  return status();
}

function pause() {
  current?.controller.abort();
}

// Pour une salle sans réseau : le même fichier apporté sur une clé, vérifié de la même façon.
async function importFile(id, source) {
  const model = entry(id);
  await verifyAndPlace(model, source, () => {});
  return status();
}

async function remove(id) {
  const model = entry(id);
  const { final, part, marker } = paths(model);
  for (const file of [final, part]) if (fs.existsSync(file)) await shell.trashItem(file);
  fs.rmSync(marker, { force: true });
  return status();
}

// À la première utilisation de la session, l'empreinte complète est recalculée : un fichier remplacé sur le
// disque (même taille, même marque) n'est jamais donné au moteur.
const verified = new Set();
async function verifiedPath(id) {
  const model = entry(id);
  if (!installed(model)) throw new Error('Ce modèle n’est pas encore installé.');
  const { final, marker } = paths(model);
  if (!verified.has(final)) {
    if ((await sha256(final)) !== model.sha256) {
      fs.rmSync(marker, { force: true });
      throw new Error('Le fichier du modèle a été modifié depuis son installation. Retéléchargez-le depuis la page Transcription.');
    }
    verified.add(final);
  }
  return final;
}

function vadPath() {
  return installed(catalog.detection_parole) ? paths(catalog.detection_parole).final : null;
}

module.exports = { status, download, pause, importFile, remove, verifiedPath, vadPath, computer, catalog };
