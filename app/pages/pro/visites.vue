<script setup lang="ts">
import { CalendarCheck, CalendarClock, FileSignature, History, MessageCircle } from '@lucide/vue'
import type { VisitSummary } from '~/types/tenant'
import { ApiRequestError } from '~/utils/authenticatedFetcher'
import { errorText } from '~/utils/apiErrors'
import { canComplete, validateVisitSlot, visitBucket, visitDate, visitExpired, visitMoved, visitTimeSlots, type VisitBucket } from '~/utils/visits'

definePageMeta({ layout: 'pro' })

/**
 * Visites du propriétaire, rangées par étape. Onglet dans l'URL (`?tab=upcoming`),
 * visite mise en avant par `?visit=<id>` (lien des notifications), suivis même
 * quand on est déjà sur la page.
 */
const route = useRoute()
const router = useRouter()
const visitsApi = useVisitsApi()
const messagingApi = useMessagingApi()
const block = useFetchBlock(() => visitsApi.fetchMine('landlord'))
onMounted(block.load)

const TABS: { key: VisitBucket; label: string; empty: string }[] = [
  { key: 'todo', label: 'À traiter', empty: "Aucune demande de visite en attente : les candidats en font depuis vos annonces publiées." },
  { key: 'upcoming', label: 'À venir', empty: 'Aucune visite confirmée à venir.' },
  { key: 'to_close', label: 'À clôturer', empty: 'Aucune visite passée à clôturer.' },
  { key: 'history', label: 'Historique', empty: "Aucune visite dans l'historique pour l'instant." }
]
const EMPTY_ICON = { todo: CalendarClock, upcoming: CalendarCheck, to_close: CalendarCheck, history: History }
const counts = computed(() => {
  const c: Record<VisitBucket, number> = { todo: 0, upcoming: 0, to_close: 0, history: 0 }
  for (const v of block.items.value) c[visitBucket(v)]++
  return c
})
const tabOptions = computed(() => TABS.map(t => ({ value: t.key, label: counts.value[t.key] && t.key !== 'history' ? `${t.label} · ${counts.value[t.key]}` : t.label })))

