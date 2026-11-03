// Expect Transcription, version grand public de l'assistant de réunion : enregistrer le son (et l'image si
// on le choisit) ou déposer un fichier, puis transcrire sur l'ordinateur. Aucun compte, aucun envoi
// d'enregistrement ; seul le téléchargement explicite d'un modèle utilise le réseau.
const fs = require('node:fs');
const path = require('node:path');
const { Readable } = require('node:stream');
const { app, BrowserWindow, dialog, ipcMain, Notification, protocol, session, shell } = require('electron');
const library = require('./library');
const recorder = require('./recorder');
const models = require('./models');
const transcriber = require('./transcriber');
const capture = require('./capture');
const indicator = require('./indicator');

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
  { scheme: 'media', privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true } }
]);
const ORIGIN = 'app://transcrire';
// L'origine d'un schéma maison n'est pas calculée par URL (« null ») : on compare protocole et hôte.
const fromOrigin = value => { try { const url = new URL(value); return url.protocol === 'app:' && url.host === 'transcrire'; } catch { return false; } };
const RENDERER = path.join(__dirname, '..', 'renderer');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };
// Développement seulement : données isolées et page d'ouverture, pour essayer l'app sans toucher
// au dossier Documents ni ouvrir le studio (qui demande l'accès à l'écran). Ignoré dans le paquet.
const DEV_DATA = !app.isPackaged && process.env.TRANSCRIRE_DONNEES;
const DEV_PAGE = !app.isPackaged && /^[a-z]+$/.test(process.env.TRANSCRIRE_PAGE || '') ? process.env.TRANSCRIRE_PAGE : '';
if (DEV_DATA) {
  app.setPath('documents', path.join(DEV_DATA, 'Documents'));
  app.setPath('userData', path.join(DEV_DATA, 'Application Support'));
}
// Une seule instance : la seconde s'arrête net, sans toucher à la bibliothèque de la première.
const primary = app.requestSingleInstanceLock();
if (!primary) app.exit(0);

let window = null;
let recordingId = null;
let convertingId = null;
let quitting = false;
// Seules ces pages s'ouvrent, dans le navigateur de l'ordinateur ; le courriel des suggestions est
// construit ici, jamais repris de l'interface.
const EXTERNAL = new Set(['https://www.expectpatient.com/', 'https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000042193566']);
const CONTACT = 'nicolas.naiditch@expectpatient.com';
const SYSTEMS = { darwin: 'Mac', win32: 'Windows', linux: 'Linux' };

function send(channel, value) {
  if (window && !window.isDestroyed()) window.webContents.send(channel, value);
}

function show() {
  if (!window) return;
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
}

// L'interface est servie depuis le paquet, sous une origine stable et sécurisée (modules et AudioWorklet).
function serveApp(request) {
  const url = new URL(request.url);
  let file;
  try { file = path.normalize(path.join(RENDERER, decodeURIComponent(url.pathname))); } catch { return new Response(null, { status: 400 }); }
  if (url.hostname !== 'transcrire' || !file.startsWith(RENDERER + path.sep) || !fs.existsSync(file) || !TYPES[path.extname(file)]) {
    return new Response(null, { status: 404 });
  }
  return new Response(fs.readFileSync(file), { headers: { 'Content-Type': TYPES[path.extname(file)], 'Content-Security-Policy': "frame-ancestors 'none'", 'X-Content-Type-Options': 'nosniff' } });
}

