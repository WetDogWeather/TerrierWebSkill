import { useCallback, useEffect, useRef, useState } from 'react'
import * as maplibreGl from 'maplibre-gl'
import * as terrierMod from '@wetdogweather/terrier'
import 'maplibre-gl/dist/maplibre-gl.css'
import './RadarMap.css'

const maplibregl = maplibreGl.default ?? maplibreGl
const Terrier = terrierMod.default ?? terrierMod

const TABS = [
  { id: 'reflectivity', label: 'Radar' },
  { id: 'temperature', label: 'Temperature' },
  { id: 'wind_uv', label: 'Wind UV' },
]

const MODEL_SOURCES = ['gfs', 'rtma', 'hrrr']
const MODEL_CADENCE = [-24 * 60 * 60, 24 * 60 * 60, 32]
const RADAR_REFRESH_CADENCE = [-2 * 60 * 60, 1 * 60 * 60, 64]

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

function formatOverlayTime(epochSeconds) {
  if (epochSeconds == null || Number.isNaN(Number(epochSeconds))) return 'Waiting for overlay…'
  return new Date(Number(epochSeconds) * 1000).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  })
}

function waitForSize(el, signal) {
  return new Promise((resolve, reject) => {
    if (el.clientWidth > 0 && el.clientHeight > 0) {
      resolve()
      return
    }
    const done = () => {
      observer.disconnect()
      resolve()
    }
    const observer = new ResizeObserver(() => {
      if (el.clientWidth > 0 && el.clientHeight > 0) done()
    })
    observer.observe(el)
    const onAbort = () => {
      observer.disconnect()
      reject(new DOMException('Aborted', 'AbortError'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

function firstSymbolLayerId(map) {
  const layers = map.getStyle()?.layers ?? []
  return layers.find((layer) => layer.type === 'symbol')?.id
}

function startReflectivity(ovl) {
  const region = 'conus'
  const observed = Terrier.sourcesForVariable({
    source: 'mrms',
    region,
    product: 'mcr',
    variable: 'reflectivity',
  })
  observed.forEach((src) => {
    src.cadence = [-2 * 60 * 60, 0, 50]
    src.enableForRange = [false, false]
  })
  const advected = Terrier.sourcesForVariable({
    source: 'mrms',
    region,
    product: 'mcr',
    variable: 'reflectivity_advected',
  })
  advected.forEach((src) => {
    src.cadence = [0, 1 * 60 * 60, 15]
    src.enableForRange = [true, false]
  })
  const sources = observed.concat(advected)
  if (!sources.length) throw new Error('No reflectivity sources available for this stack.')
  const layer = ovl.startLayer('reflectivity', {
    sources,
    colorMap: Terrier.REFLECTIVITY_HRRR_COMPATIBLE,
    snowColorMap: Terrier.SNOW_COLORS_NOT_GREY,
    cadence: [-4 * 60 * 60, 1 * 60 * 60, 64],
    interpMode: 'linear',
    opacity: 0.5,
    importFactor: 16,
  })
  return {
    layer,
    title: titleForLayer('reflectivity'),
    cadence: RADAR_REFRESH_CADENCE,
  }
}

function startTemperature(ovl) {
  let sources = Terrier.sourcesForVariable({
    source: MODEL_SOURCES,
    variable: 'temperature',
    level: '2m',
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
  return {
    layer,
    title: titleForLayer('temperature', sources[0].level || layer.level),
    cadence: MODEL_CADENCE,
  }
}

function startWindUv(ovl) {
  let sources = Terrier.sourcesForVariable({
    source: MODEL_SOURCES,
    variable: 'wind_uv',
    level: '10m',
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
  if (!sources.length) {
    sources = Terrier.sourcesForVariable({ variable: 'windUV' })
  }
  if (!sources.length && typeof Terrier.sourcesFromLayerName === 'function') {
    sources = Terrier.sourcesFromLayerName('wind_uv') || []
  }
  if (!sources.length) throw new Error('No wind UV sources available for this stack.')
  const layer = ovl.startLayer('wind_uv', {
    sources,
    level: sources[0].level,
    colorMap: Terrier.colorMapForVariable(sources[0]),
    cadence: MODEL_CADENCE,
    interpMode: 'linear',
    opacity: 0.5,
    arrows: {
      cutoff: 1.0,
      speed: [2.57, 40.0],
      size: [
        [10, 20],
        [40, 80],
      ],
      layout: [80, 80],
      colors: [0xaa000000, 0xff000000],
    },
  })
  return {
    layer,
    title: titleForLayer('wind_uv', sources[0].level || layer.level),
    cadence: MODEL_CADENCE,
  }
}

function startByTab(tabId, ovl) {
  if (tabId === 'reflectivity') return startReflectivity(ovl)
  if (tabId === 'temperature') return startTemperature(ovl)
  if (tabId === 'wind_uv') return startWindUv(ovl)
  throw new Error(`Unknown layer: ${tabId}`)
}

function applyCadence(ovl, layer, cadence) {
  if (!ovl || !layer || !cadence) return
  layer.setCadence(cadence)
  const now = Date.now()
  ovl.setTimeRange(now + cadence[0] * 1000, now + cadence[1] * 1000)
}

export default function RadarMap() {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const ovlRef = useRef(null)
  const layerRef = useRef(null)
  const cadenceRef = useRef(RADAR_REFRESH_CADENCE)
  const tabRef = useRef('reflectivity')
  const playingRef = useRef(true)
  const switchingRef = useRef(false)

  const [ready, setReady] = useState(false)
  const [playing, setPlaying] = useState(true)
  const [activeTab, setActiveTab] = useState('reflectivity')
  const [layerTitle, setLayerTitle] = useState('MRMS Reflectivity')
  const [error, setError] = useState(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [rangeSec, setRangeSec] = useState([0, 1])

  const apiKeyUnset =
    import.meta.env.VITE_TERRIER_API_KEY == null || import.meta.env.VITE_TERRIER_API_KEY === ''

  const syncTime = useCallback(() => {
    const ovl = ovlRef.current
    if (!ovl) return
    try {
      const t = ovl.getCurrentTime()
      if (typeof t === 'number' && !Number.isNaN(t)) setCurrentTime(t)
      const range = ovl.getTimeRange()
      if (Array.isArray(range) && range.length >= 2) {
        setRangeSec([range[0] / 1000, range[1] / 1000])
      }
    } catch {
      // Overlay time APIs are only valid after ready.
    }
  }, [])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return undefined

    let cancelled = false
    const abort = new AbortController()
    let refreshTimer
    let pollTimer
    let hooksWrapped = false
    const previousSetup = Terrier.setupModule?.bind(Terrier)
    const previousLoadLibrary = Terrier.loadLibrary?.bind(Terrier)
    const previousFetch = Terrier.fetchStackContents?.bind(Terrier)

    const restoreHooks = () => {
      if (!hooksWrapped) return
      if (previousSetup) Terrier.setupModule = previousSetup
      if (previousLoadLibrary) Terrier.loadLibrary = previousLoadLibrary
      if (previousFetch) Terrier.fetchStackContents = previousFetch
      hooksWrapped = false
    }

    ;(async () => {
      try {
        await waitForSize(container, abort.signal)
        if (cancelled) return

        let map
        try {
          map = new maplibregl.Map({
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
        } catch (err) {
          if (!cancelled) {
            setError(
              `${err?.message || 'Failed to initialize WebGL'}. Open this app in Chrome or Safari with hardware acceleration enabled — Cursor Simple Browser cannot create a GPU context.`,
            )
          }
          return
        }

        if (cancelled) {
          map.remove()
          return
        }
        mapRef.current = map

        map.on('error', (event) => {
          const message = event?.error?.message || event?.error || 'Map error'
          if (typeof message === 'string' && /webgl/i.test(message) && !cancelled) {
            setError(
              `${message}. Open this app in Chrome or Safari with hardware acceleration enabled.`,
            )
          }
        })

        map.on('load', () => {
          if (cancelled) return

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
          if (previousFetch) {
            Terrier.fetchStackContents = (...args) => {
              const result = previousFetch(...args)
              Promise.resolve(result).catch((err) => {
                if (!cancelled) {
                  setError(err?.message || 'Failed to fetch stack contents')
                }
              })
              return result
            }
          }
          hooksWrapped = true

          const stack = import.meta.env.VITE_TERRIER_STACK || 'dev'
          Terrier.startMapLibre(
            stack,
            import.meta.env.VITE_TERRIER_API_KEY,
            map,
            (ovl) => {
              if (cancelled) return
              ovlRef.current = ovl
              try {
                const started = startByTab('reflectivity', ovl)
                layerRef.current = started.layer
                cadenceRef.current = started.cadence
                tabRef.current = 'reflectivity'
                setLayerTitle(started.title)
                setActiveTab('reflectivity')
                ovl.timePlay({ period: 6 })
                playingRef.current = true
                setPlaying(true)
                setReady(true)
                setError(null)
                syncTime()
              } catch (err) {
                setError(err?.message || 'Failed to start reflectivity layer')
                return
              }

              pollTimer = window.setInterval(syncTime, 250)
              refreshTimer = window.setInterval(() => {
                applyCadence(ovlRef.current, layerRef.current, cadenceRef.current)
              }, 2 * 60 * 1000)
            },
            firstSymbolLayerId(map),
          )
        })
      } catch (err) {
        if (cancelled || err?.name === 'AbortError') return
        setError(err?.message || 'Failed to start map')
      }
    })()

    return () => {
      cancelled = true
      abort.abort()
      if (refreshTimer) window.clearInterval(refreshTimer)
      if (pollTimer) window.clearInterval(pollTimer)
      restoreHooks()
      try {
        Terrier.stop()
      } catch {
        // Terrier may not have started.
      }
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
      ovlRef.current = null
      layerRef.current = null
    }
  }, [syncTime])

  const togglePlay = () => {
    const ovl = ovlRef.current
    if (!ovl || !ready) return
    if (playingRef.current) {
      ovl.timePause()
      playingRef.current = false
      setPlaying(false)
    } else {
      ovl.timePlay({ period: 6 })
      playingRef.current = true
      setPlaying(true)
    }
  }

  const onScrub = (event) => {
    const ovl = ovlRef.current
    if (!ovl || !ready) return
    const seconds = Number(event.target.value)
    ovl.timePause()
    playingRef.current = false
    setPlaying(false)
    ovl.setCurrentTime(seconds)
    setCurrentTime(seconds)
  }

  const switchTab = (tabId) => {
    const ovl = ovlRef.current
    if (!ovl || !ready || switchingRef.current || tabId === tabRef.current) return
    switchingRef.current = true
    const previousTab = tabRef.current
    const previousLayer = layerRef.current
    try {
      if (previousLayer) ovl.stopLayer(previousLayer)
      const started = startByTab(tabId, ovl)
      layerRef.current = started.layer
      cadenceRef.current = started.cadence
      tabRef.current = tabId
      setActiveTab(tabId)
      setLayerTitle(started.title)
      setError(null)
      applyCadence(ovl, started.layer, started.cadence)
      if (playingRef.current) ovl.timePlay({ period: 6 })
    } catch (err) {
      setError(err?.message || `Failed to start ${tabId}`)
      try {
        const restored = startByTab(previousTab, ovl)
        layerRef.current = restored.layer
        cadenceRef.current = restored.cadence
        tabRef.current = previousTab
        setActiveTab(previousTab)
        setLayerTitle(restored.title)
        if (playingRef.current) ovl.timePlay({ period: 6 })
      } catch (restoreErr) {
        setError(
          `${err?.message || `Failed to start ${tabId}`}; restore failed: ${restoreErr?.message || restoreErr}`,
        )
      }
    } finally {
      switchingRef.current = false
    }
  }

  const minSec = Number.isFinite(rangeSec[0]) ? rangeSec[0] : 0
  const maxSec = Number.isFinite(rangeSec[1]) && rangeSec[1] > minSec ? rangeSec[1] : minSec + 1
  const sliderValue = Math.min(Math.max(currentTime || minSec, minSec), maxSec)

  return (
    <div className="radar-root">
      <div className="radar-hud">
        <h1>{layerTitle}</h1>
        <div className="radar-tabs">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              disabled={!ready}
              aria-pressed={activeTab === tab.id}
              onClick={() => switchTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {apiKeyUnset ? (
          <div className="radar-banner radar-banner-key">
            Set VITE_TERRIER_API_KEY in a local .env (see .env.example) and restart the dev server.
            The basemap still loads without a key.
          </div>
        ) : null}
        {error ? <div className="radar-banner radar-banner-error">{error}</div> : null}
      </div>
      <div className="radar-scrubber">
        <div className="radar-scrubber-time">
          {ready ? formatOverlayTime(currentTime) : 'Waiting for overlay…'}
        </div>
        <div className="radar-scrubber-row">
          <button type="button" disabled={!ready} onClick={togglePlay}>
            {playing ? 'Pause' : 'Play'}
          </button>
          <input
            type="range"
            min={minSec}
            max={maxSec}
            step={1}
            value={sliderValue}
            disabled={!ready}
            onChange={onScrub}
          />
        </div>
      </div>
      <div ref={containerRef} className="radar-map" />
    </div>
  )
}
