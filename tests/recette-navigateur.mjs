// Recette de l'interface d'Expect Transcription dans Chromium, avec l'API simulée (tests/mock-api.js).
//   node tests/recette-navigateur.mjs --serve            sert l'interface fictive sur 127.0.0.1:8797
//   node tests/recette-navigateur.mjs --out <dossier> --audio <WAV fictif> [--webm <WEBM fictif de 30 s>]
//                                                       parcours, captures 390/1280 clair/sombre, assertions
// Demande playwright-core (npm i -D playwright-core, ou PLAYWRIGHT_CORE=<chemin de son index.mjs>).
// Angle mort : ni Electron, ni capture réelle, ni autorisations système, ni moteur de transcription.
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const app = path.resolve(import.meta.dirname, '..');
const renderer = path.join(app, 'renderer');
const PORT = 8797, BASE = `http://127.0.0.1:${PORT}`;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.wav': 'audio/wav', '.json': 'application/json' };
const args = process.argv.slice(2), get = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
const fixture = get('audio', path.join(os.tmpdir(), 'absent.wav'));

function serve() {
  return http.createServer((request, response) => {
    const url = new URL(request.url, BASE);
    if (url.pathname === '/__mock.js') return send(response, path.join(app, 'tests', 'mock-api.js'));
    if (url.pathname === '/__fixture/cours.wav') return send(response, fixture, request.headers.range);
    const file = path.normalize(path.join(renderer, url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname)));
    if (!file.startsWith(renderer)) { response.writeHead(404); return response.end(); }
    if (file.endsWith('index.html')) {
      const html = fs.readFileSync(file, 'utf8').replace('<script src="app.js" type="module"></script>', '<script src="/__mock.js"></script><script src="app.js" type="module"></script>');
      response.writeHead(200, { 'Content-Type': 'text/html' }); return response.end(html);
    }
    send(response, file);
  }).listen(PORT, '127.0.0.1');
}

