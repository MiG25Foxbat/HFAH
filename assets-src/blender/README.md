# «Ладно» — five 3D characters (Blender → GLB)

One friendly "designer toy" character per category. Real geometry, simple faces, mitten hands, `Idle` / `Wave` / `Blink` clips, UV-clean `Body` for the cleaning game.

**Category id → file mapping.** The files are named by *file id*; the app's category id for electrics is plural:

| App category id | File id (`export/<id>.glb`, `optimized/<id>.glb`, `posters/<id>.png` and `.webp`) | Blender collection / name prefix |
|---|---|---|
| `furniture` | `furniture` | `Furniture` / `furniture.` |
| `plumbing` | `plumbing` | `Plumbing` / `plumbing.` |
| `electrics` | **`electric`** (singular — file names were deliberately not changed) | `Electric` / `electric.` |
| `repair` | `repair` | `Repair` / `repair.` |
| `other` | `other` | `Other` / `other.` |

So the app needs one rename only: `electrics` → `electric` (e.g. `const FILE = { electrics: "electric" }` or `` `${id === "electrics" ? "electric" : id}.glb` ``). Sizes below are in KiB (1024 bytes).

| File id | Character | Body colour | Extra parts (separate meshes) | Optimised GLB | Tris | 
|---|---|---|---|---|---|
| `furniture` | двухдверный шкаф (cornice, 2 doors with 12 mm gap, 4 legs) | oak `#C08A55` | `Legs`, `Handle_L/R` (cream) | 66 KB | 8.1k |
| `plumbing` | однорычажный смеситель (round base, pillar body, gooseneck spout, thick lever) | chrome (metal 0.7, rough 0.2) | `Lever`, `LeverTip` (blue `#4E8FCB`) | 131 KB | 19.0k |
| `electric` | настольная лампа (base, ball-jointed stem, ribbed socket, glowing bulb, cone shade, face on shade) | shade `#E3B23C` | `Base`, `Stem`, `Socket`, `Bulb` (emissive) | 120 KB | 18.2k |
| `repair` | малярный валик (fur sleeve, S-frame, grip, stands upright, face on roller, arms from the roller ends) | mint `#6CC3A0` | `Hubs`, `Frame`, `Grip` (orange handle) | 144 KB | 25.2k |
| `other` | ящик с инструментами (hollow box, lid ajar, carry handle, latches, hammer + screwdriver sticking out) | blue `#2E57D1` | `Hinge`, `Latch_L/R`, `CarryHandle`, `Hammer_Handle/Head`, `Screwdriver_Handle/Shaft` | 88 KB | 11.5k |

Raw GLBs (`export/`) are 180–525 KB; optimised ones (`optimized/`) 66–144 KB (≤400 KB target met, ≈ 2.7–3.7× smaller). No textures exist at all (flat PBR colours), so there is nothing to compress with WebP or to cap at 1024 px.

## Files

```
ladno-characters.blend   all five characters in collections Furniture / Plumbing / Electric / Repair / Other (+ Studio: poster lights & camera)
export/<id>.glb          raw Blender export, Y-up, 3 clips, only that character's nodes
optimized/<id>.glb       gltf-transform: weld, resample, prune, dedup, meshopt (+ KHR_mesh_quantization)
posters/<id>.png|.webp   1024x1024 transparent Eevee renders, soft 3/4 front, identical framing, soft contact shadow baked in
previews/                front / mid-wave (frame 34) / blink close-up per character, contact sheets (light + dark, 200 px = small-size face check),
                         threejs_optimized_env_wave_t0.7.png = the optimised GLBs loaded in three.js r180 (MeshoptDecoder) with Wave frozen at 0.7 s
qa/                      clearance.json (hand clearance), assemble_report.json (UV stats)
scripts/                 everything needed to rebuild (see below)
LICENSES.md, sources/_search-notes/   licences + free-model search log (no external assets used)
```

## Contract for the app

**Orientation / scale / origin.** Y-up glTF. Origin = bottom centre of the character on the ground (`y = 0`). Height 1.58–1.64 units (without waving arms). The character faces **+Z** (towards a camera on +Z). Footprint incl. hands at rest (x × z): furniture 1.32×0.68, plumbing 1.01×1.31 (spout), electric 1.09×0.84, repair 1.48×0.51, other 1.44×0.92.
Left/right use the Blender rig convention: `*_R` is the character's **own right = −X** (appears on the viewer's left, this is the waving arm), `*_L` is +X.

**Node tree (names identical in `export/` and `optimized/`):**

