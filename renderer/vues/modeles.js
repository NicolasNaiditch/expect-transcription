// La transcription sur cet ordinateur : la machine, le conseil, les modèles, leur téléchargement.
import { api, bytes, confirmAction, escape, notice } from '../ui.js';
import { chosenModel, main, refreshModels, store } from '../etat.js';

export function drawProgress(bar, progress) {
  bar.hidden = false;
  bar.querySelector('progress').value = Math.round(progress.recu / progress.total * 100);
  bar.querySelector('.progress-word').textContent = progress.etape === 'verification'
    ? 'Vérification de l’empreinte…' : `${bytes(progress.recu)} sur ${bytes(progress.total)}`;
}


// Vitesse mesurée ici même : temps de transcription rapporté à la durée du son, médiane des derniers essais.
function measuredSpeed(items, modelId) {
  const ratios = items.filter(item => item.modele === modelId && item.transcription_s && item.duree_s >= 60).map(item => item.transcription_s / item.duree_s).sort((a, b) => a - b);
  if (!ratios.length) return null;
  return { minutes: Math.max(1, Math.round(ratios[Math.floor(ratios.length / 2)] * 60)), n: ratios.length };
}

export async function renderModels() {
  const [models, items] = await Promise.all([refreshModels(), api.liste().catch(() => [])]);
  const preferred = chosenModel(models)?.id, computer = models.ordinateur;
  const advised = models.modeles.find(model => model.id === models.recommande);
  main.innerHTML = `
  <div class="page-head"><p class="kicker">Hors ligne, sur cet ordinateur</p><h1>La transcription.</h1>
  <p class="lead">Le texte est produit par whisper.cpp sur cet ordinateur ; aucun son ne part sur Internet. Le modèle se télécharge une seule fois depuis Hugging Face, puis tout fonctionne sans connexion.</p></div>
  ${computer ? `<section class="computer" aria-labelledby="computer-title">
    <h2 id="computer-title">Cet ordinateur</h2>
    <dl class="computer-facts">
      <div><dt>Mémoire</dt><dd>${computer.memoire_go} Go</dd></div>
      <div><dt>Processeur</dt><dd>${escape(computer.processeur || 'non indiqué')} · ${computer.coeurs} cœurs</dd></div>
      <div><dt>Carte graphique</dt><dd>${escape(computer.carte_graphique || 'non indiquée')} · ${computer.carte_utilisee ? 'utilisée par le moteur, avec la mémoire de l’ordinateur' : 'non utilisée : le moteur calcule avec le processeur'}</dd></div>
    </dl>
    <p class="advice"><span class="advice-word">Conseil pour cet ordinateur</span> <strong>${escape(advised?.nom || '')}</strong>. ${escape(computer.conseil.raison)}</p>
  </section>` : ''}
  <ul class="models">${models.modeles.map(model => {
    const percent = model.partiel ? Math.round(model.partiel / model.octets * 100) : 0;
    const running = models.telechargement?.id === model.id, speed = measuredSpeed(items, model.id);
    return `<li class="model" data-model="${model.id}">
      <div class="model-main"><h2>${escape(model.nom)}${model.id === models.recommande ? ' <span class="badge">conseillé pour cet ordinateur</span>' : ''}</h2>
        <p>${escape(model.resume)}</p>
        ${speed ? `<p class="model-speed">Sur cet ordinateur : environ ${speed.minutes} min pour une heure de son <span>(médiane de ${speed.n} transcription${speed.n > 1 ? 's' : ''})</span>.</p>` : ''}
        ${model.id === 'precis' && computer && computer.memoire_go < 8 ? '<p class="alert warn">Avec moins de 8 Go de mémoire, Précis peut manquer de place pendant la transcription. Fermez les autres applications ou gardez Rapide.</p>' : ''}
        <p class="model-meta">${bytes(model.octets)} · ${escape(model.fichier)} · licence ${escape(model.licence)}</p>
        <div class="progress" ${running ? '' : 'hidden'}><progress max="100" value="${percent}" aria-label="Téléchargement du modèle ${escape(model.nom)}"></progress><span class="progress-word"></span></div></div>
      <div class="model-actions">${model.installe
        ? `<p class="chip" data-state="transcrit">Installé</p>
           <label class="radio-row"><input type="radio" name="default-model" value="${model.id}" ${model.id === preferred ? 'checked' : ''}> Utiliser par défaut</label>
           <button class="text-button danger" type="button" data-remove="${model.id}">Retirer…</button>`
        : running
          ? `<button class="btn btn-secondary" type="button" data-pause>Mettre en pause</button>`
          : `<button class="btn ${model.id === models.recommande ? 'btn-primary' : 'btn-secondary'}" type="button" data-download="${model.id}">${percent ? `Reprendre (${percent} % reçus)` : `Télécharger ${bytes(model.octets)}`}</button>
             <button class="text-button" type="button" data-import="${model.id}">J’ai déjà le fichier…</button>`}</div>
    </li>`;
  }).join('')}</ul>
  <p class="field-hint">Emplacement des modèles : <span class="path">${escape(models.dossier)}</span>. Une détection de la parole (0,9 Mo) est installée avec le premier modèle pour éviter du texte inventé pendant les silences.</p>`;
  main.querySelectorAll('[name="default-model"]').forEach(input => input.addEventListener('change', () => { store('modele', input.value); notice('Modèle par défaut enregistré.'); }));
  main.querySelectorAll('[data-download]').forEach(button => button.addEventListener('click', async () => {
    button.disabled = true; button.textContent = 'Connexion…';
    const promise = api.telecharger(button.dataset.download);
    setTimeout(() => { if (location.hash === '#/modeles') renderModels(); }, 400);
    try { await promise; notice('Modèle installé et vérifié.'); }
    catch (error) { notice(error.message); }
    if (location.hash === '#/modeles') renderModels();
  }));
  main.querySelector('[data-pause]')?.addEventListener('click', async () => { await api.pauseTelechargement(); });
  main.querySelectorAll('[data-import]').forEach(button => button.addEventListener('click', async () => {
    try { await api.importerModele(button.dataset.import); renderModels(); } catch (error) { notice(error.message); }
  }));
  main.querySelectorAll('[data-remove]').forEach(button => button.addEventListener('click', async () => {
    const model = models.modeles.find(item => item.id === button.dataset.remove);
    const ok = await confirmAction({ title: `Retirer le modèle ${model.nom} ?`, text: 'Le fichier du modèle part dans la Corbeille. Vos enregistrements et leurs textes ne changent pas. Il faudra le réinstaller pour transcrire.', yes: 'Retirer le modèle' });
    if (ok) { await api.retirerModele(model.id); renderModels(); }
  }));
}