// Lecture des enregistrements par plages d'octets, limitée au dossier de la bibliothèque.
function serveMedia(request) {
  const url = new URL(request.url);
  let file, type;
  try {
    const [id, key] = url.pathname.slice(1).split('/').map(decodeURIComponent);
    if (url.hostname !== 'enregistrement' || !['video', 'audio', 'source'].includes(key)) throw new Error();
    file = library.file(id, key);
    if (!fs.existsSync(file)) throw new Error();
    type = key === 'video' ? 'video/webm' : key === 'audio' ? 'audio/wav' : library.IMPORTS[path.extname(file).toLowerCase()];
  } catch {
    return new Response(null, { status: 404 });
  }
  const total = fs.statSync(file).size;
  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get('range') || '');
  if (!range) {
    return new Response(Readable.toWeb(fs.createReadStream(file)), { status: 200, headers: { 'Content-Type': type, 'Content-Length': String(total), 'Accept-Ranges': 'bytes' } });
  }
  const start = range[1] ? Number(range[1]) : Math.max(0, total - Number(range[2]));
  const end = range[1] && range[2] ? Math.min(Number(range[2]), total - 1) : total - 1;
  if (start >= total || start > end) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${total}` } });
  return new Response(Readable.toWeb(fs.createReadStream(file, { start, end })), {
    status: 206,
    headers: { 'Content-Type': type, 'Content-Length': String(end - start + 1), 'Content-Range': `bytes ${start}-${end}/${total}`, 'Accept-Ranges': 'bytes' }
  });
}

// Si l'interface tombe pendant une capture ou une préparation, les fichiers sont fermés et gardés,
// puis l'interface est rechargée : rien ne reste caché derrière le verrou d'instance unique.
function recover() {
  for (const id of [recordingId, convertingId].filter(Boolean)) {
    try {
      const result = recorder.finish(id);
      library.update(id, id === recordingId
        ? { etat: 'interrompu', duree_s: result.duree_s, note: 'L’interface s’est arrêtée pendant l’enregistrement. Le fichier conservé peut être relu et transcrit.' }
        : { etat: 'interrompu', note: 'La préparation du son a été interrompue. Déposez de nouveau le fichier pour la reprendre.' });
    } catch {}
  }
  recordingId = null;
  convertingId = null;
  indicator.update(window, null);
}

function createWindow() {
  window = new BrowserWindow({
    width: 1180, height: 820, minWidth: 380, minHeight: 560, title: 'Expect Transcription', show: false,
    backgroundColor: '#f6f7fa',
    webPreferences: { preload: path.join(__dirname, '..', 'preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false }
  });
  // Pas de fuite d'adresse réseau par WebRTC : l'app n'en a pas l'usage.
  window.webContents.setWebRTCIPHandlingPolicy('disable_non_proxied_udp');
  window.once('ready-to-show', () => window.show());
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (EXTERNAL.has(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => { if (!url.startsWith(ORIGIN + '/')) event.preventDefault(); });
  window.webContents.on('render-process-gone', () => {
    recover();
    if (window && !window.isDestroyed()) window.webContents.reload();
  });
  // Pendant une capture, fermer la fenêtre la cache : l'enregistrement continue, le témoin reste visible.
  window.on('close', event => {
    if (!quitting && (recordingId || convertingId || transcriber.active())) {
      event.preventDefault();
      window.hide();
    }
  });
  window.on('closed', () => { window = null; });
  window.loadURL(`${ORIGIN}/index.html` + (DEV_PAGE ? `#/${DEV_PAGE}` : ''));
}

function guardSession() {
  const ses = session.defaultSession;
  // Le micro et la capture d'écran, pour l'interface de l'app seulement ; jamais la caméra.
  ses.setPermissionRequestHandler((contents, permission, callback, details) => {
    const audioOnly = permission !== 'media' || (details.mediaTypes || []).every(type => type === 'audio');
    callback(['media', 'display-capture'].includes(permission) && audioOnly && fromOrigin(details.requestingUrl || contents.getURL()));
  });
  ses.setPermissionCheckHandler((_contents, permission, origin, details) =>
    ['media', 'display-capture'].includes(permission) && !(permission === 'media' && details?.mediaType === 'video') && fromOrigin(origin));
  // L'interface ne charge que ce que sert l'app ; le téléchargement des modèles part du processus principal.
  ses.webRequest.onBeforeRequest((details, callback) => {
    const local = /^(app|media|data|blob|devtools):/.test(details.url);
    callback({ cancel: Boolean(details.webContentsId) && !local });
  });
  capture.install(ses, () => (window && !window.isDestroyed() ? [window.getMediaSourceId()] : []));
}

// Chaque message doit venir de l'interface de l'app, jamais d'un autre cadre.
const fromApp = event => fromOrigin(event.senderFrame?.url || '');

