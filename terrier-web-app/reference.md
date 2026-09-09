# Terrier radar reference

Use these snippets verbatim when scaffolding. Do not invent a different WASM loading path.

Official docs: https://www.npmjs.com/package/@wetdogweather/terrier (`^1.0.6`) and https://github.com/WetDogWeather/TerrierWeb (MapLibre: `maplibre-example/startMapLibreMap.js`; React: `dashboard/`).

Default HUD layers: **Radar** (`reflectivity`), **Temperature** (`temperature`, prefer `2m`), **Wind UV** (`wind_uv`, prefer `10m`). One layer at a time. Tab labels are Radar / Temperature / Wind UV. HUD titles are separate and must use the **actual** started source `level`.

## package.json

```json
{
  "name": "terrier-radar",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "postinstall": "node scripts/copy-terrier-wasm.mjs"
  },
  "dependencies": {
    "@wetdogweather/terrier": "^1.0.6",
    "maplibre-gl": "^5.3.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.0.0",
    "vite": "^5.4.0",
    "vite-plugin-static-copy": "^1.0.6"
  }
}
```

## scripts/copy-terrier-wasm.mjs

```js
import { copyFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const srcDir = join(root, 'node_modules', '@wetdogweather', 'terrier', 'public')
const destDir = join(root, 'public')
mkdirSync(destDir, { recursive: true })
for (const name of ['WhirlyGlobeWeb.js', 'WhirlyGlobeWeb.wasm']) {
  const src = join(srcDir, name)
  if (!existsSync(src)) {
    console.warn(`Terrier WASM file missing: ${src}`)
    continue
  }
  copyFileSync(src, join(destDir, name))
}
```

## vite.config.js (required)

Terrier's `terrier.js` does `import("../public/WhirlyGlobeWeb.js?url")`. Vite turns that into a hashed transformed module (`WhirlyGlobeWeb-XXXX.js`). Emscripten then runs `_glfwInit` with no `Module.canvas` → `Cannot read properties of undefined (reading 'addEventListener')`.

Fix: serve the **untransformed** files from `public/` at `/WhirlyGlobeWeb.js` and `/WhirlyGlobeWeb.wasm`.

```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteStaticCopy } from 'vite-plugin-static-copy'

function terrierStaticWasm() {
  return {
    name: 'terrier-static-wasm',
    enforce: 'pre',
    transform(code, id) {
      const normalized = id.replace(/\\/g, '/')
      if (!normalized.includes('@wetdogweather/terrier') || !normalized.endsWith('terrier.js')) {
        return null
      }
      return {
        code: code
          .replace(
            'import("../public/WhirlyGlobeWeb.js?url")',
            'Promise.resolve({ default: "/WhirlyGlobeWeb.js" })',
          )
          .replace(
            'import("../public/WhirlyGlobeWeb.wasm?url")',
            'Promise.resolve({ default: "/WhirlyGlobeWeb.wasm" })',
          ),
        map: null,
      }
    },
  }
}

export default defineConfig({
  optimizeDeps: {
    exclude: ['@wetdogweather/terrier'],
  },
  plugins: [
    terrierStaticWasm(),
    react(),
    viteStaticCopy({
      targets: [
        { src: 'node_modules/@wetdogweather/terrier/public/WhirlyGlobeWeb.js', dest: '.' },
        { src: 'node_modules/@wetdogweather/terrier/public/WhirlyGlobeWeb.wasm', dest: '.' },
      ],
    }),
  ],
})
```

After changing this file, delete `node_modules/.vite` and restart `npm run dev`. In the browser Network tab the glue script must be `/WhirlyGlobeWeb.js`, not a hashed name.

## startMapLibre

JSDoc `startMapLibre(stackName, map, readyFunc)` is stale. Working signature:

```js
Terrier.startMapLibre(stackName, apiKey, map, (ovl) => {}, symbolLayerId)
```

Always pass `import.meta.env.VITE_TERRIER_API_KEY` through as `apiKey` with no format check, coercion, or `|| ''`. `symbolLayerId` is the first MapLibre layer with `type === 'symbol'` so radar draws under labels. Call this on the map `load` event.

`Terrier.sourcesForVariable` is only valid inside the ready callback (after stack contents load).


## MapLibre constructor

Use `maplibre-gl` **^5.3.0**. MapLibre 6 is ESM-only (no default export) and Terrier's overlay never becomes ready (`Waiting for overlay…`).

