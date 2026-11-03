// Petits outils d'interface partagés par les vues.
export const api = window.transcrire;

export function escape(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export function clock(seconds) {
  const s = Math.max(0, Math.floor(seconds || 0));
  const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, r = s % 60;
  return (h ? `${h}:${String(m).padStart(2, '0')}` : String(m).padStart(2, '0')) + ':' + String(r).padStart(2, '0');
}

export function bytes(value) {
  if (!value) return '0 Mo';
  // Unités décimales, comme le Finder et les pages de téléchargement : 190 Mo = 190 000 000 octets.
  return value >= 1e9 ? `${(value / 1e9).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Go` : `${Math.max(1, Math.round(value / 1e6)).toLocaleString('fr-FR')} Mo`;
}

export function day(iso) {
  return new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

export const STATES = {
  enregistrement: 'Enregistrement en cours', finalisation: 'Finalisation', preparation: 'Préparation du son', enregistre: 'À transcrire',
  transcription: 'Transcription en cours', transcrit: 'Texte prêt', interrompu: 'Interrompu, conservé'
};

let noticeTimer = 0;
export function notice(message) {
  const host = document.querySelector('#notice');
  host.textContent = message;
  host.hidden = false;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { host.hidden = true; }, 6000);
}

// Confirmation : « Annuler » a le focus, Échap annule, le focus revient au déclencheur.
export function confirmAction({ title, text, yes }) {
  const dialog = document.querySelector('#confirm');
  const opener = document.activeElement;
  dialog.querySelector('#confirm-title').textContent = title;
  dialog.querySelector('#confirm-text').textContent = text;
  dialog.querySelector('#confirm-yes').textContent = yes;
  dialog.showModal();
  dialog.querySelector('#confirm-no').focus();
  return new Promise(resolve => {
    const finish = value => { dialog.close(); cleanup(); opener?.focus?.(); resolve(value); };
    const yesClick = () => finish(true), noClick = () => finish(false), cancel = event => { event.preventDefault(); finish(false); };
    function cleanup() {
      dialog.querySelector('#confirm-yes').removeEventListener('click', yesClick);
      dialog.querySelector('#confirm-no').removeEventListener('click', noClick);
      dialog.removeEventListener('cancel', cancel);
    }
    dialog.querySelector('#confirm-yes').addEventListener('click', yesClick);
    dialog.querySelector('#confirm-no').addEventListener('click', noClick);
    dialog.addEventListener('cancel', cancel);
  });
}

// Saisie d'un texte court (renommer) : Entrée valide, Échap annule, le focus revient au déclencheur.
export function promptText({ title, label, value, yes }) {
  const dialog = document.querySelector('#prompt');
  const opener = document.activeElement, input = dialog.querySelector('#prompt-input'), form = dialog.querySelector('form');
  dialog.querySelector('#prompt-title').textContent = title;
  dialog.querySelector('#prompt-label').textContent = label;
  dialog.querySelector('#prompt-yes').textContent = yes;
  input.value = value;
  dialog.showModal();
  input.select();
  return new Promise(resolve => {
    const finish = result => { dialog.close(); form.onsubmit = null; dialog.oncancel = null; dialog.querySelector('#prompt-no').onclick = null; opener?.focus?.(); resolve(result); };
    form.onsubmit = event => { event.preventDefault(); finish(input.value.trim() || null); };
    dialog.querySelector('#prompt-no').onclick = () => finish(null);
    dialog.oncancel = event => { event.preventDefault(); finish(null); };
  });
}

// Menu « … » et clic droit : mêmes commandes, flèches et Échap au clavier.
export function openMenu(anchor, items, point) {
  const menu = document.querySelector('#context-menu');
  menu.innerHTML = items.map((item, index) => `<button type="button" role="menuitem" data-index="${index}" class="${item.danger ? 'danger' : ''}">${escape(item.label)}</button>`).join('');
  menu.hidden = false;
  const box = anchor.getBoundingClientRect();
  const x = point ? point.x : box.right - 240, y = point ? point.y : box.bottom + 4;
  menu.style.left = `${Math.max(8, Math.min(x, innerWidth - 248))}px`;
  menu.style.top = `${Math.max(8, Math.min(y, innerHeight - menu.offsetHeight - 8))}px`;
  const buttons = [...menu.querySelectorAll('button')];
  buttons[0]?.focus();
  const close = (restore = true) => {
    menu.hidden = true;
    document.removeEventListener('pointerdown', outside, true);
    menu.onkeydown = null;
    if (restore) anchor.focus();
  };
  const outside = event => { if (!menu.contains(event.target)) close(false); };
  document.addEventListener('pointerdown', outside, true);
  menu.onkeydown = event => {
    const index = buttons.indexOf(document.activeElement);
    if (event.key === 'Escape') { event.preventDefault(); close(); }
    if (event.key === 'ArrowDown') { event.preventDefault(); buttons[(index + 1) % buttons.length].focus(); }
    if (event.key === 'ArrowUp') { event.preventDefault(); buttons[(index - 1 + buttons.length) % buttons.length].focus(); }
  };
  menu.onclick = event => {
    const button = event.target.closest('[data-index]');
    if (!button) return;
    close();
    items[Number(button.dataset.index)].action();
  };
}

export function focusHeading() {
  const heading = document.querySelector('main h1');
  if (heading) { heading.setAttribute('tabindex', '-1'); heading.focus({ preventScroll: true }); }
}
