# Bathroom WebGPU

Photorealistic bathroom viewer built with vanilla Three.js, TypeScript, Vite, and `WebGPURenderer`. There is no React, R3F, Babylon.js, or WebGL fallback.

The visual target is [Bathroom Interior by Oguz Kaya](https://sketchfab.com/3d-models/bathroom-interior-68be8975cca1481c85c20b590e81c6a6). The application starts from the reference camera inside the room, but navigation is not locked to a height, axis, or room boundary. Left- or middle-drag orbits freely, right-drag pans in screen space, the wheel dollies, and touch uses one-finger orbit plus two-finger dolly/pan.

## Run locally

Requirements: Node.js 22.12 or newer and a browser with WebGPU enabled.

```powershell
npm install
npm run dev
```

Production verification:

```powershell
npm run build
npm run preview
```

The build output is `dist/`.

## Vercel

`vercel.json` already declares the Vite build command, `dist` output directory, and SPA rewrite. Import the repository in Vercel or run:

```powershell
npx vercel
```

WebGPU requires a secure context in production; Vercel provides HTTPS automatically.

## Render pipeline

The active order is:

```text
opaque MRT G-buffer
  -> temporally filtered GTAO
  -> shadowed + IBL beauty render
  -> deployed-compatible SSR + SSGI
  -> linear HDR composite and subtle saturation correction
  -> reversible max-RGB tone compression
  -> TRAA
  -> RCAS-style sharpening in the bounded domain
  -> inverse tone compression with a radiance safety clamp
  -> AgX tone mapping
  -> sRGB output
```

The MRT stores view normal, diffuse color, metalness, roughness, depth, and velocity. Deterministic SSR follows the deployed app's material mask: authored metalness remains dominant, while dielectric reflections use a roughness-gated 4% Fresnel weight. Matte walls therefore do not inherit the same reflection level as polished stone or metal.

TRAA is included because SSR and SSGI otherwise shimmer during camera movement. Before TRAA, HDR color is reversibly compressed with `C / (1 + max(C))`; sharpening also runs in this bounded domain, then `C' / (1 - max(C'))` restores linear HDR. A hue-preserving `0.98` peak guard limits reconstructed radiance to `49`, suppressing isolated fireflies without clipping the beauty pass before temporal filtering. AgX cannot be inverted exactly because it clamps its input and output, so it remains the single final display tone map. Bloom and DOF are intentionally omitted.

The wall and vanity mirrors use a dark, low-roughness PBR/SSR response with an explicit low-strength PMREM map. There is no camera-following planar proxy, captured environment image, or extra mirror scene render, so the response stays attached to the surfaces while the camera moves and does not double the scene cost.

## Lighting and materials

- IBL: [Studio Small 08](https://polyhaven.com/a/studio_small_08), 1K HDR, PMREM-filtered. Its neutral, low-contrast softboxes avoid the black grazing reflections produced by the previous high-contrast studio HDRI.
- Direct lighting: warm `#FFF7DB / #FEEED7 / #FFF7EB` spots with intensities `61.4 / 4.9 / 30`.
- Shadows: all three spots cast cached 1024 px shadows with the independent bias, radius, and strength values in the supplied tuning snapshot.
- Ambient fill: a low neutral fill reproduces the reference viewer's background ambient contribution without erasing contact shadows.
- Tone mapping: AgX, exposure `0.66`, then sRGB encoding.
- Glass: the shower material matches the `Glass_Pure` settings from `bathroom2`: linear color `0.54901999`, roughness `0.41904891`, opacity `0.02285721`, `IOR = 1000`, specular intensity `1`, no transmission/thickness/clearcoat, double-sided rendering, and no depth write or cast shadow.
- Imported material repair: the source conversion assigned `IOR = 1000` to 76 of 78 materials. Runtime normalization restores ordinary dielectrics to `IOR = 1.5`; named polished metals use roughness `0.02` and mirrors use `0.005`. Reflective categories bind the PMREM texture directly so their individual `envMapIntensity` values actually take effect in Three.js r185; ordinary walls remain controlled by the global scene environment.
- Texture filtering: color and material maps use renderer-supported anisotropy capped at 8, preserving wall and floor detail at oblique camera angles.
- Color space: base color and emissive textures are sRGB; data textures such as normal, roughness, metalness, and AO must remain linear.

The active spotlight values come from the versioned tuning snapshot supplied for this build:

| Light | Position `(x, y, z)` | Target `(x, y, z)` | Intensity / angle | Shadow `(bias, normal, radius, strength)` |
|---|---|---|---|---|
| 1 | `(3.48699, 3.34891, -3.71707)` | `(3.53221, 1.81796, -3.53871)` | `61.4 / 55°` | `-0.0001, 0.004, 2, 0.45` |
| 2 | `(3.86184, 2.78081, -4.71600)` | `(3.79515, 1.81245, -4.97941)` | `4.9 / 83.4°` | `-0.00032, 0.0142, 3, 0.52` |
| 3 | `(3.76174, 2.77493, -3.35341)` | `(3.60485, 1.77043, -2.66449)` | `30 / 57.8°` | `-0.0001, 0.004, 2, 0.87` |

## Runtime tuning

The `lil-gui` panel exposes the renderer and scene values that materially affect reference matching: all three lights and their shadow settings, ambient/IBL intensity, GTAO (SSAO), SSR, SSGI, TAA, tone mapping, exposure, saturation, sharpening, render scale, quality profile, and camera values. Manual quality edits disable automatic quality switching so the adaptive controller cannot overwrite a value while it is being tuned.

`Copy params` writes a versioned JSON snapshot of the current live values to the clipboard. The snapshot includes the runtime model path, camera and controls, renderer/tone mapping, environment, lights, screen-space passes, composite settings, and adaptive-quality state, so a tuned look can be reproduced without transcribing the panel by hand.

### 3D light gizmos

`Lights > 3D gizmos` controls one shared translation gizmo for the three spotlights. Select a light and choose `Light position` or `Aim target`; dragging the target changes the spotlight direction because Three.js spotlights are target-driven. The light spheres and magenta target markers can also be clicked directly in the viewport to move the gizmo without returning to the panel.

The selected cone is cyan, unselected cones remain faint, and the displayed cone length is independently adjustable so the real 5.5 m light range does not cover the whole room. OrbitControls are suspended only while an axis is being dragged, static shadows are invalidated as the light moves, and the gizmos can be hidden while judging or capturing the final image. Gizmo selection, handle, size, cone length, and movement snap are included in `Copy params`.

## Adaptive performance

The upper-left `stats.js` panels show FPS, CPU frame time, and render scale. `lil-gui` is a DOM tuning panel; no labels, buttons, annotations, or text are rendered inside the 3D scene.

- Active interaction: capped at 45 FPS to reduce sustained laptop GPU power while remaining above the 30 FPS requirement.
- Idle: capped at 30 FPS to reduce heat and power use.
- Startup quality: high, with adaptive switching disabled by the supplied snapshot. If enabled manually, sustained performance below 28 FPS steps high to balanced and then low; low can recover to balanced above 40 FPS.
- GTAO and SSR run at reduced resolution. SSGI scales through slice and step counts; it does not expose an independent resolution scale in the current Three.js node.
- High and balanced render scale is `1.25`; low mode uses `0.90`.
- The mirror remains in the main PBR/SSR render and does not add a planar-reflection scene render.
- Static shadow maps do not update every frame.

Measured on 23 July 2026 at 1920 x 1080 in Chrome 150:

- CPU: AMD Ryzen 7 250, 8 cores / 16 threads.
- GPU: NVIDIA GeForce RTX 5060 Laptop GPU; WebGPU reported NVIDIA Blackwell.
- High render scale: 1.25, native on the test display.
- Active: 45 FPS target, normally 5-8 ms CPU frame time.
- Idle: 30 FPS target, normally about 4-6 ms CPU frame time.

These are local measurements, not a guarantee for every device. The stats `MS` panel measures CPU/main-thread frame time, not GPU time. The first uncached WebGPU shader compilation is hidden by the preloader.

## Asset optimization

Run the model audit with:

```powershell
npm run analyze:model -- public/models/bathroom_decimated2.glb public/models/bathroom_decimated2_optimized.glb
npm run analyze:model -- public/models/towel.glb public/models/towel_optimized.glb
```

| Bathroom metric | Updated source | Optimized runtime | Change |
|---|---:|---:|---:|
| File size | 25.93 MiB | 4.95 MiB | -80.9% |
| Rendered triangles | 352,610 | 340,149 | -12,461 redundant/degenerate faces |
| POSITION slots | 444,496 | 471,233 | +26,737 / see below |
| Render draws | 2,062 | 77 | -96.27% |
| Embedded images | 53 JPEG/PNG | 48 KTX2 | 48/48 runtime textures |

The removed hanging towel is shipped separately as `public/models/towel_optimized.glb` and attached with its exported world transform, preserving its original position. The updated bathroom export is corrected by `+3.59949` on X at its scene root to align it with the established camera, lights, and towel coordinates; Y and Z are unchanged. The towel is 0.24 MiB, one draw, 60,476 triangles, and contains one KTX2 texture. The combined runtime payload is 5.19 MiB, 78 draws, and 49 KTX2 textures.

Both runtime GLBs use post-join welding, Draco geometry compression, and `KHR_texture_basisu`. Material palette merging is disabled for the bathroom so named materials remain individually selectable and all saved material overrides continue to apply. Raw/intermediate model variants are excluded by `.vercelignore`. Both final files validate with no severity-0 or geometry errors.

One two-triangle oak primitive referenced a base-color texture without the required UV set, which could render as a black patch. `scripts/fix-missing-uv-materials.mjs` now detects this invalid pairing and assigns a textureless cloned material with a dark neutral linear color.

### Why the vertex counts look inconsistent

The numbers are measuring different things:

- A glTF POSITION accessor counts stored vertex slots, not triangle corners and not Blender's welded edit-mode vertices.
- Indexed triangles reuse POSITION slots. The index count is therefore normally much larger than the POSITION count.
- UV seams, hard normal edges, tangents, material boundaries, and modifier output split vertices that occupy the same location.
- The updated bathroom source renders as 2,062 draws; the detached towel adds one draw.
- Draco reduces transfer size but does not reduce the logical vertex or triangle count. Only topology changes such as decimation do that.
- Summing every accessor also counts normals, UVs, indices, and other attributes, so it is not a valid vertex total.

The optimized files deliberately prioritize transfer size and draw-call consolidation over another destructive decimation pass. Joining primitives can split logical vertices at material, UV, normal, or tangent boundaries, which is why the runtime POSITION-slot total remains slightly higher. Post-join welding recovers most of that inflation while preserving named materials and 78 combined draws. The compressed payload is about one fifth of the combined source size.

The largest remaining runtime geometry is concentrated in textile, towel, carpet, fixture, and curved accessory meshes. Their dense curves, folds, seams, and hard-normal splits are also why broad Blender decimation produces a smaller reduction than the visible object count suggests; further work should target those meshes selectively instead of simplifying the whole room again.

## KTX2 workflow

The two runtime models contain 49 KTX2 textures in total. Future texture replacements must be converted with the provided KTX-Software installation:

```powershell
$toktx = 'C:\Users\Alexander\Work\tools\KTX-Software\bin-4.4.2\bin\toktx.exe'

# Albedo and emissive: sRGB
& $toktx --t2 --encode uastc --uastc_quality 2 --zcmp 18 --genmipmap --assign_oetf srgb albedo.ktx2 albedo.png

# Normal, roughness, metalness, and AO: linear
& $toktx --t2 --encode uastc --uastc_quality 2 --zcmp 18 --genmipmap --assign_oetf linear normal.ktx2 normal.png
```

Do not tag normal or scalar maps as sRGB. After replacing images in either GLB, verify `KHR_texture_basisu` and the texture count with `npm run analyze:model -- <path-to-optimized.glb>` and visually compare the optimized asset with the source.

## What worked

- WebGPU-only renderer and TSL render pipeline.
- Reference-matched camera, light placement, warm-neutral color, and real direct-light shadows.
- KTX2 + Draco asset delivery with a large draw-call reduction.
- Thin glass without the former grazing-angle white veil.
- Normalized converted dielectrics and calibrated metal identities, preventing the false black-wall and black-trim response.
- Deployed-compatible SSR for metal and polished dielectrics, subtle SSGI, and firefly-safe TRAA stabilization in a reversible tone-compressed domain.
- Stable PBR/SSR mirror without a camera-following planar proxy.
- Free OrbitControls navigation plus reproducible `lil-gui` tuning and JSON parameter export.
- Reliable 30 FPS idle mode to control thermals.

## Known limitations and next steps

- SSR cannot reflect off-screen geometry and can still show edge loss on very rough or thin objects.
- The mirror inherits that SSR limitation, but its reflection no longer swims or reveals a fixed environment capture as the camera moves.
- SSGI is screen-space and temporally accumulated; disocclusion can briefly expose noise.
- Transparent glass is excluded from the opaque G-buffer, so it cannot participate in SSAO/SSR exactly like opaque geometry.
- The source remains geometry-heavy. The detached towel alone is 60,476 triangles; a future visual LOD should target its folds together with the carpet and curved fixtures while preserving silhouettes and UVs.
- A future render graph could make pass lifetime and transient texture reuse more explicit.

There is intentionally no WebGL fallback. A fallback would require reformulating the TSL/WebGPU pipeline and omitting or replacing compute-oriented passes rather than merely switching renderer constructors.

## Attribution

- Bathroom model: [Bathroom Interior by Oguz Kaya](https://sketchfab.com/3d-models/bathroom-interior-68be8975cca1481c85c20b590e81c6a6), licensed CC BY.
- HDRI: [Studio Small 08 by Sergej Majboroda / Poly Haven](https://polyhaven.com/a/studio_small_08), CC0.
