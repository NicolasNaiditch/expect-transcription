// Un enregistrement : lecteur (image, ou profil du son), transcription, texte complet ou anonymisé.
import { api, bytes, clock, day, escape, notice, openMenu } from '../ui.js';
import { chosenModel, main, refreshModels, state } from '../etat.js';
import { anonymiser, LIBELLES } from '../anonymisation/anonymiser.js';
import { dessinerRuban } from '../ruban.js';
import { exportText, KIND, recordMenu, transcribable, trash } from './actions.js';

// Temps restant extrapolé de l'avancement réel ; rien d'affiché avant 5 % et 15 secondes, trop tôt pour estimer.
export function remaining(job) {
  const elapsed = (Date.now() - job.debut) / 1000;
  if (!job.pourcentage || job.pourcentage < 5 || elapsed < 15) return '';
  const left = elapsed * (100 - job.pourcentage) / job.pourcentage;
  return left < 60 ? ' · moins d’une minute' : ` · environ ${Math.round(left / 60)} min restantes`;
}


const PLURIELS = { personne: ['nom de personne', 'noms de personnes'], lieu: ['lieu', 'lieux'], nom: ['autre nom propre', 'autres noms propres'], courriel: ['courriel', 'courriels'], lien: ['lien', 'liens'], telephone: ['téléphone', 'téléphones'], numero: ['numéro', 'numéros'], adresse: ['adresse', 'adresses'], code_postal: ['code postal', 'codes postaux'], date: ['date ramenée au mois', 'dates ramenées au mois'] };

function segmentsHTML(segments, anonymous) {
  return segments.map((segment, index) => `<li data-index="${index}" data-start="${Number(segment.debut) || 0}"><button class="time" type="button" aria-label="Écouter à partir de ${clock(segment.debut)}">${clock(segment.debut)}</button><p>${anonymous
    ? segment.morceaux.map(part => part.masque ? `<mark class="masque" data-categorie="${part.masque}">${escape(part.texte)}</mark>` : escape(part.texte)).join('')
    : escape(segment.texte)}</p></li>`).join('');
}