function handle(channel, fn) {
  ipcMain.handle(channel, async (event, ...args) => {
    if (!fromApp(event)) return { ok: false, erreur: 'Origine refusée.' };
    try { return { ok: true, valeur: await fn(...args) }; } catch (error) { return { ok: false, erreur: error.message || String(error) }; }
  });
}

// Écriture au fil de l'eau : une erreur (disque plein) arrête proprement au lieu de faire tomber l'app.
function listen(channel, fn) {
  ipcMain.on(channel, (event, ...args) => {
    if (!fromApp(event)) return;
    try { fn(...args); } catch (error) {
      send('alerte', error.code === 'ENOSPC' ? 'Le disque est plein : l’enregistrement est arrêté et ce qui a été reçu est conservé.' : 'L’écriture du fichier a échoué : l’enregistrement est arrêté et ce qui a été reçu est conservé.');
      send('commande', 'arreter');
    }
  });
}

function registerIpc() {
  handle('app:infos', () => ({ plateforme: process.platform, version: app.getVersion(), bibliotheque: library.root(), synchro: library.synchro() }));
  handle('app:licences', () => {
    const file = app.isPackaged ? path.join(process.resourcesPath, 'LICENCES-TIERS.txt') : path.join(__dirname, '..', 'vendor', 'LICENCES-TIERS.txt');
    shell.openPath(file);
    return true;
  });
  // Le courriel des suggestions : adresse fixe, objet avec la version et le système, rien d'autre.
  handle('app:ecrire', () => {
    const subject = `Expect Transcription ${app.getVersion()} (${SYSTEMS[process.platform] || process.platform}) : une suggestion`;
    shell.openExternal(`mailto:${CONTACT}?subject=${encodeURIComponent(subject)}`);
    return true;
  });
  handle('capture:sources', () => capture.sources());
  handle('capture:micro', () => capture.askMicrophone());
  handle('capture:reglages', kind => capture.openSettings(kind));

  handle('enregistrement:commencer', async ({ titre, sourceId, sonOrdinateur, micro, image }) => {
    if (recordingId || convertingId) throw new Error('Un enregistrement ou une préparation de fichier est déjà en cours.');
    if (transcriber.active()) throw new Error('Une transcription est en cours. Attendez sa fin ou arrêtez-la avant d’enregistrer.');
    if (!image && !sonOrdinateur && !micro) throw new Error('Activez au moins le son de l’ordinateur ou le micro.');
    // Sans image gardée, le son de l'ordinateur se capte quand même par l'écran principal.
    const source = image ? sourceId : sonOrdinateur ? await capture.firstScreen() : null;
    if (source) capture.choose(source, sonOrdinateur);
    const info = library.create({ title: String(titre || 'Enregistrement').slice(0, 120), source: !image ? 'son' : source.startsWith('screen:') ? 'ecran' : 'fenetre', sounds: { ordinateur: Boolean(sonOrdinateur), micro: Boolean(micro) }, image: Boolean(image) });
    recorder.start(info.id, library.file(info.id, 'video'), library.file(info.id, 'audio'));
    recordingId = info.id;
    // Le témoin est allumé par le processus principal, même si l'interface ne le rafraîchit plus.
    indicator.update(window, { etat: 'enregistrement', duree: 0 });
    return info;
  });
  listen('enregistrement:video', (id, chunk) => { if (id === recordingId) recorder.appendVideo(id, chunk); });
  listen('enregistrement:audio', (id, chunk) => { if (id === recordingId) recorder.appendAudio(id, chunk); });
  listen('enregistrement:etat', state => indicator.update(window, recordingId || state?.etat === 'preparation' ? state : null));
  handle('enregistrement:terminer', id => {
    if (id !== recordingId) throw new Error('Aucun enregistrement en cours.');
    const result = recorder.finish(id);
    recordingId = null;
    indicator.update(window, null);
    return library.update(id, { etat: 'enregistre', duree_s: result.duree_s });
  });
  handle('enregistrement:annuler', async id => {
    if (id !== recordingId) throw new Error('Aucun enregistrement en cours.');
    recorder.finish(id);
    recordingId = null;
    indicator.update(window, null);
    await library.trash(id);
    return true;
  });

  // Fichier déposé : copié dans la bibliothèque, puis l'interface en envoie le son préparé (WAV 16 kHz).
  handle('fichier:importer', ({ chemin }) => {
    if (recordingId || convertingId) throw new Error('Terminez d’abord l’enregistrement ou la préparation en cours.');
    return library.importFile(chemin);
  });
  handle('conversion:commencer', id => {
    if (recordingId || convertingId) throw new Error('Un enregistrement ou une préparation est déjà en cours.');
    const item = library.get(id);
    if (item.origine !== 'fichier' || item.etat !== 'preparation' || item.fichiers.audio) throw new Error('Ce fichier n’attend pas de préparation.');
    recorder.start(id, null, library.file(id, 'audio'));
    convertingId = id;
    return true;
  });
  listen('conversion:audio', (id, chunk) => { if (id === convertingId) recorder.appendAudio(id, chunk); });
  handle('conversion:terminer', id => {
    if (id !== convertingId) throw new Error('Aucune préparation en cours.');
    const result = recorder.finish(id);
    convertingId = null;
    if (result.duree_s < 1) throw new Error('Aucun son n’a pu être tiré de ce fichier.');
    return library.update(id, { etat: 'enregistre', duree_s: result.duree_s, note: null });
  });
  handle('conversion:abandonner', async id => {
    if (id === convertingId) { recorder.finish(id); convertingId = null; }
    const item = library.get(id);
    if (item.origine === 'fichier' && item.etat === 'preparation') await library.trash(id);
    return true;
  });

  handle('transcription:lancer', async ({ id, modele }) => {
    if (recordingId || convertingId) throw new Error('Terminez l’enregistrement ou la préparation avant de transcrire : les deux ensemble demanderaient trop de mémoire.');
    const audio = library.forEngine(id);
    const model = await models.verifiedPath(modele);
    const started = Date.now();
    library.update(id, { etat: 'transcription', note: null });
    try {
      const result = await transcriber.run({
        audio, base: library.file(id, 'json').replace(/\.json$/, '-moteur'), model, vad: models.vadPath(),
        onProgress: value => { send('transcription:progression', { id, pourcentage: value }); window?.setProgressBar(value / 100); }
      });
      const info = library.get(id);
      fs.writeFileSync(library.file(id, 'json'), JSON.stringify({ modele, langue: 'fr', segments: result.segments }, null, 2) + '\n');
      fs.writeFileSync(library.file(id, 'text'), `${info.titre}\n${new Date(info.cree).toLocaleString('fr-FR')}\n\n${result.text}`);
      const done = library.update(id, { etat: 'transcrit', modele, transcription_s: Math.round((Date.now() - started) / 1000) });
      // Une longue transcription se fait souvent fenêtre cachée : le système prévient, sans afficher le
      // titre (souvent un nom), qui pourrait paraître sur un écran partagé.
      if (Notification.isSupported() && !window?.isFocused()) {
        const note = new Notification({ title: 'Expect Transcription', body: 'Le texte est prêt.', silent: false });
        note.on('click', show);
        note.show();
      }
      return done;
    } catch (error) {
      library.update(id, { etat: 'enregistre', note: error.cancelled ? 'Transcription arrêtée.' : error.message });
      throw error;
    } finally {
      window?.setProgressBar(-1);
    }
  });
  handle('transcription:arreter', () => transcriber.cancel());

  handle('bibliotheque:liste', () => library.list());
  handle('bibliotheque:chercher', query => library.search(query));
  handle('bibliotheque:profil', id => library.peaks(id));
  handle('bibliotheque:detail', id => ({ ...library.get(id), transcription: library.transcript(id) }));
  handle('bibliotheque:renommer', (id, titre) => library.update(id, { titre: String(titre).trim().slice(0, 120) || 'Enregistrement' }));
  handle('bibliotheque:corbeille', async id => {
    if (id === recordingId || id === convertingId) throw new Error('Arrêtez d’abord l’enregistrement ou la préparation.');
    await library.trash(id);
    return true;
  });
  handle('bibliotheque:afficher', id => { if (id) library.reveal(id); else shell.openPath(library.root()); return true; });
  // Le texte anonymisé et les sous-titres sont calculés dans l'interface ; rien n'est écrit ailleurs que là
  // où la personne le choisit. Une version anonymisée ne porte jamais le titre, souvent un nom.
  handle('bibliotheque:exporter', async (id, options = {}) => {
    const info = library.get(id), source = library.file(id, 'text');
    if (!fs.existsSync(source)) throw new Error('Aucune transcription à exporter.');
    const srt = options.format === 'srt', anonymous = Boolean(options.anonyme);
    if ((anonymous || srt) && typeof options.texte !== 'string') throw new Error('Texte à exporter manquant.');
    const stamp = new Date(info.cree).toISOString().slice(0, 10);
    const name = anonymous ? `Transcription anonymisée ${stamp}.${srt ? 'srt' : 'txt'}` : `${info.titre}.${srt ? 'srt' : 'txt'}`;
    const choice = await dialog.showSaveDialog(window, {
      title: srt ? 'Exporter les sous-titres' : anonymous ? 'Exporter le texte anonymisé' : 'Exporter la transcription',
      defaultPath: path.join(app.getPath('documents'), name.replace(/[\\/:*?"<>|]/g, ' ')),
      filters: [srt ? { name: 'Sous-titres SubRip', extensions: ['srt'] } : { name: 'Texte', extensions: ['txt'] }]
    });
    if (choice.canceled || !choice.filePath) return null;
    if (typeof options.texte === 'string') fs.writeFileSync(choice.filePath, options.texte); else fs.copyFileSync(source, choice.filePath);
    return choice.filePath;
  });

  handle('modeles:etat', () => models.status());
  handle('modeles:telecharger', id => models.download(id, progress => send('modeles:progression', progress)));
  handle('modeles:pause', () => { models.pause(); return true; });
  handle('modeles:importer', async id => {
    const choice = await dialog.showOpenDialog(window, { title: 'Choisir le fichier du modèle', properties: ['openFile'], filters: [{ name: 'Modèle whisper.cpp', extensions: ['bin'] }] });
    return choice.canceled ? models.status() : models.importFile(id, choice.filePaths[0]);
  });
  handle('modeles:retirer', id => models.remove(id));
  handle('indicateur:icones', icons => { indicator.setIcons(icons); return true; });
  // Quitter sans confirmation n'est permis qu'une fois l'enregistrement fermé.
  listen('app:quitter', () => { if (!recordingId && !convertingId) { quitting = true; app.quit(); } });
}

app.on('second-instance', show);
app.on('activate', () => { if (primary) (window ? show() : createWindow()); });

app.on('before-quit', event => {
  if (quitting || (!recordingId && !transcriber.active())) { quitting = true; return; }
  event.preventDefault();
  show();
  const recording = Boolean(recordingId);
  const answer = dialog.showMessageBoxSync(window, {
    type: 'warning', buttons: [recording ? 'Revenir à l’enregistrement' : 'Laisser la transcription continuer', recording ? 'Arrêter, conserver le fichier et quitter' : 'Arrêter la transcription et quitter'],
    defaultId: 0, cancelId: 0, message: recording ? 'Un enregistrement est en cours.' : 'Une transcription est en cours.',
    detail: recording ? 'Le fichier sera conservé dans votre dossier Expect Transcription.' : 'Le fichier audio est conservé ; vous pourrez relancer la transcription.'
  });
  if (answer !== 1) return;
  if (recording) {
    send('commande', 'arreter-et-quitter');
  } else {
    transcriber.cancel();
    quitting = true;
    app.quit();
  }
});

app.on('window-all-closed', () => { if (!recordingId) app.quit(); });

app.whenReady().then(() => {
  if (!primary) return;
  protocol.handle('app', serveApp);
  protocol.handle('media', serveMedia);
  library.migrate();
  library.repair(recorder.fixWav);
  indicator.bind({ show, command: value => { show(); send('commande', value); } });
  guardSession();
  registerIpc();
  createWindow();
});
