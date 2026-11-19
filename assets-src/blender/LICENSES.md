# Licences and sources

## External assets

**None.** No third-party model, texture, HDRI, font or image was imported into `ladno-characters.blend` or any exported GLB / poster.

| Asset | URL | Author | Licence | Changes |
|---|---|---|---|---|
| _(none)_ | – | – | – | – |

What was searched, and why nothing fitted (Poly Haven CC0 catalogue, Kenney CC0, Quaternius CC0, ambientCG CC0): see `sources/_search-notes/SEARCH_NOTES.md` and `sources/_search-notes/polyhaven_candidates.tsv`.
Licence texts of the sources that were evaluated (not used): Poly Haven <https://polyhaven.com/license> (CC0 1.0), Kenney <https://kenney.nl/assets/furniture-kit> (page states CC0), Quaternius <https://quaternius.com> (CC0 1.0).

## Original work

All geometry, UV layouts, materials, rig (pivot empties), face parts, animation clips (`Idle`, `Wave`, `Blink`), posters and scripts in this folder were created for the "Ладно" project:

* `ladno-characters.blend` (all five characters, modelled procedurally from primitives, lathe/sweep profiles and bevelled boxes)
* `scripts/*.py`, `scripts/*.mjs`, `scripts/build.sh` (re-creates everything from nothing)
* `export/*.glb`, `optimized/*.glb`, `posters/*`, `previews/*`

The original geometry may be used, modified and transferred together with the sources (the .blend and scripts) by the project owner without attribution obligations.

## Tools used (not redistributed inside the assets)

* Blender 5.3 (GPL; output files are not affected by the GPL) with the bundled Khronos glTF I/O exporter.
* glTF-Transform 4.x (MIT) for optimisation; meshoptimizer (MIT) is the codec used in the optimised GLBs (`EXT_meshopt_compression`, decoded in the browser by three.js `MeshoptDecoder`).
* `sharp` (Apache-2.0) for PNG -> WebP conversion; three.js (MIT) only for the local test page `scripts/viewer/`.
* The npm packages live in `scripts/node_modules/` (re-created by `npm install` in `scripts/`; safe to delete).