function transcriptHTML(item, models, view) {
  if (item.etat === 'transcription' || state.transcribing?.id === item.id) {
    const job = state.transcribing?.id === item.id ? state.transcribing : null, value = job ? job.pourcentage : 0;
    return `<div class="working"><span class="ring" aria-hidden="true"></span><div><p class="kicker">En cours · sur cet ordinateur</p><h2>Transcription du son</h2>
      <div class="progress"><progress max="100" value="${value}" aria-label="Avancement de la transcription"></progress><span class="progress-word">${value} %${job ? remaining(job) : ''}</span></div>
      <p class="field-hint">L’ordinateur peut ralentir pendant ce temps. Vous pouvez écouter l’enregistrement ou changer de page.</p>
      <button class="btn btn-secondary" id="cancel-transcription" type="button">Arrêter la transcription</button></div></div>`;
  }
  if (item.transcription) {
    const anonymous = view?.mode === 'anonyme', anon = anonymous ? view.anon : null;
    const summary = anonymous ? Object.entries(anon.occurrences).map(([key, count]) => `${count} ${PLURIELS[key][count > 1 ? 1 : 0]}`).join(', ') : '';
    return `<div class="transcript-head"><h2>Le texte</h2>
        <div class="segmented" role="group" aria-label="Version du texte"><button type="button" data-vue="complet" aria-pressed="${!anonymous}">Texte complet</button><button type="button" data-vue="anonyme" aria-pressed="${anonymous}">Texte anonymisé</button></div></div>
      ${anonymous ? `<div class="anon-note"><p><strong>${anon.total ? `${anon.total} passage${anon.total > 1 ? 's' : ''} masqué${anon.total > 1 ? 's' : ''}` : 'Aucun passage masqué'}</strong>${summary ? ` : ${summary}.` : '.'}</p>
        <p>Anonymisation automatique, réglée large et sans relecture : elle peut masquer un mot de trop et laisser passer un nom mal transcrit, ou ce qu’on dit d’une personne qui la fait reconnaître. Relisez avant de coller ce texte dans un service en ligne.</p>
        ${anon.table.length ? `<details class="mapping"><summary>Voir les correspondances</summary><p class="field-hint">Elles restent sur cet ordinateur : ni copiées, ni exportées avec le texte anonymisé.</p>
          <dl>${anon.table.map(entry => `<div><dt>[${LIBELLES[entry.categorie]} ${entry.n}]</dt><dd>${entry.formes.map(escape).join(' · ')}</dd></div>`).join('')}</dl></details>` : ''}</div>` : ''}
      <div class="transcript-tools"><button class="btn btn-primary" id="copy" type="button">${anonymous ? 'Copier le texte anonymisé' : 'Copier le texte'}</button><button class="btn btn-secondary" id="export" type="button">Exporter en TXT…</button><button class="btn btn-secondary" id="export-srt" type="button">Sous-titres (SRT)…</button>
      <label class="visually-hidden" for="find">Chercher dans le texte</label><input id="find" type="search" placeholder="Chercher dans le texte"></div>
      <p class="field-hint">Texte produit automatiquement, à relire : les noms propres et les termes techniques peuvent être déformés. Cliquez un horaire pour écouter le passage.</p>
      <ol class="segments ${anonymous ? 'anonymous' : ''}" id="segments">${segmentsHTML(anonymous ? anon.segments : item.transcription.segments, anonymous)}</ol>
      <p class="field-hint">Transcrit avec le modèle ${escape(models.modeles.find(model => model.id === item.modele)?.nom || item.modele || '')}${item.transcription_s ? ` en ${clock(item.transcription_s)}` : ''}.</p>`;
  }
  const model = chosenModel(models);
  if (!transcribable(item)) {
    return `<h2>Le texte de cet enregistrement</h2>
      <p class="alert">${escape(item.note || 'Le son de ce fichier n’a pas été préparé jusqu’au bout.')}</p>
      <p>Déposez de nouveau le fichier d’origine : il sera préparé puis transcrit. Ce dossier-ci peut aller à la corbeille.</p>
      <div class="buttons"><a class="btn btn-primary" href="#/fichier">Déposer le fichier</a></div>`;
  }
  return `<h2>Le texte de cet enregistrement</h2>
    ${item.note ? `<p class="alert">${escape(item.note)}</p>` : ''}
    ${model ? `<p>La transcription se fait sur cet ordinateur, avec le modèle <strong>${escape(model.nom)}</strong>. Rien n’est envoyé sur Internet.</p>
      <div class="buttons"><button class="btn btn-primary" id="transcribe" type="button">Transcrire maintenant</button><a class="text-button" href="#/modeles">Changer de modèle</a></div>`
    : `<p>Pour obtenir le texte, installez une fois un modèle de transcription (190 Mo pour le modèle Rapide). Ensuite, tout fonctionne sans Internet.</p>
      <div class="buttons"><a class="btn btn-primary" href="#/modeles">Installer un modèle</a></div>`}`;
}

