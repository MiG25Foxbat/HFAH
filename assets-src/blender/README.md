# «Запросто» (formerly «Ладно») — six 3D characters (Blender → GLB)

One friendly "designer toy" character per category. Real geometry, simple faces, flat mitten hands with a palm side, `Idle` / `Wave` / `Blink` clips, UV-clean `Body` for the cleaning game.

**Category id → file mapping.** The files in this folder are named by *file id*. The app copies them under its own category id (the only difference is electrics):

| App category id | File id (`export/<id>.glb`, `optimized/<id>.glb`, `posters/<id>.png` and `.webp`) | App copy (`ladno/public/…`) | Blender collection / name prefix |
|---|---|---|---|
| `furniture` | `furniture` | `models/furniture.glb`, `posters/furniture.webp` | `Furniture` / `furniture.` |
| `plumbing` | `plumbing` | `models/plumbing.glb`, `posters/plumbing.webp` | `Plumbing` / `plumbing.` |
| `electrics` | **`electric`** (singular) | `models/electrics.glb`, `posters/electrics.webp` | `Electric` / `electric.` |
| `repair` | `repair` | `models/repair.glb`, `posters/repair.webp` | `Repair` / `repair.` |
| `other` | `other` | `models/other.glb`, `posters/other.webp` | `Other` / `other.` |
| `appliances` (new, `#8E7CE0`) | `appliances` | `models/appliances.glb`, `posters/appliances.webp` | `Appliances` / `appliances.` |

The app loads `/models/${id}.glb` and `/posters/${id}.webp` with its own category id, so `appliances` needs no mapping. Sizes below are in KiB (1024 bytes).

| File id | Character | Body colour | Extra parts (separate meshes) | Optimised GLB | Tris |
|---|---|---|---|---|---|
| `furniture` | двухдверный шкаф (cornice, 2 doors with 12 mm gap, 4 legs) | oak `#C08A55` | `Legs`, `Handle_L/R` (cream) | 80 KB | 10.7k |
| `plumbing` | однорычажный смеситель: round base, pillar body, **long chunky spout with a visible aerator mouth**, cylindrical cartridge and a **flat blue paddle lever** | chrome (metal 0.7, rough 0.2) | `Lever` (cartridge + pivot cap, chrome), `LeverTip` (paddle, blue `#4E8FCB`), `Aerator` (dark mouth disc) | 160 KB | 25.3k |
| `electric` | настольная лампа (base, ball-jointed stem, ribbed socket, glowing bulb, cone shade, face on shade; **arms start at the top of the stem under the bulb**) | shade `#E3B23C` | `Base`, `Stem`, `Socket`, `Bulb` (emissive) | 136 KB | 21.1k |
| `repair` | малярный валик (fur sleeve, S-frame, grip, stands upright, face on roller, arms from the roller ends) | mint `#6CC3A0` | `Hubs`, `Frame`, `Grip` (orange handle) | 150 KB | 27.9k |
| `other` | ящик с инструментами (hollow box, lid ajar, carry handle, latches) **full of tools: cordless drill, screwdriver, pliers, adjustable wrench, claw hammer** | blue `#2E57D1` | `Hinge`, `Latch_L/R`, `CarryHandle`, `Hammer_Handle/Head/Face`, `Screwdriver_Handle/Shaft`, `Pliers_Head/Rivet/Grip`, `Wrench`, `Drill_Body/Chuck/Grip` | 164 KB | 25.9k |
| `appliances` | **стиральная машина с фронтальной загрузкой** (cube body with soft bevels, raised control panel with face, program knob and display, porthole door with chrome ring / gasket / glass / laundry / water / bubbles, 4 feet) | lavender `#8E7CE0` | `Feet`, `Knob`, `KnobMark`, `Display`, `Display_Glow`, `Door_Ring/Gasket/Drum/Water/Laundry/Bubbles/Glass/Shine` | 126 KB | 18.1k |

Raw GLBs (`export/`) are 250–600 KB; optimised ones (`optimized/`) 80–164 KB (≤ 400 KB target met, ≈ 3–4× smaller). No textures exist at all (flat PBR colours), so there is nothing to compress with WebP or to cap at 1024 px.

## Files

