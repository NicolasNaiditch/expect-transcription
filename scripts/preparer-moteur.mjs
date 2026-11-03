// Place whisper-cli dans vendor/<plateforme>/bin pour electron-builder, après contrôle.
// Ne télécharge rien : les fichiers viennent d'une source autorisée (voir ../README.md).
//   node scripts/preparer-moteur.mjs --windows <whisper-bin-x64.zip> --runtime-windows <VC_redist.x64.exe>
//   node scripts/preparer-moteur.mjs --mac <dossier contenant whisper-cli compilé>
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const app = path.resolve(import.meta.dirname, '..');
// Binaire officiel processeur x64, release b5454 = v1.9.5, empreinte publiée par GitHub le 6 octobre 2026.
const WINDOWS = { file: 'whisper-bin-x64.zip', bytes: 8928640, sha256: '6ba69e3482d7826214f90a6a9c84ca07782aec1e1d0c6a7c30c994fd5d816ccb' };
// Runtime Visual C++ dont dépendent whisper-cli.exe et ggml (msvcp140, vcruntime140, vcruntime140_1, vcomp140) :
// joint à côté du moteur, il n'exige ni installation ni droits d'administrateur. Paquet officiel Microsoft 14.51.36247.0,
// empreinte publiée par le manifeste winget Microsoft.VCRedist.2015+.x64 ; empreintes des quatre fichiers extraits le 2 novembre 2026.
const RUNTIME = { file: 'VC_redist.x64.exe', bytes: 18731856, sha256: '843068991daaa1f73ad9f6239bce4d0f6a07a51f18c37ea2a867e9beca71295c',
  dlls: { 'msvcp140.dll': '7c26614e1d733892c2deac7e245ce115504b1d80592dd0a01b08e3e5a55f89ca',
    'vcruntime140.dll': 'd1f4225df2cd877dbf130d5668a021dce3f94118455ff5ec952061c30afc9ce7',
    'vcruntime140_1.dll': 'a7146c08f89fe5b04541ab507cdb59ff7b44534d4ba3c668a426c6450a03434e',
    'vcomp140.dll': '95d4ce4a6802d1e18b5e0e1722cc30ea72ca7e033f83828f05c0b7b993fe7cbf' } };
const args = process.argv.slice(2), get = name => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : null; };
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