export async function renderRecord(id, step) {
  const [item, models] = await Promise.all([api.detail(id), refreshModels()]);
  const arrived = step === 'termine';
  const key = item.fichiers.video ? 'video' : item.fichier_source ? 'source' : 'audio';
  const picture = Boolean(item.image) && key !== 'audio';
  const peaks = picture ? [] : await api.profil(item.id).catch(() => []);
  main.innerHTML = `
  <a class="back-link" href="#/enregistrements">← Mes enregistrements</a>
  ${arrived ? `<div class="arrival" role="status"><strong>${item.origine === 'fichier' ? 'Fichier rangé.' : 'Enregistrement conservé.'}</strong> Il est dans votre dossier Expect Transcription.${chosenModel(models) ? '' : ' Installez un modèle pour obtenir le texte.'}</div>` : ''}
  <header class="record-head"><div><h1>${escape(item.titre)}</h1><p class="record-meta">${escape(day(item.cree))} · ${clock(item.duree_s)} · ${bytes(item.octets)} · ${KIND(item)}${item.nom_origine ? ` · ${escape(item.nom_origine)}` : ''}</p></div>
    <button class="icon-button more" id="record-more" type="button" aria-haspopup="menu" aria-label="Actions pour cet enregistrement">…</button></header>
  <div class="player" data-picture="${picture}">
    <video id="video" preload="metadata" playsinline src="${api.media(item.id, key)}"></video>
    ${picture ? '' : `<canvas class="ribbon ribbon-player" id="player-ribbon" role="img" aria-label="Profil du son ; cliquez pour aller à un moment."></canvas>`}
    <div class="transport" role="group" aria-label="Lecture">
      <button class="play" id="play" type="button" aria-label="Lire">▶</button>
      <button class="btn btn-secondary" id="back5" type="button" aria-label="Reculer de 5 secondes">−5 s</button>
      <button class="btn btn-secondary" id="fwd5" type="button" aria-label="Avancer de 5 secondes">+5 s</button>
      <label class="visually-hidden" for="seek">Position dans l’enregistrement</label><input id="seek" type="range" min="0" max="0" step="1" value="0">
      <span class="clock" id="clock">00:00 / ${clock(item.duree_s)}</span>
      ${picture ? '<button class="btn btn-secondary" id="fullscreen" type="button">Plein écran</button>' : ''}
    </div>
    <p class="field-hint" id="player-status" role="status">Chargement…</p><button class="text-button" id="player-retry" type="button" hidden>Réessayer le lecteur</button>
  </div>
  <section class="transcript" id="transcript" data-id="${escape(item.id)}" aria-labelledby="transcript-title"><h2 class="visually-hidden" id="transcript-title">Transcription</h2><div id="transcript-body">${transcriptHTML(item, models)}</div></section>
  <details class="files"><summary>Fichiers et suppression</summary>
    <p class="path">${escape(item.dossier)}</p>
    <ul class="file-list">${item.fichier_source ? `<li>Fichier déposé : ${bytes(item.fichiers.source)}</li>` : `<li>${item.image === false ? 'Son' : 'Vidéo'} : ${bytes(item.fichiers.video)}</li>`}<li>Son pour la transcription : ${item.fichiers.audio ? bytes(item.fichiers.audio) : 'le fichier déposé lui-même'}</li><li>Texte : ${item.fichiers.text ? bytes(item.fichiers.text) : 'pas encore'}</li></ul>
    <div class="buttons"><button class="btn btn-secondary" id="reveal" type="button">Afficher dans le dossier</button><button class="btn btn-danger-outline" id="trash" type="button">Mettre à la corbeille…</button></div>
  </details>`;
  const video = main.querySelector('#video'), status = main.querySelector('#player-status'), retry = main.querySelector('#player-retry');
  const say = text => { if (status.textContent !== text) status.textContent = text; };
  video.addEventListener('loadedmetadata', () => say('Prêt à lire.'));
  video.addEventListener('waiting', () => say('Chargement…'));
  video.addEventListener('playing', () => say('Lecture en cours.'));
  video.addEventListener('pause', () => say('En pause.'));
  video.addEventListener('error', () => { say('Le fichier ne peut pas être lu ici. Il reste dans votre dossier.'); retry.hidden = false; });
  retry.addEventListener('click', () => { retry.hidden = true; say('Chargement…'); video.load(); });
  const play = main.querySelector('#play'), seek = main.querySelector('#seek'), time = main.querySelector('#clock'), ribbon = main.querySelector('#player-ribbon');
  const length = () => video.duration && Number.isFinite(video.duration) ? video.duration : item.duree_s;
  const drawRibbon = () => { if (ribbon) dessinerRuban(ribbon, peaks, { fichier: true, progress: length() ? video.currentTime / length() : 0 }); };
  const draw = () => {
    play.textContent = video.paused ? '▶' : '❚❚';
    play.setAttribute('aria-label', video.paused ? 'Lire' : 'Mettre en pause');
    if (document.activeElement !== seek) seek.value = Math.floor(video.currentTime);
    time.textContent = `${clock(video.currentTime)} / ${clock(length())}`;
    drawRibbon();
  };
  video.addEventListener('loadedmetadata', () => { seek.max = Math.floor(length()); draw(); });
  for (const name of ['play', 'pause', 'timeupdate', 'seeked']) video.addEventListener(name, draw);
  play.addEventListener('click', () => (video.paused ? video.play().catch(() => say('La lecture n’a pas démarré. Réessayez.')) : video.pause()));
  main.querySelector('#back5').addEventListener('click', () => { video.currentTime = Math.max(0, video.currentTime - 5); });
  main.querySelector('#fwd5').addEventListener('click', () => { video.currentTime = Math.min(length() || 0, video.currentTime + 5); });
  seek.addEventListener('input', () => { video.currentTime = Number(seek.value); });
  seek.addEventListener('change', draw);
  ribbon?.addEventListener('click', event => { const box = ribbon.getBoundingClientRect(); video.currentTime = (event.clientX - box.left) / box.width * (length() || 0); });
  main.querySelector('#fullscreen')?.addEventListener('click', () => video.requestFullscreen?.().catch(() => {}));
  video.addEventListener('error', () => { for (const control of main.querySelectorAll('.transport button, #seek')) control.disabled = true; });
  retry.addEventListener('click', () => { for (const control of main.querySelectorAll('.transport button, #seek')) control.disabled = false; });
  const resize = () => drawRibbon();
  addEventListener('resize', resize);
  state.cleanup = () => removeEventListener('resize', resize);
  drawRibbon();
  const after = () => { location.hash = '#/enregistrements'; };
  main.querySelector('#record-more').addEventListener('click', event => openMenu(event.currentTarget, recordMenu(item, () => renderRecord(item.id)).filter(entry => !['Ouvrir', 'Transcrire maintenant'].includes(entry.label))
    .map(entry => entry.danger ? { ...entry, action: () => trash([item], after) } : entry)));
  main.querySelector('#reveal').addEventListener('click', () => api.afficher(item.id));
  main.querySelector('#trash').addEventListener('click', () => trash([item], after));
  bindTranscript(item, models, video, { mode: 'complet' });
  if ((arrived || step === 'transcrire') && chosenModel(models) && !item.transcription && transcribable(item)) startTranscription(item, models, video);
}

