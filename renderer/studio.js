// Le studio : choisir ce qu'on garde (le son, ou le son et l'image), les sources, puis enregistrer.
// Au repos, l'objet présent est le ruban du son (ou l'aperçu de l'écran choisi) ; pendant la capture,
// le ruban se remplit de ce qui est réellement reçu.
import { api, clock, confirmAction, escape, notice } from './ui.js';
import { microphones, openCapture, Session, systemAudioState } from './media.js';
import { dessinerRuban } from './ruban.js';

const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const prefs = () => { try { return JSON.parse(localStorage.getItem('studio') || '{}'); } catch { return {}; } };
const savePrefs = value => { try { localStorage.setItem('studio', JSON.stringify({ ...prefs(), ...value })); } catch {} };

export const live = { session: null, id: null, etat: 'repos', title: '', timer: 0, alerts: {}, image: false, onChange: () => {} };

function defaultTitle() {
  return 'Enregistrement du ' + new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' }).format(new Date());
}

function sourceCaption(source) {
  if (!source) return 'Aucune source choisie';
  return source.type === 'ecran' ? `${source.nom} · tout l’écran` : `${source.nom} · une fenêtre`;
}

function soundCaption({ systemAudio, micro }) {
  const parts = [systemAudio && 'le son de l’ordinateur', micro && 'votre micro'].filter(Boolean);
  return parts.length ? `Gardé : ${parts.join(' et ')}. Aucune image.` : 'Aucun son choisi';
}

const WORDS = { repos: 'Prêt à enregistrer', preparation: 'Préparation…', enregistrement: 'Enregistrement en cours', pause: 'En pause', finalisation: 'Enregistrement du fichier…' };

