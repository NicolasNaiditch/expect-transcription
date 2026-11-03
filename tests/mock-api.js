// API simulée pour la recette navigateur : bibliothèque en mémoire, modèles et transcription fictifs,
// capture synthétique (mire animée + tonalité). Ne prouve ni la capture réelle, ni le moteur, ni les autorisations.
(() => {
  const params = new URLSearchParams(location.search);
  const scenario = params.get('scenario') || '';
  // C8 et captures d'un écran précis : conditions déjà lues, sinon la fenêtre modale masque la page.
  if (params.get('conditions') === 'lues') try { localStorage.setItem('conditions', '1'); } catch {}
  const listeners = { modele: [], transcription: [], commande: [] };
  const emit = (kind, value) => listeners[kind].forEach(fn => fn(value));
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const metrics = (window.__recette = { video: 0, audio: 0, etats: [], copies: [] });
  const now = Date.now();
  const segments = [
    { debut: 0.5, fin: 9, texte: 'Bonjour à toutes et à tous. Aujourd’hui, nous reprenons le cours d’épidémiologie du Master santé publique.' },
    { debut: 9, fin: 17.5, texte: 'Premier rappel : l’incidence compte les nouveaux cas pendant une période, alors que la prévalence compte tous les cas présents.' },
    { debut: 17.5, fin: 23, texte: 'Excusez-moi, madame Kowalski, est-ce que la prévalence peut augmenter même si l’incidence baisse ?' },
    { debut: 23, fin: 31, texte: 'Bonne question, Thomas. Prenons la maladie de Parkinson : à Montreuil comme ailleurs en France, on vit plus longtemps avec elle.' },
    { debut: 31, fin: 38, texte: 'Si vous avez des questions, écrivez-moi à prenom.nom@exemple.fr ou appelez le 06 12 34 56 78.' }
  ];
  const items = new Map();
  const add = (id, values) => items.set(id, { id, titre: id.slice(19), cree: new Date(now - values.age).toISOString(), source: values.image === false ? 'son' : 'ecran', sons: { ordinateur: true, micro: true },
    origine: values.origine || 'enregistrement', image: values.image ?? true, ...(values.origine === 'fichier' ? { fichier_source: 'source.m4a', nom_origine: 'Interview.m4a' } : {}),
    duree_s: values.duree, etat: values.etat, dossier: '/Users/personne/Documents/Expect Transcription/' + id, fichiers: { video: 48e6, audio: 2e6, json: values.etat === 'transcrit' ? 4000 : 0, text: values.etat === 'transcrit' ? 2000 : 0 },
    octets: 50e6, modele: values.etat === 'transcrit' ? 'rapide' : undefined, transcription_s: 41, transcription: values.etat === 'transcrit' ? { modele: 'rapide', segments } : null });
  if (scenario !== 'vide') {
    add('2026-10-28 10h02 — Cours d’épidémiologie, séance 4', { age: 5 * 864e5, duree: 3121, etat: 'transcrit' });
    add('2026-10-30 14h30 — Atelier méthodes qualitatives', { age: 3 * 864e5, duree: 2710, etat: 'enregistre' });
    add('2026-11-01 09h15 — Conférence invitée', { age: 864e5, duree: 1840, etat: 'interrompu', image: false });
    add('2026-09-18 16h40 — Interview de rentrée', { age: 45 * 864e5, duree: 1312, etat: 'transcrit', origine: 'fichier', image: false });
    add('2026-09-02 11h00 — Mémo interrompu', { age: 61 * 864e5, duree: 0, etat: 'interrompu', origine: 'fichier', image: false });
    Object.assign(items.get('2026-09-02 11h00 — Mémo interrompu'), { fichiers: { video: 0, audio: 0, json: 0, text: 0, source: 3e6 }, octets: 3e6, note: 'La préparation du son a été interrompue. Déposez de nouveau le fichier pour la reprendre.' });
  }
  const installed = new Set(scenario === 'sans-modele' || scenario === 'vide' ? [] : ['rapide']);
  let downloading = null;
  const catalog = [
    { id: 'rapide', nom: 'Rapide', resume: 'Pour un ordinateur modeste ou une longue séance. Plus d’erreurs sur les noms propres.', fichier: 'ggml-small-q5_1.bin', octets: 190085487, licence: 'MIT' },
    { id: 'precis', nom: 'Précis', resume: 'Meilleure fidélité, notamment pour les termes techniques. Plus lent sans carte graphique.', fichier: 'ggml-large-v3-turbo-q5_0.bin', octets: 574041195, licence: 'MIT' }
  ];
  const thumb = (label, hue) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200"><rect width="320" height="200" fill="hsl(${hue} 30% 92%)"/><rect x="0" y="0" width="320" height="22" fill="hsl(${hue} 25% 80%)"/><rect x="24" y="44" width="180" height="14" rx="3" fill="hsl(${hue} 30% 60%)"/><rect x="24" y="70" width="260" height="8" rx="3" fill="hsl(${hue} 15% 75%)"/><rect x="24" y="86" width="230" height="8" rx="3" fill="hsl(${hue} 15% 75%)"/><rect x="24" y="112" width="120" height="64" rx="4" fill="hsl(${hue} 40% 70%)"/><text x="160" y="190" font-family="sans-serif" font-size="11" text-anchor="middle" fill="#334">${label}</text></svg>`);
  const sources = [
    { id: 'screen:1:0', nom: 'Écran 1 — intégré', type: 'ecran', apercu: thumb('Écran 1 (fictif)', 210) },
    { id: 'screen:2:0', nom: 'Écran 2', type: 'ecran', apercu: thumb('Écran 2 (fictif)', 30) },
    { id: 'window:11:0', nom: 'Visio — Cours de santé publique', type: 'fenetre', apercu: thumb('Fenêtre de visio (fictive)', 160) },
    { id: 'window:12:0', nom: 'Diapositives — séance 4', type: 'fenetre', apercu: thumb('Diapositives (fictives)', 280) }
  ];

  // Capture synthétique à la place de getDisplayMedia : une vraie piste vidéo et une vraie piste son.
  navigator.mediaDevices.getDisplayMedia = async ({ audio }) => {
    const canvas = Object.assign(document.createElement('canvas'), { width: 640, height: 360 });
    const c = canvas.getContext('2d');
    let frame = 0;
    setInterval(() => { c.fillStyle = `hsl(${frame++ % 360} 40% 60%)`; c.fillRect(0, 0, 640, 360); c.fillStyle = '#fff'; c.font = '28px sans-serif'; c.fillText('Mire de recette ' + frame, 40, 180); }, 66);
    const stream = canvas.captureStream(15);
    if (audio && scenario !== 'son-refuse') {
      const ctx = new AudioContext(), osc = ctx.createOscillator(), gain = ctx.createGain(), dest = ctx.createMediaStreamDestination();
      gain.gain.value = scenario === 'silence' ? 0 : 0.2; osc.connect(gain).connect(dest); osc.start();
      const track = dest.stream.getAudioTracks()[0];
      if (scenario === 'son-muet') track.stop();
      stream.addTrack(track);
    }
    return stream;
  };
  navigator.mediaDevices.getUserMedia = async () => {
    const ctx = new AudioContext(), osc = ctx.createOscillator(), gain = ctx.createGain(), dest = ctx.createMediaStreamDestination();
    osc.frequency.value = 220; gain.gain.value = 0.1; osc.connect(gain).connect(dest); osc.start();
    return dest.stream;
  };
  navigator.mediaDevices.enumerateDevices = async () => [{ kind: 'audioinput', deviceId: 'micro-fictif', label: 'Micro USB (fictif)' }];
  if (navigator.clipboard) navigator.clipboard.writeText = async text => { metrics.copies.push(text.length); };

  let current = null;
  window.transcrire = {
    infos: async () => ({ plateforme: 'darwin', version: '0.2.1', bibliotheque: '/Users/personne/Documents/Expect Transcription', synchro: scenario === 'synchro' ? 'OneDrive' : null }),
    licences: async () => { metrics.etats.push('licences'); return true; },
    ecrire: async () => { metrics.etats.push('ecrire'); return true; },
    cheminDe: file => '/Users/personne/Téléchargements/' + file.name,
    importer: async ({ chemin }) => {
      const name = chemin.split('/').pop(), id = '2026-11-02 14h20 — ' + name.replace(/\.[^.]+$/, '');
      add(id, { age: 0, duree: 0, etat: 'preparation', origine: 'fichier', image: false });
      Object.assign(items.get(id), { titre: name.replace(/\.[^.]+$/, ''), nom_origine: name, fichier_source: 'source' + name.slice(name.lastIndexOf('.')).toLowerCase(), fichiers: { video: 0, audio: 0, json: 0, text: 0, source: 1e6 }, octets: 1e6 });
      metrics.etats.push('import:' + name);
      return items.get(id);
    },
    commencerConversion: async () => true,
    envoyerConversion: (_id, chunk) => { metrics.audio += chunk.byteLength; },
    terminerConversion: async id => { const item = items.get(id); item.fichiers.audio = Math.max(45, metrics.audio); return Object.assign(item, { etat: 'enregistre' }); },
    abandonnerConversion: async id => { items.delete(id); return true; },
    chercher: async query => [...items.values()].filter(item => item.transcription && item.transcription.segments.some(segment => segment.texte.toLowerCase().includes(query.toLowerCase())))
      .map(item => ({ id: item.id, extrait: '…' + item.transcription.segments.find(segment => segment.texte.toLowerCase().includes(query.toLowerCase())).texte.slice(0, 90) + '…' })),
    profil: async () => Array.from({ length: 600 }, (_, i) => Math.round((0.25 + 0.55 * Math.abs(Math.sin(i / 7)) * (0.6 + 0.4 * Math.sin(i / 41))) * 100) / 100),
    sources: async () => sources,
    demanderMicro: async () => true,
    ouvrirReglages: async kind => { metrics.etats.push('reglages:' + kind); return true; },
    commencer: async ({ titre, sourceId, image }) => {
      const id = '2026-11-02 14h05 — ' + titre;
      current = id;
      metrics.image = image;
      add(id, { age: 0, duree: 0, etat: 'enregistrement', image: Boolean(image) });
      items.get(id).titre = titre; items.get(id).source = !image ? 'son' : sourceId.startsWith('screen:') ? 'ecran' : 'fenetre';
      return items.get(id);
    },
    envoyerVideo: (_id, chunk) => { metrics.video += chunk.byteLength; },
    envoyerAudio: (_id, chunk) => { metrics.audio += chunk.byteLength; },
    signalerEtat: state => { metrics.etats.push(state ? state.etat : 'aucun'); },
    terminer: async id => { const item = items.get(id); item.etat = 'enregistre'; item.duree_s = Math.round(metrics.audio / 32000); item.fichiers = { video: metrics.video, audio: metrics.audio, json: 0, text: 0 }; current = null; return item; },
    annuler: async id => { items.delete(id); current = null; return true; },
    transcrire: async id => {
      const item = items.get(id);
      item.etat = 'transcription';
      for (const value of [8, 23, 47, 71, 93]) { await sleep(scenario === 'lent' ? 1500 : 350); emit('transcription', { id, pourcentage: value }); }
      await sleep(200);
      Object.assign(item, { etat: 'transcrit', modele: 'rapide', transcription_s: 12, transcription: { modele: 'rapide', segments } });
      item.fichiers.text = 2000;
      return item;
    },
    arreterTranscription: async () => true,
    liste: async () => [...items.values()].sort((a, b) => b.cree.localeCompare(a.cree)),
    detail: async id => { const item = items.get(id); if (!item) throw new Error('Enregistrement introuvable : il a peut-être été déplacé ou supprimé.'); return item; },
    renommer: async (id, titre) => Object.assign(items.get(id), { titre }),
    corbeille: async id => { items.delete(id); return true; },
    afficher: async () => true,
    exporter: async (id, options) => { (metrics.exports ||= []).push({ anonyme: Boolean(options?.anonyme), format: options?.format || 'txt', texte: options?.texte || '' }); return '/Users/personne/Documents/' + items.get(id).titre + (options?.anonyme ? ' (anonymisé)' : '') + '.' + (options?.format || 'txt'); },
    modeles: async () => ({ dossier: '/Users/personne/Library/Application Support/Expect Transcription/modeles', recommande: 'precis', memoire_go: 16,
      ordinateur: { memoire_go: 16, coeurs: 10, processeur: 'Apple M2 Pro (fictif)', puce_apple: true, carte_graphique: 'Apple M2 Pro (fictif)', carte_utilisee: true,
        conseil: { id: 'precis', raison: 'La puce de ce Mac calcule aussi la transcription, avec ses 16 Go de mémoire partagée : Précis reste rapide et fait deux fois moins d’erreurs.' } },
      telechargement: downloading, detection_parole: { installe: installed.size > 0 },
      modeles: catalog.map(model => ({ ...model, installe: installed.has(model.id), partiel: downloading?.id === model.id ? downloading.recu : 0 })) }),
    telecharger: async id => {
      const model = catalog.find(item => item.id === id);
      downloading = { id, recu: 0, total: model.octets };
      for (const part of [0.1, 0.35, 0.6, 0.85, 1]) { await sleep(400); downloading.recu = Math.round(model.octets * part); emit('modele', { id, etape: 'telechargement', recu: downloading.recu, total: model.octets }); }
      emit('modele', { id, etape: 'verification', recu: model.octets, total: model.octets }); await sleep(300);
      downloading = null; installed.add(id); emit('modele', { id, etape: 'installe', recu: model.octets, total: model.octets });
      return window.transcrire.modeles();
    },
    pauseTelechargement: async () => true,
    importerModele: async () => window.transcrire.modeles(),
    retirerModele: async id => { installed.delete(id); return window.transcrire.modeles(); },
    icones: async () => true,
    quitter: () => { metrics.etats.push('quitter'); },
    surProgressionTranscription: fn => { listeners.transcription.push(fn); return () => {}; },
    surProgressionModele: fn => { listeners.modele.push(fn); return () => {}; },
    surCommande: fn => { listeners.commande.push(fn); return () => {}; },
    surAlerte: () => () => {},
    media: () => '/__fixture/cours.wav'
  };
  window.__commande = value => emit('commande', value);
})();
