// Substitut minimal d'Electron pour tester le processus principal sous Node : dossiers temporaires,
// Corbeille simulée par un déplacement, net.fetch = fetch de Node. Ne prouve rien du vrai Electron.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const base = fs.mkdtempSync(path.join(os.tmpdir(), 'transcrire-test-'));
const trashed = [];
module.exports = {
  __base: base,
  __trashed: trashed,
  app: { getPath: name => { const folder = path.join(base, name); fs.mkdirSync(folder, { recursive: true }); return folder; }, isPackaged: false },
  shell: {
    trashItem: async target => { const destination = path.join(base, 'Corbeille', path.basename(target)); fs.mkdirSync(path.dirname(destination), { recursive: true }); fs.renameSync(target, destination); trashed.push(destination); },
    showItemInFolder: () => {}, openPath: async () => ''
  },
  net: { fetch: (url, options) => fetch(url, options) }
};
