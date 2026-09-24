<script setup lang="ts">
import type { HousingRequestResponse, HousingRequestSummary } from '~/types/tenant'
import { ApiRequestError } from '~/utils/authenticatedFetcher'

definePageMeta({ layout: 'locataire' })

const housingRequestsApi = useHousingRequestsApi()
const block = useFetchBlock(() => housingRequestsApi.fetchMine())
onMounted(block.load)

const showCreate = ref(false)

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}
function formatBudget(r: HousingRequestSummary) {
  if (!r.budget_min && !r.budget_max) return ''
  if (r.budget_min && r.budget_max) return `${formatFcfaShort(Number(r.budget_min))} – ${formatFcfaShort(Number(r.budget_max))}`
  return formatFcfaShort(Number(r.budget_min ?? r.budget_max))
}

/* ---- Réponses reçues, chargées à la demande (réservé à l'auteur) ---- */
const expandedId = ref<string | null>(null)
const responses = ref<Record<string, HousingRequestResponse[]>>({})
const responsesLoading = ref<string | null>(null)

async function toggleResponses(r: HousingRequestSummary) {
  if (expandedId.value === r.id) {
    expandedId.value = null
    return
  }
  expandedId.value = r.id
  if (responses.value[r.id]) return
  responsesLoading.value = r.id
  try {
    responses.value[r.id] = await housingRequestsApi.fetchResponses(r.id)
  } catch {
    responses.value[r.id] = []
  } finally {
    responsesLoading.value = null
  }
}

/* ---- Fermer une demande ---- */
const closingId = ref<string | null>(null)
const closeError = ref('')
async function closeRequest(r: HousingRequestSummary) {
  closingId.value = r.id
  closeError.value = ''
  try {
    await housingRequestsApi.close(r.id)
    await block.load()
  } catch (e) {
    closeError.value = e instanceof ApiRequestError ? (e.mapped.bannerMessage ?? 'Fermeture impossible.') : 'Fermeture impossible.'
  } finally {
    closingId.value = null
  }
}
</script>

<template>
  <div class="animate-[im-fade_.3s_ease_both]">
    <div class="mb-5 flex items-center justify-between">
      <p class="m-0 text-base font-bold">Mes demandes de logement</p>
      <CoreButton @click="showCreate = true">+ Publier une demande</CoreButton>
    </div>

    <div v-if="block.state.value === 'loading'" class="flex flex-col gap-3.5">
      <DataSkeletonCard v-for="i in 2" :key="i" :height="110" :lines="1" />
    </div>

    <FeedbackAlertBanner v-else-if="block.state.value === 'error'" tone="danger">
      Impossible de charger vos demandes pour le moment.
      <button type="button" class="ml-2 font-bold underline" @click="block.load">Réessayer</button>
    </FeedbackAlertBanner>

    <p v-else-if="block.state.value === 'empty'" class="rounded-md border border-dashed border-[var(--border-default)] bg-white px-4 py-10 text-center text-[13.5px] text-[var(--text-muted)]">
      Aucune demande publiée pour l'instant. Les propriétaires qui ont un bien correspondant à vos critères pourront vous répondre directement.
    </p>

    <template v-else>
      <p v-if="closeError" class="mb-3.5 text-[13px] font-semibold text-danger-fg">{{ closeError }}</p>

      <div v-for="r in block.items.value" :key="r.id" class="mb-3.5 rounded-xl border border-[var(--border-subtle)] bg-white p-5">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2.5">
              <CoreBadge :tone="r.status === 'open' ? 'ok' : 'neutral'">{{ r.status === 'open' ? 'Ouverte' : 'Fermée' }}</CoreBadge>
              <span v-if="formatBudget(r)" class="text-[12.5px] font-semibold text-[var(--text-muted)]">{{ formatBudget(r) }}</span>
            </div>
            <p class="mb-0 mt-2 text-[14.5px] leading-[1.55] text-[var(--text-primary)]">« {{ r.description }} »</p>
            <p class="mb-0 mt-1.5 text-[12.5px] text-[var(--text-faint)]">Publiée le {{ formatDate(r.created_at) }}</p>
          </div>
          <button
            v-if="r.status === 'open'"
            type="button"
            class="flex-none whitespace-nowrap rounded-sm border border-[var(--border-default)] bg-white px-3.5 py-2 text-[12.5px] font-bold text-sand-900"
            :disabled="closingId === r.id"
            @click="closeRequest(r)"
          >{{ closingId === r.id ? '…' : 'Fermer' }}</button>
        </div>

        <button type="button" class="mt-3.5 text-[13px] font-bold text-green-700" @click="toggleResponses(r)">
          {{ r.response_count }} réponse{{ r.response_count > 1 ? 's' : '' }} {{ expandedId === r.id ? '▲' : '▼' }}
        </button>

        <div v-if="expandedId === r.id" class="mt-3">
          <p v-if="responsesLoading === r.id" class="m-0 text-[13px] text-[var(--text-muted)]">Chargement…</p>
          <p v-else-if="!responses[r.id]?.length" class="m-0 text-[13px] text-[var(--text-muted)]">Aucune réponse pour l'instant.</p>
          <div v-else v-for="resp in responses[r.id]" :key="resp.id" class="mt-2 flex items-center justify-between gap-3 rounded-sm border border-[var(--border-subtle)] bg-[var(--surface-page)] px-3.5 py-3">
            <div class="min-w-0 flex-1">
              <p class="m-0 text-[13px] font-semibold">Un propriétaire a proposé un logement</p>
              <p v-if="resp.message" class="mb-0 mt-1 text-[12.5px] text-[var(--text-muted)]">« {{ resp.message }} »</p>
            </div>
            <NuxtLink :to="`/locataire/messages?conversation=${resp.conversation_id}`" class="flex-none rounded-pill border border-[var(--border-default)] bg-white px-3.5 py-2 text-[12px] font-bold">Voir la conversation</NuxtLink>
          </div>
        </div>
      </div>
    </template>

    <TenantHousingRequestModal v-if="showCreate" @close="showCreate = false" @created="showCreate = false; block.load()" />
  </div>
</template>