```
zaprosto-characters.blend  all six characters in collections Furniture / Plumbing / Electric / Repair / Other / Appliances (+ Studio: poster lights & camera)
export/<id>.glb          raw Blender export, Y-up, 3 clips, only that character's nodes
optimized/<id>.glb       gltf-transform: weld, resample, prune, dedup, meshopt (+ KHR_mesh_quantization)
posters/<id>.png|.webp   1024x1024 transparent Eevee renders, soft 3/4 front, identical framing, soft contact shadow baked in
previews/                front / mid-wave (frame 34) / blink close-up per character, hand close-ups (rest + mid-wave), contact sheets (light + dark, 200 px = small-size face check),
                         _flat_<id>.png = posters flattened on the page colour,
                         threejs_optimized_env_wave_t0.7.png = the optimised GLBs loaded in three.js r180 (MeshoptDecoder) with Wave frozen at 0.7 s,
                         threejs_plumbing_yaw-0.7.png = plumbing at the app's default yaw
qa/                      clearance.json (hand clearance + toolbox tool checks), assemble_report.json (UV stats)
scripts/                 everything needed to rebuild (see below)
sources/refs-2026-11-20/ owner's reference images (hammer, lamp arm redline, faucet) used for this pass (kept in blender-work only, not mirrored into the app repo)
LICENSES.md, sources/_search-notes/   licences + free-model search log (no external assets used)
```

## Contract for the app

**Orientation / scale / origin.** Y-up glTF. Origin = bottom centre of the character on the ground (`y = 0`). Height 1.52–1.64 units (without waving arms). The character faces **+Z** (towards a camera on +Z). Footprint incl. hands at rest (x × z): furniture 1.39×0.68, plumbing 1.22×1.70 (the spout reaches 1.13 forward), electric 0.85×0.84, repair 1.55×0.51, other 1.52×0.93, appliances 1.70×1.01.
Left/right use the Blender rig convention: `*_R` is the character's **own right = −X** (appears on the viewer's left, this is the waving arm), `*_L` is +X.

**Node tree (names identical in `export/` and `optimized/`):**

```
Root                      static; put app transforms (drag rotation, scale, placement) here
└─ Rig                    animated by Idle (feet stay planted: bob + squash/stretch + tiny roll)
   ├─ Body                single mesh, ONE material, UV set TEXCOORD_0 (non-overlapping, margin 0.02) – the cleaning-game surface
   ├─ <other part meshes> Legs, Handle_*, Lever*, Aerator, Base, Stem, Socket, Bulb, Hubs, Frame, Grip, Hinge, Latch_*, CarryHandle,
   │                      Hammer_*, Screwdriver_*, Pliers_*, Wrench, Drill_*, Feet, Knob, KnobMark, Display, Display_Glow, Door_*
   ├─ Face                empty – hide it (visible=false) to remove all face parts
   │  ├─ Eye_L, Eye_R, EyeShine_L, EyeShine_R, Cheek_L, Cheek_R, Mouth      (meshes)
   │  └─ Lid_L, Lid_R     pivot empties, animated by Blink (scale ≈0 → 1 → ≈0); child meshes Lid_L_Cap / Lid_R_Cap are body-coloured domes
   ├─ Arm_R               pivot empty at the shoulder, animated by Wave (rotation)
   │  ├─ Arm_R_Tube
   │  └─ Hand_R           wrist pivot, animated by Wave (rotation); children (all meshes):
   │       Hand_R_Mitten  flat mitten, convex back (+Y), shallow concave palm (−Y)
   │       Hand_R_Palm    thin palm pad lying in the dish (material GlovePalm: warmer, rougher)
   │       Hand_R_Thumb   on the outer edge, shifted to the palm side
   │       Hand_R_Cuff    short wrist cuff, open top (the arm tube passes through)
   └─ Arm_L … Hand_L      same, mirrored, never animated (rest pose only)
```

**Hands (new in the 2026-11-20 pass).** Same size and minimalism as before (no fingers, `HAND_SCALE` unchanged) but a clear palm and back: the **palm looks to +Z (towards the viewer) at rest and during Wave** (Wave only rotates about the depth axis, so the palm stays turned to the camera when the arm is up), the back is convex, the thumb sits on the outer edge at rest (it swings to the inner side when the arm goes up, like a real right hand) and is shifted to the palm side.

