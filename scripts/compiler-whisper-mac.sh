#!/bin/zsh
# Compile whisper-cli (whisper.cpp v1.9.5) pour Mac Apple Silicon, Metal embarqué, sans bibliothèque partagée.
# Les sources viennent de l'étiquette officielle v1.9.5 ; la version lue dans CMakeLists.txt est contrôlée.
#   scripts/compiler-whisper-mac.sh <whisper.cpp-1.9.5.tar.gz> [cmake] [dossier de sortie]
# Ensuite : node scripts/preparer-moteur.mjs --mac <dossier de sortie>/bin
set -euo pipefail
here="${0:A:h}"
archive="$1"; cmake="${2:-cmake}"
expected_tag="v1.9.5"
# Empreinte de l'archive codeload.github.com/ggml-org/whisper.cpp/tar.gz/refs/tags/v1.9.5 reçue le 2 novembre 2026.
# GitHub ne publie pas d'empreinte pour ces archives générées : en cas d'écart, comparer les sources à
# l'étiquette v1.9.5 du dépôt (git clone + git rev-parse) avant de changer cette valeur.
expected_sha="ff1a9053feb509ff9d7729703355541ae9690073a6b1c40eb692c962e0dc1720"
actual_sha=$(shasum -a 256 "$archive" | cut -d' ' -f1)
[[ "$actual_sha" == "$expected_sha" ]] || { print "Archive différente de celle vérifiée ($actual_sha)."; exit 1; }
out="${3:-${here:h}/.build/moteur}"
work="$out/whisper.cpp-src"
mkdir -p "$out/bin" "$work"
tar -xzf "$archive" -C "$work" --strip-components 1
version=$(sed -nE 's/^set\(WHISPER_VERSION_(MAJOR|MINOR|PATCH) ([0-9]+)\)/\2/p' "$work/CMakeLists.txt" | paste -sd. -)
[[ "v$version" == "$expected_tag" ]] || { print "Sources $version différentes de $expected_tag."; exit 1; }
"$cmake" -S "$work" -B "$work/build" -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF \
  -DGGML_METAL=ON -DGGML_METAL_EMBED_LIBRARY=ON -DWHISPER_BUILD_TESTS=OFF -DWHISPER_BUILD_SERVER=OFF \
  -DCMAKE_OSX_ARCHITECTURES=arm64 -DCMAKE_OSX_DEPLOYMENT_TARGET=13.0
"$cmake" --build "$work/build" --config Release --target whisper-cli -j 8
cp "$work/build/bin/whisper-cli" "$out/bin/whisper-cli"
codesign --force --sign - "$out/bin/whisper-cli"
otool -L "$out/bin/whisper-cli"
print "whisper-cli prêt : $out/bin/whisper-cli"
