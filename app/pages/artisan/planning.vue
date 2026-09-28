<script setup lang="ts">
import type { ArtisanRequestSummary } from '~/types/artisan'
import type { RefEntry } from '~/types/reference'
import { interventionPhase, PHASE_LABEL_ARTISAN, PHASE_TONE, warrantyLine } from '~/utils/artisanRequests'

definePageMeta({ layout: 'artisan' })

/**
 * Planning — jusqu'au Lot 54, une semaine fictive (« Fuite lavabo — A2 »…) et
 * un bouton « Bloquer une plage » qui n'enregistrait rien. L'API ne connaît ni
 * date d'intervention ni indisponibilité (#24) : on montre honnêtement ce qui
 * est à faire, dans l'ordre où il faut s'en occuper.
 */
const artisanApi = useArtisanRequestsApi()
const refData = useReferenceData()
const block = useFetchBlock(() => artisanApi.listMine())
const trades = ref<RefEntry[]>([])
onMounted(async () => {
  block.load()
  trades.value = await refData.fetchRef('ARTISAN_TRADE').catch(() => [])
})
function tradeLabel(id?: string) {
  return trades.value.find(t => t.id === id)?.labels.fr ?? 'Intervention'
}

const ORDER = ['in_progress', 'disputed', 'agreed', 'open', 'warranty']
const todo = computed(() => block.items.value
  .filter(r => ORDER.includes(interventionPhase(r)))
  .sort((a, b) => ORDER.indexOf(interventionPhase(a)) - ORDER.indexOf(interventionPhase(b)) || a.created_at.localeCompare(b.created_at)))

function nextStep(r: ArtisanRequestSummary): string {
  switch (interventionPhase(r)) {
    case 'in_progress': return "Payée : passez faire l'intervention, puis marquez-la terminée."
    case 'disputed': return 'Litige ouvert : proposez un partage de la retenue.'
    case 'agreed': return 'Offre acceptée : attendez le paiement avant de vous déplacer.'
    case 'open': return 'Négociation en cours.'
    default: return warrantyLine(r) ?? 'Sous garantie.'
  }
}
</script>

<template>
  <div class="animate-[im-fade_.3s_ease_both]">
    <p class="mb-4 mt-0 text-[13.5px] leading-[1.55] text-[var(--text-muted)]">
      Vos interventions, de la plus urgente à la moins urgente. Les dates de passage se conviennent dans la conversation de chaque demande : l'agenda et les indisponibilités ne sont pas encore gérés par l'application.
    </p>
    <div v-if="block.state.value === 'loading'" class="flex flex-col gap-3">
      <DataSkeletonCard v-for="i in 2" :key="i" :height="80" :lines="1" />
    </div>
    <FeedbackAlertBanner v-else-if="block.state.value === 'error'" tone="danger">
      Impossible de charger vos interventions.
      <button type="button" class="ml-2 font-bold underline" @click="block.load">Réessayer</button>
    </FeedbackAlertBanner>
    <p v-else-if="!todo.length" class="rounded-md border border-dashed border-[var(--border-default)] bg-white px-4 py-10 text-center text-[13.5px] text-[var(--text-muted)]">Rien à faire pour l'instant.</p>
    <NuxtLink v-for="r in todo" v-else :key="r.id" :to="`/artisan/missions?request=${r.id}`" class="mb-2.5 flex items-center gap-3.5 rounded-xl border border-[var(--border-subtle)] bg-white px-4.5 py-4 hover:shadow-md">
      <div class="min-w-0 flex-1">
        <p class="m-0 text-[14.5px] font-bold">{{ tradeLabel(r.trade_reference_id) }} — {{ r.unit?.name ?? 'Logement' }}</p>
        <p class="mb-0 mt-0.5 text-[12.5px] text-[var(--text-muted)]">{{ nextStep(r) }}</p>
      </div>
      <CoreBadge :tone="PHASE_TONE[interventionPhase(r)]">{{ PHASE_LABEL_ARTISAN[interventionPhase(r)] }}</CoreBadge>
    </NuxtLink>
  </div>
</template>
