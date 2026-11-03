// Témoin hors de la fenêtre : barre des menus (Mac) ou zone de notification (Windows), badge du Dock,
// icône superposée dans la barre des tâches. Pas de pastille flottante : elle risquerait d'apparaître dans la vidéo.
const { app, Menu, nativeImage, Tray } = require('electron');

let tray = null;
let icons = {};
let actions = {};
let lastState = '';

// Deux icônes dessinées par l'interface : seules ces deux clés, en petit PNG, sont acceptées.
function setIcons(urls) {
  icons = Object.fromEntries(['enregistrement', 'pause']
    .filter(key => typeof urls?.[key] === 'string' && urls[key].startsWith('data:image/png;base64,') && urls[key].length < 20000)
    .map(key => [key, nativeImage.createFromDataURL(urls[key])]));
}

function clock(seconds) {
  const s = Math.max(0, Math.floor(seconds || 0));
  const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, r = s % 60;
  return (h ? `${h}:${String(m).padStart(2, '0')}` : String(m).padStart(2, '0')) + ':' + String(r).padStart(2, '0');
}

const WORDS = { preparation: 'Préparation', enregistrement: 'Enregistrement', pause: 'En pause', finalisation: 'Finalisation' };

function menu(state) {
  return Menu.buildFromTemplate([
    { label: WORDS[state.etat], enabled: false },
    { type: 'separator' },
    { label: 'Afficher Expect Transcription', click: () => actions.show?.() },
    ...(state.etat === 'enregistrement' ? [{ label: 'Mettre en pause', click: () => actions.command?.('pause') }] : []),
    ...(state.etat === 'pause' ? [{ label: 'Reprendre', click: () => actions.command?.('reprendre') }] : []),
    ...(['enregistrement', 'pause'].includes(state.etat) ? [{ label: 'Arrêter l’enregistrement', click: () => actions.command?.('arreter') }] : [])
  ]);
}

function update(window, state) {
  if (!state?.etat || !Object.hasOwn(WORDS, state.etat)) {
    tray?.destroy(); tray = null; lastState = '';
    app.dock?.setBadge('');
    if (process.platform === 'win32') window?.setOverlayIcon(null, '');
    return;
  }
  const icon = icons[state.etat === 'pause' ? 'pause' : 'enregistrement'] || nativeImage.createEmpty();
  if (!tray) tray = new Tray(icon);
  else tray.setImage(icon);
  const label = `${state.etat === 'pause' ? '❚❚' : '●'} ${clock(state.duree)}`;
  if (process.platform === 'darwin') tray.setTitle(label, { fontType: 'monospacedDigit' });
  tray.setToolTip(`Expect Transcription — ${WORDS[state.etat].toLowerCase()} ${clock(state.duree)}`);
  // Le menu n'est reconstruit qu'au changement d'état : un menu ouvert ne se ferme pas chaque seconde.
  if (state.etat !== lastState) tray.setContextMenu(menu(state));
  lastState = state.etat;
  app.dock?.setBadge(state.etat === 'pause' ? '❚❚' : '●');
  if (process.platform === 'win32') window?.setOverlayIcon(icon, `${WORDS[state.etat]} ${clock(state.duree)}`);
}

function bind(values) { actions = values; }

module.exports = { setIcons, update, bind, clock };
