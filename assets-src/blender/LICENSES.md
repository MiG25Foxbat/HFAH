# Licences and sources

## External assets

**None.** No third-party model, texture, HDRI, font or image was imported into `zaprosto-characters.blend` or any exported GLB / poster. This includes the 2026-11-20 additions (washing machine `appliances`, claw hammer, pliers, adjustable wrench, cordless drill, new faucet and lamp parts, new hands): all of it is own geometry built procedurally from primitives, lathe/sweep profiles and bevelled boxes in `scripts/`.

| Asset | URL | Author | Licence | Changes |
|---|---|---|---|---|
| _(none)_ | – | – | – | – |

The owner's reference pictures in `sources/refs-2026-11-20/` (claw hammer photo, lamp sketch with red lines, faucet drawing) were used **only as visual guidance** for proportions; no geometry, texture or text was traced or copied from them, and no brand text or logo appears in any model (the hammer photo shows a manufacturer's lettering, which was deliberately not reproduced). They are not part of any shipped asset and are not redistributed in the app (the folder exists only in the `blender-work` working copy, not in the app repo mirror).

What was searched, and why nothing fitted (Poly Haven CC0 catalogue, Kenney CC0, Quaternius CC0, ambientCG CC0): see `sources/_search-notes/SEARCH_NOTES.md` and `sources/_search-notes/polyhaven_candidates.tsv`.
Licence texts of the sources that were evaluated (not used): Poly Haven <https://polyhaven.com/license> (CC0 1.0), Kenney <https://kenney.nl/assets/furniture-kit> (page states CC0), Quaternius <https://quaternius.com> (CC0 1.0).

## Original work

All geometry, UV layouts, materials, rig (pivot empties), face parts, hands, animation clips (`Idle`, `Wave`, `Blink`), posters and scripts in this folder were created for the «Запросто» project (formerly «Ладно»):

* `zaprosto-characters.blend` (all six characters: furniture, plumbing, electric, repair, other, appliances)
* `scripts/*.py`, `scripts/*.mjs`, `scripts/build.sh` (re-creates everything from nothing)
* `export/*.glb`, `optimized/*.glb`, `posters/*`, `previews/*`

The original geometry may be used, modified and transferred together with the sources (the .blend and scripts) by the project owner without attribution obligations.

## Tools used (not redistributed inside the assets)

* Blender 5.3 (GPL; output files are not affected by the GPL) with the bundled Khronos glTF I/O exporter.
* glTF-Transform 4.x (MIT) for optimisation; meshoptimizer (MIT) is the codec used in the optimised GLBs (`EXT_meshopt_compression`, decoded in the browser by three.js `MeshoptDecoder`).
* `sharp` (Apache-2.0) for PNG -> WebP conversion and review sheets; three.js (MIT) only for the local test page `scripts/viewer/`.
* The npm packages live in `scripts/node_modules/` (re-created by `npm install` in `scripts/`; safe to delete).
