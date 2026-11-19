# Free-model search notes (2026-11-19)

Requirement (SPEC.md, "3D И ИНТЕРАКТИВ"): find free models whose licence allows commercial use and transfer with sources, keep sources and licences.

**Outcome: nothing external was imported.** All geometry in `ladno-characters.blend` was modelled from scratch for this project.
Nothing was downloaded into `sources/` (no asset folders exist here besides these notes), so there is no third-party licence to carry.

## What was searched

| Source | Licence | How it was checked | Result |
|---|---|---|---|
| Poly Haven models (`https://api.polyhaven.com/assets?t=models`, 522 models) | CC0 (<https://polyhaven.com/license>: any purpose, redistribution allowed, attribution not required) | Catalogue pulled via API and filtered for cabinet / wardrobe / faucet / tap / toolbox / lamp / roller / hammer / screwdriver / socket. Candidate list with polycounts: `polyhaven_candidates.tsv` | No suitable base: every relevant asset is a photoscan-style PBR prop, 2k-61k triangles, 1k-4k textures, deliberately worn/rusty/vintage. No paint roller or mixer tap exists in the catalogue. |
| Kenney (<https://kenney.nl/assets/furniture-kit>, CC0) | CC0 | Direct script fetch returns HTTP 403 (bot protection); page read through a web fetch tool: kit is generic low-poly furniture (140 files in the 3D category, tables/chairs/beds), no two-door wardrobe with face-ready flat fronts, no tools. | Not used. |
| Quaternius (<https://quaternius.com>, CC0) | CC0 | Web search: "Fantasy Props MegaKit" (tools, furniture, weapons; fantasy style) and "Furniture Low Poly" packs; no toolbox/mixer/roller pack found. | Not used. |
| ambientCG / Poly Haven textures (CC0) | CC0 | Considered a wood texture for the wardrobe. | Rejected: spec asks for matte clay-like toy materials; flat colour keeps GLBs at 65-145 KB, no textures at all, and the `Body` UVs stay free for the game's grime mask. |

## Why from scratch

* The target is a soft stylised "designer toy" family with a face, mittens and animation; photoscan props would have to be remodelled, decimated from 14k-61k triangles to ~2-4k and re-shaded, which is more work than modelling the five simple silhouettes with bevelled primitives.
* Required constructions (mixer lever + gooseneck spout, hollow toolbox with ajar lid and tools, fur roller with frame, lamp with glowing bulb) do not exist as CC0 assets in the stylised look.
* No asset removes any obligation: all original geometry, materials and animations in this folder are created for this project and can be transferred together with the sources (see `../../LICENSES.md`).

If a CC0 asset is added later, put it in its own folder `sources/<asset-name>/` (original download untouched + `LICENSE.txt` + `SOURCE.txt`), and add a row to `LICENSES.md`.
