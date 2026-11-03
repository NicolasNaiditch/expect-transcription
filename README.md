# Expect Transcription

**English.** Free, offline speech-to-text for Mac (Apple Silicon) and Windows. Record your computer's sound and your microphone (and the screen if you want), or drop an audio or video file, and get the text on your own computer with [whisper.cpp](https://github.com/ggml-org/whisper.cpp). No account, nothing uploaded. Includes a strict automatic anonymization before pasting a transcript into an online assistant. The interface is in French.

---

Expect Transcription enregistre le son d’un cours, d’une réunion ou d’une visio, ou prend un fichier audio ou vidéo, puis en écrit le texte **sur votre ordinateur**. Pas de compte, rien n’est envoyé sur Internet : seul le modèle de transcription se télécharge une fois, quand vous le demandez. L’application est offerte par [ExpectPatient](https://www.expectpatient.com/), qui conduit des études en santé.

## Ce que fait l’app

- **Enregistrer** le son de l’ordinateur et le micro ; l’image d’un écran ou d’une fenêtre seulement si on la garde. Pause, reprise, témoin dans la barre des menus ou la zone de notification ; fermer la fenêtre ne coupe pas l’enregistrement.
- **Déposer un fichier** : MP3, M4A, WAV, MP4, MOV, WEBM, OGG, OPUS, FLAC, AAC. Une copie est rangée avec son texte ; l’original ne bouge pas.
- **Transcrire** avec whisper.cpp : modèle « Rapide » (190 Mo) ou « Précis » (574 Mo), conseillé selon la mémoire et le processeur de l’ordinateur ; téléchargement vérifié par empreinte, avec reprise.
- **Lire, chercher, copier, exporter** le texte (TXT ou sous-titres SRT) ; cliquer un horaire pour réécouter le passage.
- **Anonymiser** : une version du texte où les noms, lieux, courriels, téléphones, numéros et adresses sont remplacés par des repères (« [PERSONNE 1] »). Réglage large, sans relecture : à relire avant de confier le texte à un service en ligne.
- **Retrouver** ses enregistrements : recherche dans les titres et dans les textes, filtres, tri, sélection multiple vers la Corbeille.

Tout est rangé dans `Documents/Expect Transcription`, un dossier par enregistrement, lisible sans l’app.

## Avant d’enregistrer quelqu’un

Prévenez les personnes. Enregistrer sans leur accord les paroles d’une personne prononcées à titre privé ou confidentiel est puni par la loi (en France, article 226-1 du Code pénal) ; un cours appartient aussi à celle ou celui qui le donne. L’app le rappelle à chaque enregistrement ; les mentions légales complètes sont dans l’app.

## Installer

Les paquets seront publiés dans les [Releases](../../releases) : un `.dmg` pour Mac à puce Apple (macOS 14.2 ou plus récent) et un installeur pour Windows 10 et 11 (64 bits). Aucune version n’y est encore publiée ; d’ici là, l’app se construit depuis les sources (ci-dessous). Les paquets ne sont pas encore signés pour la diffusion : au premier lancement, macOS propose « Ouvrir quand même » dans Réglages Système → Confidentialité et sécurité, et Windows « Informations complémentaires » puis « Exécuter quand même ».

## Construire depuis les sources

Prérequis : Node.js LTS. Les binaires du moteur ne sont pas versionnés : on les prépare depuis leurs sources officielles, contrôlées par SHA-256.

```sh
npm ci
node node_modules/electron/install.js          # Electron 45 ne télécharge plus son binaire à l’installation
node --test tests/principal.test.cjs tests/anonymisation.test.mjs
```

**Mac** : compiler whisper.cpp v1.9.5 avec Metal, puis le placer.

```sh
scripts/compiler-whisper-mac.sh whisper.cpp-1.9.5.tar.gz [cmake] [dossier de sortie]
node scripts/preparer-moteur.mjs --mac .build/moteur/bin
npm run demarrer                                # ou : npm run paquet:mac-local (DMG signé ad hoc)
```

**Windows** : le binaire officiel `whisper-bin-x64.zip` (release b5454) et le paquet Microsoft `VC_redist.x64.exe` 14.51.36247.0 ; le script vérifie les deux, extrait les quatre DLL du runtime Visual C++ et refuse un moteur dont une dépendance manquerait. Détail et grille d’essai : [WINDOWS.md](WINDOWS.md).

```sh
node scripts/preparer-moteur.mjs --windows whisper-bin-x64.zip --runtime-windows VC_redist.x64.exe
npm run paquet:windows
```

## Essais

- `node --test tests/principal.test.cjs tests/anonymisation.test.mjs` : processus principal (bibliothèque, écriture, téléchargement, import, recherche) et anonymisation.
- `node tests/recette-navigateur.mjs --audio <WAV> --webm <WEBM de 30 s>` : parcours complets dans Chromium avec une API simulée, à 390 et 1 280 px, en clair et en sombre. Demande `playwright-core` (`npm i -D playwright-core`, ou `PLAYWRIGHT_CORE=<chemin de son index.mjs>`).
- `node tests/essai-electron.mjs --donnees <dossier neuf> --audio <WAV> --modeles <dossier des modèles> --out <dossier>` : le vrai Electron sur des données fictives isolées (Mac, avec ffmpeg et afconvert).

Aucun essai ne remplace une capture réelle : les autorisations du système et le son d’un vrai bureau se vérifient à la main.

## Organisation

| Dossier | Rôle |
|---|---|
| `main/` | processus principal : bibliothèque, écriture continue, modèles, transcription (whisper-cli en processus séparé), capture, témoin |
| `preload.js` | pont nommé et minimal entre l’interface et l’ordinateur |
| `renderer/` | interface ; `vues/` une vue par fichier, `anonymisation/` l’anonymisation, `conversion.js` la préparation du son des fichiers déposés, `pages.js` les textes d’information |
| `renderer/partage/` | fondation graphique et jetons partagés avec l’app de réunion d’ExpectPatient (copie empreintée) |
| `modeles.json` | catalogue figé des modèles : adresse au commit, taille, SHA-256 |
| `scripts/` | préparation et contrôle du moteur, copie des lexiques d’anonymisation |
| `tests/` | essais Node, recette navigateur, essai Electron |

## Contribuer

Suggestions, défauts, idées : [CONTRIBUTING.md](CONTRIBUTING.md), ou un courriel à nicolas.naiditch@expectpatient.com. Questions de sécurité : [SECURITY.md](SECURITY.md).

## Licence

Le code est publié sous licence MIT ([LICENSE](LICENSE)). Le nom, le logo et les éléments d’identité ExpectPatient (dont `renderer/partage/assets/expectpatient-mark.svg` et les icônes de `build/`) n’entrent pas dans cette licence et ne peuvent pas être réutilisés sans autorisation. Les composants tiers (Electron, whisper.cpp, SDL2, runtime Visual C++ de Microsoft) et les modèles Whisper gardent leurs licences : [vendor/LICENCES-TIERS.txt](vendor/LICENCES-TIERS.txt).

Conçue par Nicolas Naïditch (ExpectPatient) et développée avec l’assistance de Claude Code, sous sa supervision.
