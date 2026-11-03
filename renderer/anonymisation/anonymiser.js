// Anonymisation automatique d'une transcription, réglage strict, sans relecture humaine.
// Pensée pour un texte qu'on va coller dans un assistant en ligne : elle masque large (un nom de
// marque ou d'établissement peut y passer) plutôt que de laisser un nom de personne.
// Passes : motifs (courriel, lien, téléphone, numéro long, adresse, code postal, date ramenée au
// mois), puis noms propres repérés par leur majuscule, enfin chaque forme masquée l'est partout.
// Ne masque pas ce qui n'identifie personne : lexiques d'ExpectQuali (maladies éponymes,
// institutions, grands lieux, nationalités, formules d'adresse), copiés par scripts/importer_lexiques.py.
// Angle mort : un nom écrit sans majuscule, déformé par la transcription, cité en début de phrase sans
// être un prénom courant, ou qui est aussi un mot des lexiques (une ville, un hôpital) sans indice de
// personne autour, reste visible ; une personne se reconnaît aussi par ce qu'on dit d'elle.
import { lexiques } from './lexiques.js';

export const LIBELLES = { personne: 'PERSONNE', lieu: 'LIEU', nom: 'NOM', courriel: 'COURRIEL', lien: 'LIEN', telephone: 'TÉLÉPHONE', numero: 'NUMÉRO', adresse: 'ADRESSE', code_postal: 'CODE POSTAL', date: 'DATE' };
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

export function plier(value) {
  return String(value).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’'\-]/g, ' ').replace(/\s+/g, ' ').trim();
}

const set = words => new Set(words.split(/\s+/).filter(Boolean));
// Mots qui ouvrent une phrase sans être des noms : une majuscule de début de phrase ne prouve rien.
const OUVERTURES = set(`le la les l un une des du de d et ou mais donc or ni car alors puis ensuite enfin aussi ainsi bon bah ben euh oui non si
  voila voici bonjour bonsoir merci salut bienvenue je j tu il elle on nous vous ils elles ce c cet cette ces ca cela ceci celui celle ceux celles
  moi toi lui eux leur leurs mon ma mes ton ta tes son sa ses notre nos votre vos qui que qu quoi quel quelle quels quelles quand comment pourquoi
  combien est en dans pour par sur sous avec sans chez vers entre depuis pendant avant apres comme parce puisque lorsque tout tous toute toutes
  rien personne chaque plusieurs certains certaines autre autres meme tres trop peu beaucoup plus moins deja encore toujours jamais aujourd
  hier demain maintenant ici premier premiere deuxieme troisieme dernier derniere excusez excuse pardon attendez regardez voyons ecoutez allez
  allons bien bref effectivement evidemment exactement ok okay hum hmm ah oh eh tiens voyez sinon pourtant cependant toutefois neanmoins voyons
  sachez notez retenez imaginons prenons disons reprenons passons commencons concernant selon grace face apres-midi matin soir chers cher chere`);
// Lu comme un mot courant même avec une majuscule au milieu d'une phrase.
const COMMUNS = set(`internet web dieu covid sida vih noel paques ramadan toussaint master licence bac doctorat zoom teams meet google chatgpt
  whatsapp youtube facebook instagram linkedin microsoft apple android iphone wikipedia powerpoint word excel pdf euro euros lundi mardi mercredi
  jeudi vendredi samedi dimanche janvier fevrier mars avril mai juin juillet aout septembre octobre novembre decembre etat republique nord sud est
  ouest moyen age antiquite renaissance terre lune soleil`);
