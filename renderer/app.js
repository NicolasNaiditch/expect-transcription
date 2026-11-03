// Coquille de l'app : thème, témoin d'enregistrement, écouteurs du processus principal, conditions au
// premier lancement et routeur. Chaque vue vit dans vues/ ; les textes des pages d'information dans pages.js.
import { api, clock, escape, focusHeading, notice } from './ui.js';
import { live, renderStudio } from './studio.js';
import { renderAbout, renderMentions } from './pages.js';
import { currentRoute, main, refreshModels, state, store, stored } from './etat.js';
import { ecouterDepot, renderImport } from './vues/fichier.js';
import { renderList } from './vues/liste.js';
import { remaining, renderRecord } from './vues/enregistrement.js';
import { drawProgress, renderModels } from './vues/modeles.js';

// Le thème suit le système tant que la personne n'a pas choisi avec le bouton ; ce choix seul est retenu.
const systemDark = matchMedia('(prefers-color-scheme: dark)');
function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('#theme-toggle').setAttribute('aria-label', theme === 'dark' ? 'Passer en thème clair' : 'Passer en thème sombre');
}
setTheme(stored('theme', null) || (systemDark.matches ? 'dark' : 'light'));
systemDark.addEventListener('change', event => { if (!stored('theme', null)) setTheme(event.matches ? 'dark' : 'light'); });
document.querySelector('#theme-toggle').addEventListener('click', () => {
  const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  store('theme', theme);
  setTheme(theme);
});

// Icônes du témoin système, dessinées ici pour ne livrer aucun fichier image supplémentaire.
function trayIcon(kind) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 32;
  const c = canvas.getContext('2d');
  c.fillStyle = kind === 'pause' ? '#5d6b7e' : '#c0392b';
  if (kind === 'pause') { c.fillRect(8, 6, 6, 20); c.fillRect(18, 6, 6, 20); }
  else { c.beginPath(); c.arc(16, 16, 10, 0, Math.PI * 2); c.fill(); }
  return canvas.toDataURL('image/png');
}
api.icones({ enregistrement: trayIcon('rec'), pause: trayIcon('pause') }).catch(() => {});

function updateHeader(route) {
  for (const link of document.querySelectorAll('[data-route]')) {
    if (link.dataset.route === route) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
  }
  const link = document.querySelector('#live');
  const recording = Boolean(live.session) && route !== 'enregistrer';
  link.hidden = !recording;
  if (recording) {
    const word = live.etat === 'pause' ? 'En pause' : live.etat === 'finalisation' ? 'Finalisation' : 'Enregistrement';
    link.textContent = `${word} ${clock(live.session.elapsed())}`;
    link.dataset.state = live.etat;
    link.setAttribute('aria-label', `${word} ${clock(live.session.elapsed())} — revenir au studio`);
  }
}

// Battement unique : témoin système et rappel dans l'en-tête, même hors du studio.
setInterval(() => {
  if (live.session) api.signalerEtat({ etat: live.etat, duree: live.session.elapsed() });
  updateHeader(currentRoute());
}, 1000);
live.onChange = () => updateHeader(currentRoute());

// Écriture impossible (disque plein) : le processus principal le dit, puis arrête l'enregistrement.
api.surAlerte(message => notice(message));

api.surCommande(command => {
  if (!live.session) return;
  if (command === 'arreter-et-quitter' && !location.hash.startsWith('#/enregistrer')) location.hash = '#/enregistrer';
  setTimeout(() => live.commands?.[command]?.(), command === 'arreter-et-quitter' ? 300 : 0);
});

api.surProgressionModele(progress => {
  state.download = progress.etape === 'telechargement' || progress.etape === 'verification' ? progress : null;
  const bar = document.querySelector(`[data-model="${progress.id}"] .progress`);
  if (bar) drawProgress(bar, progress);
});

api.surProgressionTranscription(({ id, pourcentage }) => {
  state.transcribing = { id, pourcentage, debut: state.transcribing?.id === id ? state.transcribing.debut : Date.now() };
  const host = document.querySelector(`#transcript[data-id="${CSS.escape(id)}"] .progress`);
  if (host) { host.querySelector('progress').value = pourcentage; host.querySelector('.progress-word').textContent = `${pourcentage} %${remaining(state.transcribing)}`; }
});

/* ---------- Conditions, au premier lancement ---------- */

function conditions(route) {
  const dialog = document.querySelector('#conditions');
  if (stored('conditions') === '1' || ['mentions', 'a-propos'].includes(route) || dialog.open) return;
  dialog.showModal();
  dialog.querySelector('#conditions-yes').onclick = () => { store('conditions', '1'); dialog.close(); focusHeading(); };
  dialog.querySelector('#conditions-more').onclick = () => dialog.close();
  dialog.oncancel = event => event.preventDefault();
}

/* ---------- Routeur ---------- */

async function route() {
  state.cleanup?.();
  state.cleanup = null;
  const parts = location.hash.replace(/^#\//, '').split('/');
  const name = parts[0] || 'enregistrer';
  updateHeader(name);
  main.setAttribute('aria-busy', 'true');
  try {
    if (name === 'enregistrements') await renderList();
    else if (name === 'enregistrement' && parts[1]) await renderRecord(decodeURIComponent(parts[1]), parts[2]);
    else if (name === 'modeles') await renderModels();
    else if (name === 'fichier') renderImport();
    else if (name === 'a-propos') await renderAbout(main, parts[1]);
    else if (name === 'mentions') await renderMentions(main, parts[1]);
    else state.cleanup = await renderStudio(main, { models: await refreshModels() });
    document.title = `${main.querySelector('h1')?.textContent?.trim() || 'Expect Transcription'} · Expect Transcription`;
    if (!(['mentions', 'a-propos'].includes(name) && parts[1])) focusHeading();
  } catch (error) {
    main.innerHTML = `<p class="alert">${escape(error.message)}</p><a class="back-link" href="#/enregistrements">← Mes enregistrements</a>`;
  } finally {
    main.removeAttribute('aria-busy');
  }
  conditions(name);
}

ecouterDepot();
window.addEventListener('hashchange', route);
route();
