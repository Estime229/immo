<script setup lang="ts">
import { ChevronRight, Megaphone, Plus, X } from '@lucide/vue'
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

const flash = ref('')
function onClosed() {
  selected.value = null
  flash.value = "Demande fermée : elle n'apparaît plus aux propriétaires. Vos conversations restent dans vos messages."
  block.load()
}
function onCreated() {
  showCreate.value = false
  flash.value = 'Demande publiée : les propriétaires peuvent maintenant vous proposer un logement.'
  block.load()
}
</script>

<template>
  <div class="animate-[im-fade_.3s_ease_backwards]">
    <div class="mb-4.5 flex flex-wrap items-center justify-between gap-3">
      <p class="m-0 max-w-[520px] text-[13.5px] text-[var(--text-muted)]">Décrivez ce que vous cherchez : les propriétaires qui ont un logement correspondant vous répondent par message.</p>
      <CoreButton @click="showCreate = true"><span class="inline-flex items-center gap-1.5"><Plus class="h-4 w-4" :stroke-width="2.2" />Publier une demande</span></CoreButton>
    </div>

    <div v-if="flash" class="mb-4.5 flex items-start gap-3 rounded-md border border-ok-border bg-ok-bg px-3.5 py-2.5 text-[13px] font-semibold text-green-900">
      <p class="m-0 flex-1">{{ flash }}</p>
      <button type="button" aria-label="Masquer" class="flex-none text-green-900/70 hover:text-green-900" @click="flash = ''"><X class="h-4 w-4" :stroke-width="1.9" /></button>
    </div>

    <div v-if="block.state.value === 'loading' || block.state.value === 'idle'" class="grid grid-cols-1 gap-4.5 sm:grid-cols-2 lg:grid-cols-3">
      <DataSkeletonCard v-for="i in 3" :key="i" :height="140" :lines="0" />
    </div>

    <FeedbackAlertBanner v-else-if="block.state.value === 'error'" tone="danger">
      Impossible de charger vos demandes pour le moment.
      <button type="button" class="ml-2 font-bold underline" @click="block.load">Réessayer</button>
    </FeedbackAlertBanner>

    <div v-else-if="block.state.value === 'empty'" class="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-[var(--border-default)] bg-white px-4 py-12 text-center">
      <div class="grid h-[46px] w-[46px] place-items-center rounded-pill bg-green-50 text-green-700"><Megaphone class="h-5 w-5" :stroke-width="1.9" /></div>
      <p class="m-0 text-[15px] font-bold">Aucune demande publiée</p>
      <p class="m-0 max-w-[420px] text-[13.5px] text-[var(--text-muted)]">Publiez ce que vous cherchez (ville, budget, type de location) : chaque réponse d'un propriétaire ouvre une conversation.</p>
    </div>

    <div v-else class="grid grid-cols-1 gap-4.5 sm:grid-cols-2 lg:grid-cols-3">
      <button
        v-for="r in block.items.value"
        :key="r.id"
        type="button"
        class="group flex flex-col rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5 text-left transition-[transform,box-shadow] duration-[var(--duration-base)] hover:-translate-y-0.5 hover:shadow-raised"
        @click="selected = r"
      >
        <div class="flex items-center justify-between gap-2.5">
          <CoreBadge :tone="r.status === 'open' ? 'ok' : 'neutral'">{{ r.status === 'open' ? 'Ouverte' : 'Fermée' }}</CoreBadge>
          <span class="text-[12.5px] font-bold text-[var(--text-secondary)]" :class="{ 'font-mono': r.budget_min || r.budget_max }">{{ formatBudget(r) }}</span>
        </div>
        <p v-if="criteriaLine(r)" class="mb-0 mt-3 text-xs font-semibold text-[var(--text-faint)]">{{ criteriaLine(r) }}</p>
        <p class="mb-0 mt-1.5 line-clamp-3 flex-1 text-[13.5px] leading-[1.55] text-[var(--text-primary)] [overflow-wrap:anywhere]">« {{ r.description }} »</p>
        <div class="mt-3.5 flex items-center justify-between border-t border-sand-200 pt-3">
          <span class="font-mono text-xs text-[var(--text-faint)]">{{ r.status === 'closed' && r.closed_at ? `Fermée le ${formatDate(r.closed_at)}` : formatDate(r.created_at) }}</span>
          <span class="inline-flex items-center gap-1 text-[12.5px] font-bold" :class="r.response_count ? 'text-green-700' : 'text-[var(--text-muted)]'">
            {{ r.response_count }} réponse{{ r.response_count > 1 ? 's' : '' }}
            <ChevronRight class="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" :stroke-width="1.9" />
          </span>
        </div>
      </button>
    </div>

    <TenantHousingRequestDetailModal v-if="selected" :request="selected" @close="selected = null" @closed="onClosed" />
    <TenantHousingRequestModal v-if="showCreate" @close="showCreate = false" @created="onCreated" />
  </div>
</template>
