<script setup lang="ts">
import type { HousingRequestSummary } from '~/types/tenant'
import { REQUEST_FREQUENCY_LABEL } from '~/utils/housingRequest'

definePageMeta({ layout: 'locataire' })

const route = useRoute()
const housingRequestsApi = useHousingRequestsApi()
const block = useFetchBlock(() => housingRequestsApi.fetchMine())
/** `?request=<id>` ouvre directement la demande (lien des notifications « Un propriétaire a répondu » et du tableau de bord). */
onMounted(async () => {
  await block.load()
  openFromQuery()
})
watch(() => route.query.request, async () => {
  await block.load()
  openFromQuery()
})
function openFromQuery() {
  const wanted = String(route.query.request ?? '')
  if (wanted) selected.value = block.items.value.find(r => r.id === wanted) ?? null
}

const showCreate = ref(false)
const selected = ref<HousingRequestSummary | null>(null)

function criteriaLine(r: HousingRequestSummary) {
  return [r.desired_billing_frequency ? REQUEST_FREQUENCY_LABEL[r.desired_billing_frequency] : '', r.neighborhood?.name, r.city?.name].filter(Boolean).join(' · ')
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}
function formatBudget(r: HousingRequestSummary) {
  if (!r.budget_min && !r.budget_max) return 'Budget non précisé'
  if (r.budget_min && r.budget_max) return `${formatFcfaShort(Number(r.budget_min))} – ${formatFcfaShort(Number(r.budget_max))}`
  return formatFcfaShort(Number(r.budget_min ?? r.budget_max))
}

function onClosed() {
  selected.value = null
  block.load()
}
</script>

<template>
  <div class="animate-[im-fade_.3s_ease_both]">
    <div class="mb-5 flex items-center justify-between">
      <p class="m-0 text-base font-bold">Mes demandes de logement</p>
      <CoreButton @click="showCreate = true">+ Publier une demande</CoreButton>
    </div>

    <div v-if="block.state.value === 'loading'" class="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
      <DataSkeletonCard v-for="i in 3" :key="i" :height="140" :lines="1" />
    </div>

    <FeedbackAlertBanner v-else-if="block.state.value === 'error'" tone="danger">
      Impossible de charger vos demandes pour le moment.
      <button type="button" class="ml-2 font-bold underline" @click="block.load">Réessayer</button>
    </FeedbackAlertBanner>

    <p v-else-if="block.state.value === 'empty'" class="rounded-md border border-dashed border-[var(--border-default)] bg-white px-4 py-10 text-center text-[13.5px] text-[var(--text-muted)]">
      Aucune demande publiée pour l'instant. Décrivez ce que vous cherchez : les propriétaires qui ont un logement correspondant vous répondent directement, par message.
    </p>

    <div v-else class="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
      <button
        v-for="r in block.items.value"
        :key="r.id"
        type="button"
        class="flex flex-col rounded-2xl border border-[var(--border-subtle)] bg-white p-4.5 text-left transition-[transform,box-shadow] duration-[var(--duration-base)] hover:-translate-y-0.5 hover:shadow-raised"
        @click="selected = r"
      >
        <div class="flex items-center justify-between gap-2.5">
          <CoreBadge :tone="r.status === 'open' ? 'ok' : 'neutral'">{{ r.status === 'open' ? 'Ouverte' : 'Fermée' }}</CoreBadge>
          <span class="text-[12.5px] text-[var(--text-muted)]" :class="{ 'font-mono': r.budget_min || r.budget_max }">{{ formatBudget(r) }}</span>
        </div>
        <p v-if="criteriaLine(r)" class="mb-0 mt-2.5 text-[12.5px] font-semibold text-[var(--text-secondary)]">{{ criteriaLine(r) }}</p>
        <p class="mb-0 mt-2 line-clamp-3 flex-1 text-[14px] leading-[1.55] text-[var(--text-primary)] [overflow-wrap:anywhere]">« {{ r.description }} »</p>
        <div class="mt-3.5 flex items-center justify-between border-t border-sand-200 pt-3">
          <span class="text-[12.5px] text-[var(--text-faint)]">{{ r.status === 'closed' && r.closed_at ? `Fermée le ${formatDate(r.closed_at)}` : formatDate(r.created_at) }}</span>
          <span class="text-[12.5px] font-bold" :class="r.response_count ? 'text-green-700' : 'text-[var(--text-muted)]'">
            {{ r.response_count }} réponse{{ r.response_count > 1 ? 's' : '' }} →
          </span>
        </div>
      </button>
    </div>

    <TenantHousingRequestDetailModal v-if="selected" :request="selected" @close="selected = null" @closed="onClosed" />
    <TenantHousingRequestModal v-if="showCreate" @close="showCreate = false" @created="showCreate = false; block.load()" />
  </div>
</template>