function send(response, file, range) {
  if (!fs.existsSync(file)) { response.writeHead(404); return response.end(); }
  const total = fs.statSync(file).size, type = TYPES[path.extname(file)] || 'application/octet-stream';
  const match = /bytes=(\d+)-(\d*)/.exec(range || '');
  if (match) {
    const start = Number(match[1]), end = match[2] ? Number(match[2]) : total - 1;
    response.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${start}-${end}/${total}`, 'Content-Length': end - start + 1, 'Accept-Ranges': 'bytes' });
    return fs.createReadStream(file, { start, end }).pipe(response);
  }
  response.writeHead(200, { 'Content-Type': type, 'Content-Length': total, 'Accept-Ranges': 'bytes' });
  fs.createReadStream(file).pipe(response);
}

if (args.includes('--serve')) { serve(); console.log(`Interface fictive : ${BASE}/?scenario=`); }
else {
  const out = path.resolve(get('out', path.join(app, '..', '..', 'output', 'grand-public-recette')));
  fs.mkdirSync(out, { recursive: true });
  const server = serve();
  const { chromium } = await import(process.env.PLAYWRIGHT_CORE || 'playwright-core');
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const checks = [], errors = [];
  const check = (ok, label) => { checks.push({ ok: Boolean(ok), label }); if (!ok) console.error('ÉCHEC', label); };
  const webm = get('webm', null);
  for (const width of [390, 1280]) for (const theme of ['light', 'dark']) {
    const profile = `${width}-${theme}`;
    const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 860 }, colorScheme: theme });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(`${profile}: ${error.message}`));
    page.on('console', message => { if (message.type() === 'error' && !/Failed to load resource/.test(message.text())) errors.push(`${profile} console: ${message.text()}`); });
    const shot = name => page.screenshot({ path: path.join(out, `${name}-${profile}.png`), fullPage: true });
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    // Texte de chaque bouton visible contre son propre fond (couleurs pleines) : au moins 4,5:1.
    const buttons = (where) => page.evaluate(() => {
      const rgb = value => (value.match(/[\d.]+/g) || []).map(Number);
      const lum = ([r, g, b]) => [r, g, b].map(c => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }).reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
      return [...document.querySelectorAll('.btn, .record-start, .record-stop')].filter(el => el.offsetParent && el.textContent.trim()).map(el => {
        const style = getComputedStyle(el), fg = rgb(style.color), bg = rgb(style.backgroundColor);
        if (bg.length === 4 && bg[3] === 0) return null;
        const a = lum(fg), b = lum(bg);
        return { label: el.textContent.trim().slice(0, 30), ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) };
      }).filter(item => item && item.ratio < 4.5);
    }).then(bad => check(!bad.length, `${profile} boutons lisibles : ${where}`, bad.map(item => `${item.label} ${item.ratio.toFixed(2)}`).join(', ')));

    // Premier lancement : les conditions, rien de coché d'avance.
    await page.goto(`${BASE}/?scenario=`); await page.waitForSelector('#conditions[open]');
    check(await page.locator('#conditions input:checked').count() === 0, `${profile} conditions sans case cochée d’avance`);
    await shot('00-conditions');
    await page.click('#conditions-yes');
    await page.waitForSelector('#ribbon');
    check(await page.evaluate(() => document.activeElement?.tagName === 'H1'), `${profile} focus sur le titre après les conditions`);
    check(await page.locator('button[data-image="false"][aria-pressed="true"]').count() === 1 && await page.locator('#image-sources').isHidden(), `${profile} le son seul est le choix par défaut`);
    check((await page.textContent('.consent')).includes('Prévenez les personnes'), `${profile} rappel du consentement près du bouton`);
    await buttons('studio');
    await shot('01-studio-son');

    await page.click('#start');
    await page.waitForSelector('.studio[data-state="enregistrement"]');
    check(await page.evaluate(() => document.activeElement?.id === 'stop'), `${profile} focus sur Arrêter après le départ`);
    await page.waitForTimeout(3200);
    const during = await page.evaluate(() => ({ ...window.__recette }));
    check(during.image === false && during.audio > 32000 && during.video > 0, `${profile} son seul : WebM audio et WAV écrits (${during.video} o / ${during.audio} o)`);
    check(await page.evaluate(() => { const c = document.querySelector('#ribbon'); return c.width > 0 && c.getContext('2d').getImageData(c.width - 8, c.height / 2, 1, 1).data[3] > 0; }), `${profile} le ruban se remplit à droite`);
    check(!(await overflow()), `${profile} aucun débordement pendant l’enregistrement`);
    await shot('02-enregistrement-son');
    await page.click('#pause'); await page.waitForTimeout(300);
    const paused = await page.evaluate(() => window.__recette.audio); await page.waitForTimeout(1500);
    check(await page.evaluate(() => window.__recette.audio) - paused <= 16000, `${profile} rien d’écrit pendant la pause`);
    await page.evaluate(() => window.__commande('reprendre')); await page.waitForTimeout(400);
    check((await page.textContent('#state-chip')) === 'Enregistrement en cours', `${profile} reprise depuis le témoin système`);
    await page.click('[data-route="enregistrements"]'); await page.waitForTimeout(1300);
    check(await page.isVisible('#live') && /Enregistrement \d\d:\d\d/.test(await page.textContent('#live')), `${profile} témoin visible dans l’en-tête hors du studio`);
    await page.click('#live'); await page.waitForSelector('.studio[data-state="enregistrement"]');
    await page.click('#stop');
    await page.waitForURL(/termine$/);
    await page.waitForSelector('#segments li', { timeout: 10000 });
    check(await page.isVisible('#player-ribbon') && await page.locator('#video').evaluate(video => video.offsetWidth <= 1), `${profile} lecteur sans image : le ruban remplace l’écran noir`);
    await buttons('enregistrement');
    await shot('03-texte-pret');

    await page.click('[data-vue="anonyme"]');
    const masked = await page.evaluate(() => ({ marks: document.querySelectorAll('#segments mark.masque').length, text: document.querySelector('#segments').textContent }));
    check(masked.marks >= 4 && masked.text.includes('[PERSONNE 1]') && !/Kowalski|Thomas|06 12/.test(masked.text) && /Parkinson/.test(masked.text), `${profile} texte anonymisé : noms et coordonnées masqués, maladie gardée`, `${masked.marks} masques`);
    await page.click('#copy'); await page.click('#export'); await page.click('#export-srt');
    const anonymous = await page.evaluate(() => ({ copies: window.__recette.copies.length, exports: window.__recette.exports }));
    check(anonymous.copies === 1 && anonymous.exports?.[0]?.anonyme && anonymous.exports[0].format === 'txt' && /^Texte anonymisé automatiquement\n/.test(anonymous.exports[0].texte) && !/Enregistrement du/.test(anonymous.exports[0].texte), `${profile} export anonymisé sans le titre de l’enregistrement`);
    const srt = anonymous.exports?.[1];
    check(srt?.format === 'srt' && srt.anonyme && /^1\n00:00:00,500 --> 00:00:09,000\n/.test(srt.texte) && !/Kowalski/.test(srt.texte), `${profile} sous-titres SRT anonymisés, horaires au millième`);
    await page.click('.mapping summary');
    await shot('04-texte-anonymise');

    // Le son et l'image : le choix de la source réapparaît.
    await page.goto(`${BASE}/?scenario=`); await page.waitForSelector('#ribbon');
    await page.click('button[data-image="true"]');
    await page.waitForSelector('#source-grid .source');
    await page.click('[data-kind="fenetre"]');
    check(await page.locator('#start[aria-disabled="true"]').count() === 1, `${profile} avec image : départ indisponible sans fenêtre choisie`);
    await page.click('[data-source="window:11:0"]');
    check((await page.textContent('#frame-caption')).includes('Visio'), `${profile} l’aperçu nomme la fenêtre choisie`);
    await shot('05-studio-image');
    await page.click('button[data-image="false"]');

    // Déposer un fichier : un WAV lu tel quel, un WEBM converti en WAV 16 kHz.
    await page.goto(`${BASE}/?scenario=#/fichier`); await page.waitForSelector('#dropzone');
    await shot('06-deposer');
    const beforeWav = await page.evaluate(() => window.__recette.audio);
    await page.setInputFiles('#file-input', { name: 'Interview fictive.wav', mimeType: 'audio/wav', buffer: fs.readFileSync(fixture) });
    await page.waitForURL(/termine$/, { timeout: 30000 });
    const wavSeconds = (await page.evaluate(() => window.__recette.audio) - beforeWav) / 32000;
    check((await page.textContent('.arrival')).includes('Fichier rangé') && wavSeconds > 190, `${profile} WAV déposé, relu par l’app et préparé en entier`, `${wavSeconds.toFixed(1)} s`);
    await page.waitForSelector('#segments li', { timeout: 10000 });
    if (webm) {
      await page.goto(`${BASE}/?scenario=#/fichier`); await page.waitForSelector('#dropzone');
      const before = await page.evaluate(() => window.__recette.audio);
      await page.setInputFiles('#file-input', { name: 'Visio fictive.webm', mimeType: 'video/webm', buffer: fs.readFileSync(webm) });
      await page.waitForSelector('#import-state progress');
      await shot('07-conversion');
      await page.waitForURL(/termine$/, { timeout: 30000 });
      const written = await page.evaluate(() => window.__recette.audio) - before;
      check(written > 28 * 32000 && written < 32 * 32000, `${profile} WEBM converti en WAV 16 kHz (30 s attendues)`, `${(written / 32000).toFixed(1)} s`);
    }

    // Mes enregistrements : chercher dans les textes, filtrer, renommer, sélectionner.
    await page.goto(`${BASE}/?scenario=#/enregistrements`); await page.waitForSelector('.record');
    const all = await page.locator('.record').count();
    await page.fill('#search', 'parkinson'); await page.waitForTimeout(500);
    check(await page.locator('.record-extract').count() >= 1, `${profile} recherche dans les textes avec extrait`);
    await page.fill('#search', ''); await page.waitForTimeout(400);
    await page.click('[data-filtre="atranscrire"]');
    check(await page.locator('.record').count() < all, `${profile} filtre « À transcrire »`);
    await page.click('[data-filtre="tous"]');
    await buttons('liste');
    await shot('08-liste');
    await page.locator('.record .more').first().click(); await page.waitForSelector('#context-menu:not([hidden])');
    await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
    await page.waitForSelector('#prompt[open]');
    await page.fill('#prompt-input', 'Séance renommée'); await page.keyboard.press('Enter');
    await page.waitForTimeout(400);
    check((await page.textContent('#records')).includes('Séance renommée'), `${profile} renommer depuis le menu`);
    await page.click('#select');
    await page.locator('.record-check input').nth(0).check(); await page.locator('.record-check input').nth(1).check();
    check((await page.textContent('#selection-count')) === '2 sélectionnés', `${profile} sélection de deux enregistrements`);
    await shot('09-selection');
    await page.click('#selection-trash'); await page.waitForSelector('#confirm[open]');
    check(await page.evaluate(() => document.activeElement?.id === 'confirm-no'), `${profile} Annuler a le focus dans la confirmation`);
    await page.click('#confirm-yes'); await page.waitForTimeout(400);
    check(await page.locator('.record').count() === all - 2, `${profile} deux enregistrements à la corbeille`);
    check(!(await overflow()), `${profile} aucun débordement dans la liste`);

    // La transcription : cet ordinateur, le conseil, le téléchargement.
    await page.goto(`${BASE}/?scenario=sans-modele#/modeles`); await page.waitForSelector('[data-download]');
    check(await page.isVisible('.computer') && (await page.textContent('.advice')).includes('Précis'), `${profile} mémoire, processeur, carte graphique et conseil affichés`);
    await buttons('modèles');
    await shot('10-modeles');
    await page.click('[data-download="rapide"]');
    await page.waitForSelector('[data-model="rapide"] .chip', { timeout: 8000 });
    check(await page.locator('[data-model="rapide"] [name="default-model"]').count() === 1, `${profile} modèle installé puis choisissable`);

    // Fichier déposé dont la préparation a été interrompue : pas de transcription impossible proposée.
    await page.goto(`${BASE}/?scenario=#/enregistrement/${encodeURIComponent('2026-09-02 11h00 — Mémo interrompu')}`); await page.waitForSelector('#transcript-body');
    check(await page.locator('#transcribe').count() === 0 && await page.locator('#transcript-body a[href="#/fichier"]').count() === 1, `${profile} fichier interrompu : redéposer plutôt que transcrire`);

    // Pages d'information.
    await page.goto(`${BASE}/?scenario=#/a-propos`); await page.waitForSelector('.offer');
    check(await page.locator('a[href="https://www.expectpatient.com/"]').count() >= 1, `${profile} page ExpectPatient avec le lien du site`);
    await page.click('footer a[href="#/a-propos/suggestions"]'); await page.waitForTimeout(400);
    check(await page.evaluate(() => Boolean(document.activeElement?.closest('#suggestions'))) && (await page.textContent('#suggestions')).includes('nicolas.naiditch@expectpatient.com'), `${profile} « Une suggestion ? » mène à l’adresse`);
    await page.click('#write-contact');
    check(await page.evaluate(() => window.__recette.etats.includes('ecrire')), `${profile} « Écrire un courriel » passe par l’app`);
    await page.click('#copy-contact');
    check((await page.textContent('#notice')).includes('nicolas.naiditch@expectpatient.com'), `${profile} adresse copiée`);
    await buttons('page ExpectPatient');
    await shot('11b-suggestions');
    check(!(await overflow()), `${profile} aucun débordement page ExpectPatient`);
    await shot('11-a-propos');
    await page.goto(`${BASE}/?scenario=#/mentions/enregistrer`); await page.waitForSelector('.legal');
    check(await page.evaluate(() => document.activeElement?.closest('#enregistrer') !== null), `${profile} le lien « Ce que dit la loi » mène à la bonne rubrique`);
    check(!(await overflow()), `${profile} aucun débordement mentions légales`);
    await shot('12-mentions');

    await page.goto(`${BASE}/?scenario=son-muet`); await page.waitForSelector('#ribbon');
    await page.click('#start'); await page.waitForSelector('.studio[data-state="enregistrement"]');
    await page.waitForTimeout(600);
    check((await page.textContent('#alerts')).includes('n’est pas autorisé'), `${profile} piste muette signalée comme autorisation manquante`);
    await page.evaluate(() => window.__commande('arreter')); await page.waitForURL(/termine$/);
    await page.goto(`${BASE}/?scenario=synchro#/enregistrements`); await page.waitForSelector('.record');
    check((await page.textContent('.page-head')).includes('synchronisé avec OneDrive'), `${profile} Documents synchronisé : l’avertissement est affiché`);
    await page.goto(`${BASE}/?scenario=vide#/enregistrements`); await page.waitForSelector('.empty');
    await shot('13-liste-vide');
    check(!(await overflow()), `${profile} aucun débordement liste vide`);
    await context.close();
  }
  await browser.close(); server.close();
  const report = { portee: 'Interface d’Expect Transcription dans Chromium, API et capture simulées ; aucune preuve Electron, matérielle ou moteur.', checks, errors, passed: checks.filter(item => item.ok).length, total: checks.length };
  fs.writeFileSync(path.join(out, 'recette.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(`${report.passed}/${report.total} vérifications, ${errors.length} erreurs JS → ${out}`);
  process.exit(report.passed === report.total && !errors.length ? 0 : 1);
}
