// État partagé des vues : élément principal, préférences locales, modèles installés, route courante.
import { api } from './ui.js';

export const main = document.querySelector('#main');
export const state = { models: null, download: null, transcribing: null, cleanup: null, query: '', filtre: 'tous', tri: 'recents', selection: null, importing: null };
export const stored = (key, fallback = '') => { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } };
export const store = (key, value) => { try { localStorage.setItem(key, value); } catch {} };
export const currentRoute = () => location.hash.split('/')[1] || 'enregistrer';

export async function refreshModels() {
  state.models = await api.modeles();
  return state.models;
}

// Le modèle choisi par défaut, sinon le conseillé, sinon le premier installé.
export function chosenModel(models) {
  const installed = models.modeles.filter(model => model.installe);
  return installed.find(model => model.id === stored('modele')) || installed.find(model => model.id === models.recommande) || installed[0] || null;
}