```js
import * as maplibreGl from 'maplibre-gl'
import * as terrierMod from '@wetdogweather/terrier'
import 'maplibre-gl/dist/maplibre-gl.css'

const maplibregl = maplibreGl.default ?? maplibreGl
const Terrier = terrierMod.default ?? terrierMod
```

Terrier is `export default` of a mutable singleton. `import * as Terrier` is an immutable ESM namespace, so `Terrier.setupModule = …` fails at Vite scan with `Cannot assign to import "setupModule"`. Unwrap `default` first, then wrap methods on that instance.

```js
new maplibregl.Map({
  container,
  style: 'https://tiles.openfreemap.org/styles/liberty',
  center: [-100, 35.68],
  zoom: 3,
  canvasContextAttributes: {
    antialias: false,
    powerPreference: 'default',
    failIfMajorPerformanceCaveat: false,
    preserveDrawingBuffer: false,
    desynchronized: false,
  },
})
```

Wait until `container.clientWidth/Height > 0` before constructing. Catch WebGL failures; Cursor Simple Browser / Electron cannot create a GPU context — tell the user to open Chrome or Safari.

Do not wrap the map in React `StrictMode`. Cleanup: `Terrier.stop()` then `map.remove()`.

## Canvas hook (required)

On map `load`, wrap **both** `Terrier.setupModule` and `Terrier.loadLibrary` on the unwrapped default instance so `Module.canvas` is set before WASM/`_glfwInit`. Wrapping only `setupModule` is not enough. Do not assign these onto a namespace import.

```js
const previousSetup = Terrier.setupModule.bind(Terrier)
const previousLoadLibrary = Terrier.loadLibrary.bind(Terrier)
const setCanvas = () => {
  if (globalThis.Module) globalThis.Module.canvas = map.getCanvas()
}
Terrier.setupModule = (...args) => {
  const result = previousSetup(...args)
  setCanvas()
  return result
}
Terrier.loadLibrary = (...args) => {
  setCanvas()
  return previousLoadLibrary(...args)
}
```

Then call `Terrier.startMapLibre`. Optional: wrap `fetchStackContents` so a failed stack fetch sets an HUD error instead of staying on `Waiting for overlay…`. Restart `npm run dev` after `.env` changes so `VITE_TERRIER_API_KEY` is loaded.

## Layer names

Older blogs use `startLayer('radar')`. TerrierWeb uses **`reflectivity`**. Use reflectivity, not `radar`.

Always ship a HUD switcher with these three. Start **reflectivity** in the ready callback. Switch with `ovl.stopLayer(layer)` then the matching recipe. If start throws, restart the previous layer. Keep `timePlay` / `timePause` as the user left them.

The HUD **layer title** is not the tab label and not the prefer-level string. After `startLayer`, read the actual `level` from the sources you passed (or `layer.level`). Format with a space before the unit (`2m` → `2 m`, `10m` → `10 m`).

| Tab | HUD title |
| --- | --- |
| Radar | `MRMS Reflectivity` |
| Temperature | `{actual source level} Temperature` |
| Wind UV | `{actual source level} Wind UV` |

Prefer `2m` / `10m` when querying; if the stack has no match and you retry without `level`, the title must follow whatever level Terrier actually selected. Do not keep showing `10 m Wind UV` unless the started sources used `10m`.

| Tab | `startLayer` name | Sources | Cadence (refresh) |
| --- | --- | --- | --- |
| Radar | `reflectivity` | MRMS CONUS `mcr` observed + advected | `[-2*60*60, 1*60*60, 64]` |
| Temperature | `temperature` | `gfs` / `rtma` / `hrrr`, prefer `level: '2m'` | `[-24*60*60, 24*60*60, 32]` |
| Wind UV | `wind_uv` | `gfs` / `rtma` / `hrrr`, prefer `level: '10m'` + `arrows` | `[-24*60*60, 24*60*60, 32]` |

Throw if `sourcesForVariable` returns `[]`. For temperature and wind UV, retry without `level` before throwing. For wind UV, if still empty, retry without the `gfs`/`rtma`/`hrrr` source filter (and `windUV` / `sourcesFromLayerName` if needed).

Use `formatLevel` / `titleForLayer` below. After a successful start, set the HUD heading from the returned title (`sources[0].level` or `layer.level`). Never copy the prefer-level string into the heading.