const CIVILITES = set('monsieur madame mademoiselle m mme mlle mr dr docteur docteure pr professeur professeure maitre me');
const PARTICULES = set('de du des la le van von ben bin el al di da del dos ter');
const LIEUX_AVANT = set('a au aux en dans vers depuis habite habitent vit vivent ne nee ville commune quartier region');
const INTRODUCTEURS = /(?:je m['’]appelle|il s['’]appelle|elle s['’]appelle|moi c['’]est|mon prénom(?: c['’]est)?|mon nom(?: c['’]est)?)\s+$/i;
// Prénoms courants : un prénom seul en début de phrase (« Marie a dit… ») est masqué quand même.
const PRENOMS = set(`jean pierre michel andre philippe alain jacques bernard claude daniel christian patrick nicolas christophe francois eric
  laurent frederic stephane david olivier julien thomas alexandre sebastien vincent maxime antoine guillaume romain kevin mathieu matthieu
  benjamin florian jeremy anthony adrien hugo lucas louis gabriel arthur jules leo raphael paul adam nathan ethan noah mohamed mohammed ahmed ali
  karim mehdi yanis rayan enzo theo tom clement quentin alexis valentin simon damien cedric fabrice franck gilles herve jerome ludovic marc
  pascal sylvain thierry xavier yves denis didier dominique emmanuel gerard henri joel marcel maurice raymond rene robert roger serge bruno
  cyril arnaud aurelien baptiste bastien charles edouard etienne felix gael gregory jordan loic martin mathis matteo noe oscar sacha samuel
  timothee tristan victor william youssef ibrahim moussa amine bilal hamza idris ilyes nassim omar samir sofiane walid yacine younes
  marie nathalie isabelle sylvie catherine christine francoise martine monique nicole sandrine valerie veronique sophie celine stephanie
  aurelie julie camille laura lea manon chloe emma ines jade louise alice lina rose anna mila ambre juliette lucie sarah pauline marion claire
  anne helene elodie emilie caroline laure laetitia melanie virginie audrey charlotte clara margaux mathilde oceane justine morgane amandine
  anais alexandra agnes brigitte chantal colette danielle denise florence genevieve jacqueline jeanne josiane madeleine michele odile patricia
  sabrina sonia corinne karine delphine cecile fabienne gaelle ludivine myriam nadia fatima aicha yasmine leila salma amina nour zoe eva nina
  elise agathe apolline victoire adele romane elsa margot lola maelys lou capucine berenice coralie estelle jessica jennifer melissa vanessa
  severine solene tiphaine laurence beatrice evelyne josette lucienne simone suzanne yvette yvonne paulette ginette odette huguette marjorie`);
const GARDES = new Set(Object.values(lexiques).flat());

function garder(words) {
  const whole = plier(words.join(' '));
  if (GARDES.has(whole) || COMMUNS.has(whole)) return true;
  return words.every(word => { const folded = plier(word); return GARDES.has(folded) || COMMUNS.has(folded) || PARTICULES.has(folded); });
}

const MOTIFS = [
  ['courriel', /[\w.%+-]+@[\w-]+(?:\.[\w-]+)*\.[A-Za-z]{2,}/g],
  ['lien', /\b(?:https?:\/\/|www\.)[^\s,;]+/gi],
  ['numero', /\bFR\d{2}(?:\s?[0-9A-Z]{4}){5}\s?[0-9A-Z]{1,3}\b/g],
  ['telephone', /(?:\+33\s?|\b0)[1-9](?:[\s.\-]?\d{2}){4}\b/g],
  ['telephone', /\+\d{1,3}(?:[\s.\-]?\d{2,4}){2,5}\b/g],
  ['telephone', /\b\d{3}[\s.\-]\d{3}[\s.\-]\d{4}\b/g],
  ['numero', /\b\d(?:[\s.\-]?\d){8,}\b/g],
  ['adresse', /\b\d{1,4}(?:\s?(?:bis|ter))?,?\s+(?:(?:rue|avenue|boulevard|bd|chemin|route|impasse|all[ée]e|place|cours|quai|faubourg|square|résidence|lotissement)\b|av\.)[^,.;!?\n]{0,40}/gi],
  ['code_postal', /\b\d{5}(?=\s+\p{Lu})/gu],
  ['date', new RegExp(`\\b(\\d{1,2})(?:er)?\\s+(${MOIS.join('|')})\\s+((?:19|20)\\d{2})\\b`, 'gi')],
  ['date', /\b(\d{1,2})[/.](\d{1,2})[/.]((?:19|20)\d{2})\b/g]
];

