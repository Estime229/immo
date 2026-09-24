<script setup lang="ts">
import type { VisitStatus, VisitSummary } from '~/types/tenant'
import { ApiRequestError } from '~/utils/authenticatedFetcher'

definePageMeta({ layout: 'locataire' })

const visitsApi = useVisitsApi()
const block = useFetchBlock(() => visitsApi.fetchMine())
onMounted(block.load)

const tab = ref<'avenir' | 'passees'>('avenir')
const UPCOMING: VisitStatus[] = ['pending', 'confirmed']

const rows = computed(() => block.items.value
  .filter(v => (tab.value === 'avenir' ? UPCOMING.includes(v.status) : !UPCOMING.includes(v.status)))
  .sort((a, b) => new Date(b.requested_at).getTime() - new Date(a.requested_at).getTime()))

const STATUS_LABEL: Record<VisitStatus, string> = {
  pending: 'En attente de confirmation',
  confirmed: 'Confirmée',
  rejected: 'Refusée',
  cancelled: 'Annulée',
  completed: 'Réalisée'
}
const STATUS_TONE: Record<VisitStatus, 'ok' | 'warn' | 'danger' | 'neutral'> = {
  pending: 'warn',
  confirmed: 'ok',
  rejected: 'danger',
  cancelled: 'neutral',
  completed: 'neutral'
}

function dayOf(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit' })
}
function monthOf(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { month: 'short' })
}
function timeOf(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { weekday: 'long', hour: '2-digit', minute: '2-digit' })
}

const cancellingId = ref<string | null>(null)
const cancelError = ref('')
async function cancelVisit(v: VisitSummary) {
  cancellingId.value = v.id
  cancelError.value = ''
  try {
    await visitsApi.cancel(v.id)
    await block.load()
  } catch (e) {
    cancelError.value = e instanceof ApiRequestError ? (e.mapped.bannerMessage ?? 'Annulation impossible.') : 'Annulation impossible.'
  } finally {
    cancellingId.value = null
  }
}
</script>

<template>
  <div class="animate-[im-fade_.3s_ease_both]">
    <div class="mb-5 flex w-fit gap-[5px] rounded-pill bg-sand-200 p-1">
      <button type="button" class="rounded-pill px-5 py-2.5 text-[13.5px] font-bold transition-all" :class="tab === 'avenir' ? 'bg-white text-green-900 shadow-card' : 'bg-transparent text-[var(--text-secondary)]'" @click="tab = 'avenir'">À venir</button>
      <button type="button" class="rounded-pill px-5 py-2.5 text-[13.5px] font-bold transition-all" :class="tab === 'passees' ? 'bg-white text-green-900 shadow-card' : 'bg-transparent text-[var(--text-secondary)]'" @click="tab = 'passees'">Passées</button>
    </div>

    <div v-if="block.state.value === 'loading'" class="flex flex-col gap-3.5">
      <DataSkeletonCard v-for="i in 2" :key="i" :height="90" :lines="1" />
    </div>

    <FeedbackAlertBanner v-else-if="block.state.value === 'error'" tone="danger">
      Impossible de charger vos visites pour le moment.
      <button type="button" class="ml-2 font-bold underline" @click="block.load">Réessayer</button>
    </FeedbackAlertBanner>

    <template v-else>
      <p v-if="cancelError" class="mb-3.5 text-[13px] font-semibold text-danger-fg">{{ cancelError }}</p>
      <p v-if="!rows.length" class="rounded-md border border-dashed border-[var(--border-default)] bg-white px-4 py-10 text-center text-[13.5px] text-[var(--text-muted)]">
        {{ tab === 'avenir' ? 'Aucune visite à venir.' : 'Aucune visite passée.' }}
      </p>

      <div v-for="v in rows" :key="v.id" class="mb-3.5 flex items-center gap-4.5 rounded-xl border border-[var(--border-subtle)] bg-white p-5">
        <div class="flex h-16 w-16 flex-none flex-col items-center justify-center rounded-md bg-green-50">
          <span class="font-display text-xl font-extrabold leading-none text-green-800">{{ dayOf(v.requested_at) }}</span>
          <span class="text-[11px] font-bold uppercase text-green-700">{{ monthOf(v.requested_at) }}</span>
        </div>
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2.5">
            <p class="m-0 text-[15.5px] font-bold">{{ v.unit.name }}</p>
            <CoreBadge :tone="STATUS_TONE[v.status]">{{ STATUS_LABEL[v.status] }}</CoreBadge>
          </div>
          <p class="mb-0 mt-1.5 text-[13.5px] capitalize text-[var(--text-muted)]">{{ timeOf(v.requested_at) }}</p>
          <p v-if="v.note" class="mb-0 mt-2 text-[12.5px] text-[var(--text-secondary)]">« {{ v.note }} »</p>
        </div>
        <div v-if="UPCOMING.includes(v.status)" class="flex flex-col gap-2">
          <button
            type="button"
            class="whitespace-nowrap rounded-sm border border-[var(--border-default)] bg-white px-4 py-2.5 text-[12.5px] font-bold text-sand-900"
            :disabled="cancellingId === v.id"
            @click="cancelVisit(v)"
          >{{ cancellingId === v.id ? '…' : 'Annuler' }}</button>
        </div>
      </div>
    </template>
  </div>
</template>
