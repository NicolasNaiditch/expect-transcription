// Mes enregistrements : chercher dans les titres et les textes, filtrer, trier, ranger par mois, sélectionner.
import { api, bytes, clock, day, escape, openMenu, STATES } from '../ui.js';
import { main, state } from '../etat.js';
import { KIND, recordMenu, trash } from './actions.js';

const FILTRES = { tous: ['Tous', () => true], atranscrire: ['À transcrire', item => ['enregistre', 'interrompu'].includes(item.etat)], prets: ['Texte prêt', item => item.etat === 'transcrit'] };
const TRIS = { recents: ['Plus récents d’abord', (a, b) => b.cree.localeCompare(a.cree)], anciens: ['Plus anciens d’abord', (a, b) => a.cree.localeCompare(b.cree)], longs: ['Plus longs d’abord', (a, b) => b.duree_s - a.duree_s], titre: ['Par titre', (a, b) => a.titre.localeCompare(b.titre, 'fr')] };

export async function renderList() {
  const [items, infos] = await Promise.all([api.liste(), api.infos()]);
  const total = items.reduce((sum, item) => sum + item.octets, 0), ready = items.filter(item => item.etat === 'transcrit').length;
  main.innerHTML = `
  <div class="page-head"><p class="kicker">Vos fichiers</p><h1>Mes enregistrements.</h1>
    ${infos.synchro ? `<p class="alert warn">Votre dossier Documents semble synchronisé avec ${escape(infos.synchro)} : vos enregistrements et leurs textes y sont envoyés. Pour les garder sur cet ordinateur seulement, désactivez la synchronisation de Documents dans ${escape(infos.synchro)}.</p>` : ''}
    <p class="lead">Chaque enregistrement est un dossier dans <span class="path">${escape(infos.bibliotheque)}</span> : le son, l’image si vous l’avez gardée, et le texte quand il est prêt.</p>
    <div class="buttons"><a class="btn btn-primary" href="#/enregistrer">Nouvel enregistrement</a><a class="btn btn-secondary" href="#/fichier">Déposer un fichier</a><button class="text-button" id="open-folder" type="button">Ouvrir le dossier</button></div></div>
  ${items.length ? `<div class="toolbar">
    <div class="toolbar-search"><label class="field-label" for="search">Chercher dans les titres et dans les textes</label><input id="search" type="search" value="${escape(state.query)}" placeholder="Un mot, un nom, une date…"></div>
    <div class="segmented" role="group" aria-label="Filtrer">${Object.entries(FILTRES).map(([key, [label, test]]) => `<button type="button" data-filtre="${key}" aria-pressed="${state.filtre === key}">${label} <span class="count-in">${items.filter(test).length}</span></button>`).join('')}</div>
    <div class="toolbar-sort"><label class="field-label" for="sort">Ordre</label><select id="sort">${Object.entries(TRIS).map(([key, [label]]) => `<option value="${key}" ${state.tri === key ? 'selected' : ''}>${label}</option>`).join('')}</select></div>
    <button class="btn btn-secondary" id="select" type="button" aria-pressed="${Boolean(state.selection)}">${state.selection ? 'Terminer la sélection' : 'Sélectionner'}</button>
  </div>
  <p class="count" id="count" role="status"></p>` : ''}
  <div id="records"></div>
  ${items.length ? '' : '<div class="empty"><h2>Aucun enregistrement pour l’instant.</h2><p>Enregistrez le son d’un cours ou d’une réunion, ou déposez un fichier : il apparaîtra ici.</p></div>'}
  <div class="selection-bar" id="selection-bar" hidden><span id="selection-count"></span><button class="btn btn-danger-outline" id="selection-trash" type="button">Mettre à la corbeille…</button><button class="text-button" id="selection-cancel" type="button">Annuler</button></div>`;
  main.querySelector('#open-folder').addEventListener('click', () => api.afficher(null));
  let found = new Map(), searchTimer = 0;
  const visible = () => {
    const query = state.query.trim().toLowerCase();
    return items.filter(FILTRES[state.filtre][1])
      .filter(item => !query || `${item.titre} ${day(item.cree)}`.toLowerCase().includes(query) || found.has(item.id))
      .sort(TRIS[state.tri][1]);
  };
  const draw = () => {
    const shown = visible();
    if (items.length) main.querySelector('#count').textContent = `${shown.length} sur ${items.length} enregistrement${items.length > 1 ? 's' : ''} · ${bytes(total)} sur cet ordinateur · ${ready} texte${ready > 1 ? 's' : ''} prêt${ready > 1 ? 's' : ''}`;
    const groups = new Map();
    for (const item of shown) {
      const month = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(new Date(item.cree));
      const key = state.tri === 'recents' || state.tri === 'anciens' ? month.charAt(0).toUpperCase() + month.slice(1) : '';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    }
    main.querySelector('#records').innerHTML = [...groups].map(([month, group]) => `${month ? `<h2 class="month">${escape(month)}</h2>` : ''}<ul class="records" ${state.selection ? 'data-selecting="true"' : ''}>${group.map(item => {
      const date = new Date(item.cree), extract = found.get(item.id);
      return `<li class="record" data-id="${escape(item.id)}">
        ${state.selection ? `<label class="record-check"><input type="checkbox" ${state.selection.has(item.id) ? 'checked' : ''} aria-label="Sélectionner ${escape(item.titre)}"></label>` : ''}
        <a class="record-row" href="#/enregistrement/${encodeURIComponent(item.id)}">
          <span class="stamp"><span>${date.getDate()}</span>${new Intl.DateTimeFormat('fr-FR', { month: 'short' }).format(date)}</span>
          <span class="record-main"><strong>${escape(item.titre)}</strong>
            <span class="record-meta">${escape(day(item.cree))} · ${clock(item.duree_s)} · ${bytes(item.octets)} · ${KIND(item)}</span>
            ${extract ? `<span class="record-extract">« ${escape(extract)} »</span>` : ''}</span>
          <span class="chip" data-state="${escape(item.etat)}">${escape(STATES[item.etat] || item.etat)}</span>
        </a>
        <button class="icon-button more" type="button" aria-haspopup="menu" aria-label="Actions pour ${escape(item.titre)}">…</button>
      </li>`;
    }).join('')}</ul>`).join('') || (items.length ? '<p class="empty-inline">Aucun enregistrement ne correspond. Essayez un autre mot ou un autre filtre.</p>' : '');
    const bar = main.querySelector('#selection-bar');
    bar.hidden = !state.selection;
    if (state.selection) {
      main.querySelector('#selection-count').textContent = `${state.selection.size} sélectionné${state.selection.size > 1 ? 's' : ''}`;
      main.querySelector('#selection-trash').disabled = !state.selection.size;
    }
  };
  draw();
  main.querySelector('#search')?.addEventListener('input', event => {
    state.query = event.target.value; draw();
    clearTimeout(searchTimer);
    searchTimer = setTimeout(async () => {
      const results = await api.chercher(state.query).catch(() => []);
      found = new Map(results.map(result => [result.id, result.extrait]));
      draw();
    }, 250);
  });
  if (state.query) api.chercher(state.query).then(results => { found = new Map(results.map(result => [result.id, result.extrait])); draw(); }).catch(() => {});
  main.querySelectorAll('[data-filtre]').forEach(button => button.addEventListener('click', () => {
    state.filtre = button.dataset.filtre;
    main.querySelectorAll('[data-filtre]').forEach(other => other.setAttribute('aria-pressed', String(other === button)));
    draw();
  }));
  main.querySelector('#sort')?.addEventListener('change', event => { state.tri = event.target.value; draw(); });
  main.querySelector('#select')?.addEventListener('click', event => {
    state.selection = state.selection ? null : new Set();
    event.currentTarget.setAttribute('aria-pressed', String(Boolean(state.selection)));
    event.currentTarget.textContent = state.selection ? 'Terminer la sélection' : 'Sélectionner';
    draw();
  });
  main.querySelector('#selection-cancel').addEventListener('click', () => { state.selection = null; renderList(); });
  main.querySelector('#selection-trash').addEventListener('click', () => trash(items.filter(item => state.selection?.has(item.id)), renderList));
  const list = main.querySelector('#records');
  const itemOf = element => items.find(item => item.id === element.closest('[data-id]')?.dataset.id);
  list.addEventListener('change', event => {
    if (!event.target.matches('.record-check input')) return;
    const item = itemOf(event.target);
    if (event.target.checked) state.selection.add(item.id); else state.selection.delete(item.id);
    draw();
    list.querySelector(`[data-id="${CSS.escape(item.id)}"] .record-check input`)?.focus();
  });
  list.addEventListener('click', event => {
    const button = event.target.closest('.more');
    if (button) openMenu(button, recordMenu(itemOf(button), renderList));
    // En sélection, un clic sur la ligne coche au lieu d'ouvrir.
    const row = event.target.closest('.record-row');
    if (row && state.selection) { event.preventDefault(); const box = row.parentElement.querySelector('.record-check input'); box.checked = !box.checked; box.dispatchEvent(new Event('change', { bubbles: true })); }
  });
  list.addEventListener('contextmenu', event => {
    const item = itemOf(event.target);
    if (!item) return;
    event.preventDefault();
    openMenu(event.target.closest('.record').querySelector('.more'), recordMenu(item, renderList), { x: event.clientX, y: event.clientY });
  });
  list.addEventListener('keydown', event => {
    if (event.key === 'F10' && event.shiftKey || event.key === 'ContextMenu') {
      const item = itemOf(event.target);
      if (!item) return;
      event.preventDefault();
      openMenu(event.target.closest('.record').querySelector('.more'), recordMenu(item, renderList));
    }
  });
}

