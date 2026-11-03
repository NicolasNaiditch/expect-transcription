# Construire et valider sous Windows

Une version préparée depuis un Mac n’est pas une version Windows validée. Ce qui suit se fait sur un vrai PC Windows 10 ou 11 x64, de préférence un modèle modeste (8 Go de mémoire, sans carte graphique dédiée) puis un modèle à 16 Go.

## Construire

1. Installer Node.js LTS (site officiel), puis se placer dans le dossier de l’app : la racine du dépôt public, ou `edition-grand-public\app` dans l’assistant de réunion (avec `web\` à sa place, deux niveaux au-dessus).
2. `node scripts\partager.mjs` : copie la base commune depuis `web\` si elle est là, sinon contrôle la copie présente contre `renderer\partage\partage.json`.
3. Placer `whisper-bin-x64.zip` (release b5454, SHA-256 `6ba69e3482d7826214f90a6a9c84ca07782aec1e1d0c6a7c30c994fd5d816ccb`) et `VC_redist.x64.exe` (Microsoft 14.51.36247.0, SHA-256 `843068991daaa1f73ad9f6239bce4d0f6a07a51f18c37ea2a867e9beca71295c`), puis `node scripts\preparer-moteur.mjs --windows <zip> --runtime-windows <VC_redist.x64.exe>` (sous Windows, `tar` lit aussi les cabinets Microsoft).
4. `npm ci`, puis `node node_modules\electron\install.js` (Electron 45 ne télécharge plus son binaire à l’installation), puis `node --test tests\principal.test.cjs tests\anonymisation.test.mjs`.
5. `npm run paquet:windows` : produit l’installateur NSIS dans `dist\`.

Sans signature Authenticode, Windows affiche « Windows a protégé votre ordinateur » ; Smart App Control peut bloquer l’installateur. Noter ce que voit la personne qui installe.

## Grille de recette (données fictives ou autorisées)

| Parcours | Attendu | Noter |
|---|---|---|
| Installer la 0.1 (`Transcrire-0.1.0-Windows-installation.exe`, construit sur Mac le 2 novembre) | avertissement SmartScreen contourné par « Exécuter quand même », installation en français sans droits d’administrateur, raccourcis Bureau et menu Démarrer avec l’icône | |
| Installer la 0.2.1 (`Expect-Transcription-0.2.1-Windows-installation.exe`) par-dessus | l’app s’appelle Expect Transcription ; `Documents\Transcrire` devient `Documents\Expect Transcription` ; le modèle déjà reçu est repris sans téléchargement | |
| Premier lancement | conditions à lire une fois ; studio sur « Le son » ; « Documents › Expect Transcription » ouvre le bon dossier | |
| Première transcription, juste après l’installation (court son fictif) | texte obtenu, sans « composant Windows manque » : le moteur utilise les fichiers Microsoft joints dans `resources\bin`, même si le PC a déjà son propre runtime | |
| Le son seul : son de l’ordinateur + micro | ruban qui se remplit, fichier sans image, les deux sons dans le texte | |
| Le son et l’image : écran entier + son de l’ordinateur + micro | vidéo avec les deux sons ; niveaux « Son reçu » | |
| Une fenêtre seule (visio, vidéo) | image de la fenêtre ; son de tout l’ordinateur | |
| Micro refusé dans Paramètres → Confidentialité | message clair, réglage ouvert par le bouton | |
| Pause, reprise, arrêt | durée correcte, texte aligné sur la vidéo | |
| Fermer la fenêtre pendant la capture | capture continue, icône dans la zone de notification | |
| Débrancher le micro USB | alerte nommant le micro, capture conservée | |
| Arrêt brutal (fin de tâche) puis relance | enregistrement « Interrompu, conservé », lisible | |
| Télécharger « Rapide », couper le réseau à mi-course, reprendre | reprise sans repartir de zéro, empreinte vérifiée | |
| Transcrire 10 min et 60 min | durée, mémoire maximale (Gestionnaire des tâches) | |
| Transcrire avec « Précis » sur 8 Go | réussite ou message mémoire clair | |
| Copier, exporter en TXT, chercher, cliquer un horaire | conforme | |
| Déposer un M4A de téléphone, puis un MP4 de visio (Teams, Zoom) | « Préparation du son » puis texte ; **décodeur AAC de Chromium jamais essayé sous Windows** : noter le message si ça échoue | |
| Déposer un MP3, puis un WAV | « Préparation du son » (rapide), puis texte | |
| Titre avec accents ou caractères non latins (« Réunion — été », « 会议 ») | la transcription aboutit : le moteur reçoit des chemins relatifs | |
| Texte anonymisé : copier, exporter | noms et coordonnées remplacés par des repères, correspondances visibles seulement dans l’app | |
| Mes enregistrements : chercher un mot du texte, filtrer, renommer, sélectionner et mettre à la corbeille | conforme | |
| Page « Transcription » | mémoire, processeur et carte graphique de ce PC, carte « non utilisée », conseil cohérent | |
| Mettre à la corbeille puis restaurer depuis la Corbeille | dossier complet restauré | |
| Désinstaller | `Documents\Transcrire` conservé | |

Rapporter la configuration (processeur, mémoire, version de Windows) avec chaque mesure. Aucun enregistrement réel de cours sans l’accord des personnes enregistrées.
