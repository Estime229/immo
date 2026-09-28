<script setup lang="ts">
import type { Map as LeafletMap, Marker } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { cityCenter, DEFAULT_MAP_CENTER, formatCoords, isInBenin, MAP_TILE_ATTRIBUTION, MAP_TILE_URL, roundCoords, type GeoPoint } from '~/utils/geo'

/**
 * Sélecteur de position d'un bien : un clic sur la carte place le repère, qu'on
 * ajuste ensuite en le faisant glisser ; « Utiliser ma position » sert quand le
 * propriétaire est sur place. Rendu côté client uniquement (Leaflet touche `window`).
 *
 * `clearable: false` quand une position est déjà enregistrée : l'API ne sait
 * pas l'effacer (`PATCH /property/:id` avec `gps_latitude: null` → 500,
 * vérifié le 2026-09-28), on ne propose donc que de la déplacer.
 */
const props = withDefaults(defineProps<{
  modelValue: GeoPoint | null
  /** Ville choisie dans le formulaire — la carte s'y centre tant qu'aucun repère n'est posé. */
  cityName?: string | null
  clearable?: boolean
}>(), { cityName: null, clearable: true })

const emit = defineEmits<{ 'update:modelValue': [value: GeoPoint | null] }>()

const el = ref<HTMLElement | null>(null)
const error = ref('')
const locating = ref(false)
let L: typeof import('leaflet') | null = null
let map: LeafletMap | null = null
let marker: Marker | null = null

function pick(p: GeoPoint) {
  if (!isInBenin(p.lat, p.lng)) {
    error.value = 'Ce point est hors du Bénin : placez le repère sur le bâtiment.'
    return false
  }
  error.value = ''
  emit('update:modelValue', roundCoords(p))
  return true
}

function syncMarker() {
  if (!L || !map) return
  const v = props.modelValue
  if (!v) {
    marker?.remove()
    marker = null
    return
  }
  if (marker) {
    marker.setLatLng([v.lat, v.lng])
    return
  }
  marker = L.marker([v.lat, v.lng], {
    draggable: true,
    autoPan: true,
    keyboard: true,
    title: 'Position du bien — faites glisser pour ajuster',
    icon: L.divIcon({ className: 'im-map-dot-wrap', html: '<div class="im-map-dot"></div>', iconSize: [26, 26], iconAnchor: [13, 13] })
  }).addTo(map)
  marker.on('dragend', () => {
    const ll = marker!.getLatLng()
    // Glissé hors du Bénin : on remet le repère à sa dernière position valable.
    if (!pick({ lat: ll.lat, lng: ll.lng }) && props.modelValue) marker!.setLatLng([props.modelValue.lat, props.modelValue.lng])
  })
}

function centerOnCity() {
  if (!map || props.modelValue) return
  const c = cityCenter(props.cityName) ?? DEFAULT_MAP_CENTER
  map.setView([c.lat, c.lng], 13)
}

function useMyPosition() {
  if (!navigator.geolocation) {
    error.value = "Votre navigateur ne permet pas de vous localiser : cliquez directement sur la carte."
    return
  }
  locating.value = true
  error.value = ''
  navigator.geolocation.getCurrentPosition(
    pos => {
      locating.value = false
      const p = { lat: pos.coords.latitude, lng: pos.coords.longitude }
      if (pick(p)) map?.setView([p.lat, p.lng], 18)
    },
    err => {
      locating.value = false
      error.value = err.code === err.PERMISSION_DENIED
        ? "Localisation refusée par le navigateur : cliquez directement sur la carte."
        : "Position introuvable pour le moment : cliquez directement sur la carte."
    },
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
  )
}

onMounted(async () => {
  L = await import('leaflet')
  if (!el.value) return
  map = L.map(el.value, { scrollWheelZoom: false })
  L.tileLayer(MAP_TILE_URL, { maxZoom: 19, attribution: MAP_TILE_ATTRIBUTION }).addTo(map)
  map.on('click', e => {
    map?.scrollWheelZoom.enable()
    pick({ lat: e.latlng.lat, lng: e.latlng.lng })
  })
  map.on('mouseout', () => map?.scrollWheelZoom.disable())
  if (props.modelValue) map.setView([props.modelValue.lat, props.modelValue.lng], 17)
  else centerOnCity()
  syncMarker()
})

onBeforeUnmount(() => {
  map?.remove()
  map = null
  marker = null
})

watch(() => props.modelValue, syncMarker, { deep: true })
watch(() => props.cityName, centerOnCity)
</script>

<template>
  <div>
    <div class="relative isolate h-[300px] overflow-hidden rounded-md border border-[var(--border-default)]">
      <div ref="el" class="im-map-picker h-full w-full" />
      <p v-if="!modelValue" class="pointer-events-none absolute left-1/2 top-3 z-[1000] m-0 -translate-x-1/2 whitespace-nowrap rounded-pill bg-white/[.94] px-3.5 py-2 text-[12.5px] font-bold text-[var(--text-secondary)] shadow-card">
        Cliquez sur le bâtiment pour le placer
      </p>
    </div>
    <div class="mt-2.5 flex flex-wrap items-center gap-2.5">
      <p v-if="modelValue" class="m-0 flex-1 text-[12.5px] text-[var(--text-muted)]">
        <span class="font-mono font-bold text-[var(--text-primary)]">{{ formatCoords(modelValue) }}</span> · faites glisser le repère pour ajuster
      </p>
      <p v-else class="m-0 flex-1 text-[12.5px] text-[var(--text-muted)]">Sans position, les locataires ne voient qu'une zone approximative autour de la ville.</p>
      <button type="button" class="rounded-pill border border-[var(--border-default)] bg-white px-3.5 py-2 text-[12.5px] font-bold disabled:opacity-60" :disabled="locating" @click="useMyPosition">
        {{ locating ? 'Localisation…' : '◎ Utiliser ma position' }}
      </button>
      <button v-if="modelValue && clearable" type="button" class="rounded-pill px-3 py-2 text-[12.5px] font-bold text-[var(--text-muted)] underline" @click="emit('update:modelValue', null)">Retirer</button>
    </div>
    <p v-if="error" class="mb-0 mt-2 text-[12.5px] font-semibold text-danger-fg">{{ error }}</p>
  </div>
</template>

<style>
.im-map-picker {
  font-family: var(--font-sans);
  background: var(--color-sand-200);
}
.im-map-picker .leaflet-control-attribution {
  font-size: 10.5px;
}
.im-map-dot-wrap {
  background: none;
  border: 0;
}
.im-map-dot {
  width: 26px;
  height: 26px;
  border-radius: 9999px;
  background: var(--color-green-700);
  border: 4px solid #fff;
  box-shadow: 0 0 0 6px rgba(26, 93, 62, 0.22), 0 4px 12px rgba(18, 60, 41, 0.35);
  cursor: grab;
}
.leaflet-dragging .im-map-dot {
  cursor: grabbing;
}
</style>
