// Assemble le dépôt public d'Expect Transcription dans un dossier neuf, depuis l'app (source unique) et
// depot-public/ (README, licence, contribution, sécurité). Liste blanche : rien d'autre ne sort.
// Puis contrôle le résultat : ni chemin personnel, ni secret, ni binaire, ni adresse autre que celle des
// suggestions. Ne crée aucun dépôt Git, ne publie rien.
//   node scripts/exporter-depot.mjs <dossier cible neuf>
// Mise à jour du dépôt publié : dans son clone, « git rm -rq . » ne laisse que .git, puis relancer vers ce clone.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const app = path.resolve(import.meta.dirname, '..');
const extras = path.resolve(app, '..', 'depot-public');
const target = path.resolve(process.argv[2] || '');
if (!process.argv[2]) { console.error('Indiquer un dossier cible neuf.'); process.exit(2); }
if (fs.existsSync(target) && fs.readdirSync(target).some(name => name !== '.git')) { console.error('Dossier cible non vide :', target); process.exit(2); }

const FROM_APP = ['main', 'renderer', 'preload.js', 'package.json', 'package-lock.json', 'modeles.json', 'build/icon.png', 'build/icon-windows.png',
  'build/entitlements.mac.plist', 'build/entitlements.mac.local.plist', 'scripts/preparer-moteur.mjs', 'scripts/partager.mjs', 'scripts/importer_lexiques.py', 'scripts/compiler-whisper-mac.sh',
  'scripts/exporter-depot.mjs', 'tests', 'vendor/LICENCES-TIERS.txt'];
const FROM_EXTRAS = { 'README.md': 'README.md', 'CONTRIBUTING.md': 'CONTRIBUTING.md', 'SECURITY.md': 'SECURITY.md', 'LICENSE': 'LICENSE', 'gitignore': '.gitignore' };
const IGNORED = /(^|\/)(\.DS_Store|node_modules)(\/|$)/;

function copy(from, to) {
  const stats = fs.statSync(from);
  if (stats.isDirectory()) { for (const name of fs.readdirSync(from)) copy(path.join(from, name), path.join(to, name)); return; }
  if (IGNORED.test(from)) return;
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
  if (stats.mode & 0o111) fs.chmodSync(to, 0o755);
}
for (const item of FROM_APP) copy(path.join(app, item), path.join(target, item));
for (const [from, to] of Object.entries(FROM_EXTRAS)) copy(path.join(extras, from), path.join(target, to));
copy(path.resolve(app, '..', 'WINDOWS.md'), path.join(target, 'WINDOWS.md'));
// Le dépôt public porte la licence MIT ; le paquet reste « private » pour ne jamais partir sur npm.
const pkg = JSON.parse(fs.readFileSync(path.join(target, 'package.json'), 'utf8'));
pkg.license = 'MIT';
pkg.repository = undefined;
fs.writeFileSync(path.join(target, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');

// Contrôles du dossier assemblé.
const files = [];
const walk = folder => fs.readdirSync(folder, { withFileTypes: true }).forEach(entry => {
  const full = path.join(folder, entry.name);
  if (entry.isDirectory()) walk(full); else files.push(full);
});
walk(target);
const problems = [];
const TEXT = /\.(js|mjs|cjs|json|html|css|md|py|sh|txt|plist|svg)$|^(LICENSE|\.gitignore)$/;
for (const file of files) {
  const relative = path.relative(target, file), size = fs.statSync(file).size;
  if (!TEXT.test(path.basename(file)) && !/\.png$/.test(file)) problems.push(`${relative} : type de fichier inattendu`);
  if (size > 2 * 1024 * 1024 && !/package-lock\.json$/.test(file)) problems.push(`${relative} : ${Math.round(size / 1e6)} Mo`);
  if (!TEXT.test(path.basename(file))) continue;
  const text = fs.readFileSync(file, 'utf8');
  if (/\/Users\/(?!personne\b)|C:\\Users\\|Documents\/(ChatGPT|Marjorie)|Downloads\/ExpectQuali/.test(text)) problems.push(`${relative} : chemin d’un poste personnel`);
  if (/(api[_-]?key|secret|token|password|mot de passe)\s*[:=]\s*['"][^'"]{8,}/i.test(text)) problems.push(`${relative} : ressemble à un secret`);
  // Les adresses d'auteurs des paquets npm, publiques, restent dans package-lock.json.
  if (/package-lock\.json$/.test(file)) continue;
  for (const mail of (text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/g) || []).map(found => found.replace(/\.+$/, ''))) {
    if (!/^(nicolas\.naiditch@expectpatient\.com|prenom\.nom@exemple\.fr|noreply@anthropic\.com)$/.test(mail) && !/@[\d.]+$|@electron|@playwright/.test(mail)) problems.push(`${relative} : adresse ${mail}`);
  }
}
console.log(`${files.length} fichiers assemblés dans ${target}`);
if (problems.length) { console.error('À regarder avant toute publication :\n- ' + problems.join('\n- ')); process.exit(1); }
console.log('Contrôles : aucun chemin personnel, secret, binaire ni adresse inattendue.');
try { execFileSync('git', ['-C', target, 'status'], { stdio: 'ignore' }); console.log('Note : le dossier est dans un dépôt Git existant.'); } catch { console.log('Aucun dépôt Git créé : « git init » se fera au moment de publier.'); }