```
Root                      static; put app transforms (drag rotation, scale, placement) here
└─ Rig                    animated by Idle (feet stay planted: bob + squash/stretch + tiny roll)
   ├─ Body                single mesh, ONE material, UV set TEXCOORD_0 (non-overlapping, margin 0.02) – the cleaning-game surface
   ├─ <other part meshes> Legs, Handle_*, Lever*, Base, Stem, Socket, Bulb, Hubs, Frame, Grip, Hinge, Latch_*, CarryHandle, Hammer_*, Screwdriver_*
   ├─ Face                empty – hide it (visible=false) to remove all face parts
   │  ├─ Eye_L, Eye_R, EyeShine_L, EyeShine_R, Cheek_L, Cheek_R, Mouth      (meshes)
   │  └─ Lid_L, Lid_R     pivot empties, animated by Blink (scale ≈0 → 1 → ≈0); child meshes Lid_L_Cap / Lid_R_Cap are body-coloured domes
   ├─ Arm_R               pivot empty at the shoulder, animated by Wave (rotation)
   │  ├─ Arm_R_Tube
   │  └─ Hand_R           wrist pivot, animated by Wave (rotation); children Hand_R_Mitten, Hand_R_Thumb
   └─ Arm_L … Hand_L      same, mirrored, never animated (rest pose only)
```

**Clips** (every GLB has exactly these three, glTF animation names): `Idle` 3.000 s (loop), `Wave` 1.600 s (once), `Blink` 0.180 s (once).
The clips write to disjoint nodes (Idle → `Rig`; Wave → `Arm_R`, `Hand_R`; Blink → `Lid_L`, `Lid_R`), so all three can play at the same time without cross-fading:

```js
mixer.clipAction(idle).play();                                   // loop
mixer.clipAction(wave).setLoop(THREE.LoopOnce, 1).reset().play(); // greeting, ends back at the rest pose
mixer.clipAction(blink).setLoop(THREE.LoopOnce, 1).reset().play(); // call every 3–6 s at random
```

Rest pose (frame 0 of every clip = the pose after loading): arms hang out 20–34° from vertical, lids hidden (scale 0.001).
Wave: right arm rises to 152°, wrist swings ±0.55 rad five half-swings (≈2.5 waves), arm returns.

**Loading.** GLBs require `EXT_meshopt_compression` and `KHR_mesh_quantization`: `new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)` (from `three/addons/libs/meshopt_decoder.module.js`, bundled — no CDN). No Draco, no KTX2, no extension needing MeshPhysicalMaterial.
Material names: `Wood`, `WoodDark`, `Handle`, `Chrome`, `LeverBlue`, `Shade`, `Base`, `Metal`, `Bulb`, `Mint`, `Grip`, `Steel`, `Blue`, `LatchMetal`, `ToolWood`, `Screwdriver`, `ArmTube`, and the shared face set `Eye`, `EyeShine`, `Mouth`, `Cheek`, `Glove` (per-file).
After optimisation geometry is quantised, so mesh nodes (e.g. `Body`) carry a translation/scale that undoes the quantisation — do not reset their transforms. `Lid_*` and all animated nodes are empties, so quantisation never touches them.

**Lighting notes.** Plain glTF PBR: the chrome faucet needs `scene.environment` (any room/studio IBL) to look metallic; without it it reads as mid-grey (metalness 0.7 was chosen so it never goes black). The bulb is emissive (`#FFB84D`, strength 1); add bloom if you want a glow. With a bright environment + neutral tone mapping the colours match the posters; with only weak direct lights everything looks darker (checked in `scripts/viewer`).

**Cleaning game.** `Body` is one mesh, one material, one UV layer; no overlap (rasterised check at 512², `qa/assemble_report.json`), margin 0.02, island texel density equalised. UV coverage: furniture 60 %, plumbing 52 %, electric 43 %, repair 72 %, other 60 %. The roller's UVs were unwrapped on the smooth sleeve and the fur displacement was applied afterwards, so the layout is clean despite the bumps. Face parts are separate meshes on `Face`, so painting on `Body` UVs never sees them.

## Art-direction pass (2026-11-19)

* Repair: arm pivots moved from the orange grip to the lower front of the roller end faces; arm tubes are now light grey (`ArmTube` `#C9CED4`) so the grip reads as a handle, not legs; hands hang at mid-height beside the head.
* All characters: mittens and thumbs scaled +25 % (`HAND_SCALE` in `scripts/lib.py`).
* Plumbing: lever thicker (radius 0.082→0.072 chrome, 0.074→0.078 blue tip) and ~17 % longer, tilted further back; blue tip kept.
* Electric: arms shortened (0.34→0.26) and moved under the shade rim, 30° forward of the sides, rest angle 20°.

## Hand clearance (Blender units ≈ metres; hands vs every non-arm mesh incl. Body, legs, frame, lid, tools)

Method (`scripts/export_all.py › clearance`): NLA evaluated at 148 sample frames per character (Idle+Wave every 2 frames, Wave alone, Idle alone), world-space BVH of each hand (mitten + thumb): minimum vertex→surface distance both directions plus triangle-overlap test. **Zero intersecting triangles in all 740 samples.**