**Clips** (every GLB has exactly these three, glTF animation names): `Idle` 3.000 s (loop), `Wave` 1.600 s (once), `Blink` 0.180 s (once).
The clips write to disjoint nodes (Idle → `Rig`; Wave → `Arm_R`, `Hand_R`; Blink → `Lid_L`, `Lid_R`), so all three can play at the same time without cross-fading:

```js
mixer.clipAction(idle).play();                                   // loop
mixer.clipAction(wave).setLoop(THREE.LoopOnce, 1).reset().play(); // greeting, ends back at the rest pose
mixer.clipAction(blink).setLoop(THREE.LoopOnce, 1).reset().play(); // call every 3–6 s at random
```

Rest pose (frame 0 of every clip = the pose after loading): arms hang out 20–34° from vertical, lids hidden (scale 0.001).
Wave: right arm rises to 152° (**lamp: 102°**, because its arms start under the shade and the raised hand must stay below / outside the shade rim; the wrist is bent up by 0.25 rad there), wrist swings ±0.55 rad five half-swings (≈2.5 waves), arm returns. Checked in three.js: armR angle 20° → 152° (lamp 102°) → 20°, lids 0 → 0.9 → 0.

**Loading.** GLBs require `EXT_meshopt_compression` and `KHR_mesh_quantization`: `new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)` (from `three/addons/libs/meshopt_decoder.module.js`, bundled — no CDN). No Draco, no KTX2, no extension needing MeshPhysicalMaterial.
Material names: `Wood`, `WoodDark`, `Handle`, `Chrome`, `LeverBlue`, `Aerator`, `Shade`, `Base`, `Metal`, `Bulb`, `Mint`, `Grip`, `Steel`, `Blue`, `LatchMetal`, `ToolWood`, `Screwdriver`, `PliersGrip`, `Drill`, `DrillDark`, `ArmTube`, `Lavender`, `Enamel`, `Gasket`, `Drum`, `Water`, `Laundry`, `Foam`, `Glass`, `KnobMark`, `Display`, `DisplayGlow`, `Feet`, and the shared face set `Eye`, `EyeShine`, `Mouth`, `Cheek`, `Glove`, `GlovePalm` (per-file).
**`appliances/Glass`** is the only alpha-blended material in the set (`alphaMode: BLEND`, double-sided, α 0.30, plain metal-rough, no transmission): three.js sets `transparent`/`depthWrite=false` itself. It is a thin dome in front of the drum; if a renderer cannot blend, hide the mesh `Door_Glass` and the porthole still reads (dark drum, laundry, water).
After optimisation geometry is quantised, so mesh nodes (e.g. `Body`) carry a translation/scale that undoes the quantisation — do not reset their transforms. `Lid_*` and all animated nodes are empties, so quantisation never touches them.

**Lighting notes.** Plain glTF PBR: the chrome faucet and the washing machine's chrome ring need `scene.environment` (any room/studio IBL) to look metallic; without it they read as mid-grey (metalness 0.65–0.7 was chosen so they never go black). The bulb and the washing machine display digits are emissive (strength 1); add bloom if you want a glow. With a bright environment + neutral tone mapping the colours match the posters; with only weak direct lights everything looks darker (checked in `scripts/viewer`).

**Cleaning game.** `Body` is one mesh, one material, one UV layer; no overlap (rasterised check at 512², `qa/assemble_report.json`), margin 0.02, island texel density equalised. UV coverage: furniture 60 %, plumbing 49 %, electric 43 %, repair 72 %, other 60 %, **appliances 72 %**. The washing machine's control-panel plate is part of `Body` (same material), the door, knob, display and feet are separate meshes (not cleanable). The roller's UVs were unwrapped on the smooth sleeve and the fur displacement was applied afterwards, so the layout is clean despite the bumps. Face parts are separate meshes on `Face`, so painting on `Body` UVs never sees them.

## Art-direction pass 1 (2026-11-19)

* Repair: arm pivots moved from the orange grip to the lower front of the roller end faces; arm tubes are now light grey (`ArmTube` `#C9CED4`) so the grip reads as a handle, not legs; hands hang at mid-height beside the head.
* All characters: mittens and thumbs scaled +25 % (`HAND_SCALE` in `scripts/lib.py`).
* Plumbing: lever thicker and longer; Electric: arms shortened and moved under the shade rim.

