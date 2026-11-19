#!/usr/bin/env bash
# Full rebuild: .blend -> QA -> raw GLB -> posters -> optimised GLB.
set -e
BLENDER="${BLENDER:-C:/Users/debil/Downloads/blender-5.3.0-windows-x64/blender.exe}"
cd "$(dirname "$0")/.."
[ -d scripts/node_modules ] || (cd scripts && npm install --no-audit --no-fund)
"$BLENDER" -b --python scripts/assemble.py
# one Blender process per step: rendering posters after the QA frame sweeps + GLB export in the same process left small cuff artefacts
for STEP in qa glb posters; do STEPS=$STEP "$BLENDER" -b zaprosto-characters.blend --python scripts/export_all.py; done
node scripts/posters_post.mjs
node scripts/optimize.mjs
