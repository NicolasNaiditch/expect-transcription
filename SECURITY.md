# Sécurité d’Expect Transcription

## Signaler une faille

Écrivez à **nicolas.naiditch@expectpatient.com** avec, si possible, une façon de la reproduire. Merci de ne pas la décrire publiquement avant qu’un correctif soit publié. Ne joignez aucun enregistrement de personnes réelles.

## Ce que l’app protège, et comment

L’app enregistre des voix et garde leurs textes ; sur Mac, elle détient les autorisations du micro et de l’enregistrement de l’écran. Elle est conçue pour que rien ne sorte de l’ordinateur et que ces autorisations ne puissent pas être détournées. Une revue de sécurité indépendante a été faite avant la première publication ; ses constats ont été corrigés ou figurent dans les limites ci-dessous.

- **Réseau** : rien ne part sur Internet, sauf le modèle de transcription, téléchargé à la demande depuis une adresse figée au commit. Le téléchargement s’arrête au-delà de la taille attendue et refuse un passage d’https à http ; le fichier est vérifié par taille et SHA-256 avant usage, puis de nouveau à sa première utilisation de chaque session. L’interface ne peut charger que ce que sert l’app (les autres requêtes sont annulées), et WebRTC n’expose pas d’adresse réseau. Aucun compte, aucune mesure d’audience, aucun traceur.
- **Interface isolée** : `contextIsolation`, `sandbox`, pas de `nodeIntegration`, politique de sécurité de contenu stricte (`script-src 'self'`, `style-src 'self'`), interface servie depuis le paquet sous `app://`, navigation et nouvelles fenêtres bloquées. Deux pages seulement s’ouvrent hors de l’app, à l’adresse exacte (le site d’ExpectPatient, l’article 226-1 du Code pénal) ; le courriel des suggestions est construit par l’app, avec une adresse et un objet fixes.
- **Pont minimal** : l’interface n’a accès qu’à des fonctions nommées (`preload.js`), et chaque message est refusé s’il ne vient pas de l’interface de l’app. Les identifiants d’enregistrement sont des noms de dossiers directs de la bibliothèque ; les médias ne sont servis que depuis cette bibliothèque. Le seul chemin libre est celui d’un fichier que la personne dépose ou choisit : il doit être local (pas de partage réseau), réel, et ses premiers octets doivent correspondre à son extension.
- **Autorisations** : seuls le micro et la capture d’écran sont accordés, à l’interface de l’app seulement, jamais la caméra ; la source capturée est celle choisie dans l’app, une fois. Le témoin d’enregistrement est allumé par le processus principal, pas par l’interface.
- **Fichiers venus d’ailleurs** : un fichier déposé n’est jamais lu par le moteur. Il est décodé dans l’interface isolée (décodeurs de Chromium), avec des plafonds contre les fichiers piégés, et l’app écrit elle-même le WAV que lit le moteur.
- **Moteur** : `whisper-cli` est celui du paquet et lui seul (aucune variable d’environnement ne peut le remplacer dans l’app installée). Il est lancé sans shell, avec des arguments fixes, un environnement réduit et des chemins relatifs. Ses sources ou binaires officiels sont contrôlés par SHA-256 : archive whisper.cpp v1.9.5 pour Mac (`scripts/compiler-whisper-mac.sh`), archive Windows et runtime Visual C++ de Microsoft, fichier par fichier (`scripts/preparer-moteur.mjs`), qui ne garde que les bibliothèques réellement chargées.
- **Paquet durci** : les fusibles d’Electron coupent l’exécution comme Node (`RunAsNode`), `NODE_OPTIONS` et les arguments d’inspection, et n’acceptent que le code de l’archive de l’app, dont l’intégrité est vérifiée au lancement. Sur Mac, le runtime renforcé est actif (pas d’injection par `DYLD_*`).
- **Données** : un dossier par enregistrement ; suppression toujours vers la Corbeille du système. Seuls des fichiers intermédiaires (téléchargement ou préparation interrompus, sortie brute du moteur) sont effacés directement. Une version anonymisée exportée ne porte pas le titre de l’enregistrement, et la notification de fin ne l’affiche pas.

## Limites connues

- **Signature** : les paquets ne sont pas encore signés pour la diffusion (ni Developer ID Apple ni certificat Windows). Vérifiez l’empreinte SHA-256 publiée avec chaque version. Sur Mac, la signature locale oblige à lever la validation des bibliothèques (`disable-library-validation`) ; une signature Developer ID permettra de la rétablir. Les autorisations macOS sont à redonner après chaque mise à jour.
- **Installation par utilisateur** (Windows) : le dossier de l’app, moteur compris, est modifiable par les programmes de la même session. L’intégrité de l’archive de l’app est vérifiée au lancement, pas celle du moteur.
- **Synchronisation** : si le dossier Documents est synchronisé (OneDrive, iCloud), les enregistrements partent avec lui ; l’app le signale quand elle le détecte, mais ne peut pas l’empêcher.
- **Runtime Visual C++** (Windows) : joint à l’app, il ne suit pas Windows Update ; il est repris à chaque version.
- **Anonymisation** : automatique et sans relecture. Elle peut laisser passer un nom mal transcrit, écrit sans majuscule, ou qui est aussi un mot courant des lexiques sans indice de personne autour ; et une personne se reconnaît aussi à ce qu’on dit d’elle.
