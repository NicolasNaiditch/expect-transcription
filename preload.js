// Pont minimal et nommé entre l'interface et l'ordinateur ; aucun accès général aux fichiers.
const { contextBridge, ipcRenderer, webUtils } = require('electron');

async function call(channel, ...args) {
  const answer = await ipcRenderer.invoke(channel, ...args);
  if (!answer.ok) throw new Error(answer.erreur);
  return answer.valeur;
}

function listen(channel) {
  return handler => {
    const wrapped = (_event, value) => handler(value);
    ipcRenderer.on(channel, wrapped);
    return () => ipcRenderer.removeListener(channel, wrapped);
  };
}

contextBridge.exposeInMainWorld('transcrire', {
  infos: () => call('app:infos'),
  licences: () => call('app:licences'),
  ecrire: () => call('app:ecrire'),
  sources: () => call('capture:sources'),
  demanderMicro: () => call('capture:micro'),
  ouvrirReglages: kind => call('capture:reglages', kind),
  commencer: options => call('enregistrement:commencer', options),
  envoyerVideo: (id, chunk) => ipcRenderer.send('enregistrement:video', id, chunk),
  envoyerAudio: (id, chunk) => ipcRenderer.send('enregistrement:audio', id, chunk),
  signalerEtat: state => ipcRenderer.send('enregistrement:etat', state),
  terminer: id => call('enregistrement:terminer', id),
  annuler: id => call('enregistrement:annuler', id),
  // Le chemin d'un fichier glissé ou choisi : seul moyen de le connaître dans une interface isolée.
  cheminDe: file => webUtils.getPathForFile(file),
  importer: options => call('fichier:importer', options),
  commencerConversion: id => call('conversion:commencer', id),
  envoyerConversion: (id, chunk) => ipcRenderer.send('conversion:audio', id, chunk),
  terminerConversion: id => call('conversion:terminer', id),
  abandonnerConversion: id => call('conversion:abandonner', id),
  transcrire: (id, modele) => call('transcription:lancer', { id, modele }),
  arreterTranscription: () => call('transcription:arreter'),
  liste: () => call('bibliotheque:liste'),
  chercher: query => call('bibliotheque:chercher', query),
  profil: id => call('bibliotheque:profil', id),
  detail: id => call('bibliotheque:detail', id),
  renommer: (id, titre) => call('bibliotheque:renommer', id, titre),
  corbeille: id => call('bibliotheque:corbeille', id),
  afficher: id => call('bibliotheque:afficher', id),
  exporter: (id, options) => call('bibliotheque:exporter', id, options),
  modeles: () => call('modeles:etat'),
  telecharger: id => call('modeles:telecharger', id),
  pauseTelechargement: () => call('modeles:pause'),
  importerModele: id => call('modeles:importer', id),
  retirerModele: id => call('modeles:retirer', id),
  icones: urls => call('indicateur:icones', urls),
  quitter: () => ipcRenderer.send('app:quitter'),
  surProgressionTranscription: listen('transcription:progression'),
  surProgressionModele: listen('modeles:progression'),
  surCommande: listen('commande'),
  surAlerte: listen('alerte'),
  media: (id, key) => `media://enregistrement/${encodeURIComponent(id)}/${key}`
});