if (get('windows')) {
  const zip = get('windows');
  if (fs.statSync(zip).size !== WINDOWS.bytes || hash(zip) !== WINDOWS.sha256) throw new Error('Archive Windows différente de celle autorisée.');
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-win-'));
  execFileSync('tar', ['-xf', zip, '-C', temporary]);
  const found = [];
  const walk = folder => fs.readdirSync(folder, { withFileTypes: true }).forEach(entry => {
    const full = path.join(folder, entry.name);
    // Le moteur et ce qu'il charge : whisper, ggml et les variantes processeur que ggml choisit à l'exécution.
    // Le reste de l'archive (SDL2, llama, parakeet, autres outils) ne sert pas et n'est pas livré.
    if (entry.isDirectory()) walk(full); else if (/^(whisper-cli\.exe|whisper\.dll|ggml\.dll|ggml-base\.dll|ggml-cpu-[a-z0-9]+\.dll)$/i.test(entry.name)) found.push(full);
  });
  walk(temporary);
  if (!found.some(file => /whisper-cli\.exe$/i.test(file))) throw new Error('whisper-cli.exe absent de l’archive.');
  const target = path.join(app, 'vendor', 'win', 'bin');
  fs.rmSync(target, { recursive: true, force: true }); fs.mkdirSync(target, { recursive: true });
  for (const file of found) fs.copyFileSync(file, path.join(target, path.basename(file)));
  console.log('Moteur Windows prêt :', found.map(file => path.basename(file)).join(', '));
}
if (get('runtime-windows')) {
  const bundle = fs.readFileSync(get('runtime-windows'));
  if (bundle.length !== RUNTIME.bytes || crypto.createHash('sha256').update(bundle).digest('hex') !== RUNTIME.sha256) throw new Error('Paquet Visual C++ différent de celui autorisé.');
  const target = path.join(app, 'vendor', 'win', 'bin');
  if (!fs.existsSync(path.join(target, 'whisper-cli.exe'))) throw new Error('Préparer d’abord le moteur Windows (--windows).');
  // Le paquet WiX porte ses fichiers dans un cabinet ajouté à l'exécutable : le plus grand en-tête MSCF dont la taille tient dans le fichier.
  let container = null;
  for (let at = bundle.indexOf('MSCF'); at >= 0; at = bundle.indexOf('MSCF', at + 4)) {
    const size = bundle.readUInt32LE(at + 8);
    if (bundle.readUInt32LE(at + 4) === 0 && size > 0 && at + size <= bundle.length && (!container || size > container.length)) container = bundle.subarray(at, at + size);
  }
  if (!container) throw new Error('Cabinet introuvable dans le paquet Visual C++.');
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'vcredist-'));
  try {
    fs.writeFileSync(path.join(temporary, 'conteneur.cab'), container);
    execFileSync('tar', ['-xf', 'conteneur.cab'], { cwd: temporary });
    const wanted = Object.keys(RUNTIME.dlls).map(name => name + '_amd64');
    // Les MSI voisins ne sont pas des archives : seuls les cabinets (signature MSCF) sont listés.
    const cabinet = fs.readdirSync(temporary).find(name => name !== 'conteneur.cab'
      && fs.readFileSync(path.join(temporary, name)).subarray(0, 4).toString() === 'MSCF'
      && wanted.every(entry => execFileSync('tar', ['-tf', name], { cwd: temporary }).toString().split('\n').includes(entry)));
    if (!cabinet) throw new Error('Runtime x64 absent du paquet Visual C++.');
    execFileSync('tar', ['-xf', cabinet, ...wanted], { cwd: temporary });
    for (const [name, sha256] of Object.entries(RUNTIME.dlls)) {
      if (hash(path.join(temporary, name + '_amd64')) !== sha256) throw new Error(name + ' différent de celui contrôlé.');
      fs.copyFileSync(path.join(temporary, name + '_amd64'), path.join(target, name));
    }
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
  console.log('Runtime Visual C++ joint au moteur :', Object.keys(RUNTIME.dlls).join(', '));
}
// Chaque bibliothèque importée par le moteur Windows doit être jointe ou faire partie de Windows 10 et 11.
const WINDOWS_SYSTEM = /^(api-ms-win-crt-[a-z]+-l1-1-0|kernel32|advapi32|user32|gdi32|imm32|ole32|oleaut32|setupapi|shell32|version|winmm|msvcrt)\.dll$/;
function imports(file) {
  const data = fs.readFileSync(file), pe = data.readUInt32LE(0x3c), sections = [];
  const optional = pe + 24, directories = optional + (data.readUInt16LE(optional) === 0x20b ? 112 : 96);
  for (let i = 0; i < data.readUInt16LE(pe + 6); i++) {
    const at = optional + data.readUInt16LE(pe + 20) + 40 * i;
    sections.push({ va: data.readUInt32LE(at + 12), size: Math.max(data.readUInt32LE(at + 8), data.readUInt32LE(at + 16)), raw: data.readUInt32LE(at + 20) });
  }
  const offset = rva => { const s = sections.find(s => rva >= s.va && rva < s.va + s.size); return rva - s.va + s.raw; };
  const name = rva => { const at = offset(rva); return data.subarray(at, data.indexOf(0, at)).toString('latin1').toLowerCase(); };
  const names = [];
  // Table d'import (entrées de 20 octets, nom à +12) puis imports différés (32 octets, nom à +4).
  for (const [entry, step, field] of [[1, 20, 12], [13, 32, 4]]) {
    const rva = data.readUInt32LE(directories + 8 * entry);
    if (rva) for (let at = offset(rva); data.readUInt32LE(at + field); at += step) names.push(name(data.readUInt32LE(at + field)));
  }
  return names;
}
if (get('windows') || get('runtime-windows')) {
  const target = path.join(app, 'vendor', 'win', 'bin');
  const present = new Set(fs.readdirSync(target).map(name => name.toLowerCase()));
  const missing = new Set(fs.readdirSync(target).filter(name => /\.(exe|dll)$/i.test(name))
    .flatMap(name => imports(path.join(target, name))).filter(name => !present.has(name) && !WINDOWS_SYSTEM.test(name)));
  if (missing.size) throw new Error('Le moteur Windows dépend de fichiers absents : ' + [...missing].join(', ') + '. Joindre le runtime (--runtime-windows).');
  console.log('Dépendances du moteur Windows couvertes :', present.size, 'fichiers joints, le reste fourni par Windows.');
}
if (get('mac')) {
  const source = path.join(get('mac'), 'whisper-cli');
  const links = execFileSync('otool', ['-L', source]).toString().split('\n').slice(1).map(line => line.trim().split(' (')[0]).filter(Boolean);
  const outside = links.filter(link => !link.startsWith('/usr/lib/') && !link.startsWith('/System/'));
  if (outside.length) throw new Error('whisper-cli dépend de fichiers hors du système : ' + outside.join(', '));
  const target = path.join(app, 'vendor', 'mac', 'bin');
  fs.mkdirSync(target, { recursive: true });
  fs.copyFileSync(source, path.join(target, 'whisper-cli'));
  fs.chmodSync(path.join(target, 'whisper-cli'), 0o755);
  console.log('Moteur Mac prêt, sans dépendance hors du système :', hash(source));
}
if (!get('windows') && !get('runtime-windows') && !get('mac')) {
  console.error('Indiquer --windows <zip> --runtime-windows <VC_redist.x64.exe>, ou --mac <dossier>.');
  process.exit(2);
}
