<script setup lang="ts">
import { ListChecks, MapPin, MessageSquare, Navigation } from '@lucide/vue'
import type { ArtisanRequestSummary } from '~/types/artisan'
import type { InterventionPhase } from '~/utils/artisanRequests'
import { interventionPhase } from '~/utils/artisanRequests'
import { useArtisanProfile } from '~/composables/useArtisanProfile'

definePageMeta({ layout: 'artisan' })

/**
 * À faire (ancien « Planning ») — ce qui attend une action de l'artisan, du plus urgent au moins
 * urgent. L'API ne connaît ni date d'intervention ni indisponibilité (#24) : aucune promesse
 * d'agenda, les passages se conviennent dans la conversation de chaque demande.
 */
const artisanApi = useArtisanRequestsApi()
const modal = useArtisanModal()
const modalTarget = useArtisanModalTarget()
const modalRequest = useArtisanModalRequest()
const refresh = useArtisanRequestsRefresh()
const artisan = useArtisanProfile()
const { tradeLabel } = artisan

const block = useFetchBlock(() => artisanApi.listMine())
onMounted(() => {
  block.load()
  artisan.ensureTrades()
})
watch(refresh, () => block.load())

interface Group { phase: InterventionPhase; title: string; hint: string; tone: 'ok' | 'danger' | 'warn' | 'info' }
const GROUPS: Group[] = [
  { phase: 'in_progress', title: 'À réaliser', hint: "Payées : passez faire l'intervention, puis marquez-la terminée.", tone: 'ok' },
  { phase: 'disputed', title: 'Litiges à régler', hint: 'Le demandeur a signalé un problème : proposez ou acceptez un partage de la retenue.', tone: 'danger' },
  { phase: 'open', title: 'Négociations', hint: 'Répondez aux contre-propositions ou ajustez votre offre.', tone: 'warn' },
  { phase: 'agreed', title: 'En attente du paiement', hint: 'Offre acceptée : attendez le paiement avant de vous déplacer.', tone: 'info' }
]
const groups = computed(() => GROUPS
  .map(g => ({ ...g, items: block.items.value.filter(r => interventionPhase(r) === g.phase).sort((a, b) => a.created_at.localeCompare(b.created_at)) }))
  .filter(g => g.items.length))
const total = computed(() => groups.value.reduce((n, g) => n + g.items.length, 0))

const COUNT_TONE: Record<Group['tone'], string> = {
  ok: 'bg-green-600 text-white',
  danger: 'bg-danger-fg text-white',
  warn: 'bg-warn-bg text-warn-fg-deep',
  info: 'bg-info-bg text-info-fg-deep'
}

function requesterName(r: ArtisanRequestSummary) {
  return r.requester ? [r.requester.first_name, r.requester.last_name].filter(Boolean).join(' ') || 'Le demandeur' : 'Le demandeur'
}
function mapsLink(r: ArtisanRequestSummary) {
  const u = r.unit
  return u?.gps_latitude && u?.gps_longitude ? `https://www.google.com/maps?q=${u.gps_latitude},${u.gps_longitude}` : null
}
function openTerminer(r: ArtisanRequestSummary) {
  modalTarget.value = r.id
  modalRequest.value = r
  modal.value = 'terminer'
}
</script>

<template>
  <div class="flex animate-[im-fade_.3s_ease_backwards] flex-col gap-4.5">
    <p class="m-0 text-[13.5px] leading-[1.55] text-[var(--text-muted)]">
      Ce qui attend votre action, du plus urgent au moins urgent. Les dates de passage se conviennent avec le demandeur, dans la conversation de chaque mission.
    </p>

    <div v-if="block.state.value === 'idle' || (block.state.value === 'loading' && !block.items.value.length)" class="flex flex-col gap-3">
      <DataSkeletonCard v-for="i in 2" :key="i" :height="130" :lines="0" />
    </div>
    <FeedbackAlertBanner v-else-if="block.state.value === 'error'" tone="danger">
      Impossible de charger vos missions pour le moment.
      <button type="button" class="ml-2 font-bold underline" @click="block.load">Réessayer</button>
    </FeedbackAlertBanner>
    <ArtisanEmptyState
      v-else-if="!total"
      :icon="ListChecks"
      title="Rien à faire pour l'instant"
      text="Aucune mission payée à réaliser, aucun litige ni négociation en cours. Les postes ouverts de votre métier sont dans Mes missions."
      action-label="Voir les postes ouverts"
      to="/artisan/missions?tab=ouvertes"
    />

    <template v-else>
      <section v-for="g in groups" :key="g.phase" class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
        <div class="flex flex-wrap items-center gap-2.5">
          <h2 class="m-0 text-[15px] font-bold">{{ g.title }}</h2>
          <span class="rounded-pill px-2.5 py-0.5 font-mono text-xs font-bold" :class="COUNT_TONE[g.tone]">{{ g.items.length }}</span>
        </div>
        <p class="mb-1.5 mt-1 text-[13px] text-[var(--text-muted)]">{{ g.hint }}</p>

        <div v-for="r in g.items" :key="r.id" class="border-b border-sand-200 py-3.5 last:border-b-0 last:pb-0">
          <NuxtLink :to="`/artisan/missions?tab=encours&request=${r.id}`" class="block text-sm font-bold hover:text-green-700 hover:underline">
            {{ tradeLabel(r.trade_reference_id) }} — {{ r.unit?.name ?? 'Logement' }}
          </NuxtLink>
          <p class="mb-0 mt-0.5 text-xs text-[var(--text-faint)]">{{ requesterName(r) }}</p>
          <p v-if="r.unit?.address" class="mb-0 mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[13px] text-[var(--text-secondary)]">
            <MapPin class="h-3.5 w-3.5 flex-none text-[var(--text-faint)]" :stroke-width="1.9" aria-hidden="true" />
            <span class="min-w-0 [overflow-wrap:anywhere]">{{ r.unit.address }}</span>
            <a v-if="mapsLink(r)" :href="mapsLink(r) ?? undefined" target="_blank" rel="noopener" class="inline-flex items-center gap-1 text-[12.5px] font-bold text-green-700">
              <Navigation class="h-3.5 w-3.5" :stroke-width="1.9" aria-hidden="true" />Itinéraire
            </a>
          </p>
          <div class="mt-2.5 flex flex-wrap gap-2">
            <CoreButton v-if="g.phase === 'in_progress'" size="sm" tone="secondary" @click="openTerminer(r)">Marquer terminée</CoreButton>
            <CoreButton v-else size="sm" tone="secondary" @click="navigateTo(`/artisan/missions?tab=encours&request=${r.id}`)">{{ g.phase === 'disputed' ? 'Ouvrir le litige' : g.phase === 'open' ? 'Voir les offres' : 'Voir la mission' }}</CoreButton>
            <NuxtLink
              v-if="r.conversation_id"
              :to="`/artisan/messages?conversation=${r.conversation_id}`"
              class="inline-flex items-center gap-1.5 rounded-pill px-3.5 py-[9px] text-[13px] font-bold text-[var(--text-secondary)] hover:bg-sand-50"
            >
              <MessageSquare class="h-4 w-4" :stroke-width="1.9" aria-hidden="true" />Conversation
            </NuxtLink>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>
