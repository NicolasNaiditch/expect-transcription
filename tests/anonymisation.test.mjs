// Anonymisation stricte, sur des phrases fictives : ce qui doit partir, ce qui doit rester.
//   node --test tests/anonymisation.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { anonymiser } from '../renderer/anonymisation/anonymiser.js';

const texte = phrases => anonymiser(phrases.map((value, index) => ({ debut: index, fin: index + 1, texte: value })));
const sortie = phrases => texte(phrases).segments.map(segment => segment.texte);

test('noms de personnes, avec ou sans civilité, numérotés et suivis', () => {
  const [a, b, c, d] = sortie([
    'Marie Dupont m’a appelée hier.',
    'Excusez-moi, madame Kowalski, est-ce que la prévalence peut augmenter ?',
    'Dupont a répondu que non.',
    'Le docteur Martin et Jean-Pierre étaient là.'
  ]);
  assert.equal(a, '[PERSONNE 1] m’a appelée hier.');
  assert.equal(b, 'Excusez-moi, madame [PERSONNE 2], est-ce que la prévalence peut augmenter ?');
  assert.equal(c, '[PERSONNE 1] a répondu que non.');
  assert.equal(d, 'Le docteur [PERSONNE 3] et [PERSONNE 4] étaient là.');
});

test('prénom seul en début de phrase, et forme reprise partout', () => {
  const [a, b] = sortie(['Paul est arrivé en retard.', 'Ensuite, Kowalski a pris la parole. Kowalski a conclu.']);
  assert.equal(a, '[PERSONNE 1] est arrivé en retard.');
  assert.equal(b, 'Ensuite, [NOM 1] a pris la parole. [NOM 1] a conclu.');
});

test('coordonnées et dates', () => {
  const [a, b, c] = sortie([
    'Rappelez-moi au 06 12 34 56 78 ou écrivez à prenom.nom@exemple.fr.',
    'J’habite au 12 bis rue des Lilas, et je suis né le 3 mars 1985.',
    'Mon numéro de sécurité sociale est 1 85 03 75 115 042 21.'
  ]);
  assert.equal(a, 'Rappelez-moi au [TÉLÉPHONE 1] ou écrivez à [COURRIEL 1].');
  assert.equal(b, 'J’habite au [ADRESSE 1], et je suis né le mars 1985.');
  assert.equal(c, 'Mon numéro de sécurité sociale est [NUMÉRO 1].');
});

test('ce qui n’identifie personne reste visible', () => {
  const phrases = [
    'Bonjour à toutes et à tous.',
    'Aujourd’hui, nous reprenons le cours d’épidémiologie du Master santé publique.',
    'La maladie de Parkinson et la maladie d’Alzheimer touchent surtout les personnes âgées en France.',
    'La CPAM et l’ARS ont répondu en novembre.'
  ];
  assert.deepEqual(sortie(phrases), phrases);
});

test('lieux après une préposition, élision comprise', () => {
  const [a] = sortie(['Elle travaille à Montreuil-sur-Mer, près d’Étaples.']);
  assert.equal(a, 'Elle travaille à [LIEU 1], près d’[NOM 1].');
});

test('table de correspondance et décompte', () => {
  const result = texte(['Marie Dupont et Paul.', 'Dupont est revenue.']);
  assert.equal(result.total, 3);
  assert.deepEqual(result.table.map(entry => [entry.categorie, entry.n, entry.formes]), [['personne', 1, ['Marie Dupont', 'Dupont']], ['personne', 2, ['Paul']]]);
});

test('l’indice de personne l’emporte sur les lexiques, capitales comprises', () => {
  const [a, b, c, d] = sortie([
    'J’ai vu Madame Nancy et Monsieur Pellegrin hier.',
    'Madame DUPONT a signé, puis Jean DUPONT est parti.',
    'Il habite à Nancy, près de l’hôpital Pellegrin.',
    'Ensuite DUPONT a rappelé.'
  ]);
  assert.equal(a, 'J’ai vu Madame [PERSONNE 1] et Monsieur [PERSONNE 2] hier.');
  assert.equal(b, 'Madame [PERSONNE 3] a signé, puis [PERSONNE 4] est parti.');
  // Réglage strict : une forme reconnue comme une personne est masquée partout dans le texte.
  assert.equal(c, 'Il habite à [PERSONNE 1], près de l’hôpital [PERSONNE 2].');
  assert.equal(d, 'Ensuite [PERSONNE 3] a rappelé.');
  // Sans personne de ce nom dans le texte, la ville et l'hôpital restent lisibles.
  assert.deepEqual(sortie(['Il habite à Nancy, près de l’hôpital Pellegrin.']), ['Il habite à Nancy, près de l’hôpital Pellegrin.']);
});

test('autres formats de numéros et d’adresses', () => {
  const [a, b, c] = sortie([
    'Mon numéro américain est le 555-123-4567, ou le +44 20 7946 0958.',
    'La carte 4970-1234-5678-9012 a expiré.',
    'Écrivez au 3 av. des Tilleuls.'
  ]);
  assert.equal(a, 'Mon numéro américain est le [TÉLÉPHONE 1], ou le [TÉLÉPHONE 2].');
  assert.equal(b, 'La carte [NUMÉRO 1] a expiré.');
  assert.equal(c, 'Écrivez au [ADRESSE 1].');
});
