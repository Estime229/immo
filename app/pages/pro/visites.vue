<script setup lang="ts">
import type { VisitSummary } from '~/types/tenant'
import { ApiRequestError } from '~/utils/authenticatedFetcher'
import { errorText } from '~/utils/apiErrors'
import { canComplete, validateVisitSlot, visitBucket, visitDate, visitExpired, visitMoved, visitTimeSlots, type VisitBucket } from '~/utils/visits'

definePageMeta({ layout: 'pro' })

const route = useRoute()
const visitsApi = useVisitsApi()
const messagingApi = useMessagingApi()
const block = useFetchBlock(() => visitsApi.fetchMine('landlord'))

const TABS: { key: VisitBucket; label: string; empty: string }[] = [
  { key: 'todo', label: 'À traiter', empty: 'Aucune demande de visite en attente.' },
  { key: 'upcoming', label: 'À venir', empty: 'Aucune visite confirmée à venir.' },
  { key: 'to_close', label: 'À clôturer', empty: 'Aucune visite passée à clôturer.' },
  { key: 'history', label: 'Historique', empty: 'Aucune visite dans l\'historique.' }
]
const tab = ref<VisitBucket>('todo')
const counts = computed(() => {
  const c: Record<VisitBucket, number> = { todo: 0, upcoming: 0, to_close: 0, history: 0 }
  for (const v of block.items.value) c[visitBucket(v)]++
  return c
})
const rows = computed(() => block.items.value
  .filter(v => visitBucket(v) === tab.value)
  .sort((a, b) => {
    const d = new Date(visitDate(a)).getTime() - new Date(visitDate(b)).getTime()
    return tab.value === 'history' ? -d : d
  }))

