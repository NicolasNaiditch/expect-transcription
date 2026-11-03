// Déposer un fichier : copie dans la bibliothèque, préparation du son si le moteur ne lit pas le format.
import { api, escape, notice } from '../ui.js';
import { live } from '../studio.js';
import { convertir } from '../conversion.js';
import { currentRoute, main, state } from '../etat.js';

const ETAPES = { lecture: 'Lecture du fichier…', copie: 'Copie dans votre dossier Expect Transcription…', conversion: 'Préparation du son pour la transcription…' };

function importHTML() {
  const job = state.importing;
  if (!job) return '';
  const percent = Math.round(job.fraction * 100);
  return `<div class="working"><span class="ring" aria-hidden="true"></span><div><p class="kicker">En préparation · sur cet ordinateur</p><h2>${escape(job.nom)}</h2>
    <div class="progress"><progress max="100" value="${job.etape === 'conversion' ? percent : 0}" aria-label="Préparation du fichier"></progress><span class="progress-word">${job.etape === 'conversion' ? `${percent} %` : ''}</span></div>
    <p class="field-hint">${ETAPES[job.etape]}</p>
    <button class="btn btn-secondary" id="cancel-import" type="button">Arrêter</button></div></div>`;
}

function drawImport() {
  const host = document.querySelector('#import-state');
  if (!host) return;
  const job = state.importing;
  if (job && host.querySelector('progress') && job.etape === 'conversion') {
    host.querySelector('progress').value = Math.round(job.fraction * 100);
    host.querySelector('.progress-word').textContent = `${Math.round(job.fraction * 100)} %`;
    host.querySelector('.field-hint').textContent = ETAPES[job.etape];
    return;
  }
  host.innerHTML = importHTML();
  host.querySelector('#cancel-import')?.addEventListener('click', () => state.importing?.controller.abort());
  document.querySelector('#dropzone')?.toggleAttribute('hidden', Boolean(job));
}

async function importer(file) {
  if (state.importing) return notice('Un fichier est déjà en préparation.');
  if (live.session) return notice('Terminez d’abord l’enregistrement en cours.');
  if (currentRoute() !== 'fichier') location.hash = '#/fichier';
  const controller = new AbortController();
  state.importing = { nom: file.name, etape: 'lecture', fraction: 0, controller };
  drawImport();
  let info = null;
  try {
    const chemin = api.cheminDe(file);
    if (!chemin) throw new Error('Ce fichier ne peut pas être lu depuis cet emplacement. Copiez-le d’abord sur l’ordinateur.');
    state.importing.etape = 'copie'; drawImport();
    info = await api.importer({ chemin });
    state.importing.etape = 'conversion'; drawImport();
    await api.commencerConversion(info.id);
    let last = 0;
    await convertir(file, {
      signal: controller.signal,
      onPcm: buffer => api.envoyerConversion(info.id, buffer),
      onProgress: fraction => { state.importing.fraction = fraction; if (Date.now() - last > 200) { last = Date.now(); drawImport(); } }
    });
    await api.terminerConversion(info.id);
    state.importing = null;
    location.hash = `#/enregistrement/${encodeURIComponent(info.id)}/termine`;
  } catch (error) {
    state.importing = null;
    if (info) await api.abandonnerConversion(info.id).catch(() => {});
    drawImport();
    notice(error.name === 'AbortError' ? 'Préparation arrêtée : la copie du fichier est dans la Corbeille.' : error.message);
  }
}

export function renderImport() {
  main.innerHTML = `
  <div class="page-head"><p class="kicker">Un fichier audio ou vidéo</p><h1>Déposer un fichier à transcrire.</h1>
    <p class="lead">Un cours enregistré sur votre téléphone, une réunion en visio, une interview : déposez le fichier, Expect Transcription en range une copie et en écrit le texte sur cet ordinateur.</p></div>
  <div class="dropzone" id="dropzone" ${state.importing ? 'hidden' : ''}>
    <svg class="dropzone-mark" viewBox="0 0 120 64" aria-hidden="true"><path d="M8 32h6M20 22v20M28 14v36M36 24v16M44 8v48M52 20v24M60 28v8" /><path class="arrow" d="M70 32h14m-5-5 5 5-5 5" /><path class="lines" d="M92 18h22M92 28h18M92 38h22M92 48h12" /></svg>
    <p><strong>Glissez un fichier ici</strong>, n’importe où dans la fenêtre.</p>
    <button class="btn btn-primary" id="choose" type="button">Choisir un fichier…</button>
    <p class="field-hint">MP3, M4A, WAV, MP4, MOV, WEBM, OGG, OPUS, FLAC ou AAC.</p>
    <input type="file" id="file-input" accept=".mp3,.m4a,.wav,.mp4,.mov,.webm,.ogg,.opus,.flac,.aac" hidden>
  </div>
  <div id="import-state" role="status">${importHTML()}</div>
  <ul class="facts">
    <li><strong>L’original ne bouge pas.</strong> Une copie est rangée dans Documents › Expect Transcription, avec son texte.</li>
    <li><strong>Rien ne part sur Internet.</strong> Le son est préparé dans l’app, puis transcrit sur cet ordinateur.</li>
    <li><strong>Une vidéo garde son image.</strong> Le texte, lui, ne vient que du son.</li>
  </ul>`;
  const input = main.querySelector('#file-input');
  main.querySelector('#choose').addEventListener('click', () => input.click());
  input.addEventListener('change', () => { if (input.files[0]) importer(input.files[0]); input.value = ''; });
  main.querySelector('#cancel-import')?.addEventListener('click', () => state.importing?.controller.abort());
}

// Glisser un fichier n'importe où : un voile dit ce qui va se passer.
export function ecouterDepot() {
  const drop = document.querySelector('#drop');
  const hasFiles = event => [...(event.dataTransfer?.types || [])].includes('Files');
  let depth = 0;
  addEventListener('dragenter', event => { if (!hasFiles(event)) return; event.preventDefault(); depth += 1; drop.hidden = false; });
  addEventListener('dragleave', event => { if (!hasFiles(event)) return; depth = Math.max(0, depth - 1); if (!depth) drop.hidden = true; });
  addEventListener('dragover', event => { if (hasFiles(event)) event.preventDefault(); });
  addEventListener('drop', event => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    depth = 0; drop.hidden = true;
    const file = event.dataTransfer.files[0];
    if (file) importer(file);
  });
}
