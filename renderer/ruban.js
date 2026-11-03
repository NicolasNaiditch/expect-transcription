// Le ruban sonore : une barre par instant, haute comme le son. En direct dans le studio (les derniers
// instants défilent vers la gauche), en entier dans le lecteur (la partie écoutée est pleine).
// Les couleurs viennent des jetons du thème : le ruban suit le clair et le sombre.
export function dessinerRuban(canvas, values, { fichier = false, progress = 1, empty = false } = {}) {
  const ratio = window.devicePixelRatio || 1, width = canvas.clientWidth, height = canvas.clientHeight;
  if (!width || !height) return;
  if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
    canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
  }
  const c = canvas.getContext('2d'), style = getComputedStyle(canvas);
  const done = style.getPropertyValue('--ruban-plein').trim() || '#0066a8', rest = style.getPropertyValue('--ruban-vide').trim() || '#c9d3df';
  c.setTransform(ratio, 0, 0, ratio, 0, 0);
  c.clearRect(0, 0, width, height);
  const bar = 3, gap = 2, count = Math.floor(width / (bar + gap)), middle = height / 2;
  // Au repos : une silhouette d'onde grisée, qui montre où le son viendra, sans prétendre le mesurer.
  if (empty) {
    c.fillStyle = rest;
    for (let index = 0; index < count; index += 1) {
      const h = Math.max(2, (0.18 + 0.5 * Math.abs(Math.sin(index / 5.3)) * (0.55 + 0.45 * Math.sin(index / 23))) * (height - 8));
      c.fillRect(index * (bar + gap), middle - h / 2, bar, h);
    }
    return;
  }
  const shown = values.length > count ? resample(values, count, fichier) : values;
  const offset = fichier ? 0 : count - shown.length;
  for (let index = 0; index < count; index += 1) {
    const value = shown[index - offset];
    const h = value === undefined ? 2 : Math.max(2, value * (height - 8));
    c.fillStyle = value === undefined ? rest : (index + 0.5) / count <= progress ? done : rest;
    c.fillRect(index * (bar + gap), middle - h / 2, bar, h);
  }
}

// Le lecteur montre tout le fichier (moyenne par barre) ; le direct ne garde que les derniers instants.
function resample(values, count, whole) {
  if (!whole) return values.slice(-count);
  const out = [];
  for (let index = 0; index < count; index += 1) {
    const from = Math.floor(index * values.length / count), to = Math.max(from + 1, Math.floor((index + 1) * values.length / count));
    let sum = 0;
    for (let i = from; i < to; i += 1) sum += values[i];
    out.push(sum / (to - from));
  }
  return out;
}
