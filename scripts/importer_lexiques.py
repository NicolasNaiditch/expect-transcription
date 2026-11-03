"""Copie déclarée des lexiques d'anonymisation d'ExpectQuali vers Expect Transcription.

La source unique reste `config/anonymisation_lexiques.yaml` d'ExpectQuali : ce script la relit, garde
les listes qui disent ce qu'il ne faut PAS masquer (maladies éponymes, institutions, grands lieux,
nationalités, formules d'adresse, mots communs pris pour des noms) et écrit un module JavaScript
avec l'empreinte de la source. Ne jamais éditer le module à la main : relancer ce script.

    <python avec PyYAML> -I scripts/importer_lexiques.py <chemin de config/anonymisation_lexiques.yaml d'ExpectQuali>

ExpectQuali n'est pas public : hors de son poste, le module généré, versionné avec l'app, fait foi.
"""
import hashlib
import json
import sys
from datetime import date
from pathlib import Path

import yaml

if len(sys.argv) != 2:
    sys.exit('Indiquer le chemin de config/anonymisation_lexiques.yaml (ExpectQuali).')
SOURCE = Path(sys.argv[1])
TARGET = Path(__file__).resolve().parents[1] / 'renderer' / 'anonymisation' / 'lexiques.js'
LISTES = ['lexique_institutions', 'lieux_non_reidentifiants', 'nationalites', 'metiers_et_fonctions', 'termes_parente',
          'civilites_seules', 'eponymes_medicaux', 'fonctions_publiques', 'etablissements_eponymes', 'bruit_ner']

raw = SOURCE.read_bytes()
data = yaml.safe_load(raw)
listes = {}
for key in LISTES:
    value = data.get(key) or []
    items = value if isinstance(value, list) else list(value)
    listes[key] = sorted({str(item).strip().lower() for item in items if str(item).strip()})
receipt = {'source': 'ExpectQuali, config/anonymisation_lexiques.yaml', 'sha256': hashlib.sha256(raw).hexdigest(), 'copie': date.today().isoformat()}
TARGET.parent.mkdir(parents=True, exist_ok=True)
TARGET.write_text('// Généré par scripts/importer_lexiques.py — ne pas éditer à la main.\n'
                  f'// Source : {receipt["source"]}, SHA-256 {receipt["sha256"]}, copie du {receipt["copie"]}.\n'
                  f'export const provenance = {json.dumps(receipt, ensure_ascii=False)};\n'
                  f'export const lexiques = {json.dumps(listes, ensure_ascii=False, indent=1)};\n', encoding='utf-8')
print(json.dumps({key: len(items) for key, items in listes.items()}))
