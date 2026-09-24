<script setup lang="ts">
import type { PropertySearchResult } from '~/types/property'

definePageMeta({ layout: 'pro' })

const propertiesApi = useLandlordPropertiesApi()

const items = ref<PropertySearchResult[]>([])
const state = ref<'loading' | 'success' | 'error'>('loading')

async function load() {
  state.value = 'loading'
  try {
    const res = await propertiesApi.fetchMine()
    items.value = res.data as PropertySearchResult[]
    state.value = 'success'
  } catch {
    state.value = 'error'
  }
}
onMounted(load)

const query = ref('')
const statusFilter = ref('Tous les statuts')
const STATUS_LABEL: Record<string, string> = { available: 'Publié', occupied: 'Occupé', maintenance: 'En maintenance' }
const STATUS_TONE: Record<string, 'ok' | 'warn' | 'danger' | 'neutral'> = { available: 'ok', occupied: 'neutral', maintenance: 'warn' }

const filtered = computed(() => items.value.filter(p => {
  const matchesQuery = !query.value.trim() || p.name.toLowerCase().includes(query.value.trim().toLowerCase())
  const matchesStatus = statusFilter.value === 'Tous les statuts' || STATUS_LABEL[p.status] === statusFilter.value
  return matchesQuery && matchesStatus
}))

function unitsSummary(p: PropertySearchResult) {
  const occupied = p.units.filter(u => u.unit_status === 'occupied').length
  const available = p.units.filter(u => u.unit_status === 'available').length
  const parts = []
  if (occupied) parts.push(`${occupied} occupée${occupied > 1 ? 's' : ''}`)
  if (available) parts.push(`${available} libre${available > 1 ? 's' : ''}`)
  return `${p.units.length} · ${parts.join(', ') || 'aucun détail'}`
}
function monthlyRevenue(p: PropertySearchResult) {
  return p.units.filter(u => u.unit_status === 'occupied').reduce((sum, u) => sum + Number(u.price), 0)
}
function firstPhoto(p: PropertySearchResult) {
  return p.media.find(m => m.is_primary)?.url ?? p.media[0]?.url ?? null
}
function openBien(p: PropertySearchResult) {
  navigateTo(`/pro/biens/fiche?id=${p.id}`)
}
</script>

<template>
  <div class="animate-[im-fade_.3s_ease_both]">
    <div class="mb-4.5 flex flex-wrap items-center gap-2.5">
      <label class="flex h-[46px] min-w-[200px] flex-1 items-center gap-2.5 rounded-pill border border-[var(--border-default)] bg-white px-4">
        <span class="h-3.5 w-3.5 flex-none rounded-pill border-2 border-[var(--text-faint)]" />
        <input v-model="query" placeholder="Rechercher un bien" class="w-full border-0 bg-transparent text-sm outline-none">
      </label>
      <select v-model="statusFilter" class="h-[46px] rounded-pill border border-[var(--border-default)] bg-white px-3.5 text-[13.5px] font-semibold text-sand-900">
        <option>Tous les statuts</option>
        <option>Publié</option>
        <option>Occupé</option>
        <option>En maintenance</option>
      </select>
      <NuxtLink to="/pro/biens/ajouter" class="flex h-[46px] items-center rounded-pill bg-[image:var(--action-primary)] px-5 text-[13.5px] font-bold text-white shadow-action">+ Ajouter un bien</NuxtLink>
    </div>

    <div v-if="state === 'loading'" class="grid grid-cols-1 gap-4.5 sm:grid-cols-2 lg:grid-cols-3">
      <DataSkeletonCard v-for="i in 3" :key="i" :height="240" :lines="1" />
    </div>

    <FeedbackAlertBanner v-else-if="state === 'error'" tone="danger">
      Impossible de charger vos biens pour le moment.
      <button type="button" class="ml-2 font-bold underline" @click="load">Réessayer</button>
    </FeedbackAlertBanner>

    <div v-else-if="!filtered.length" class="rounded-2xl border border-dashed border-[var(--border-default)] bg-white px-10 py-[60px] text-center">
      <p class="mb-0 mt-0 text-lg font-bold">{{ items.length ? 'Aucun bien pour ces critères' : "Vous n'avez pas encore de bien" }}</p>
      <p class="mx-auto mb-[22px] mt-2.5 max-w-[420px] text-[14.5px] leading-[1.6] text-[var(--text-muted)]">
        {{ items.length ? 'Modifiez la recherche ou le filtre de statut.' : 'Publiez votre premier bien pour commencer à recevoir des demandes.' }}
      </p>
      <NuxtLink v-if="!items.length" to="/pro/biens/ajouter" class="inline-block rounded-md bg-[image:var(--action-primary)] px-7 py-3.5 text-[15px] font-bold text-white shadow-action">Ajouter un bien</NuxtLink>
    </div>

    <div v-else class="grid grid-cols-1 gap-4.5 sm:grid-cols-2 lg:grid-cols-3">
      <div
        v-for="p in filtered"
        :key="p.id"
        class="cursor-pointer overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-white transition-shadow hover:shadow-raised"
        @click="openBien(p)"
      >
        <div class="relative h-[150px] bg-cover bg-center bg-sand-200" :style="firstPhoto(p) ? { backgroundImage: `url(${firstPhoto(p)})` } : {}">
          <CoreBadge :tone="STATUS_TONE[p.status] ?? 'neutral'" class="absolute left-3 top-3">{{ STATUS_LABEL[p.status] ?? p.status }}</CoreBadge>
        </div>
        <div v-if="p.is_suspended" class="border-b border-danger-border bg-danger-bg px-4 py-2.5">
          <p class="m-0 text-xs font-bold text-danger-fg">Bien suspendu</p>
          <p v-if="p.suspended_reason" class="mb-0 mt-0.5 text-[11.5px] text-danger-fg-deep">{{ p.suspended_reason }}</p>
        </div>
        <div class="px-4.5 pb-4.5 pt-4">
          <p class="m-0 text-[15.5px] font-bold tracking-[-.01em]">{{ p.name }}</p>
          <p class="mb-0 mt-1 text-[13px] text-[var(--text-muted)]">{{ p.neighborhood?.name ?? p.city?.name ?? '' }}</p>
          <div class="mt-3.5 flex gap-4">
            <div>
              <p class="m-0 text-[11px] font-bold uppercase tracking-[.04em] text-[var(--text-faint)]">Unités</p>
              <p class="mb-0 mt-1 text-[13.5px] font-semibold">{{ unitsSummary(p) }}</p>
            </div>
            <div>
              <p class="m-0 text-[11px] font-bold uppercase tracking-[.04em] text-[var(--text-faint)]">Revenu / mois</p>
              <p class="mb-0 mt-1 font-mono text-[13.5px] font-bold">{{ formatFcfaShort(monthlyRevenue(p)) }}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