/** `?visit=<id>` (lien des notifications) : bon onglet + visite mise en évidence ; sinon le premier onglet non vide. */
const highlighted = ref(String(route.query.visit ?? ''))
onMounted(async () => {
  await block.load()
  const v = block.items.value.find(x => x.id === highlighted.value)
  if (v) {
    tab.value = visitBucket(v)
    nextTick(() => document.getElementById(`visit-${v.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
  } else {
    tab.value = (['todo', 'upcoming', 'to_close'] as VisitBucket[]).find(k => counts.value[k] > 0) ?? 'todo'
  }
})

function whenOf(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
}
function dayOf(iso: string) { return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit' }) }
function monthOf(iso: string) { return new Date(iso).toLocaleDateString('fr-FR', { month: 'short' }) }
function tenantName(v: VisitSummary) {
  if (!v.tenant) return 'Candidat'
  return `${v.tenant.first_name ?? ''} ${v.tenant.last_name ?? ''}`.trim() || 'Candidat'
}
function historyLabel(v: VisitSummary): { label: string; tone: 'ok' | 'warn' | 'danger' | 'neutral' } {
  if (visitExpired(v)) return { label: 'Restée sans réponse', tone: 'warn' }
  if (v.status === 'rejected') return { label: 'Refusée', tone: 'danger' }
  if (v.status === 'cancelled') return { label: v.cancelled_by === v.tenant_id ? 'Annulée par le candidat' : 'Annulée par vous', tone: 'neutral' }
  if (v.status === 'completed') return { label: 'Réalisée', tone: 'ok' }
  return { label: v.status, tone: 'neutral' }
}

/* ---- Actions ---- */
const busyId = ref<string | null>(null)
const actionError = ref<{ id: string; message: string } | null>(null)
const doneNote = ref('')
async function run(v: VisitSummary, action: () => Promise<unknown>, success: string) {
  busyId.value = v.id
  actionError.value = null
  doneNote.value = ''
  try {
    await action()
    panel.value = null
    doneNote.value = success
    await block.load()
  } catch (e) {
    actionError.value = { id: v.id, message: e instanceof ApiRequestError ? errorText(e.mapped, "L'action a échoué.") : "L'action a échoué." }
  } finally {
    busyId.value = null
  }
}

/** Un seul panneau ouvert à la fois : autre horaire, replanification, refus ou annulation. */
const panel = ref<{ id: string; kind: 'propose' | 'reschedule' | 'reject' | 'cancel' } | null>(null)
function open(v: VisitSummary, kind: 'propose' | 'reschedule' | 'reject' | 'cancel') {
  panel.value = { id: v.id, kind }
  actionError.value = null
  slotDate.value = ''
  slotTime.value = '10:00'
  reason.value = ''
}
const slots = visitTimeSlots()
function localIso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const todayIso = localIso(new Date())
const slotDate = ref('')
const slotTime = ref('10:00')
const reason = ref('')
const REASONS = ['Logement déjà loué', 'Créneau indisponible, proposez-en un autre', 'Logement en travaux']

function confirmSlot(v: VisitSummary) {
  run(v, () => visitsApi.confirm(v.id), 'Visite confirmée — le candidat est prévenu.')
}
function submitSlot(v: VisitSummary, kind: 'propose' | 'reschedule') {
  const err = validateVisitSlot(slotDate.value, slotTime.value)
  if (err) {
    actionError.value = { id: v.id, message: err }
    return
  }
  const iso = new Date(`${slotDate.value}T${slotTime.value}:00`).toISOString()
  // « Proposer un autre horaire » confirme directement à cette heure (confirmed_at) ; replanifier une visite déjà confirmée passe par /reschedule.
  run(v, () => (kind === 'propose' ? visitsApi.confirm(v.id, iso) : visitsApi.reschedule(v.id, iso)), 'Nouvel horaire enregistré — le candidat est prévenu.')
}
function submitReject(v: VisitSummary) {
  run(v, () => visitsApi.reject(v.id, reason.value.trim() || undefined), 'Demande refusée — le candidat est prévenu.')
}
function submitCancel(v: VisitSummary) {
  run(v, () => visitsApi.cancel(v.id), 'Visite annulée — le candidat est prévenu.')
}
function complete(v: VisitSummary) {
  run(v, () => visitsApi.complete(v.id), 'Visite marquée comme réalisée.')
}
async function contactTenant(v: VisitSummary) {
  const tenantId = v.tenant?.id ?? v.tenant_id
  if (!tenantId) return
  busyId.value = v.id
  actionError.value = null
  try {
    const conv = await messagingApi.openConversation(v.unit_id, tenantId)
    await navigateTo(`/pro/messages?conversation=${conv.id}`)
  } catch (e) {
    actionError.value = { id: v.id, message: e instanceof ApiRequestError ? errorText(e.mapped, "Impossible d'ouvrir la conversation.") : "Impossible d'ouvrir la conversation." }
  } finally {
    busyId.value = null
  }
}
</script>

<template>
  <div class="animate-[im-fade_.3s_ease_both]">
    <div class="mb-5 flex flex-wrap gap-1.5">
      <button
        v-for="t in TABS"
        :key="t.key"
        type="button"
        class="rounded-pill border px-4 py-2.5 text-[13px] font-bold transition-all"
        :class="tab === t.key ? 'border-green-900 bg-green-900 text-white' : 'border-[var(--border-default)] bg-white text-[var(--text-secondary)]'"
        @click="tab = t.key; doneNote = ''"
      >{{ t.label }}<span v-if="counts[t.key] && t.key !== 'history'" class="ml-1.5 rounded-pill px-1.5 text-[11px]" :class="tab === t.key ? 'bg-white/20' : t.key === 'todo' ? 'bg-clay-500 text-white' : 'bg-sand-200'">{{ counts[t.key] }}</span></button>
    </div>

    <div v-if="block.state.value === 'loading'" class="flex flex-col gap-3.5">
      <DataSkeletonCard v-for="i in 3" :key="i" :height="90" :lines="1" />
    </div>

    <FeedbackAlertBanner v-else-if="block.state.value === 'error'" tone="danger">
      Impossible de charger vos visites pour le moment.
      <button type="button" class="ml-2 font-bold underline" @click="block.load">Réessayer</button>
    </FeedbackAlertBanner>

    <template v-else>
      <p v-if="doneNote" class="mb-3.5 rounded-md border border-ok-border bg-ok-bg px-3.5 py-2.5 text-[13px] font-semibold text-green-900">{{ doneNote }}</p>
      <p v-if="!rows.length" class="rounded-md border border-dashed border-[var(--border-default)] bg-white px-4 py-10 text-center text-[13.5px] text-[var(--text-muted)]">{{ TABS.find(t => t.key === tab)?.empty }}</p>

      <div
        v-for="v in rows"
        :id="`visit-${v.id}`"
        :key="v.id"
        class="mb-3 rounded-xl border bg-white p-4.5"
        :class="highlighted === v.id ? 'border-green-600 shadow-raised' : 'border-[var(--border-subtle)]'"
      >
        <div class="flex flex-wrap items-center gap-4">
          <div class="flex h-15 w-15 flex-none flex-col items-center justify-center rounded-md bg-green-50">
            <span class="font-display text-lg font-extrabold leading-none text-green-800">{{ dayOf(visitDate(v)) }}</span>
            <span class="text-[10.5px] font-bold uppercase text-green-700">{{ monthOf(visitDate(v)) }}</span>
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2.5">
              <p class="m-0 text-[15px] font-bold">{{ tenantName(v) }}</p>
              <CoreBadge v-if="tab === 'history'" :tone="historyLabel(v).tone">{{ historyLabel(v).label }}</CoreBadge>
              <CoreBadge v-else-if="tab === 'todo'" tone="warn">Demande en attente</CoreBadge>
              <CoreBadge v-else-if="tab === 'upcoming'" tone="ok">Confirmée</CoreBadge>
              <CoreBadge v-else tone="neutral">Passée — à clôturer</CoreBadge>
            </div>
            <p class="mb-0 mt-1 text-[13px] text-[var(--text-secondary)]">{{ v.unit?.name ?? 'Logement supprimé' }}<template v-if="v.unit?.property?.name"> · {{ v.unit.property.name }}</template></p>
            <p class="mb-0 mt-0.5 text-[13px] text-[var(--text-muted)] first-letter:uppercase">{{ whenOf(visitDate(v)) }}</p>
            <p v-if="visitMoved(v)" class="mb-0 mt-0.5 text-[12px] text-[var(--text-faint)]">Demandée pour le <span>{{ whenOf(v.requested_at) }}</span></p>
            <p v-if="v.note" class="mb-0 mt-1.5 line-clamp-4 text-[12.5px] italic text-[var(--text-secondary)] [overflow-wrap:anywhere]">« {{ v.note }} »</p>
            <p v-if="v.status === 'rejected' && v.rejection_reason" class="mb-0 mt-1 text-[12.5px] text-danger-fg [overflow-wrap:anywhere]">Motif : {{ v.rejection_reason }}</p>
          </div>
          <div class="flex flex-none flex-wrap gap-2">
            <template v-if="tab === 'todo'">
              <CoreButton size="sm" :disabled="busyId === v.id" @click="confirmSlot(v)">Confirmer ce créneau</CoreButton>
              <CoreButton size="sm" tone="secondary" @click="open(v, 'propose')">Autre horaire</CoreButton>
              <CoreButton size="sm" tone="secondary" @click="open(v, 'reject')">Refuser</CoreButton>
            </template>
            <template v-else-if="tab === 'upcoming'">
              <CoreButton size="sm" tone="secondary" @click="open(v, 'reschedule')">Replanifier</CoreButton>
              <CoreButton size="sm" tone="secondary" @click="open(v, 'cancel')">Annuler</CoreButton>
            </template>
            <CoreButton v-else-if="tab === 'to_close' && canComplete(v)" size="sm" :disabled="busyId === v.id" @click="complete(v)">Marquer réalisée</CoreButton>
            <CoreButton v-if="tab !== 'history'" size="sm" tone="ghost" :disabled="busyId === v.id" @click="contactTenant(v)">Écrire</CoreButton>
            <!-- Suite naturelle d'une visite réussie (Lot 50) : le formulaire de bail arrive pré-rempli. -->
            <NuxtLink v-if="v.status === 'completed' && v.tenant_id && v.unit" :to="`/pro/baux/nouveau?tenantId=${v.tenant_id}&unitId=${v.unit_id}`" class="inline-flex items-center rounded-sm border border-[var(--border-default)] bg-white px-3 py-1.5 text-[12.5px] font-bold">Proposer un bail</NuxtLink>
          </div>
        </div>

        <!-- Autre horaire / replanifier -->
        <div v-if="panel?.id === v.id && (panel?.kind === 'propose' || panel?.kind === 'reschedule')" class="mt-3.5 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-page)] p-3.5">
          <p class="m-0 text-[13px] font-bold">{{ panel?.kind === 'propose' ? 'Confirmer à un autre horaire' : 'Nouvel horaire' }}</p>
          <div class="mt-2 flex flex-wrap items-end gap-2">
            <label class="text-[11.5px] font-bold">Date<input v-model="slotDate" type="date" :min="todayIso" class="mt-1 block h-10 rounded-sm border border-[var(--border-default)] bg-white px-2.5 text-[13px] font-normal outline-none"></label>
            <label class="text-[11.5px] font-bold">Heure
              <select v-model="slotTime" class="mt-1 block h-10 rounded-sm border border-[var(--border-default)] bg-white px-2.5 text-[13px] font-normal">
                <option v-for="s in slots" :key="s" :value="s">{{ s.replace(':', ' h ') }}</option>
              </select>
            </label>
            <CoreButton size="sm" :disabled="busyId === v.id" @click="submitSlot(v, panel?.kind === 'propose' ? 'propose' : 'reschedule')">{{ busyId === v.id ? '…' : 'Enregistrer et prévenir' }}</CoreButton>
            <CoreButton size="sm" tone="secondary" @click="panel = null">Annuler</CoreButton>
          </div>
        </div>

        <!-- Refus -->
        <div v-if="panel?.id === v.id && panel?.kind === 'reject'" class="mt-3.5 rounded-md border border-danger-border bg-danger-bg p-3.5">
          <p class="m-0 text-[13px] font-bold text-danger-fg-deep">Refuser la visite de {{ tenantName(v) }} ?</p>
          <div class="mt-2 flex flex-wrap gap-1.5">
            <button v-for="r in REASONS" :key="r" type="button" class="rounded-pill border border-danger-border bg-white px-3 py-1 text-[12px] font-semibold" @click="reason = r">{{ r }}</button>
          </div>
          <textarea v-model="reason" rows="2" maxlength="300" placeholder="Motif communiqué au candidat (conseillé)" class="mt-2 w-full resize-none rounded-sm border border-[var(--border-default)] bg-white p-2.5 text-[13px] outline-none" />
          <div class="mt-2 flex gap-2">
            <CoreButton size="sm" tone="danger" :disabled="busyId === v.id" @click="submitReject(v)">{{ busyId === v.id ? '…' : 'Refuser et prévenir' }}</CoreButton>
            <CoreButton size="sm" tone="secondary" @click="panel = null">Annuler</CoreButton>
          </div>
        </div>

        <!-- Annulation -->
        <div v-if="panel?.id === v.id && panel?.kind === 'cancel'" class="mt-3.5 flex flex-wrap items-center gap-2.5 rounded-md border border-warn-border bg-warn-bg px-3.5 py-2.5">
          <p class="m-0 flex-1 text-[13px] font-semibold text-warn-fg-deep">Annuler cette visite confirmée ? Le candidat sera prévenu.</p>
          <CoreButton size="sm" tone="danger" :disabled="busyId === v.id" @click="submitCancel(v)">{{ busyId === v.id ? '…' : 'Oui, annuler' }}</CoreButton>
          <CoreButton size="sm" tone="secondary" @click="panel = null">Non</CoreButton>
        </div>

        <p v-if="actionError?.id === v.id" class="mb-0 mt-2.5 text-[13px] font-semibold text-danger-fg">{{ actionError?.message }}</p>
      </div>
    </template>
  </div>
</template>
