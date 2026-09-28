<script setup lang="ts">
import type { Map as LeafletMap, Marker, Circle, LayerGroup } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { DEFAULT_MAP_CENTER, focusCluster, MAP_TILE_ATTRIBUTION, MAP_TILE_URL, type MapMarker } from '~/utils/geo'

/**
 * Carte OpenStreetMap (Leaflet), rendue côté client uniquement — Leaflet
 * touche `window` dès l'import.
 *
 * - `precise: true` → pastille à l'emplacement exact.
 * - `precise: false` → zone en pointillés (cercle + pastille) : position
 *   approximative (centre de la ville), jamais présentée comme une adresse.
 */

const props = withDefaults(defineProps<{
  markers: MapMarker[]
  activeId?: string | null
  /** Zoom quand un seul repère est affiché. */
  singleZoom?: number
  /** Rayon du cercle des zones approximatives, en mètres. */
  zoneRadius?: number
}>(), { activeId: null, singleZoom: 15, zoneRadius: 2500 })

const emit = defineEmits<{ select: [id: string]; hover: [id: string | null] }>()

/** En dessous de ce zoom (≈ vue région), étiquettes courtes. */
const FAR_ZOOM = 10

const el = ref<HTMLElement | null>(null)
let L: typeof import('leaflet') | null = null
let map: LeafletMap | null = null
let layer: LayerGroup | null = null
const pins = new Map<string, Marker>()

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

function render() {
  if (!L || !map || !layer) return
  layer.clearLayers()
  pins.clear()

  for (const m of props.markers) {
    if (!m.precise) {
      const zone: Circle = L.circle([m.lat, m.lng], { radius: props.zoneRadius, color: '#1a5d3e', weight: 1.5, dashArray: '5 6', fillColor: '#2b8a5c', fillOpacity: 0.1, interactive: false })
      layer.addLayer(zone)
    }
    const icon = L.divIcon({
      className: 'im-map-pin-wrap',
      html: `<div class="im-map-pin${m.precise ? '' : ' im-map-pin--zone'}">${m.shortLabel
        ? `<span class="im-map-pin__full">${escapeHtml(m.label)}</span><span class="im-map-pin__short">${escapeHtml(m.shortLabel)}</span>`
        : escapeHtml(m.label)}</div>`,
      iconSize: [0, 0]
    })
    const pin = L.marker([m.lat, m.lng], { icon, riseOnHover: true, keyboard: true, title: m.label })
    pin.on('click', () => emit('select', m.id))
    pin.on('mouseover', () => emit('hover', m.id))
    pin.on('mouseout', () => emit('hover', null))
    layer.addLayer(pin)
    pins.set(m.id, pin)
  }
  highlight()
  fit()
}

function fit() {
  if (!L || !map || !props.markers.length) return
  if (props.markers.length === 1) {
    const m = props.markers[0]!
    map.setView([m.lat, m.lng], m.precise ? props.singleZoom : 12)
    return
  }
  const focus = focusCluster(props.markers)
  if (focus.length === 1) {
    map.setView([focus[0]!.lat, focus[0]!.lng], focus[0]!.precise ? props.singleZoom : 12)
    return
  }
  const bounds = L.latLngBounds(focus.map(m => [m.lat, m.lng] as [number, number]))
  map.fitBounds(bounds, { padding: [48, 48], maxZoom: props.singleZoom })
}

function highlight() {
  for (const [id, pin] of pins) {
    const active = id === props.activeId
    pin.getElement()?.querySelector('.im-map-pin')?.classList.toggle('im-map-pin--active', active)
    pin.setZIndexOffset(active ? 1000 : 0)
  }
}

onMounted(async () => {
  L = await import('leaflet')
  if (!el.value) return
  map = L.map(el.value, { scrollWheelZoom: false, zoomControl: true, attributionControl: true })
  L.tileLayer(MAP_TILE_URL, { maxZoom: 19, attribution: MAP_TILE_ATTRIBUTION }).addTo(map)
  // Défilement molette seulement après un clic sur la carte, pour ne pas piéger le scroll de la page.
  map.on('click', () => map?.scrollWheelZoom.enable())
  map.on('mouseout', () => map?.scrollWheelZoom.disable())
  // Dézoomé, les pastilles se chevauchent : on bascule sur leur étiquette courte.
  const syncFar = () => el.value?.classList.toggle('im-map--far', (map?.getZoom() ?? FAR_ZOOM) < FAR_ZOOM)
  map.on('zoomend', syncFar)
  layer = L.layerGroup().addTo(map)
  if (!props.markers.length) map.setView([DEFAULT_MAP_CENTER.lat, DEFAULT_MAP_CENTER.lng], 11)
  render()
  syncFar()
})

onBeforeUnmount(() => {
  map?.remove()
  map = null
})

watch(() => props.markers, render, { deep: true })
watch(() => props.activeId, highlight)
</script>

<template>
  <div ref="el" class="im-map h-full w-full" />
</template>

<style>
.im-map {
  font-family: var(--font-sans);
  background: var(--color-sand-200);
  z-index: 0;
}
.im-map .leaflet-control-attribution {
  font-size: 10.5px;
  background: rgba(255, 255, 255, 0.85);
}
.im-map-pin-wrap {
  background: none;
  border: 0;
}
.im-map-pin {
  position: absolute;
  left: 0;
  top: 0;
  transform: translate(-50%, -50%);
  white-space: nowrap;
  border-radius: 9999px;
  padding: 8px 13px;
  font-family: var(--font-mono);
  font-size: 12.5px;
  font-weight: 700;
  color: var(--text-primary);
  background: #fff;
  box-shadow: 0 3px 10px rgba(26, 23, 20, 0.22);
  cursor: pointer;
  transition: transform 0.15s ease, background-color 0.15s ease, color 0.15s ease;
}
.im-map-pin--zone {
  font-family: var(--font-sans);
  font-size: 12px;
  border: 1.5px dashed var(--color-green-700);
  color: var(--color-green-900);
}
.im-map-pin__short,
.im-map--far .im-map-pin__full {
  display: none;
}
.im-map--far .im-map-pin__short {
  display: inline;
}
.im-map-pin--active {
  transform: translate(-50%, -50%) scale(1.1);
  background: var(--color-green-900);
  color: #fff;
  box-shadow: 0 10px 24px rgba(18, 60, 41, 0.4);
}
</style>