function bindTranscript(item, models, video, view) {
  const body = main.querySelector('#transcript-body');
  body.querySelector('#transcribe')?.addEventListener('click', () => startTranscription(item, models, video));
  body.querySelector('#cancel-transcription')?.addEventListener('click', async () => { await api.arreterTranscription(); });
  body.querySelectorAll('[data-vue]').forEach(button => button.addEventListener('click', () => {
    const mode = button.dataset.vue;
    if (mode === view.mode) return;
    const next = { mode, anon: mode === 'anonyme' ? view.anon || anonymiser(item.transcription.segments) : view.anon };
    body.innerHTML = transcriptHTML(item, models, next);
    bindTranscript(item, models, video, next);
    body.querySelector(`[data-vue="${mode}"]`).focus();
  }));
  body.querySelector('#copy')?.addEventListener('click', async () => {
    const segments = view.mode === 'anonyme' ? view.anon.segments : item.transcription.segments;
    await navigator.clipboard.writeText(segments.map(segment => segment.texte).join('\n'));
    notice(view.mode === 'anonyme' ? 'Texte anonymisé copié.' : 'Texte copié.');
  });
  body.querySelector('#export')?.addEventListener('click', () => exportText(item.id, view.mode === 'anonyme'));
  body.querySelector('#export-srt')?.addEventListener('click', () => exportText(item.id, view.mode === 'anonyme', 'srt'));
  const segments = body.querySelector('#segments');
  if (!segments) return;
  segments.addEventListener('click', event => {
    const row = event.target.closest('.time');
    if (!row) return;
    video.currentTime = Number(row.closest('li').dataset.start);
    video.play().catch(() => {});
  });
  body.querySelector('#find').addEventListener('input', event => {
    const query = event.target.value.trim().toLowerCase();
    for (const row of segments.children) row.hidden = Boolean(query) && !row.textContent.toLowerCase().includes(query);
  });
  let current = -1;
  video.addEventListener('timeupdate', () => {
    if (!segments.isConnected) return;
    const time = video.currentTime;
    const index = item.transcription.segments.findIndex(segment => time >= segment.debut && time < segment.fin);
    if (index === current) return;
    segments.children[current]?.removeAttribute('aria-current');
    if (index >= 0) segments.children[index].setAttribute('aria-current', 'true');
    current = index;
  });
}

async function startTranscription(item, models, video) {
  const model = chosenModel(models);
  if (!model) return;
  state.transcribing = { id: item.id, pourcentage: 0, debut: Date.now() };
  const body = main.querySelector('#transcript-body');
  body.innerHTML = transcriptHTML({ ...item, etat: 'transcription' }, models);
  bindTranscript(item, models, video, { mode: 'complet' });
  body.querySelector('#cancel-transcription')?.focus();
  try {
    await api.transcrire(item.id, model.id);
    state.transcribing = null;
    notice('Le texte est prêt.');
  } catch (error) {
    state.transcribing = null;
    notice(error.message);
  }
  if (location.hash.includes(encodeURIComponent(item.id))) {
    const fresh = await api.detail(item.id);
    const host = main.querySelector('#transcript-body');
    host.innerHTML = transcriptHTML(fresh, models);
    bindTranscript(fresh, models, main.querySelector('#video'), { mode: 'complet' });
    host.querySelector('#copy, #transcribe')?.focus();
  }
}