// Une date complète devient son mois : « 12 mars 1985 » → « mars 1985 ».
function dateGeneralisee(match) {
  if (/[/.]/.test(match[0])) return `${MOIS[Number(match[2]) - 1] || ''} ${match[3]}`.trim();
  return `${match[2].toLowerCase()} ${match[3]}`;
}

// L'élision est un mot à part : « d'Amiens » donne « d' » puis « Amiens ».
const MOT = /[dlnjcsmt]['’](?=\p{L})|qu['’](?=\p{L})|[\p{L}][\p{L}'’\-]*|\d+|\S/giu;
const FINS = new Set(['.', '?', '!', '…', ':', '«', '"', '“']);
const capitales = word => /^\p{Lu}{2,}$/u.test(word.replace(/[’'\-]/g, ''));
const majuscule = word => /^\p{Lu}/u.test(word) && !capitales(word);

/** Masque les segments d'une transcription. Rend, pour chaque segment, des morceaux de texte et de masques numérotés. */
export function anonymiser(segments) {
  const numeros = new Map(), compteurs = {}, formes = new Map(), mots = new Map();
  const numero = (categorie, forme) => {
    const key = `${categorie}|${plier(forme)}`;
    if (!numeros.has(key)) {
      // « Dupont » seul après « Marie Dupont » : même personne, même numéro.
      const linked = categorie !== 'date' && plier(forme).split(' ').length === 1 ? mots.get(plier(forme)) : null;
      if (linked && linked.categorie === categorie) numeros.set(key, linked.n);
      else { compteurs[categorie] = (compteurs[categorie] || 0) + 1; numeros.set(key, compteurs[categorie]); }
    }
    const n = numeros.get(key);
    if (['personne', 'lieu', 'nom'].includes(categorie)) {
      for (const word of plier(forme).split(' ')) if (word.length >= 3 && !PARTICULES.has(word) && !CIVILITES.has(word) && !mots.has(word)) mots.set(word, { categorie, n });
    }
    const label = `${categorie}|${n}`;
    if (!formes.has(label)) formes.set(label, { categorie, n, formes: new Set() });
    formes.get(label).formes.add(forme);
    return n;
  };

  let phraseOuverte = true;
  const premier = segments.map(segment => {
    const text = segment.texte, spans = [];
    const libre = (start, end) => spans.every(span => end <= span.start || start >= span.end);
    for (const [categorie, regex] of MOTIFS) {
      for (const match of text.matchAll(regex)) {
        const start = match.index, end = start + match[0].length;
        if (!libre(start, end)) continue;
        spans.push({ start, end, categorie, forme: match[0], remplacement: categorie === 'date' ? dateGeneralisee(match) : null });
      }
    }
    const tokens = [...text.matchAll(MOT)].map(match => ({ word: match[0], start: match.index, end: match.index + match[0].length }));
    for (let index = 0; index < tokens.length; index += 1) {
      const token = tokens[index];
      const ouverture = index === 0 ? phraseOuverte : FINS.has(tokens[index - 1].word);
      // « Madame DUPONT », « je m'appelle MARTIN » : des capitales après un indice de personne.
      if (capitales(token.word) && token.word.length >= 3 && libre(token.start, token.end)
        && (CIVILITES.has(plier(tokens[index - 1]?.word || '')) || INTRODUCTEURS.test(text.slice(0, token.start)))) {
        spans.push({ start: token.start, end: token.end, categorie: 'personne', forme: token.word });
        continue;
      }
      if (!majuscule(token.word) || !libre(token.start, token.end)) continue;
      // Une suite de mots à majuscule, avec ses particules : « Jean de La Fontaine ».
      let last = index;
      for (let next = index + 1; next < tokens.length; next += 1) {
        const suite = majuscule(tokens[next].word) || (capitales(tokens[next].word) && tokens[next].word.length >= 3);
        if (suite && libre(tokens[next].start, tokens[next].end)) { last = next; continue; }
        if (PARTICULES.has(tokens[next].word.toLowerCase()) && tokens[next + 1] && majuscule(tokens[next + 1].word)) continue;
        break;
      }
      let first = index;
      // Formule d'adresse : « Madame Martin » garde « Madame », masque « Martin ».
      while (first <= last && CIVILITES.has(plier(tokens[first].word))) first += 1;
      const civilite = first > index;
      // En début de phrase, les mots d'ouverture (« Bonjour », « Le ») ne sont pas des noms.
      let debut = ouverture && !civilite;
      while (debut && first <= last && OUVERTURES.has(plier(tokens[first].word))) { first += 1; debut = false; }
      if (first > last) { index = last; continue; }
      const words = tokens.slice(first, last + 1).map(item => item.word);
      const prenom = words.some(word => plier(word).split(' ').some(part => PRENOMS.has(part)));
      const intro = INTRODUCTEURS.test(text.slice(0, tokens[first].start));
      // Un indice de personne (civilité, présentation, prénom) l'emporte sur les lexiques : « Madame Nancy »,
      // « Monsieur Pellegrin » sont des personnes, même si Nancy est une ville et Pellegrin un hôpital.
      const personne = civilite || intro || prenom || CIVILITES.has(plier(tokens[first - 1]?.word || ''));
      if (!personne && garder(words)) { index = last; continue; }
      if (debut && words.length === 1 && !prenom && !intro) { index = last; continue; }
      const avant = plier(tokens[first - 1]?.word || '');
      const categorie = civilite || prenom || intro || CIVILITES.has(avant) ? 'personne' : LIEUX_AVANT.has(avant) ? 'lieu' : 'nom';
      spans.push({ start: tokens[first].start, end: tokens[last].end, categorie, forme: text.slice(tokens[first].start, tokens[last].end) });
      index = last;
    }
    phraseOuverte = /[.?!…]\s*$/.test(text.trim()) || !text.trim();
    return { segment, spans, tokens };
  });

  // Numérotation dans l'ordre du texte, puis chaque forme masquée l'est partout, même en début de phrase.
  for (const item of premier) {
    for (const span of item.spans.sort((a, b) => a.start - b.start)) {
      if (span.categorie === 'date') continue;
      // Un mot seul déjà masqué garde sa catégorie : « DUPONT » après « Madame DUPONT » reste une personne.
      const known = plier(span.forme).split(' ').length === 1 && ['personne', 'lieu', 'nom'].includes(span.categorie) ? mots.get(plier(span.forme)) : null;
      if (known) span.categorie = known.categorie;
      span.n = numero(span.categorie, span.forme);
    }
  }
  for (const item of premier) {
    for (const token of item.tokens) {
      const known = mots.get(plier(token.word));
      if (!known || !/^\p{Lu}/u.test(token.word) || item.spans.some(span => token.start < span.end && token.end > span.start)) continue;
      item.spans.push({ start: token.start, end: token.end, categorie: known.categorie, forme: token.word, n: known.n });
      formes.get(`${known.categorie}|${known.n}`)?.formes.add(token.word);
    }
  }

  const occurrences = {};
  const result = premier.map(({ segment, spans }) => {
    const text = segment.texte, morceaux = [];
    let at = 0;
    for (const span of spans.sort((a, b) => a.start - b.start)) {
      if (span.start > at) morceaux.push({ texte: text.slice(at, span.start) });
      const remplacement = span.remplacement ?? `[${LIBELLES[span.categorie]} ${span.n}]`;
      morceaux.push({ texte: remplacement, masque: span.categorie });
      occurrences[span.categorie] = (occurrences[span.categorie] || 0) + 1;
      at = span.end;
    }
    if (at < text.length) morceaux.push({ texte: text.slice(at) });
    return { ...segment, texte: morceaux.map(part => part.texte).join(''), morceaux };
  });
  const table = [...formes.values()].map(entry => ({ ...entry, formes: [...entry.formes] }))
    .sort((a, b) => a.categorie.localeCompare(b.categorie) || a.n - b.n);
  return { segments: result, occurrences, table, total: Object.values(occurrences).reduce((a, b) => a + b, 0) };
}