const highlighted = computed(() => (typeof route.query.visit === 'string' ? route.query.visit : ''))
const highlightedVisit = computed(() => block.items.value.find(x => x.id === highlighted.value) ?? null)
/** Onglet de l'URL ; sinon celui de la visite du lien ; sinon le premier non vide. */
const tab = computed<VisitBucket>(() => {
  const q = route.query.tab
  if (TABS.some(t => t.key === q)) return q as VisitBucket
  if (highlightedVisit.value) return visitBucket(highlightedVisit.value)
  return (['todo', 'upcoming', 'to_close'] as VisitBucket[]).find(k => counts.value[k] > 0) ?? 'todo'
})
function setTab(v: string) {
  const { tab: _, ...rest } = route.query
  router.replace({ query: { ...rest, tab: v } })
  doneNote.value = ''
  panel.value = null
}
watch([highlighted, () => block.items.value], () => {
  if (highlightedVisit.value) nextTick(() => document.getElementById(`visit-${highlighted.value}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
})

const rows = computed(() => block.items.value
  .filter(v => visitBucket(v) === tab.value)
  .sort((a, b) => {
    const d = new Date(visitDate(a)).getTime() - new Date(visitDate(b)).getTime()
    return tab.value === 'history' ? -d : d
  }))

function whenOf(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
}
function dayOf(iso: string) { return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit' }) }
function monthOf(iso: string) { return new Date(iso).toLocaleDateString('fr-FR', { month: 'short' }) }
function tenantName(v: VisitSummary) {
  if (!v.tenant) return 'Candidat'
  return `${v.tenant.first_name ?? ''} ${v.tenant.last_name ?? ''}`.trim() || 'Candidat'
}
function statusBadge(v: VisitSummary): { label: string; tone: 'ok' | 'warn' | 'danger' | 'neutral' | 'info' } {
  const b = visitBucket(v)
  if (b === 'todo') return { label: 'Demande en attente', tone: 'warn' }
  if (b === 'upcoming') return { label: 'Confirmée', tone: 'ok' }
  if (b === 'to_close') return { label: 'Passée, à clôturer', tone: 'info' }
  if (visitExpired(v)) return { label: 'Restée sans réponse', tone: 'warn' }
  if (v.status === 'rejected') return { label: 'Refusée', tone: 'danger' }
  if (v.status === 'cancelled') return { label: v.cancelled_by === v.tenant_id ? 'Annulée par le candidat' : 'Annulée par vous', tone: 'neutral' }
  if (v.status === 'completed') return { label: 'Réalisée', tone: 'ok' }
  return { label: 'Statut inconnu', tone: 'neutral' }
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
    const status = e instanceof ApiRequestError ? e.status ?? 0 : 0
    if (status >= 500) {
      // L'API a déjà enregistré malgré une 5xx (#11) : on relit, on montre la visite là où elle est,
      // et on demande de vérifier avant de réessayer plutôt que d'inviter à recommencer.
      panel.value = null
      await block.load()
      const fresh = block.items.value.find(x => x.id === v.id)
      if (fresh && visitBucket(fresh) !== tab.value) setTab(visitBucket(fresh))
      actionError.value = { id: v.id, message: "Le serveur n'a pas confirmé l'action, mais elle a peut-être été enregistrée. La liste vient d'être rechargée : vérifiez l'état de la visite avant de réessayer." }
    } else {
      actionError.value = { id: v.id, message: e instanceof ApiRequestError ? errorText(e.mapped, "L'action a échoué.") : "L'action a échoué." }
    }
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
function isOpen(v: VisitSummary, kind: string) {
  return panel.value?.id === v.id && panel.value.kind === kind
}
const slots = visitTimeSlots()
function localIso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const todayIso = localIso(new Date())
const slotDate = ref('')
const slotTime = ref('10:00')
const reason = ref('')
const REASONS = ['Logement déjà loué', "Créneau indisponible, proposez-en un autre", 'Logement en travaux', 'Logement retiré de la location']

function confirmSlot(v: VisitSummary) {
  run(v, () => visitsApi.confirm(v.id), `Visite de ${tenantName(v)} confirmée : le candidat est prévenu.`)
}
function submitSlot(v: VisitSummary, kind: 'propose' | 'reschedule') {
  const err = validateVisitSlot(slotDate.value, slotTime.value)
  if (err) {
    actionError.value = { id: v.id, message: err }
    return
  }
  const iso = new Date(`${slotDate.value}T${slotTime.value}:00`).toISOString()
  // « Proposer un autre horaire » confirme directement à cette heure (confirmed_at) ; replanifier une visite déjà confirmée passe par /reschedule.
  run(v, () => (kind === 'propose' ? visitsApi.confirm(v.id, iso) : visitsApi.reschedule(v.id, iso)), `Nouvel horaire enregistré pour ${tenantName(v)} : le candidat est prévenu.`)
}
function submitReject(v: VisitSummary) {
  if (!reason.value.trim()) return
  run(v, () => visitsApi.reject(v.id, reason.value.trim()), `Demande de ${tenantName(v)} refusée : le candidat est prévenu, avec votre motif.`)
}
function submitCancel(v: VisitSummary) {
  run(v, () => visitsApi.cancel(v.id), `Visite de ${tenantName(v)} annulée : le candidat est prévenu.`)
}
function complete(v: VisitSummary) {
  run(v, () => visitsApi.complete(v.id), `Visite de ${tenantName(v)} marquée comme réalisée.`)
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
  <div class="animate-[im-fade_.3s_ease_backwards]">
    <div class="mb-4.5 max-w-full overflow-x-auto [&_button]:whitespace-nowrap">
      <FormsSegmentedControl :options="tabOptions" :model-value="tab" size="sm" @update:model-value="setTab" />
    </div>

    <div v-if="block.state.value === 'loading' || block.state.value === 'idle'" class="flex flex-col gap-3.5">
      <DataSkeletonCard v-for="i in 3" :key="i" :height="90" :lines="1" />
    </div>

    <FeedbackAlertBanner v-else-if="block.state.value === 'error'" tone="danger">
      Impossible de charger vos visites pour le moment.
      <button type="button" class="ml-2 font-bold underline" @click="block.load">Réessayer</button>
    </FeedbackAlertBanner>

    <template v-else>
      <p v-if="doneNote" class="mb-4.5 mt-0 rounded-md border border-ok-border bg-ok-bg px-3.5 py-2.5 text-[13px] font-semibold text-green-900">{{ doneNote }}</p>
      <div v-if="!rows.length" class="flex flex-col items-center rounded-2xl border border-dashed border-[var(--border-default)] bg-white px-4 py-10 text-center">
        <span class="grid h-[46px] w-[46px] place-items-center rounded-pill bg-green-50 text-green-700"><component :is="EMPTY_ICON[tab]" class="h-5 w-5" :stroke-width="1.9" /></span>
        <p class="mb-0 mt-3 max-w-[400px] text-[13.5px] text-[var(--text-muted)]">{{ TABS.find(t => t.key === tab)?.empty }}</p>
        <NuxtLink v-if="tab === 'todo'" to="/pro/biens" class="mt-4 rounded-pill border border-[var(--border-default)] bg-white px-4 py-[9px] text-[13px] font-bold text-sand-900">Voir mes biens</NuxtLink>
        <CoreButton v-else-if="tab !== 'history' && counts.todo" size="sm" tone="secondary" class="mt-4" @click="setTab('todo')">{{ counts.todo }} demande{{ counts.todo > 1 ? 's' : '' }} à traiter</CoreButton>
      </div>

      <div class="flex flex-col gap-3.5">
        <section
          v-for="v in rows"
          :id="`visit-${v.id}`"
          :key="v.id"
          class="rounded-2xl border bg-white px-5 py-4.5"
          :class="highlighted === v.id ? 'border-green-600 ring-2 ring-green-100' : 'border-[var(--border-subtle)]'"
        >
          <div class="flex flex-wrap items-center gap-4">
            <div class="flex h-[58px] w-[58px] flex-none flex-col items-center justify-center rounded-md bg-green-50">
              <span class="font-mono text-lg font-bold leading-none text-green-900">{{ dayOf(visitDate(v)) }}</span>
              <span class="mt-0.5 text-[10.5px] font-bold uppercase text-green-700">{{ monthOf(visitDate(v)) }}</span>
            </div>
            <div class="min-w-0 flex-[1_1_220px]">
              <div class="flex flex-wrap items-center gap-2.5">
                <p class="m-0 text-sm font-bold">{{ tenantName(v) }}</p>
                <CoreBadge :tone="statusBadge(v).tone">{{ statusBadge(v).label }}</CoreBadge>
              </div>
              <p class="mb-0 mt-1 text-[13.5px] text-[var(--text-muted)]">{{ v.unit?.name ?? 'Logement supprimé' }}<template v-if="v.unit?.property?.name"> · {{ v.unit.property.name }}</template></p>
              <p class="mb-0 mt-0.5 text-xs text-[var(--text-faint)] first-letter:uppercase">{{ whenOf(visitDate(v)) }}<template v-if="visitMoved(v)"> · demandée pour le {{ whenOf(v.requested_at) }}</template></p>
              <p v-if="v.note" class="mb-0 mt-1.5 line-clamp-4 text-[13px] italic text-[var(--text-secondary)] [overflow-wrap:anywhere]">« {{ v.note }} »</p>
              <p v-if="v.status === 'rejected' && v.rejection_reason" class="mb-0 mt-1 text-[13px] text-danger-fg [overflow-wrap:anywhere]">Motif : {{ v.rejection_reason }}</p>
            </div>
            <div class="flex flex-wrap gap-2">
              <template v-if="tab === 'todo'">
                <CoreButton size="sm" :disabled="busyId === v.id" @click="confirmSlot(v)">Confirmer ce créneau</CoreButton>
                <CoreButton size="sm" tone="secondary" @click="open(v, 'propose')">Autre horaire</CoreButton>
                <CoreButton size="sm" tone="ghost" @click="open(v, 'reject')">Refuser</CoreButton>
              </template>
              <template v-else-if="tab === 'upcoming'">
                <CoreButton size="sm" tone="secondary" @click="open(v, 'reschedule')">Replanifier</CoreButton>
                <CoreButton size="sm" tone="ghost" @click="open(v, 'cancel')">Annuler</CoreButton>
              </template>
              <CoreButton v-else-if="tab === 'to_close' && canComplete(v)" size="sm" :disabled="busyId === v.id" @click="complete(v)">Marquer réalisée</CoreButton>
              <CoreButton v-if="tab !== 'history'" size="sm" tone="ghost" :disabled="busyId === v.id" @click="contactTenant(v)">
                <span class="inline-flex items-center gap-1.5"><MessageCircle class="h-4 w-4" :stroke-width="1.9" />Écrire</span>
              </CoreButton>
              <!-- Suite naturelle d'une visite réussie (Lot 50) : le formulaire de bail arrive pré-rempli. -->
              <NuxtLink v-if="v.status === 'completed' && v.tenant_id && v.unit" :to="`/pro/baux/nouveau?tenantId=${v.tenant_id}&unitId=${v.unit_id}`" class="inline-flex items-center gap-1.5 rounded-pill border border-green-600 bg-white px-4 py-[9px] text-[13px] font-bold text-green-700">
                <FileSignature class="h-4 w-4" :stroke-width="1.9" />Proposer un bail
              </NuxtLink>
            </div>
          </div>

          <!-- Autre horaire / replanifier -->
          <div v-if="isOpen(v, 'propose') || isOpen(v, 'reschedule')" class="mt-3.5 rounded-md border border-[var(--border-default)] bg-[var(--surface-page)] p-3.5">
            <p class="m-0 text-[13px] font-bold">{{ isOpen(v, 'propose') ? 'Confirmer à un autre horaire' : 'Nouvel horaire' }}</p>
            <div class="mt-2.5 flex flex-wrap items-end gap-2">
              <label class="block">
                <span class="mb-1 block text-[12px] font-bold">Date</span>
                <input v-model="slotDate" type="date" :min="todayIso" class="h-[42px] rounded-md border border-[var(--border-default)] bg-white px-3 text-[13px] outline-none">
              </label>
              <label class="block">
                <span class="mb-1 block text-[12px] font-bold">Heure</span>
                <select v-model="slotTime" class="h-[42px] rounded-md border border-[var(--border-default)] bg-white px-3 text-[13px]">
                  <option v-for="s in slots" :key="s" :value="s">{{ s.replace(':', ' h ') }}</option>
                </select>
              </label>
              <CoreButton size="sm" :disabled="busyId === v.id" @click="submitSlot(v, isOpen(v, 'propose') ? 'propose' : 'reschedule')">{{ busyId === v.id ? '…' : 'Enregistrer et prévenir' }}</CoreButton>
              <CoreButton size="sm" tone="secondary" @click="panel = null">Annuler</CoreButton>
            </div>
          </div>

          <!-- Refus : motif obligatoire, transmis au candidat -->
          <CoreInlineConfirm
            v-if="isOpen(v, 'reject')"
            class="mt-3.5"
            tone="danger"
            :message="`Refuser la visite de ${tenantName(v)} ? Le candidat est prévenu avec votre motif.`"
            confirm-label="Refuser"
            :loading="busyId === v.id"
            :disabled="!reason.trim()"
            @confirm="submitReject(v)"
            @cancel="panel = null"
          >
            <div class="mb-2 flex flex-wrap gap-1.5">
              <button
                v-for="r in REASONS"
                :key="r"
                type="button"
                class="rounded-pill border px-3 py-1.5 text-[12.5px] font-semibold"
                :class="reason === r ? 'border-danger-fg bg-white text-danger-fg' : 'border-danger-border bg-white text-[var(--text-secondary)]'"
                :aria-pressed="reason === r"
                @click="reason = r"
              >{{ r }}</button>
            </div>
            <textarea v-model="reason" rows="2" maxlength="300" placeholder="Motif communiqué au candidat (obligatoire)" aria-label="Motif du refus" class="w-full resize-none rounded-sm border border-[var(--border-default)] bg-white p-2.5 text-[13px] outline-none" />
          </CoreInlineConfirm>

          <!-- Annulation -->
          <CoreInlineConfirm
            v-if="isOpen(v, 'cancel')"
            class="mt-3.5"
            tone="danger"
            :message="`Annuler la visite confirmée de ${tenantName(v)} ? Le candidat est prévenu ; il devra en redemander une.`"
            confirm-label="Annuler la visite"
            cancel-label="Garder"
            :loading="busyId === v.id"
            @confirm="submitCancel(v)"
            @cancel="panel = null"
          />

          <p v-if="actionError?.id === v.id" class="mb-0 mt-2.5 text-[13px] font-semibold text-danger-fg">{{ actionError.message }}</p>
        </section>
      </div>
    </template>
  </div>
</template>
