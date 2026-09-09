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
