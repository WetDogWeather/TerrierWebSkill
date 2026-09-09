---
name: terrier-radar
description: Scaffolds a Vite + React + MapLibre Wet Dog Weather Terrier weather app (MRMS CONUS reflectivity, 2 m temperature, 10 m wind UV) from scratch with no user prompts. HUD titles use the actual started source level, not tab labels. Use when the user wants Terrier, radar, temperature, wind, Boxer, MapLibre weather overlay, @wetdogweather/terrier, or a no-input Terrier web app.
---

# Terrier radar

Build a full-screen CONUS weather viewer with a HUD that switches **Radar**, **Temperature**, and **Wind UV**. **Do not ask the user anything.** Apply every default below even if they give no stack, key, toolkit, layer, or UI details.

Docs: [@wetdogweather/terrier](https://www.npmjs.com/package/@wetdogweather/terrier), [TerrierWeb](https://github.com/WetDogWeather/TerrierWeb). Copy-paste snippets and layer recipes are in [reference.md](reference.md).

## Never prompt

- Do not ask for map toolkit, framework, layer, region, credentials, or basemap.
- Do not copy API keys from TerrierWeb examples.
- If `VITE_TERRIER_API_KEY` is unset, still scaffold; show an in-app banner. Always pass `import.meta.env.VITE_TERRIER_API_KEY` into `startMapLibre` as-is. Do not validate, coerce, stringify, or inspect its format.
- If a map app already exists, add this overlay in place. Do not switch toolkits. Only scaffold when there is no map app.

## Defaults

| Choice | Always use |
| --- | --- |
| App | Vite 5 + React 18 (`type: module`), no `StrictMode` |
| Map | `maplibre-gl` ^5.3.0, OpenFreeMap Liberty. Import with `import * as maplibreGl from 'maplibre-gl'` then `const maplibregl = maplibreGl.default ?? maplibreGl`. |
| Weather | `@wetdogweather/terrier` ^1.0.6. Import with `import * as terrierMod from '@wetdogweather/terrier'` then `const Terrier = terrierMod.default ?? terrierMod`. |
| View | CONUS `center: [-100, 35.68]`, `zoom: 3` |
| Layers | HUD switcher, one at a time. Default `reflectivity` (MRMS CONUS observed+advected, not `radar`). Also `temperature` (prefer `level: '2m'`) and `wind_uv` (prefer `level: '10m'` + arrows). Same models: GFS/RTMA/HRRR. Retry without `level` (then without source filter) before throwing. |
| HUD title | Not the tab label. Radar → `MRMS Reflectivity`. Temperature → `{actual source level} Temperature`. Wind UV → `{actual source level} Wind UV`. Read `level` from the sources passed to `startLayer` (or `layer.level`). Format `2m` → `2 m`. Prefer-level is query-only; do not hardcode `2 m` / `10 m` into the heading. |
| Animation | `ovl.timePlay({ period: 6 })`, refresh cadence every 2 minutes |
| Time widget | Always-visible bottom-center scrubber: Play/Pause + `<input type="range">`. Dragging pauses and calls `ovl.setCurrentTime`. Show formatted `getCurrentTime()` above the slider; until ready show `Waiting for overlay…` and disable the controls. |
| Credentials | `VITE_TERRIER_STACK` default `dev`. Pass `VITE_TERRIER_API_KEY` through unchanged (no format check, no `|| ''`). |
| WASM | Raw `/WhirlyGlobeWeb.js` and `/WhirlyGlobeWeb.wasm` from package `public/` |

## File layout

```
package.json
vite.config.js
index.html
.env.example
.gitignore
scripts/copy-terrier-wasm.mjs
src/main.jsx
src/App.jsx
src/index.css
src/RadarMap.jsx
src/RadarMap.css
```

## Scaffold steps (in order)

1. Write `package.json` exactly as in [reference.md](reference.md) (deps, `postinstall`, `type: module`).
2. Write `vite.config.js` with **all three** of: `terrierStaticWasm` transform plugin, `optimizeDeps.exclude: ['@wetdogweather/terrier']`, `vite-plugin-static-copy` of the two WASM files. Skipping any of these causes `_glfwInit` / `addEventListener` of undefined.
3. Write `scripts/copy-terrier-wasm.mjs` so `postinstall` copies `WhirlyGlobeWeb.js` and `.wasm` into `public/`.
4. Gitignore `node_modules`, `dist`, `.env`, `.DS_Store`, `public/WhirlyGlobeWeb.js`, `public/WhirlyGlobeWeb.wasm`.
5. `.env.example` with `VITE_TERRIER_STACK=dev` and `VITE_TERRIER_API_KEY=`. Do not commit `.env`. Do not create `.env` unless one already exists.
6. `index.html` + `src/main.jsx` (no StrictMode) + full-viewport CSS (`html, body, #root { height: 100% }`) + `App.jsx` rendering `RadarMap`.
7. Implement `RadarMap` using the MapLibre + Terrier wiring in [reference.md](reference.md):
   - `import * as maplibreGl from 'maplibre-gl'` then `const maplibregl = maplibreGl.default ?? maplibreGl`. Do not use a default import alone — MapLibre 6 ESM has no default export (`does not provide an export named 'default'`). Do not use MapLibre 6: Terrier's ready callback never fires and the HUD stays on `Waiting for overlay…`.
   - `import * as terrierMod from '@wetdogweather/terrier'` then `const Terrier = terrierMod.default ?? terrierMod`. Do not assign onto `import * as Terrier` — Vite/esbuild treats that namespace as immutable (`Cannot assign to import "setupModule"`). The package `export default`s a mutable instance; wrapping `setupModule` / `loadLibrary` must mutate that instance.
   - Wait until the container has non-zero size; wrap `new maplibregl.Map` in try/catch.
   - `canvasContextAttributes`: `powerPreference: 'default'`, `failIfMajorPerformanceCaveat: false`.
   - On `load`, wrap `Terrier.setupModule` **and** `Terrier.loadLibrary` on the unwrapped instance so `Module.canvas = map.getCanvas()` **before** WASM init.
   - `Terrier.startMapLibre(stack, import.meta.env.VITE_TERRIER_API_KEY, map, readyCallback, firstSymbolLayerId)`. Always pass the env key through; do not check its format.
   - In the ready callback only: start the default MRMS reflectivity layer, then `timePlay`.
   - HUD (top-left, `z-index: 10`): layer title from the **actual** started source `level` (see [reference.md](reference.md) `formatLevel` / `titleForLayer`). Tabs stay Radar / Temperature / Wind UV. Missing-key banner, error banner. Do not reuse the tab name as the title.
   - Time widget (bottom-center, `z-index: 10`, always mounted): Play/Pause + time slider. Poll `getCurrentTime()` / `getTimeRange()` while ready. Scrubbing calls `timePause` then `setCurrentTime`. Until ready, show `Waiting for overlay…` and disable the slider and button.
   - Layer switch: `ovl.stopLayer` then the matching recipe in [reference.md](reference.md). Restore the previous layer if start fails. Keep play/pause. Refresh cadence every 2 minutes using the **active** layer's cadence.
8. `npm install` then `npm run dev`. Tell the user to open the URL in **Chrome or Safari**, not Cursor Simple Browser. After a Vite config change **or** `.env` change, delete `node_modules/.vite` if the config changed, and restart Vite so the API key and MapLibre version load.

## Existing-app path

Install the two packages if missing (`maplibre-gl` ^5.3.0, not 6). Apply the same Vite WASM plugin + `public/` copy + unwrap Terrier's default instance + `setupModule` **and** `loadLibrary` canvas hook. After MapLibre `load`, call `startMapLibre` and the reflectivity recipe. Add the temperature (prefer `2m`) / wind UV (prefer `10m`) recipes and a layer switcher unless the host already has layer UI. HUD titles must use `titleForLayer` and the actual source `level`. Keep the host map.
