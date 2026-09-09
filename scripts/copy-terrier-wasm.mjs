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
