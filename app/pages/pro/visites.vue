<script setup lang="ts">
import type { VisitStatus, VisitSummary } from '~/types/tenant'
import { ApiRequestError } from '~/utils/authenticatedFetcher'

definePageMeta({ layout: 'pro' })

const visitsApi = useVisitsApi()
const block = useFetchBlock(() => visitsApi.fetchMine('landlord'))
onMounted(block.load)

const STATUS_LABEL: Record<VisitStatus, string> = { pending: 'En attente', confirmed: 'Confirmée', rejected: 'Refusée', cancelled: 'Annulée', completed: 'Réalisée' }
const STATUS_TONE: Record<VisitStatus, 'ok' | 'warn' | 'danger' | 'neutral'> = { pending: 'warn', confirmed: 'ok', rejected: 'danger', cancelled: 'neutral', completed: 'neutral' }

function dayOf(iso: string) { return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit' }) }
function monthOf(iso: string) { return new Date(iso).toLocaleDateString('fr-FR', { month: 'short' }) }
function timeOf(iso: string) { return new Date(iso).toLocaleDateString('fr-FR', { weekday: 'long', hour: '2-digit', minute: '2-digit' }) }
function tenantName(v: VisitSummary) {
  if (!v.tenant) return 'Candidat'
  return `${v.tenant.first_name ?? ''} ${v.tenant.last_name ?? ''}`.trim() || v.tenant.email
}

const busyId = ref<string | null>(null)
const actionError = ref('')

async function run(v: VisitSummary, action: () => Promise<unknown>) {
  busyId.value = v.id
  actionError.value = ''
  try {
    await action()
    await block.load()
  } catch (e) {
    actionError.value = e instanceof ApiRequestError ? (e.mapped.bannerMessage ?? "L'action a échoué.") : "L'action a échoué."
  } finally {
    busyId.value = null
  }
}
function confirmVisit(v: VisitSummary) { run(v, () => visitsApi.confirm(v.id)) }
function rejectVisit(v: VisitSummary) { run(v, () => visitsApi.reject(v.id)) }
function completeVisit(v: VisitSummary) { run(v, () => visitsApi.complete(v.id)) }

/* ---- Replanifier ---- */
const reschedulingId = ref<string | null>(null)
const rescheduleDate = ref('')
function openReschedule(v: VisitSummary) {
  reschedulingId.value = v.id
  rescheduleDate.value = ''
}
function submitReschedule(v: VisitSummary) {
  if (!rescheduleDate.value) return
  run(v, () => visitsApi.reschedule(v.id, new Date(rescheduleDate.value).toISOString())).then(() => { reschedulingId.value = null })
}
</script>

<template>
  <div class="animate-[im-fade_.3s_ease_both]">
    <div v-if="block.state.value === 'loading'" class="flex flex-col gap-3.5">
      <DataSkeletonCard v-for="i in 3" :key="i" :height="90" :lines="1" />
    </div>

    <FeedbackAlertBanner v-else-if="block.state.value === 'error'" tone="danger">
      Impossible de charger vos visites pour le moment.
      <button type="button" class="ml-2 font-bold underline" @click="block.load">Réessayer</button>
    </FeedbackAlertBanner>

    <p v-else-if="block.state.value === 'empty'" class="rounded-md border border-dashed border-[var(--border-default)] bg-white px-4 py-10 text-center text-[13.5px] text-[var(--text-muted)]">
      Aucune visite demandée pour l'instant sur vos biens.
    </p>

    <template v-else>
      <p v-if="actionError" class="mb-3.5 text-[13px] font-semibold text-danger-fg">{{ actionError }}</p>

      <div v-for="v in block.items.value" :key="v.id" class="mb-3 rounded-xl border border-[var(--border-subtle)] bg-white p-4.5">
        <div class="flex items-center gap-4">
          <div class="flex h-15 w-15 flex-none flex-col items-center justify-center rounded-md bg-green-50">
            <span class="font-display text-lg font-extrabold leading-none text-green-800">{{ dayOf(v.requested_at) }}</span>
            <span class="text-[10.5px] font-bold uppercase text-green-700">{{ monthOf(v.requested_at) }}</span>
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2.5">
              <p class="m-0 text-[15px] font-bold">{{ v.unit.name }}</p>
              <CoreBadge :tone="STATUS_TONE[v.status]">{{ STATUS_LABEL[v.status] }}</CoreBadge>
            </div>
            <p class="mb-0 mt-1.5 text-[13px] capitalize text-[var(--text-muted)]">{{ timeOf(v.requested_at) }} · candidat {{ tenantName(v) }}</p>
            <p v-if="v.note" class="mb-0 mt-1 text-[12.5px] text-[var(--text-faint)]">« {{ v.note }} »</p>
            <p v-if="v.rejection_reason" class="mb-0 mt-1 text-[12.5px] text-danger-fg">{{ v.rejection_reason }}</p>
          </div>
          <div v-if="v.status === 'pending'" class="flex flex-none gap-2">
            <button type="button" class="whitespace-nowrap rounded-sm bg-[image:var(--action-primary)] px-3.5 py-2.5 text-xs font-bold text-white" :disabled="busyId === v.id" @click="confirmVisit(v)">{{ busyId === v.id ? '…' : 'Confirmer' }}</button>
            <button type="button" class="whitespace-nowrap rounded-sm border border-[var(--border-default)] bg-white px-3.5 py-2.5 text-xs font-bold text-sand-900" :disabled="busyId === v.id" @click="rejectVisit(v)">Refuser</button>
          </div>
          <div v-else-if="v.status === 'confirmed'" class="flex flex-none gap-2">
            <button type="button" class="whitespace-nowrap rounded-sm bg-green-50 px-3.5 py-2.5 text-xs font-bold text-green-700" :disabled="busyId === v.id" @click="completeVisit(v)">Marquer réalisée</button>
            <button type="button" class="whitespace-nowrap rounded-sm border border-[var(--border-default)] bg-white px-3.5 py-2.5 text-xs font-bold text-sand-900" @click="openReschedule(v)">Replanifier</button>
          </div>
        </div>
        <div v-if="reschedulingId === v.id" class="mt-3.5 flex items-center gap-2.5 border-t border-sand-200 pt-3.5">
          <input v-model="rescheduleDate" type="datetime-local" class="h-10 flex-1 rounded-sm border border-[var(--border-default)] bg-white px-3 text-[13px] outline-none">
          <button type="button" class="rounded-sm bg-[image:var(--action-primary)] px-3.5 py-2.5 text-xs font-bold text-white" :disabled="!rescheduleDate || busyId === v.id" @click="submitReschedule(v)">Confirmer</button>
          <button type="button" class="rounded-sm border border-[var(--border-default)] bg-white px-3.5 py-2.5 text-xs font-bold" @click="reschedulingId = null">Annuler</button>
        </div>
      </div>
    </template>
  </div>
</template>