export async function renderStudio(main, { models }) {
  const p = prefs();
  const state = { sources: [], image: p.image ?? false, kind: p.kind || 'ecran', selected: null, systemAudio: p.systemAudio ?? true, micro: p.micro ?? true, microId: p.microId || '', mics: [] };
  const installed = models?.modeles.some(model => model.installe);
  const recording = Boolean(live.session);
  if (recording) state.image = live.image;
  main.innerHTML = `
  <section class="studio" data-state="${live.etat}" data-image="${state.image}" aria-labelledby="studio-title">
    <div class="studio-head">
      <p class="kicker">Son de l’ordinateur · micro · image si vous la gardez</p>
      <label class="visually-hidden" for="studio-title-input">Nom de l’enregistrement</label>
      <h1 id="studio-title"><input id="studio-title-input" value="${escape(live.title || p.title || defaultTitle())}" maxlength="120" ${recording ? 'disabled' : ''}></h1>
      <p class="studio-meta">Le fichier sera rangé dans <button class="text-button" id="open-library" type="button">Documents › Expect Transcription</button></p>
    </div>
    <div class="studio-body">
      <div class="studio-stage">
        <figure class="frame" id="frame">
          <div class="frame-picture" id="frame-picture"></div>
          <figcaption id="frame-caption"></figcaption>
          <span class="rec-badge" aria-hidden="true"><span class="rec-dot"></span><span id="badge-time">00:00</span></span>
        </figure>
        <div class="state-line"><p class="state-chip" id="state-chip" role="status">${WORDS[live.etat]}</p><p class="timer" id="timer" aria-hidden="${recording ? 'false' : 'true'}">${clock(live.session?.elapsed() || 0)}</p></div>
        <div class="controls" id="controls"></div>
        <p class="consent">Prévenez les personnes avant d’enregistrer : enregistrer quelqu’un à son insu est puni par la loi. <a href="#/mentions/enregistrer">Ce que dit la loi</a></p>
        <div class="meters" id="meters" ${recording ? '' : 'hidden'}>
          <div class="meter" data-source="ordinateur"><span class="meter-name">Son de l’ordinateur</span><span class="meter-bar"><span></span></span><span class="meter-word">—</span></div>
          <div class="meter" data-source="micro"><span class="meter-name">Votre micro</span><span class="meter-bar"><span></span></span><span class="meter-word">—</span></div>
        </div>
        <div class="alerts" id="alerts" role="alert"></div>
        ${installed ? '' : `<p class="model-hint">Pour obtenir le texte, installez une fois le modèle de transcription. <a href="#/modeles">Voir la transcription sur cet ordinateur</a></p>`}
      </div>
      <aside class="setup" aria-label="Réglages de l’enregistrement">
        <fieldset class="setup-block" ${recording ? 'disabled' : ''}>
          <legend>Ce que vous gardez</legend>
          <div class="segmented" role="group" aria-label="Ce que vous gardez">
            <button type="button" data-image="false" aria-pressed="${!state.image}">Le son</button>
            <button type="button" data-image="true" aria-pressed="${state.image}">Le son et l’image</button>
          </div>
          <p class="field-hint" id="image-hint"></p>
          <div id="image-sources" ${state.image ? '' : 'hidden'}>
            <div class="segmented segmented-small" role="group" aria-label="Type de source">
              <button type="button" data-kind="ecran" aria-pressed="${state.kind === 'ecran'}">Un écran</button>
              <button type="button" data-kind="fenetre" aria-pressed="${state.kind === 'fenetre'}">Une fenêtre</button>
            </div>
            <div class="source-grid" id="source-grid" role="group" aria-label="Sources disponibles"><p class="field-hint">Recherche des sources…</p></div>
            <button class="text-button" id="refresh-sources" type="button">Actualiser la liste</button>
          </div>
        </fieldset>
        <fieldset class="setup-block" ${recording ? 'disabled' : ''}>
          <legend>Le son</legend>
          <label class="switch-row"><span>Son de l’ordinateur<small>La visio, une vidéo, le cours en ligne</small></span><input type="checkbox" role="switch" id="system-audio" ${state.systemAudio ? 'checked' : ''}></label>
          <label class="switch-row"><span>Mon micro<small>Votre voix et la pièce</small></span><input type="checkbox" role="switch" id="micro" ${state.micro ? 'checked' : ''}></label>
          <label for="micro-select" class="field-label">Micro utilisé</label>
          <select id="micro-select" ${state.micro ? '' : 'disabled'}><option value="">Micro par défaut</option></select>
          <p class="field-hint">Avec des enceintes, le micro reprend aussi le son de l’ordinateur : un casque évite les doublons dans le texte.</p>
        </fieldset>
      </aside>
    </div>
  </section>`;

  const $ = selector => main.querySelector(selector);
  const titleInput = $('#studio-title-input');
  titleInput.addEventListener('change', () => savePrefs({ title: titleInput.value.trim() || defaultTitle() }));
  $('#open-library').addEventListener('click', () => api.afficher(null));

  function ready() {
    return state.image ? Boolean(state.selected) : state.systemAudio || state.micro;
  }

  function drawRibbon() {
    const canvas = $('#ribbon');
    if (canvas) dessinerRuban(canvas, live.session?.history || [], { empty: !live.session });
  }

  function drawFrame() {
    const host = $('#frame-picture');
    $('.studio').dataset.image = String(state.image);
    if (!state.image) {
      if (!$('#ribbon')) host.innerHTML = `<canvas class="ribbon" id="ribbon" aria-hidden="true"></canvas><span class="ribbon-word" id="ribbon-word"></span>`;
      $('#ribbon-word').textContent = live.session ? '' : state.systemAudio || state.micro ? 'Le son arrivera ici' : 'Activez au moins une source de son';
      $('#frame-caption').textContent = live.session ? live.caption : soundCaption(state);
      $('#image-hint').textContent = state.systemAudio ? 'Le son de l’ordinateur passe par l’autorisation d’enregistrer l’écran, mais aucune image n’est gardée.' : 'Seul votre micro est enregistré.';
      drawRibbon();
      return;
    }
    const source = state.sources.find(item => item.id === state.selected);
    const picture = live.session ? live.preview : source?.apercu;
    host.innerHTML = picture ? `<img src="${picture}" alt="">` : `<span class="frame-empty">${state.sources.length ? 'Choisissez un écran ou une fenêtre à droite' : 'Choisissez ce que vous voulez garder'}</span>`;
    $('#frame-caption').textContent = live.session ? live.caption : sourceCaption(source);
    $('#image-hint').textContent = 'La vidéo pèse environ 1 Go par heure. Le texte, lui, ne vient que du son.';
  }

  function drawSources() {
    const list = state.sources.filter(source => source.type === state.kind);
    const grid = $('#source-grid');
    if (!list.length) {
      grid.innerHTML = `<p class="field-hint">${state.kind === 'ecran' ? 'Aucun écran trouvé.' : 'Aucune fenêtre ouverte trouvée. Ouvrez la fenêtre du cours puis actualisez.'}</p>`;
      return;
    }
    grid.innerHTML = list.map(source => `<button type="button" class="source" data-source="${escape(source.id)}" aria-pressed="${source.id === state.selected}">
      <span class="source-thumb">${source.apercu ? `<img src="${source.apercu}" alt="">` : ''}</span><span class="source-name">${escape(source.nom)}</span></button>`).join('');
  }

  async function loadSources() {
    try {
      state.sources = await api.sources();
      if (!state.sources.some(source => source.id === state.selected)) {
        const remembered = state.sources.find(source => source.id === prefs().sourceId && source.type === state.kind);
        state.selected = remembered?.id || state.sources.find(source => source.type === state.kind && source.type === 'ecran')?.id || null;
      }
    } catch (error) {
      state.sources = [];
      $('#source-grid').innerHTML = `<p class="field-hint">${escape(error.message)}</p>`;
    }
    drawSources(); drawFrame(); drawControls();
  }

  async function loadMics() {
    state.mics = await microphones();
    $('#micro-select').innerHTML = '<option value="">Micro par défaut</option>' + state.mics.filter(mic => mic.id && mic.id !== 'default').map(mic => `<option value="${escape(mic.id)}" ${mic.id === state.microId ? 'selected' : ''}>${escape(mic.nom)}</option>`).join('');
  }

  function drawControls() {
    const controls = $('#controls');
    if (live.etat === 'repos') {
      const ok = ready();
      controls.innerHTML = `<button class="record-start" id="start" type="button" ${ok ? '' : 'aria-disabled="true"'}><span class="rec-core" aria-hidden="true"></span>Démarrer l’enregistrement</button>
        ${ok ? '' : `<p class="field-hint" id="start-hint">${state.image ? 'Choisissez d’abord un écran ou une fenêtre.' : 'Activez le son de l’ordinateur ou le micro.'}</p>`}`;
      $('#start').addEventListener('click', () => (ok ? start() : (state.image ? $('#source-grid button') : $('#system-audio'))?.focus()));
    } else if (['enregistrement', 'pause'].includes(live.etat)) {
      controls.innerHTML = `<button class="record-stop" id="stop" type="button"><span class="rec-core" aria-hidden="true"></span>Arrêter et enregistrer</button>
        <button class="btn btn-secondary" id="pause" type="button">${live.etat === 'pause' ? 'Reprendre' : 'Mettre en pause'}</button>
        <button class="text-button danger" id="cancel" type="button">Annuler l’enregistrement</button>`;
      $('#stop').addEventListener('click', () => stop());
      $('#pause').addEventListener('click', () => togglePause());
      $('#cancel').addEventListener('click', () => cancel());
    } else {
      controls.innerHTML = `<button class="record-start" type="button" aria-busy="true" disabled><span class="rec-core" aria-hidden="true"></span>${WORDS[live.etat]}</button>`;
    }
  }

  function setState(etat) {
    live.etat = etat;
    $('.studio').dataset.state = etat;
    $('#state-chip').textContent = WORDS[etat];
    $('#timer').setAttribute('aria-hidden', String(!live.session));
    $('#meters').hidden = !live.session;
    for (const block of main.querySelectorAll('.setup fieldset')) block.disabled = etat !== 'repos';
    titleInput.disabled = etat !== 'repos';
    drawControls();
    live.onChange();
  }

  function showAlerts() {
    const lines = Object.values(live.alerts).filter(Boolean);
    $('#alerts').innerHTML = lines.map(alert => `<p class="alert ${alert.level || ''}">${escape(alert.text)}${alert.action ? ` <button type="button" class="text-button" data-settings="${alert.action}">Ouvrir les réglages</button>` : ''}</p>`).join('');
  }
  $('#alerts').addEventListener('click', event => { const button = event.target.closest('[data-settings]'); if (button) api.ouvrirReglages(button.dataset.settings); });

  function tick() {
    if (!live.session) return;
    const elapsed = live.session.elapsed();
    $('#timer').textContent = clock(elapsed);
    $('#badge-time').textContent = clock(elapsed);
    const levels = live.session.measure();
    for (const meter of main.querySelectorAll('.meter')) {
      const name = meter.dataset.source, level = levels[name];
      const bar = meter.querySelector('.meter-bar > span'), word = meter.querySelector('.meter-word');
      if (!level) { meter.dataset.state = 'off'; word.textContent = live.requested?.[name] ? 'Indisponible' : 'Non enregistré'; bar.style.width = '0'; continue; }
      const width = Math.max(0, Math.min(100, (level.db + 60) / 60 * 100));
      bar.style.width = `${width}%`;
      const quiet = level.silence_s > 20;
      meter.dataset.state = live.etat === 'pause' ? 'pause' : quiet ? 'quiet' : level.db > -3 ? 'loud' : 'ok';
      word.textContent = live.etat === 'pause' ? 'En pause' : level.db > -3 ? 'Très fort' : level.db > -55 ? 'Son reçu' : quiet ? `Silence depuis ${Math.round(level.silence_s)} s` : 'Silence';
      // Un silence n'est pas une panne : l'alerte dit ce qu'on peut vérifier, sans conclure.
      live.alerts[`silence-${name}`] = quiet && live.etat === 'enregistrement'
        ? { text: name === 'ordinateur' ? 'Aucun son de l’ordinateur depuis un moment. C’est normal si personne ne parle ; sinon, vérifiez que le son joue bien sur cet ordinateur.' : 'Votre micro ne reçoit rien depuis un moment. C’est normal si vous écoutez ; sinon, vérifiez le micro choisi.' }
        : null;
    }
    showAlerts();
    if (!state.image) drawRibbon();
  }

  async function start() {
    const title = titleInput.value.trim() || defaultTitle();
    savePrefs({ title: '', image: state.image, sourceId: state.selected, kind: state.kind, systemAudio: state.systemAudio, micro: state.micro, microId: state.microId });
    const source = state.sources.find(item => item.id === state.selected);
    live.title = title; live.image = state.image; live.alerts = {};
    live.caption = state.image ? sourceCaption(source) : soundCaption(state); live.preview = state.image ? source?.apercu || null : null;
    live.requested = { ordinateur: state.systemAudio, micro: state.micro };
    setState('preparation');
    api.signalerEtat({ etat: 'preparation', duree: 0 });
    let info = null, capture = null;
    try {
      if (state.micro) await api.demanderMicro();
      info = await api.commencer({ titre: title, image: state.image, sourceId: state.selected, sonOrdinateur: state.systemAudio, micro: state.micro });
      capture = await openCapture({ image: state.image, systemAudio: state.systemAudio, micro: state.micro, microId: state.microId });
      const audio = systemAudioState(capture.display, state.systemAudio);
      if (audio === 'muet' || audio === 'refuse') {
        live.alerts.system = { level: 'warn', text: 'Le son de l’ordinateur n’est pas autorisé : seul votre micro est enregistré. Sur Mac, autorisez Expect Transcription dans « Enregistrement de l’écran et audio du système », puis relancez l’app.', action: 'son' };
      }
      live.id = info.id;
      live.session = new Session({
        display: capture.display, mic: capture.mic, id: info.id, image: state.image,
        onVideo: buffer => api.envoyerVideo(info.id, buffer),
        onAudio: buffer => api.envoyerAudio(info.id, buffer),
        onEvent: event => {
          if (event.type === 'image-arretee' && live.session) { notice(state.image ? 'La source enregistrée s’est fermée : l’enregistrement est arrêté et conservé.' : 'La capture du son de l’ordinateur s’est arrêtée : l’enregistrement est arrêté et conservé.'); stop(); }
          if (event.type === 'source-arretee') { live.alerts[event.source] = { level: 'warn', text: event.source === 'micro' ? 'Le micro s’est arrêté (débranché ?). L’enregistrement continue sans lui.' : 'Le son de l’ordinateur s’est arrêté. L’enregistrement continue avec le micro.' }; showAlerts(); }
        }
      });
      await live.session.start();
      setState('enregistrement');
      drawFrame();
      live.timer = setInterval(tick, reduced.matches ? 1000 : 200);
      tick();
      $('#stop')?.focus();
    } catch (error) {
      capture?.display?.getTracks().forEach(track => track.stop());
      capture?.mic?.getTracks().forEach(track => track.stop());
      live.session = null; live.id = null;
      if (info) await api.annuler(info.id).catch(() => {});
      api.signalerEtat(null);
      setState('repos');
      drawFrame();
      const denied = /NotAllowed|Permission|autoris/i.test(`${error.name} ${error.message}`);
      live.alerts.start = { level: 'warn', text: denied ? (state.image || state.systemAudio ? 'L’enregistrement de l’écran et du son de l’ordinateur n’est pas autorisé pour Expect Transcription. Autorisez-le dans les réglages du système, puis réessayez.' : 'Le micro n’est pas autorisé pour Expect Transcription.') : error.message, action: denied ? (state.image || state.systemAudio ? 'ecran' : 'micro') : null };
      showAlerts();
    }
  }

  function togglePause() {
    if (!live.session) return;
    if (live.etat === 'pause') { live.session.resume(); setState('enregistrement'); }
    else { live.session.pause(); setState('pause'); }
    tick();
    $('#pause')?.focus();
  }

  async function stop(after) {
    if (!live.session || live.etat === 'finalisation') return;
    clearInterval(live.timer);
    setState('finalisation');
    api.signalerEtat({ etat: 'finalisation', duree: live.session.elapsed() });
    const session = live.session, id = live.id;
    await session.stop();
    live.session = null; live.id = null; live.alerts = {};
    try {
      await api.terminer(id);
      setState('repos');
      live.title = '';
      if (after === 'quitter') return api.quitter();
      location.hash = `#/enregistrement/${encodeURIComponent(id)}/termine`;
    } catch (error) {
      setState('repos');
      notice(error.message);
    }
  }

  async function cancel() {
    const ok = await confirmAction({ title: 'Annuler cet enregistrement ?', text: 'Ce qui a été enregistré part dans la Corbeille de l’ordinateur, sans transcription. Vous pourrez l’y récupérer tant qu’elle n’est pas vidée.', yes: 'Annuler et mettre à la corbeille' });
    if (!ok || !live.session) return;
    clearInterval(live.timer);
    const session = live.session, id = live.id;
    live.session = null; live.id = null; live.alerts = {};
    await session.stop();
    await api.annuler(id).catch(error => notice(error.message));
    api.signalerEtat(null);
    setState('repos');
    drawFrame();
    notice('Enregistrement annulé et placé dans la Corbeille.');
  }

  main.querySelectorAll('button[data-image]').forEach(button => button.addEventListener('click', () => {
    state.image = button.dataset.image === 'true';
    savePrefs({ image: state.image });
    main.querySelectorAll('button[data-image]').forEach(other => other.setAttribute('aria-pressed', String(other === button)));
    $('#image-sources').hidden = !state.image;
    $('#frame-picture').innerHTML = '';
    if (state.image && !state.sources.length) loadSources();
    drawFrame(); drawControls();
  }));
  main.querySelectorAll('[data-kind]').forEach(button => button.addEventListener('click', () => {
    state.kind = button.dataset.kind;
    main.querySelectorAll('[data-kind]').forEach(other => other.setAttribute('aria-pressed', String(other === button)));
    state.selected = state.kind === 'ecran' ? state.sources.find(source => source.type === 'ecran')?.id || null : null;
    drawSources(); drawFrame(); drawControls();
  }));
  $('#source-grid').addEventListener('click', event => {
    const button = event.target.closest('[data-source]');
    if (!button) return;
    state.selected = button.dataset.source;
    main.querySelectorAll('.source').forEach(other => other.setAttribute('aria-pressed', String(other === button)));
    drawFrame(); drawControls();
  });
  $('#refresh-sources').addEventListener('click', loadSources);
  $('#system-audio').addEventListener('change', event => { state.systemAudio = event.target.checked; savePrefs({ systemAudio: state.systemAudio }); drawFrame(); drawControls(); });
  $('#micro').addEventListener('change', event => { state.micro = event.target.checked; $('#micro-select').disabled = !state.micro; savePrefs({ micro: state.micro }); drawFrame(); drawControls(); });
  $('#micro-select').addEventListener('change', event => { state.microId = event.target.value; savePrefs({ microId: state.microId }); });
  const resize = () => drawRibbon();
  window.addEventListener('resize', resize);

  live.commands = { pause: () => live.etat === 'enregistrement' && togglePause(), reprendre: () => live.etat === 'pause' && togglePause(), arreter: () => stop(), 'arreter-et-quitter': () => stop('quitter') };
  drawFrame();
  drawControls();
  if (recording) { live.timer = setInterval(tick, reduced.matches ? 1000 : 200); tick(); }
  else await Promise.all([state.image ? loadSources() : Promise.resolve(), loadMics()]);
  return () => { clearInterval(live.timer); window.removeEventListener('resize', resize); };
}