```js
function formatLevel(level) {
  if (level == null || level === '') return null
  const raw = String(level).trim()
  if (!raw || raw.toLowerCase() === 'none') return null
  const withUnit = raw.match(/^([+-]?\d+(?:\.\d+)?)([a-z]+)$/i)
  if (withUnit) return `${withUnit[1]} ${withUnit[2]}`
  return raw
}

function titleForLayer(tabId, level) {
  if (tabId === 'reflectivity') return 'MRMS Reflectivity'
  const formatted = formatLevel(level)
  if (tabId === 'temperature') return formatted ? `${formatted} Temperature` : 'Temperature'
  if (tabId === 'wind_uv') return formatted ? `${formatted} Wind UV` : 'Wind UV'
  return tabId
}
```

## Radar source recipe

```js
const region = 'conus'
const observed = Terrier.sourcesForVariable({
  source: 'mrms', region, product: 'mcr', variable: 'reflectivity',
})
observed.forEach((src) => {
  src.cadence = [-2 * 60 * 60, 0, 50]
  src.enableForRange = [false, false]
})
const advected = Terrier.sourcesForVariable({
  source: 'mrms', region, product: 'mcr', variable: 'reflectivity_advected',
})
advected.forEach((src) => {
  src.cadence = [0, 1 * 60 * 60, 15]
  src.enableForRange = [true, false]
})
const layer = ovl.startLayer('reflectivity', {
  sources: observed.concat(advected),
  colorMap: Terrier.REFLECTIVITY_HRRR_COMPATIBLE,
  snowColorMap: Terrier.SNOW_COLORS_NOT_GREY,
  cadence: [-4 * 60 * 60, 1 * 60 * 60, 64],
  interpMode: 'linear',
  opacity: 0.5,
  importFactor: 16,
})
const title = titleForLayer('reflectivity')
```

Call `ovl.timePlay({ period: 6 })` from the ready callback after starting reflectivity, and again after a successful layer switch if still playing. Do not bury `timePlay` only inside the reflectivity recipe.

## Temperature source recipe

```js
const MODEL_SOURCES = ['gfs', 'rtma', 'hrrr']
const MODEL_CADENCE = [-24 * 60 * 60, 24 * 60 * 60, 32]
let sources = Terrier.sourcesForVariable({
  source: MODEL_SOURCES, variable: 'temperature', level: '2m',
})
if (!sources.length) {
  sources = Terrier.sourcesForVariable({ source: MODEL_SOURCES, variable: 'temperature' })
}
if (!sources.length) throw new Error('No temperature sources available for this stack.')
const layer = ovl.startLayer('temperature', {
  sources,
  colorMap: Terrier.colorMapForVariable(sources[0]),
  cadence: MODEL_CADENCE,
  interpMode: 'linear',
  opacity: 0.5,
})
const title = titleForLayer('temperature', sources[0].level)
```

## Wind UV source recipe

```js
const MODEL_SOURCES = ['gfs', 'rtma', 'hrrr']
let sources = Terrier.sourcesForVariable({
  source: MODEL_SOURCES, variable: 'wind_uv', level: '10m',
})
if (!sources.length) {
  sources = Terrier.sourcesForVariable({ source: MODEL_SOURCES, variable: 'wind_uv' })
}
if (!sources.length) {
  sources = Terrier.sourcesForVariable({ variable: 'wind_uv', level: '10m' })
}
if (!sources.length) {
  sources = Terrier.sourcesForVariable({ variable: 'wind_uv' })
}
if (!sources.length) throw new Error('No wind UV sources available for this stack.')
const layer = ovl.startLayer('wind_uv', {
  sources,
  level: sources[0].level,
  colorMap: Terrier.colorMapForVariable(sources[0]),
  cadence: [-24 * 60 * 60, 24 * 60 * 60, 32],
  interpMode: 'linear',
  opacity: 0.5,
  arrows: {
    cutoff: 1.0,
    speed: [2.57, 40.0],
    size: [[10, 20], [40, 80]],
    layout: [80, 80],
    colors: [0xaa000000, 0xff000000],
  },
})
const title = titleForLayer('wind_uv', sources[0].level || layer.level)
```

`cadence` is `[minOffsetSeconds, maxOffsetSeconds, maxSlices]` relative to now. Every 2 minutes, apply the **active** layer cadence:

```js
layer.setCadence(cadence)
const now = Date.now()
ovl.setTimeRange(now + cadence[0] * 1000, now + cadence[1] * 1000)
```

