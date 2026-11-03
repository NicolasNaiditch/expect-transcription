// Actions sur un enregistrement, partagées par la liste et la page d'un enregistrement : menu, renommer,
// exporter (texte complet ou anonymisé, TXT ou sous-titres SRT), mettre à la corbeille.
import { api, confirmAction, notice, promptText } from '../ui.js';
import { anonymiser } from '../anonymisation/anonymiser.js';
import { state } from '../etat.js';

// Le moteur ne lit que le WAV écrit par l'app : un fichier déposé n'est transcriptible qu'une fois préparé.
export const transcribable = item => ['enregistre', 'interrompu'].includes(item.etat) && item.fichiers?.audio > 44;
export const KIND = item => item.origine === 'fichier' ? (item.image ? 'vidéo déposée' : 'son déposé') : item.image === false ? 'son' : item.source === 'fenetre' ? 'son et image d’une fenêtre' : 'son et image de l’écran';

export function recordMenu(item, after) {
  const canTranscribe = transcribable(item);
  return [
    { label: 'Ouvrir', action: () => { location.hash = `#/enregistrement/${encodeURIComponent(item.id)}`; } },
    { label: 'Renommer…', action: () => rename(item, after) },
    ...(canTranscribe ? [{ label: 'Transcrire maintenant', action: () => { location.hash = `#/enregistrement/${encodeURIComponent(item.id)}/transcrire`; } }] : []),
    { label: 'Afficher dans le dossier', action: () => api.afficher(item.id) },
    ...(item.etat === 'transcrit' ? [
      { label: 'Exporter le texte (TXT)…', action: () => exportText(item.id) },
      { label: 'Exporter le texte anonymisé (TXT)…', action: () => exportText(item.id, true) }
    ] : []),
    { label: 'Mettre à la corbeille…', danger: true, action: () => trash([item], after) }
  ];
}

async function rename(item, after) {
  const titre = await promptText({ title: 'Renommer l’enregistrement', label: 'Nouveau nom', value: item.titre, yes: 'Renommer' });
  if (!titre || titre === item.titre) return;
  try { await api.renommer(item.id, titre); notice('Nom enregistré.'); after(); } catch (error) { notice(error.message); }
}

function plainText(segments) {
  return segments.map(segment => segment.texte).join('\n') + '\n';
}

// Sous-titres SubRip : un passage par bloc, horaires au millième.
function srtTime(seconds) {
  const ms = Math.round(seconds * 1000), pad = (value, size = 2) => String(value).padStart(size, '0');
  return `${pad(Math.floor(ms / 3600000))}:${pad(Math.floor(ms / 60000) % 60)}:${pad(Math.floor(ms / 1000) % 60)},${pad(ms % 1000, 3)}`;
}
function subtitles(segments) {
  return segments.map((segment, index) => `${index + 1}\n${srtTime(segment.debut)} --> ${srtTime(segment.fin)}\n${segment.texte}\n`).join('\n');
}

export async function exportText(id, anonymous = false, format = 'txt') {
  try {
    const options = { anonyme: anonymous, format };
    if (anonymous || format === 'srt') {
      const item = await api.detail(id);
      const segments = anonymous ? anonymiser(item.transcription.segments).segments : item.transcription.segments;
      // La version anonymisée ne reprend pas le titre : il porte souvent un nom (celui du fichier déposé).
      options.texte = format === 'srt' ? subtitles(segments) : anonymous ? `Texte anonymisé automatiquement\n\n${plainText(segments)}` : plainText(segments);
    }
    const file = await api.exporter(id, options);
    const what = format === 'srt' ? (anonymous ? 'Sous-titres anonymisés exportés' : 'Sous-titres exportés') : (anonymous ? 'Texte anonymisé exporté' : 'Texte exporté');
    if (file) notice(`${what} : ${file}`);
  } catch (error) { notice(error.message); }
}

export async function trash(items, after) {
  const one = items.length === 1;
  const ok = await confirmAction({
    title: one ? `Mettre « ${items[0].titre} » à la corbeille ?` : `Mettre ${items.length} enregistrements à la corbeille ?`,
    text: `${one ? 'Le dossier de cet enregistrement' : 'Le dossier de chacun'} (son, image s’il y en a, texte) part dans la Corbeille de l’ordinateur. Vous pouvez l’y récupérer tant qu’elle n’est pas vidée.`,
    yes: 'Mettre à la corbeille'
  });
  if (!ok) return;
  let done = 0;
  for (const item of items) {
    try { await api.corbeille(item.id); done += 1; } catch (error) { notice(error.message); }
  }
  if (done) notice(one ? `« ${items[0].titre} » est dans la Corbeille.` : `${done} enregistrements sont dans la Corbeille.`);
  state.selection = null;
  after();
}

