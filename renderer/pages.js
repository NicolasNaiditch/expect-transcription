// Textes des pages « Offert par ExpectPatient » et « Mentions légales ». Les informations sur l'éditeur
// viennent des mentions de l'Atlas territorial (attestation RNE du 14 août 2026) : les corriger là d'abord.
import { api, escape, notice } from './ui.js';
import { provenance } from './anonymisation/lexiques.js';

const SITE = 'https://www.expectpatient.com/';
const LEGIFRANCE_226_1 = 'https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000042193566';
const CONTACT = 'nicolas.naiditch@expectpatient.com';

export async function renderAbout(main, anchor) {
  main.innerHTML = `
  <article class="reading">
    <div class="page-head"><p class="kicker">Qui fait Expect Transcription</p><h1>Un outil offert par ExpectPatient.</h1>
      <p class="lead">ExpectPatient conduit des études en santé qui relient l’expérience des patients à leurs conditions de vie. Nicolas Naïditch, sociologue de la santé et docteur en sociologie, la dirige.</p>
      <div class="buttons"><a class="btn btn-primary" href="${SITE}" target="_blank" rel="noopener">Découvrir expectpatient.com <span aria-hidden="true">↗</span></a></div></div>
    <section class="reading-block">
      <h2>Pourquoi cet outil</h2>
      <p>Transcrire un cours, un entretien ou une réunion prend des heures, et les services en ligne envoient le son sur leurs serveurs. ExpectPatient a d’abord construit, pour son propre usage, un assistant de réunion qui fait tout sur l’ordinateur. Expect Transcription en est la version grand public : enregistrer, déposer un fichier, obtenir le texte, sans compte et sans envoi.</p>
    </section>
    <section class="reading-block">
      <h2>Ce que fait ExpectPatient</h2>
      <ul class="offer">
        <li><strong>Des études en santé</strong><span>qualitatives et quantitatives : entretiens, groupes, questionnaires, et l’analyse de milliers de témoignages, identités masquées sur place.</span></li>
        <li><strong>L’accompagnement des projets de recherche</strong><span>la méthode, la protection des données des participants, l’éthique.</span></li>
        <li><strong>Des formations et des conférences</strong><span>sur l’expérience des patients, les méthodes d’enquête et l’IA au travail.</span></li>
        <li><strong>Des ressources en accès libre</strong><span>ExpectTools, une boîte à outils de méthode ; l’Atlas territorial de l’accès aux soins ; AGISS, un outil pédagogique.</span></li>
      </ul>
    </section>
    <section class="reading-block suggestions" id="suggestions">
      <h2>Une suggestion, un défaut, une idée ?</h2>
      <p>Expect Transcription s’améliore avec ce que vous en dites : ce qui manque, ce qui gêne, ce qui ne marche pas sur votre ordinateur. Écrivez à Nicolas Naïditch, qui l’a conçue. N’hésitez pas.</p>
      <p class="contact-address">${CONTACT}</p>
      <div class="buttons"><button class="btn btn-primary" id="write-contact" type="button">Écrire un courriel</button><button class="btn btn-secondary" id="copy-contact" type="button">Copier l’adresse</button></div>
      <p class="field-hint">« Écrire un courriel » ouvre votre logiciel de messagerie, avec la version de l’app dans l’objet. Pour un défaut, dites ce que vous faisiez et ce qui s’est affiché ; n’envoyez pas d’enregistrement de personnes sans leur accord.</p>
    </section>
    <section class="reading-block">
      <h2>Le nom</h2>
      <p>ExpectPatient, pour les expériences et les attentes de chaque patient. Expect Transcription garde le mot : ce que vous attendez d’une transcription, c’est un texte fidèle, et qui reste chez vous.</p>
    </section>
  </article>`;
  // L'app ouvre la messagerie avec l'adresse et un objet fixes (version et système) : rien d'autre.
  main.querySelector('#write-contact').addEventListener('click', () => api.ecrire());
  main.querySelector('#copy-contact').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(CONTACT); notice(`Adresse copiée : ${CONTACT}`); } catch { notice(CONTACT); }
  });
  if (anchor) {
    const target = main.querySelector(`#${CSS.escape(anchor)}`);
    target?.scrollIntoView({ block: 'start' });
    target?.querySelector('h2')?.setAttribute('tabindex', '-1');
    target?.querySelector('h2')?.focus({ preventScroll: true });
  }
}