## Art-direction pass 2 (2026-11-20, owner review)

* **Hands, all six.** Flat mitten (`hand_bm` in `scripts/lib.py`): squircle outline, convex back, shallow dish on the palm side with a separate palm pad (`GlovePalm` `#E4D8C6`, roughness 0.95 vs `Glove` `#F6F2EA` 0.75), thumb on the outer edge shifted to the palm side, short open-top cuff (`cuff_bm`) at the wrist. Same overall size as before (mitten slightly wider and clearly thinner; the thumb adds ~0.1 on the outer side).
* **Toolbox.** Still the same box, lid angle and face. Tools (`scripts/toolbox_tools.py`, placed by `TOOL_PLACE` in `chars.py`, fanned left to right): cordless drill (green/graphite, chuck + bit), screwdriver, combination pliers (orange grips), adjustable wrench, **claw hammer** — big head with a round polished striking face on one side and a split curved claw on the other, steel shaft, yellow grip with flared butt; no brand text. Every tool leans forward through the lid gap and is checked against box, lid, latches and each other (0 overlapping triangles).
* **Lamp.** Shoulder pivots moved from the shade rim to the top of the stem: `(±0.052, −0.02, 0.91)` on the metal socket just under the bulb (red lines in `sources/refs-2026-11-20/lamp-arms-from-stem-top-redline.png`; the old pivots were at z ≈ 1.15 under the shade rim, the new ones are where the red lines start, 0.24 lower), arm length 0.44 (was 0.26), rest angle 26°. Wave raises the arm to 102° with a wrist bend; the hand stays clear of the shade rim (min clearance 2 cm).
* **Faucet.** Spout is now 1.0 long (was 0.8), radius 0.098 (was 0.074), straight forward then bending ~31° down into an aerator ring with a dark mouth disc, with a collar at the body. The pillar's top is a sloping shoulder carrying a **cylindrical cartridge** (`Lever`) and a **flat paddle lever** (`LeverTip`, blue, rising 15°, pointing back-right so it reads side-on at the app's default yaw of −0.7 rad). The spout stays above the face (eyes top at 0.76, spout bottom at ≈ 0.82) and leaves to the viewer's left at yaw −0.7 (`previews/threejs_plumbing_yaw-0.7.png`).
* **New: `appliances`.** Front-loading washing machine in category lavender, built from own geometry with the same helpers (see table above). Face on the raised control panel between the program knob (with dial dots) and a small display ("11:11"); porthole door below it stays free; arms come out of the side walls (`ArmTube` `#6A58C4`).

## Hand clearance (Blender units ≈ metres; hands vs every non-arm mesh incl. Body, legs, frame, lid, tools, door parts)

Method (`scripts/export_all.py › clearance`): NLA evaluated at 148 sample frames per character (Idle+Wave every 2 frames, Wave alone, Idle alone), world-space BVH of each hand (mitten + palm + thumb + cuff): minimum vertex→surface distance both directions plus triangle-overlap test. **Zero intersecting triangles in all 888 samples.**

| Character | Min hand clearance (worst frame) | Min arm-tube clearance beyond the shoulder socket (>9 cm from pivot) | Overlapping triangles |
|---|---|---|---|
| furniture | 0.042 (Idle+Wave f46, right hand) | 0.021 | 0 |
| plumbing | 0.030 (Idle+Wave f74, left hand) | 0.013 | 0 |
| electric | 0.020 (Idle+Wave f46, right hand) | 0.085 | 0 |
| repair | 0.031 (Idle+Wave f46, right hand) | 0.005 | 0 |
| other | 0.032 (Idle+Wave f46, right hand) | 0.007 | 0 |
| appliances | 0.039 (Idle+Wave f46, right hand) | 0.032 | 0 |

Toolbox tools (`qa/clearance.json › other_tools`): 0 overlapping triangles against box / lid / latches / carry handle and between tools; closest approach to the box 0.014 (drill), 0.017 (hammer), 0.024 (wrench), 0.036 (pliers), 0.082 (screwdriver); closest tool pair 0.026 (pliers–screwdriver).

