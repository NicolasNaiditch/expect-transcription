# Contribuer à Expect Transcription

Merci de prendre le temps. Toute remarque compte : ce qui manque, ce qui gêne, ce qui ne marche pas sur votre ordinateur.

## Une suggestion ou un défaut

- Ouvrez une *issue*, ou écrivez à **nicolas.naiditch@expectpatient.com**.
- Pour un défaut, dites ce que vous faisiez, ce qui s’est affiché, votre système (Mac ou Windows, version) et la version de l’app (page « Mentions légales »).
- **N’envoyez jamais d’enregistrement ni de transcription de personnes réelles** sans leur accord. Un son fictif, ou une description, suffit presque toujours.

## Proposer une modification

1. Gardez le périmètre : une app locale, sans compte ni envoi. Une fonction qui ferait sortir du son ou du texte de l’ordinateur n’entrera pas.
2. Pas de nouvelle dépendance sans en dire la raison, la licence et la taille.
3. Les essais passent avant la demande de fusion :
   `node --test tests/principal.test.cjs tests/anonymisation.test.mjs`, puis la recette navigateur si l’interface change.
4. L’interface reste en français, utilisable au clavier, en thème sombre et avec le mouvement réduit ; les cibles font au moins 44 px.
5. Le texte affiché dit ce qui se passe réellement (enregistré, envoyé, supprimé) : jamais une promesse que le code ne tient pas.

## L’anonymisation

Elle est volontairement large et sans relecture. Un faux positif (un mot masqué de trop) est préférable à un nom laissé. Toute modification vient avec des phrases d’essai fictives dans `tests/anonymisation.test.mjs` : ce qui doit partir, ce qui doit rester. Les lexiques de `renderer/anonymisation/lexiques.js` sont générés : ne pas les éditer à la main.