export async function renderMentions(main, anchor) {
  const [infos, models] = await Promise.all([api.infos(), api.modeles().catch(() => null)]);
  main.innerHTML = `
  <article class="reading legal">
    <div class="page-head"><p class="kicker">Mentions légales</p><h1>Ce qu’il faut savoir avant d’enregistrer.</h1>
      <p class="lead">Expect Transcription est une application gratuite qui fonctionne entièrement sur votre ordinateur. Version ${escape(infos.version)}.</p></div>

    <section class="reading-block" id="enregistrer">
      <p class="section-label">Enregistrer d’autres personnes</p>
      <h2>Prévenez-les avant de démarrer.</h2>
      <p>Capter ou enregistrer, sans leur consentement, les paroles d’une personne prononcées à titre privé ou confidentiel est puni d’un an d’emprisonnement et de 45&nbsp;000&nbsp;€ d’amende (<a href="${LEGIFRANCE_226_1}" target="_blank" rel="noopener">article&nbsp;226-1 du Code pénal <span aria-hidden="true">↗</span></a>). Le consentement est présumé quand l’enregistrement se fait au vu et au su des personnes, sans qu’elles s’y opposent alors qu’elles le pouvaient : le plus simple est de l’annoncer à voix haute.</p>
      <p>Un cours, une conférence ou une intervention est une œuvre de la personne qui le donne (article&nbsp;L112-2 du Code de la propriété intellectuelle). Ne diffusez ni le son, ni la vidéo, ni le texte sans son accord. Certains établissements interdisent aussi d’enregistrer les cours sans autorisation : renseignez-vous.</p>
      <p>Dans un cadre professionnel ou associatif (réunion, entretien), les voix et ce qui est dit sont des données personnelles : la structure qui organise l’enregistrement doit informer les personnes de son but, de la durée de conservation et de leurs droits (règlement général sur la protection des données, article&nbsp;13).</p>
    </section>

    <section class="reading-block">
      <p class="section-label">Limite de responsabilité</p>
      <h2>Vous êtes responsable de vos enregistrements.</h2>
      <p>L’application est fournie gratuitement, en l’état, sans garantie de fonctionnement ni d’exactitude, dans les limites prévues par la loi. Vous êtes responsable des enregistrements que vous faites, des fichiers que vous déposez et de l’usage des textes obtenus. ExpectPatient n’a accès à aucun de vos fichiers et ne répond ni de leur contenu ni de leur utilisation.</p>
      <p>Le texte et son anonymisation sont produits automatiquement : ils contiennent des erreurs et peuvent laisser passer une information. Relisez-les avant de vous en servir, et surtout avant de les confier à un service en ligne.</p>
    </section>

    <section class="reading-block" id="anonymisation">
      <p class="section-label">Anonymisation</p>
      <h2>Un réglage large, sans relecture.</h2>
      <p>Le texte anonymisé remplace les noms de personnes, de lieux et les autres noms propres, les courriels, liens, numéros de téléphone, numéros longs et adresses par des repères numérotés (« [PERSONNE 1] ») ; une date complète est ramenée à son mois. Les noms de maladies, d’institutions, de grandes villes et de pays restent visibles, d’après les lexiques de l’outil d’analyse ExpectQuali (copie du ${escape(provenance.copie)}).</p>
      <p>Un nom déformé par la transcription, écrit sans majuscule ou placé en début de phrase sans être un prénom courant peut passer, et une personne se reconnaît aussi à ce qu’on dit d’elle. Les correspondances restent sur cet ordinateur.</p>
    </section>

    <section class="reading-block">
      <p class="section-label">Données personnelles</p>
      <h2>ExpectPatient ne collecte rien.</h2>
      <p>Ni compte, ni mesure d’audience, ni traceur. Vos enregistrements, leurs textes et les modèles restent sur cet ordinateur. L’application ne se connecte que pour télécharger un modèle de transcription, quand vous le demandez, depuis Hugging Face (Hugging Face, Inc.), qui reçoit alors les informations techniques de la connexion, dont l’adresse IP. Les liens vers expectpatient.com ou Légifrance s’ouvrent dans votre navigateur.</p>
    </section>

    <section class="reading-block">
      <p class="section-label">Stockage sur cet ordinateur</p>
      <h2>Ce qui est gardé, et où.</h2>
      <dl class="legal-facts">
        <div><dt>Vos enregistrements</dt><dd><span class="path">${escape(infos.bibliotheque)}</span> : un dossier par enregistrement, avec le son, l’image si vous l’avez gardée, la copie d’un fichier déposé et le texte.</dd></div>
        ${models ? `<div><dt>Les modèles</dt><dd><span class="path">${escape(models.dossier)}</span></dd></div>` : ''}
        <div><dt>Vos préférences</dt><dd>Dans le stockage local de l’application : le thème, le modèle par défaut, les derniers réglages du studio (nom, sources, micro) et le fait d’avoir lu les conditions.</dd></div>
      </dl>
      <p>Rien n’expire de soi-même. « Mettre à la corbeille » envoie un enregistrement dans la Corbeille de l’ordinateur ; désinstaller l’application laisse vos enregistrements à leur place. Seuls des fichiers intermédiaires (un téléchargement ou une préparation interrompus) sont effacés directement.</p>
      <p><strong>Si votre dossier Documents est synchronisé</strong> (OneDrive sous Windows, iCloud sur Mac), vos enregistrements et leurs textes partent avec lui vers ce service : l’application ne peut pas l’empêcher.${infos.synchro ? ` Sur cet ordinateur, Documents semble synchronisé avec ${escape(infos.synchro)}.` : ''}</p>
    </section>

    <section class="reading-block">
      <p class="section-label">Éditeur</p>
      <h2>ExpectPatient</h2>
      <dl class="legal-facts">
        <div><dt>Forme juridique</dt><dd>Société à responsabilité limitée à associé unique (SARLU ou EURL)</dd></div>
        <div><dt>Capital social</dt><dd>1&nbsp;000&nbsp;€</dd></div>
        <div><dt>Adresse du siège</dt><dd>17 rue du Docteur Sureau, 93160&nbsp;Noisy-le-Grand, France</dd></div>
        <div><dt>SIREN</dt><dd>987&nbsp;694&nbsp;536</dd></div>
        <div><dt>SIRET du siège</dt><dd>987&nbsp;694&nbsp;536&nbsp;00028</dd></div>
        <div><dt>Immatriculée le</dt><dd>22&nbsp;mars&nbsp;2024, Registre national des entreprises</dd></div>
        <div><dt>Contact</dt><dd>${CONTACT} (suggestions bienvenues)</dd></div>
        <div><dt>Site</dt><dd><a href="${SITE}" target="_blank" rel="noopener">www.expectpatient.com <span aria-hidden="true">↗</span></a></dd></div>
        <div><dt>Directeur de la publication</dt><dd>Nicolas Naïditch, gérant d’ExpectPatient</dd></div>
      </dl>
    </section>

    <section class="reading-block">
      <p class="section-label">Assistance numérique et liens d’intérêts</p>
      <h2>Conçue par une personne, développée avec l’IA.</h2>
      <p>Nicolas Naïditch a conçu l’application et l’a développée avec l’assistance de Claude Code, sous sa supervision. Le développement n’étant pas son métier, les essais réalisés sont conservés avec le code. L’application est offerte, sans financement spécifique ; ExpectPatient mène par ailleurs une activité d’études et de conseil en santé.</p>
    </section>

    <section class="reading-block">
      <p class="section-label">Propriété intellectuelle et licences</p>
      <h2>Des logiciels libres, une marque protégée.</h2>
      <p>L’application s’appuie sur Electron et whisper.cpp (licence MIT) et, sous Windows, sur le runtime Visual C++ de Microsoft ; les modèles Whisper sont publiés par OpenAI sous licence MIT. Le nom, le logo et les éléments d’identité ExpectPatient ne peuvent pas être réutilisés sans autorisation.</p>
      <div class="buttons"><button class="btn btn-secondary" id="licences" type="button">Lire les licences</button></div>
    </section>

    <section class="reading-block">
      <p class="section-label">Accessibilité</p>
      <h2>Conçue pour tous, pas encore auditée.</h2>
      <p>L’application se pilote au clavier, suit le thème sombre et le mouvement réduit du système, et nomme ses commandes pour les lecteurs d’écran. Elle n’a pas fait l’objet d’un audit indépendant.</p>
    </section>
  </article>`;
  main.querySelector('#licences').addEventListener('click', () => api.licences());
  if (anchor) {
    const target = main.querySelector(`#${CSS.escape(anchor)}`);
    target?.scrollIntoView({ block: 'start' });
    target?.querySelector('h2')?.setAttribute('tabindex', '-1');
    target?.querySelector('h2')?.focus({ preventScroll: true });
  }
}