Arms are tubes that rotate about a shoulder pivot placed on the body surface and always point outward (x-component ≤ 0 for the right arm at every Wave angle). Shoulders: furniture/plumbing/toolbox/washing machine on the side walls; lamp on the socket at the top of the stem (tubes start inside the socket, so the lamp's two arms leave from the same metal collar); roller on the lower front of the two roller end faces (so the arms stay clear of the frame wire, which lies in the y=0 plane).

## Rebuild / re-export / re-optimise

Requirements: Blender 5.3 (path in `scripts/build.sh`, override with `BLENDER=`), Node ≥ 20.

```bash
bash scripts/build.sh          # assemble .blend → QA + export GLB + posters/previews → posters to WebP + sheets → optimise GLBs
# or step by step:
blender -b --python scripts/assemble.py                                  # builds the 6 characters, UVs, NLA clips, saves zaprosto-characters.blend
blender -b zaprosto-characters.blend --python scripts/export_all.py      # STEPS=qa,glb,posters (env var) to run a subset
node scripts/posters_post.mjs                                            # PNG → WebP + contact sheets + flat posters + blink/hand sheets
node scripts/optimize.mjs                                                # export/ → optimized/ (+ gltf validator)
node scripts/glb_stats.mjs optimized ; node scripts/glb_nodes.mjs optimized/appliances.glb   # verify sizes, node names, clips
node scripts/anim_cmp.mjs export/electric.glb optimized/electric.glb     # animation curves raw vs optimised (slerp aware, max error ≤ 5e-4)
```

Optimisation chain (per file): `weld` → `resample --tolerance 1e-5` → `prune --keep-leaves true --keep-attributes true` → `dedup` → `meshopt --level high`. Deliberately **not** used: `optimize`, `flatten`, `join`, `palette` (they merge or rename nodes). `--keep-attributes true` is essential: plain `prune` strips `TEXCOORD_0` (nothing references it through a texture) and the grime mask would lose its UVs.

Export details (Blender 5.3 glTF exporter): `export_animation_mode='NLA_TRACKS'`; each animated object has an NLA track named `Idle`/`Wave`/`Blink`, tracks with equal names are merged into one glTF animation. Datablocks are named `<id>.<name>` inside the .blend (Blender needs unique names); the export script strips the prefix for the selected character only, exports, then restores the names.

Dev tools: `scripts/dev.py` (quick preview renders and QA of one character, e.g. `CATS=plumbing VIEWS=front,tq,-40:9 FRAME=34 FOCUS=hand CLEAR=1 TOOLS=1 blender -b --python scripts/dev.py`), `scripts/viewer/` (three.js test page: `node scripts/viewer/serve.mjs`, then open `http://127.0.0.1:8766/scripts/viewer/index.html?env=1&t=0.7`; `&only=plumbing&yaw=-0.7` for one character at the app's default yaw), `scripts/anim_cmp.mjs`, `scripts/glb_bounds.mjs`, `scripts/crop.mjs` (crop + upscale a poster region).

## Known limitations (honest list)

* Eevee here has no shadow catcher, so the posters carry a baked soft contact-shadow blob (alpha ≤ 0.55); the app draws its own shadow in the scene.
* The lamp's arms are thin metal tubes and its Wave is a lower, sideways "hi" (102°) instead of a high wave: with the shoulders on the stem a higher arm would pass through the bulb or the shade rim. Its two shoulders share one metal collar.
* The faucet's lever reads as a long thin bar when seen exactly from the side (it is a flat paddle, 0.72 × 0.36 × 0.15) and its chrome depends on an environment map.
* The washing machine's glass is alpha-blended; with a non-blending renderer hide `Door_Glass`. The tools in the toolbox are toy-scale and stylised (the claw is two round-section prongs, the wrench head is three boxes), no brand marks.
* Blink: closed lids are body-coloured domes (look like a smooth eyelid bump); at very oblique angles a hairline of the eye may show for a few frames.
* Quantisation precision: positions 14 bit per mesh, normals 10 bit, UV 12 bit (grime mask sampling error < 1/4096 of UV space).
* Fur on the roller is geometric noise (damped around the face), 28k triangles for that character; the others are 10–26k.
* Checked in a real browser (three.js r180, MeshoptDecoder, Wave frozen at 0.7 s and clip sampling at 0 / 0.5 / 1 / 1.59 s, with an environment) but not on a physical phone.