| Character | Min hand clearance (worst frame) | Min arm-tube clearance beyond the shoulder socket (>9 cm from pivot) | Overlapping triangles |
|---|---|---|---|
| furniture | 0.059 (Idle+Wave f80, left hand) | 0.021 | 0 |
| plumbing | 0.040 (Idle+Wave f74, left hand) | 0.013 | 0 |
| electric | 0.132 (Idle+Wave f46, right hand) | 0.054 | 0 |
| repair | 0.047 (Idle+Wave f46, right hand) | 0.005 | 0 |
| other | 0.043 (Idle+Wave f70, left hand) | 0.007 | 0 |

Arms are tubes that rotate about a shoulder pivot placed on the body surface and always point outward (x-component ≤ 0 for the right arm at every Wave angle). Shoulders: furniture/plumbing/toolbox on the side walls; lamp under the shade rim, 30° forward of the sides; roller on the lower front of the two roller end faces (so the arms stay clear of the frame wire, which lies in the y=0 plane). The tools in the toolbox were also checked against the lid/walls (0 overlapping triangles, ≥ 8 cm).

## Rebuild / re-export / re-optimise

Requirements: Blender 5.3 (path in `scripts/build.sh`, override with `BLENDER=`), Node ≥ 20.

```bash
bash scripts/build.sh          # assemble .blend → QA + export GLB + posters/previews → posters to WebP → optimise GLBs
# or step by step:
blender -b --python scripts/assemble.py                                  # builds the 5 characters, UVs, NLA clips, saves ladno-characters.blend
blender -b ladno-characters.blend --python scripts/export_all.py         # STEPS=qa,glb,posters (env var) to run a subset
node scripts/posters_post.mjs                                            # PNG → WebP + contact sheets
node scripts/optimize.mjs                                                # export/ → optimized/
node scripts/glb_stats.mjs optimized ; node scripts/glb_nodes.mjs optimized/other.glb   # verify sizes, node names, clips
```

Optimisation chain (per file): `weld` → `resample --tolerance 1e-5` → `prune --keep-leaves true --keep-attributes true` → `dedup` → `meshopt --level high`. Deliberately **not** used: `optimize`, `flatten`, `join`, `palette` (they merge or rename nodes). `--keep-attributes true` is essential: plain `prune` strips `TEXCOORD_0` (nothing references it through a texture) and the grime mask would lose its UVs.

Export details (Blender 5.3 glTF exporter): `export_animation_mode='NLA_TRACKS'`; each animated object has an NLA track named `Idle`/`Wave`/`Blink`, tracks with equal names are merged into one glTF animation. Datablocks are named `<id>.<name>` inside the .blend (Blender needs unique names); the export script strips the prefix for the selected character only, exports, then restores the names.

Dev tools: `scripts/dev.py` (quick preview renders, `CATS=plumbing VIEWS=front,tq blender -b --python scripts/dev.py`), `scripts/viewer/` (three.js test page: `node scripts/viewer/serve.mjs`, then open `http://127.0.0.1:8766/scripts/viewer/index.html?env=1&t=0.7`), `scripts/anim_cmp.mjs` (compare animation curves of two GLBs), `scripts/glb_bounds.mjs`.

## Known limitations (honest list)

* Eevee here has no shadow catcher, so the posters carry a baked soft contact-shadow blob (alpha ≤ 0.55); the app draws its own shadow in the scene.
* The lamp's arms are now short and start under the shade rim, but they are still thin metal tubes; the faucet reads as a pillar mixer with a thick lever, still the least iconic of the five, and its chrome depends on an environment map.
* Blink: closed lids are body-coloured domes (look like a smooth eyelid bump); at very oblique angles a hairline of the eye may show for a few frames.
* Quantisation precision: positions 14 bit per mesh, normals 10 bit, UV 12 bit (grime mask sampling error < 1/4096 of UV space).
* Fur on the roller is geometric noise (damped around the face), 25k triangles for that character; the other four are 8–19k.
* Checked in a real browser (three.js r180, MeshoptDecoder, Wave frozen at 0.7 s, with and without an environment) but not on a physical phone.

## Handover notes (added when this folder was copied into the app repository)

* In the app repository this folder is `assets-src/blender/`; the working copy used to live next to the app as `blender-work/`.
* Not copied, to keep the repository small: `scripts/node_modules/` (run `npm install` in `scripts/`), the `.blend1` backup, and most of `previews/` (only the contact sheets are kept; the other preview PNGs, including `threejs_optimized_env_wave_t0.7.png`, can be re-created with `scripts/dev.py` and `scripts/viewer/`). Total size of this folder: about 8.6 MB.
* The app serves copies of the optimised files: `optimized/<id>.glb` → `public/models/<id>.glb` and `posters/<id>.webp` → `public/posters/<id>.webp`, with the one rename `electric` → `electrics`. On 2026-11-19 these files were byte-identical (checked with sha256 for the five GLBs and the posters used by the app).
* `scripts/build.sh` defaults to the author's Blender path (Windows, Downloads folder): set `BLENDER=/path/to/blender`.
* `scripts/assemble.py` rebuilds `ladno-characters.blend` from the scripts and overwrites manual edits made in Blender; if you edit the `.blend` by hand, run only the export and optimisation steps.
