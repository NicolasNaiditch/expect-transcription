// Base commune avec l'app personnelle : fondation Atlas, jetons clairs/sombres et logo.
// La source reste dans web/ ; ici, une copie empreintée. `--verifier` échoue si elle a divergé.
// Hors du dépôt de l'assistant (dépôt public seul), web/ n'existe pas : la copie présente fait foi,
// contrôlée contre les empreintes de partage.json.
//   node scripts/partager.mjs            copie et écrit renderer/partage/partage.json
//   node scripts/partager.mjs --verifier code 1 si une copie diffère de sa source
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const app = path.resolve(import.meta.dirname, '..');
const web = path.resolve(app, '..', '..', 'web');
const target = path.join(app, 'renderer', 'partage');
const FILES = ['foundation.css', 'theme.css', 'assets/expectpatient-mark.svg'];
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

if (!fs.existsSync(web)) {
  const receipt = JSON.parse(fs.readFileSync(path.join(target, 'partage.json'), 'utf8'));
  const differ = FILES.filter(name => !fs.existsSync(path.join(target, name)) || hash(path.join(target, name)) !== receipt.fichiers[name]);
  if (differ.length) { console.error('Copies modifiées depuis leur relevé :', differ.join(', ')); process.exit(1); }
  console.log('Source web/ absente : copie présente gardée, conforme à partage.json.');
} else if (process.argv.includes('--verifier')) {
  const differ = FILES.filter(name => !fs.existsSync(path.join(target, name)) || hash(path.join(target, name)) !== hash(path.join(web, name)));
  if (differ.length) { console.error('Copies à reprendre depuis web/ :', differ.join(', ')); process.exit(1); }
  console.log('Base commune identique à web/ :', FILES.length, 'fichiers.');
} else {
  const receipt = { source: 'web/ de l’assistant de réunion', fichiers: {} };
  for (const name of FILES) {
    fs.mkdirSync(path.dirname(path.join(target, name)), { recursive: true });
    fs.copyFileSync(path.join(web, name), path.join(target, name));
    receipt.fichiers[name] = hash(path.join(web, name));
  }
  fs.writeFileSync(path.join(target, 'partage.json'), JSON.stringify(receipt, null, 2) + '\n');
  console.log('Base commune copiée :', FILES.join(', '));
}
