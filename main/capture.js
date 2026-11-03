// Capture déléguée à Chromium : écran ou fenêtre choisis dans l'app, son de l'ordinateur en « loopback ».
// macOS : son de l'ordinateur à partir de 14.2 ; un refus d'autorisation donne une piste muette, détectée côté interface.
// Le son de l'ordinateur passe toujours par une capture d'écran : sans image gardée, l'interface laisse
// l'écran principal ouvert en très basse définition et n'en enregistre rien.
const { desktopCapturer, shell, systemPreferences } = require('electron');

let pending = null;
let ownWindows = () => [];

async function sources() {
  const own = new Set(ownWindows());
  const list = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 320, height: 200 }, fetchWindowIcons: false });
  return list.filter(source => !own.has(source.id)).map((source, index) => ({
    id: source.id,
    nom: source.name || (source.id.startsWith('screen:') ? `Écran ${index + 1}` : 'Fenêtre sans titre'),
    type: source.id.startsWith('screen:') ? 'ecran' : 'fenetre',
    apercu: source.thumbnail && !source.thumbnail.isEmpty() ? source.thumbnail.toDataURL() : null
  }));
}

async function firstScreen() {
  const list = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } });
  if (!list.length) throw new Error('Aucun écran trouvé pour capter le son de l’ordinateur.');
  return list[0].id;
}

function choose(sourceId, systemAudio) {
  if (typeof sourceId !== 'string' || !/^(screen|window):[\w:-]+$/.test(sourceId)) throw new Error('Source d’image inconnue.');
  pending = { sourceId, systemAudio: Boolean(systemAudio) };
}

// Seule la source choisie dans l'app peut être accordée, une fois.
function install(session, windowIds) {
  ownWindows = windowIds;
  session.setDisplayMediaRequestHandler(async (_request, callback) => {
    const choice = pending;
    pending = null;
    try {
      if (!choice) return callback({});
      const list = await desktopCapturer.getSources({ types: ['screen', 'window'] });
      const source = list.find(item => item.id === choice.sourceId);
      if (!source) return callback({});
      callback(choice.systemAudio ? { video: source, audio: 'loopback' } : { video: source });
    } catch {
      callback({});
    }
  });
}

async function askMicrophone() {
  return process.platform === 'darwin' ? systemPreferences.askForMediaAccess('microphone') : true;
}

const SETTINGS = {
  darwin: {
    micro: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone',
    ecran: 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture',
    son: 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'
  },
  win32: { micro: 'ms-settings:privacy-microphone', ecran: 'ms-settings:privacy-graphicsCaptureProgrammatic' }
};

function openSettings(kind) {
  const url = Object.hasOwn(SETTINGS, process.platform) && Object.hasOwn(SETTINGS[process.platform], kind) ? SETTINGS[process.platform][kind] : null;
  if (url) shell.openExternal(url);
  return Boolean(url);
}

module.exports = { sources, firstScreen, choose, install, askMicrophone, openSettings };