Radar refresh cadence is `[-2 * 60 * 60, 1 * 60 * 60, 64]`. Temperature and wind UV use `[-24 * 60 * 60, 24 * 60 * 60, 32]`.

## Overlay controls

| Call | Use |
| --- | --- |
| `ovl.timePlay({ period: 6 })` | Animate the loaded range in 6s |
| `ovl.timePause()` | Stop |
| `ovl.getCurrentTime()` | Epoch **seconds** (`tracker.curTime / 1000`) |
| `ovl.setCurrentTime(epochSeconds)` | Seek; pass seconds |
| `ovl.getTimeRange()` | `[min, max]` in **ms**; divide by 1000 for the slider |
| `ovl.startLayer` / `ovl.stopLayer` | Add or remove |

Disable Play, layer tabs, and the slider until the ready callback fires. Weather pixels need a real Boxer key; the basemap still loads without one.

Always mount a bottom-center **slider + Play/Pause** (not a clock-only chip). Treat `getCurrentTime()` as seconds and `getTimeRange()` as ms. Dragging the slider must pause, then `setCurrentTime(seconds)`:

```jsx
<div className="radar-scrubber">
  <div className="radar-scrubber-time">
    {ready ? formatOverlayTime(currentTime) : 'Waiting for overlay…'}
  </div>
  <div className="radar-scrubber-row">
    <button type="button" disabled={!ready} onClick={togglePlay}>
      {playing ? 'Pause' : 'Play'}
    </button>
    <input type="range" min={minSec} max={maxSec} step={1} value={currentTime}
      disabled={!ready} onChange={onScrub} />
  </div>
</div>
```

Position `.radar-scrubber` at `left: 50%; bottom: 20px; transform: translateX(-50%)` with `z-index: 10`.

## Credentials

```
VITE_TERRIER_STACK=dev
VITE_TERRIER_API_KEY=
```

Read stack with `import.meta.env.VITE_TERRIER_STACK || 'dev'`. Read the API key with `import.meta.env.VITE_TERRIER_API_KEY` and pass it to `startMapLibre` as-is. Do not validate, coerce, stringify, or inspect its format. Never prompt. Never hardcode keys from TerrierWeb. Restart `npm run dev` after `.env` changes.

## CSS / entry

`html, body, #root, .radar-root, .radar-map { height: 100%; margin: 0 }` so MapLibre is not a 0×0 canvas.

```jsx
// src/main.jsx — no StrictMode
ReactDOM.createRoot(document.getElementById('root')).render(<App />)
```

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| `Failed to initialize WebGL` | Cursor Simple Browser. Open Chrome/Safari. Enable hardware acceleration. |
| `does not provide an export named 'default'` (maplibre-gl) | Default import. Use `import * as maplibreGl from 'maplibre-gl'` and `const maplibregl = maplibreGl.default ?? maplibreGl`. Clear `node_modules/.vite` and restart. |
| `Cannot assign to import "setupModule"` (or `loadLibrary` / `fetchStackContents`) | Assigned onto `import * as Terrier`. Unwrap with `const Terrier = terrierMod.default ?? terrierMod`, then wrap methods on that instance. |
| Stuck on `Waiting for overlay…` | MapLibre 6 (pin `^5.3.0`), Vite started before `.env` (restart `npm run dev`), or stack fetch failed (check the HUD error / browser console). |
| `_glfwInit` / `addEventListener` of undefined | Vite transformed `WhirlyGlobeWeb.js`. Apply the Vite plugin, copy files to `public/`, set `Module.canvas`. |
| Hashed `WhirlyGlobeWeb-XXXX.js` in Network | Stale Vite cache. `rm -rf node_modules/.vite`, restart. |
| Map, no overlay, Play disabled | Stack fetch failed (bad/missing key) or ready callback never ran. |
| Map, no radar, Play enabled | Layer/sources; confirm `reflectivity` + MRMS recipe inside the callback. |
| Temperature/Wind tab errors | Empty `sourcesForVariable`; prefer `2m`/`10m` then retry without `level`, then without the model source filter. Confirm stack has GFS/RTMA/HRRR. Restore previous layer. |
| HUD title is Radar / Temperature / Wind UV | Reused the tab label. Title must come from `titleForLayer` + actual source `level`. |
| HUD title always `10 m Wind UV` / `2 m Temperature` | Hardcoded prefer-level. Use `sources[0].level` after start; if the stack used `sfc` (or another level), show that. |
