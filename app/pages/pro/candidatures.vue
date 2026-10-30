<script setup lang="ts">
import { CalendarCheck, FileSignature, Inbox, MessageCircle, UserCheck } from '@lucide/vue'
import type { LeaseSummary, RentalRequestSummary, VisitSummary } from '~/types/tenant'
import { ApiRequestError } from '~/utils/authenticatedFetcher'
import { errorText } from '~/utils/apiErrors'
import { leasePhase, LEASE_PHASE_LABEL } from '~/utils/leases'
import { visitDate } from '~/utils/visits'
import { acceptancePreview, CANDIDATURE_LABEL, CANDIDATURE_TONE, conflictingLease, draftLeaseFor, groupByUnit, leaseStartIfAccepted, visitOf } from '~/utils/rentalRequests'

definePageMeta({ layout: 'pro' })

/**
 * Candidatures reçues. Onglet dans l'URL (`?tab=done`) ; `?request=<id>` met une
 * candidature en avant, suivi même quand on est déjà sur la page.
 */
const route = useRoute()
const router = useRouter()
const rentalApi = useRentalRequestsApi()
const leasesApi = useLeasesApi()
const visitsApi = useVisitsApi()
const messagingApi = useMessagingApi()

const requests = ref<RentalRequestSummary[]>([])
const leases = ref<LeaseSummary[]>([])
const visits = ref<VisitSummary[]>([])
const state = ref<'loading' | 'error' | 'ready'>('loading')
const highlight = computed(() => (typeof route.query.request === 'string' ? route.query.request : null))

function localIso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const todayIso = localIso(new Date())

async function load() {
  if (!requests.value.length) state.value = 'loading'
  try {
    const [r, l, v] = await Promise.all([
      rentalApi.fetchMine('landlord'),
      leasesApi.fetchMine().catch(() => [] as LeaseSummary[]),
      visitsApi.fetchMine('landlord').catch(() => [] as VisitSummary[])
    ])
    requests.value = r
    leases.value = l
    visits.value = v
    state.value = 'ready'
  } catch {
    state.value = 'error'
  }
}
onMounted(load)

/** Onglet de l'URL ; sinon celui de la candidature du lien. */
const tab = computed<'todo' | 'done'>(() => {
  if (route.query.tab === 'done' || route.query.tab === 'todo') return route.query.tab
  const target = highlight.value ? requests.value.find(r => r.id === highlight.value) : null
  return target && target.status !== 'pending' ? 'done' : 'todo'
})
function setTab(v: string) {
  const { tab: _, ...rest } = route.query
  router.replace({ query: v === 'done' ? { ...rest, tab: 'done' } : rest })
  actionError.value = ''
}
watch([highlight, state], () => {
  if (highlight.value && state.value === 'ready') nextTick(() => document.getElementById(`request-${highlight.value}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }))
})

const pendingGroups = computed(() => groupByUnit(requests.value.filter(r => r.status === 'pending')))
const done = computed(() => requests.value.filter(r => r.status !== 'pending').sort((a, b) => (b.responded_at ?? '').localeCompare(a.responded_at ?? '')))
const pendingCount = computed(() => requests.value.filter(r => r.status === 'pending').length)
const tabOptions = computed(() => [
  { value: 'todo', label: pendingCount.value ? `À traiter · ${pendingCount.value}` : 'À traiter' },
  { value: 'done', label: done.value.length ? `Traitées · ${done.value.length}` : 'Traitées' }
])

function name(r: RentalRequestSummary) {
  return `${r.tenant?.first_name ?? ''} ${r.tenant?.last_name ?? ''}`.trim() || r.tenant?.email || 'Candidat'
}
function formatDate(iso: string | null | undefined) {
  if (!iso) return ''
  return new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}
function visitLine(r: RentalRequestSummary): { text: string; tone: 'ok' | 'warn' | 'neutral' } {
  const v = visitOf(visits.value, r.tenant_id, r.unit_id)
  if (!v) return { text: 'Pas de visite de ce logement', tone: 'neutral' }
  const when = formatDate(visitDate(v))
  if (v.status === 'completed') return { text: `A visité le ${when}`, tone: 'ok' }
  if (v.status === 'confirmed') return { text: `Visite prévue le ${when}`, tone: 'warn' }
  return { text: 'Visite demandée, pas encore confirmée', tone: 'neutral' }
}
/** Bail qui empêche de retenir un candidat sur ce logement (voir `conflictingLease`), avec son libellé. */
function conflictFor(r: Pick<RentalRequestSummary, 'unit_id' | 'desired_move_in_at'>): { id: string; label: string } | null {
  const l = conflictingLease(leases.value, r.unit_id, leaseStartIfAccepted(r, todayIso).date)
  return l ? { id: l.id, label: LEASE_PHASE_LABEL[leasePhase(l)].toLowerCase() } : null
}

/* ---- Accepter ---- */
const accepting = ref<RentalRequestSummary | null>(null)
const busy = ref(false)
const actionError = ref('')
const others = computed(() => (accepting.value ? requests.value.filter(r => r.unit_id === accepting.value!.unit_id && r.status === 'pending' && r.id !== accepting.value!.id).length : 0))
const acceptPreview = computed(() => (accepting.value?.unit ? acceptancePreview(accepting.value.unit) : null))
const acceptStart = computed(() => (accepting.value ? leaseStartIfAccepted(accepting.value, todayIso) : null))
async function confirmAccept() {
  const r = accepting.value
  if (!r) return
  busy.value = true
  actionError.value = ''
  try {
    await rentalApi.accept(r.id)
    // L'API ne renvoie pas l'id du bail préparé : on le retrouve parmi les baux.
    const fresh = await leasesApi.fetchMine()
    const lease = draftLeaseFor(fresh, r.unit_id, r.tenant_id)
    accepting.value = null
    if (lease) await navigateTo(`/pro/baux/${lease.id}`)
    else {
      flash.value = `${name(r)} est retenu : le bail brouillon est dans Baux, à relire puis envoyer.`
      await load()
    }
  } catch (e) {
    actionError.value = e instanceof ApiRequestError
      ? (e.status === 409 ? 'Ce logement vient d\'être attribué : rechargez la page.' : errorText(e.mapped, "La candidature n'a pas pu être acceptée."))
      : "La candidature n'a pas pu être acceptée."
  } finally {
    busy.value = false
  }
}

/*
 * ---- Refuser ----
 * L'API ne prévient pas le candidat d'un refus : on lui écrit d'abord dans la
 * conversation (archivée au refus), motif obligatoire. Le message est mémorisé
 * une fois parti : si l'enregistrement du refus échoue, un nouvel essai ne le
 * renvoie pas en double.
 */
const REJECT_REASONS = [
  'Le logement a été attribué à un autre candidat.',
  "La date d'emménagement souhaitée ne correspond pas.",
  "Le logement n'est plus proposé à la location."
]
const rejecting = ref<RentalRequestSummary | null>(null)
const rejectMessage = ref('')
const rejectInitial = ref('')
const rejectReason = ref('')
/** Candidatures dont le message de refus est déjà parti (session en cours). */
const messageSent = ref<Record<string, boolean>>({})
function rejectText(r: RentalRequestSummary, reason: string) {
  const hello = r.tenant?.first_name ? `Bonjour ${r.tenant.first_name},` : 'Bonjour,'
  return `${hello} merci pour votre candidature pour ${r.unit?.name ?? 'ce logement'}. ${reason ? `${reason} ` : ''}Je ne peux malheureusement pas y donner suite.`
}
function openReject(r: RentalRequestSummary) {
  rejecting.value = r
  rejectReason.value = ''
  rejectMessage.value = ''
  rejectInitial.value = ''
  actionError.value = ''
}
function pickReason(reason: string) {
  if (!rejecting.value) return
  rejectReason.value = reason
  rejectMessage.value = rejectText(rejecting.value, reason)
}
const rejectNeedsMessage = computed(() => !!rejecting.value?.conversation_id && !messageSent.value[rejecting.value.id])
const canReject = computed(() => !rejectNeedsMessage.value || rejectMessage.value.trim().length > 0)
async function confirmReject() {
  const r = rejecting.value
  if (!r || !canReject.value) return
  busy.value = true
  actionError.value = ''
  try {
    if (r.conversation_id && !messageSent.value[r.id]) {
      await messagingApi.sendMessage(r.conversation_id, rejectMessage.value.trim())
      messageSent.value = { ...messageSent.value, [r.id]: true }
    }
    await rentalApi.reject(r.id)
    rejecting.value = null
    flash.value = `Candidature de ${name(r)} refusée${r.conversation_id ? ' : votre message lui a été envoyé' : ''}.`
    await load()
  } catch (e) {
    const base = e instanceof ApiRequestError ? errorText(e.mapped, "La candidature n'a pas pu être refusée.") : "La candidature n'a pas pu être refusée."
    actionError.value = messageSent.value[r.id] ? `${base} Votre message est bien parti : réessayer n'enregistre que le refus.` : base
  } finally {
    busy.value = false
  }
}
const flash = ref('')

function leaseLinkFor(r: RentalRequestSummary) {
  const l = draftLeaseFor(leases.value, r.unit_id, r.tenant_id)
  return l ? `/pro/baux/${l.id}` : null
}
/** Brouillon jamais envoyé : l'action la plus importante en attente côté propriétaire — le signaler plutôt
 * que de le laisser se fondre dans la liste des candidatures traitées (amélioration UX, tâche 4). */
function leaseNeedsSending(r: RentalRequestSummary): boolean {
  const l = draftLeaseFor(leases.value, r.unit_id, r.tenant_id)
  return !!l && leasePhase(l) === 'draft'
}
</script>

<template>
  <div class="animate-[im-fade_.3s_ease_backwards]">
    <div v-if="state === 'loading'" class="flex flex-col gap-4.5">
      <DataSkeletonCard v-for="i in 2" :key="i" :height="140" :lines="1" />
    </div>
    <FeedbackAlertBanner v-else-if="state === 'error'" tone="danger">
      Impossible de charger les candidatures pour le moment.
      <button type="button" class="ml-2 font-bold underline" @click="load">Réessayer</button>
    </FeedbackAlertBanner>
    <div v-else-if="!requests.length" class="flex flex-col items-center rounded-2xl border border-dashed border-[var(--border-default)] bg-white px-4 py-10 text-center">
      <span class="grid h-[46px] w-[46px] place-items-center rounded-pill bg-green-50 text-green-700"><Inbox class="h-5 w-5" :stroke-width="1.9" /></span>
      <p class="mb-0 mt-3 text-[15px] font-bold">Aucune candidature pour l'instant</p>
      <p class="mx-auto mb-0 mt-1.5 max-w-[440px] text-[13.5px] text-[var(--text-muted)]">Les locataires vérifiés candidatent depuis l'annonce d'un logement au mois. En retenant un candidat, vous obtenez un bail prêt à relire et à envoyer.</p>
      <NuxtLink to="/pro/biens" class="mt-4 rounded-pill border border-[var(--border-default)] bg-white px-4 py-[9px] text-[13px] font-bold text-sand-900">Voir mes biens</NuxtLink>
    </div>

    <template v-else>
      <div class="mb-4.5 max-w-full overflow-x-auto [&_button]:whitespace-nowrap">
        <FormsSegmentedControl :options="tabOptions" :model-value="tab" size="sm" @update:model-value="setTab" />
      </div>
      <p v-if="flash" class="mb-4.5 mt-0 rounded-md border border-ok-border bg-ok-bg px-3.5 py-2.5 text-[13px] font-semibold text-green-900">{{ flash }}</p>
      <p v-if="actionError && !accepting && !rejecting" class="mb-4.5 mt-0 rounded-md border border-danger-border bg-danger-bg px-3.5 py-2.5 text-[13px] font-semibold text-danger-fg">{{ actionError }}</p>

      <template v-if="tab === 'todo'">
        <div v-if="!pendingGroups.length" class="flex flex-col items-center rounded-2xl border border-dashed border-[var(--border-default)] bg-white px-4 py-10 text-center">
          <span class="grid h-[46px] w-[46px] place-items-center rounded-pill bg-green-50 text-green-700"><UserCheck class="h-5 w-5" :stroke-width="1.9" /></span>
          <p class="mb-0 mt-3 max-w-[380px] text-[13.5px] text-[var(--text-muted)]">Aucune candidature en attente : tout est traité.</p>
          <CoreButton v-if="done.length" size="sm" tone="secondary" class="mt-4" @click="setTab('done')">Voir les candidatures traitées</CoreButton>
        </div>
        <div class="flex flex-col gap-4.5">
          <section v-for="g in pendingGroups" :key="g.unitId" class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
            <div class="flex flex-wrap items-baseline justify-between gap-2">
              <h2 class="m-0 text-[15px] font-bold">{{ g.unit?.name ?? 'Logement supprimé' }}<template v-if="g.unit?.property?.name"> — {{ g.unit.property.name }}</template></h2>
              <p class="m-0 text-xs text-[var(--text-faint)]">{{ g.pending }} candidat{{ g.pending > 1 ? 's' : '' }}<template v-if="g.unit"> · <span class="font-mono">{{ formatFcfa(Number(g.unit.price)) }}</span> / mois</template></p>
            </div>
            <div v-if="conflictFor({ unit_id: g.unitId, desired_move_in_at: null })" class="mt-3 rounded-md border border-warn-border bg-warn-bg p-3.5 text-[13px] leading-[1.55] text-warn-fg-deep">
              Un bail existe déjà sur ce logement ({{ conflictFor({ unit_id: g.unitId, desired_move_in_at: null })?.label }}). Retenir un candidat en créerait un second sur la même période<template v-if="g.requests.some(r => !conflictFor(r))"> — sauf pour un emménagement après le départ du locataire actuel</template>.
              <NuxtLink :to="`/pro/baux/${conflictFor({ unit_id: g.unitId, desired_move_in_at: null })?.id}`" class="font-bold underline">Voir ce bail</NuxtLink>
            </div>

            <div
              v-for="r in g.requests"
              :id="`request-${r.id}`"
              :key="r.id"
              class="border-b border-sand-200 py-4 last:border-b-0 last:pb-0"
              :class="r.id === highlight ? '-mx-2.5 rounded-md bg-green-50 px-2.5' : ''"
            >
              <div class="flex flex-wrap items-center gap-2.5">
                <CoreAvatar :name="name(r)" :size="36" />
                <div class="min-w-0 flex-[1_1_180px]">
                  <p class="m-0 text-sm font-bold">{{ name(r) }}</p>
                  <p class="mb-0 mt-0.5 text-xs text-[var(--text-faint)] [overflow-wrap:anywhere]">
                    Candidature du <span class="font-mono">{{ formatDate(r.created_at) }}</span>
                    <template v-if="r.tenant?.email"> · {{ r.tenant.email }}</template>
                    <template v-if="r.tenant?.phone_number"> · <span class="font-mono">{{ r.tenant.phone_number }}</span></template>
                  </p>
                </div>
                <div class="flex flex-wrap gap-1.5">
                  <CoreBadge v-if="r.tenant?.is_verified" tone="ok">Identité vérifiée</CoreBadge>
                  <CoreBadge v-if="r.tenant?.profile?.trust_badge" tone="ok">Badge de confiance</CoreBadge>
                  <CoreBadge v-if="r.tenant?.profile" tone="neutral">Note <span class="font-mono">{{ r.tenant.profile.reputation_score }}</span>/5</CoreBadge>
                </div>
              </div>
              <p class="mb-0 mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
                <span class="inline-flex items-center gap-1.5 font-semibold" :class="visitLine(r).tone === 'ok' ? 'text-ok-fg' : visitLine(r).tone === 'warn' ? 'text-warn-fg' : 'text-[var(--text-muted)]'">
                  <CalendarCheck class="h-4 w-4" :stroke-width="1.9" />{{ visitLine(r).text }}
                </span>
                <span v-if="r.desired_move_in_at" class="text-[var(--text-muted)]">Emménagement souhaité le <span class="font-mono">{{ formatDate(r.desired_move_in_at) }}</span></span>
              </p>
              <p v-if="r.message" class="mb-0 mt-2.5 rounded-md bg-[var(--surface-page)] p-3 text-[13.5px] leading-[1.55] text-[var(--text-secondary)] [overflow-wrap:anywhere]">« {{ r.message }} »</p>
              <div class="mt-3 flex flex-wrap gap-2">
                <CoreButton size="sm" :disabled="!!conflictFor(r) || !r.unit" @click="accepting = r; actionError = ''">Retenir ce candidat</CoreButton>
                <NuxtLink v-if="r.conversation_id" :to="`/pro/messages?conversation=${r.conversation_id}`" class="inline-flex items-center gap-1.5 rounded-pill border border-[var(--border-default)] bg-white px-4 py-[9px] text-[13px] font-bold text-sand-900">
                  <MessageCircle class="h-4 w-4" :stroke-width="1.9" />Écrire
                </NuxtLink>
                <CoreButton size="sm" tone="ghost" @click="openReject(r)">Refuser</CoreButton>
              </div>
            </div>
          </section>
        </div>
      </template>

      <template v-else>
        <div v-if="!done.length" class="flex flex-col items-center rounded-2xl border border-dashed border-[var(--border-default)] bg-white px-4 py-10 text-center">
          <span class="grid h-[46px] w-[46px] place-items-center rounded-pill bg-green-50 text-green-700"><Inbox class="h-5 w-5" :stroke-width="1.9" /></span>
          <p class="mb-0 mt-3 max-w-[380px] text-[13.5px] text-[var(--text-muted)]">Aucune candidature traitée pour l'instant : celles que vous retenez ou refusez apparaîtront ici.</p>
        </div>
        <section v-else class="rounded-2xl border border-[var(--border-subtle)] bg-white px-5.5 py-2">
          <div v-for="r in done" :id="`request-${r.id}`" :key="r.id" class="flex flex-wrap items-center gap-3 border-b border-sand-200 py-3 last:border-b-0" :class="r.id === highlight ? '-mx-2.5 rounded-md bg-green-50 px-2.5' : ''">
            <CoreAvatar :name="name(r)" :size="34" />
            <div class="min-w-0 flex-[1_1_200px]">
              <p class="m-0 text-sm font-bold">{{ name(r) }} <span class="font-normal text-[var(--text-muted)]">· {{ r.unit?.name ?? 'logement supprimé' }}</span></p>
              <p class="mb-0 mt-0.5 text-xs text-[var(--text-faint)]">{{ CANDIDATURE_LABEL[r.status] }}<template v-if="r.responded_at"> le <span class="font-mono">{{ formatDate(r.responded_at) }}</span></template></p>
            </div>
            <CoreBadge v-if="r.status === 'accepted' && leaseNeedsSending(r)" tone="warn">Bail à envoyer</CoreBadge>
            <CoreBadge v-else :tone="CANDIDATURE_TONE[r.status]">{{ CANDIDATURE_LABEL[r.status] }}</CoreBadge>
            <NuxtLink v-if="r.status === 'accepted' && leaseLinkFor(r)" :to="leaseLinkFor(r) ?? ''" class="inline-flex items-center gap-1 text-[12.5px] font-bold text-green-700">
              <FileSignature class="h-4 w-4" :stroke-width="1.9" />{{ leaseNeedsSending(r) ? 'Relire et envoyer' : 'Voir le bail' }}
            </NuxtLink>
          </div>
        </section>
      </template>
    </template>

    <!-- Retenir : récapitulatif avant l'action définitive -->
    <CoreModal :open="!!(accepting && acceptPreview && acceptStart)" :title="accepting ? `Retenir ${name(accepting)} ?` : ''" width="500px" @close="accepting = null">
      <template v-if="accepting && acceptPreview && acceptStart">
        <ul class="m-0 list-disc space-y-1.5 pl-5 text-[13.5px] leading-[1.55] text-[var(--text-secondary)]">
          <li>Un <strong>bail brouillon</strong> est préparé ; vous le relisez puis l'envoyez pour signature.</li>
          <li>Le logement est <strong>bloqué dans votre calendrier</strong> à partir du {{ formatDate(acceptStart.date) }} ; il ne sera marqué <strong>loué</strong> qu'une fois le bail signé et le paiement d'entrée reçu.</li>
          <li v-if="others">{{ others > 1 ? `Les ${others} autres candidatures en attente sont refusées` : "L'autre candidature en attente est refusée" }} ; leurs auteurs sont prévenus.</li>
          <li>C'est définitif : l'application ne permet pas de revenir en arrière.</li>
        </ul>
        <div class="mt-4 rounded-md border border-[var(--border-default)] bg-white px-4 py-3">
          <DataMoneyLine label="Loyer mensuel" :value="formatFcfa(acceptPreview.rent)" />
          <DataMoneyLine :label="`Caution (${acceptPreview.depositMonths} mois)`" :value="formatFcfa(acceptPreview.deposit)" />
          <DataMoneyLine v-if="acceptPreview.advance" :label="`Avance (${acceptPreview.advanceMonths} mois)`" :value="formatFcfa(acceptPreview.advance)" />
          <DataMoneyLine label="Début du bail" :value="formatDate(acceptStart.date)" total />
        </div>
        <p v-if="acceptStart.past" class="mb-0 mt-2.5 rounded-md border border-warn-border bg-warn-bg px-3.5 py-2.5 text-[13px] text-warn-fg-deep">La date souhaitée par le candidat est passée : modifiez la date de début dans le brouillon avant de l'envoyer.</p>
        <p v-if="acceptPreview.prepaidIgnored" class="mb-0 mt-2.5 text-xs text-[var(--text-faint)]">Les loyers prépayés prévus sur le logement ne sont pas repris dans ce brouillon.</p>
        <p v-if="actionError" class="mb-0 mt-3 text-[13px] font-semibold text-danger-fg">{{ actionError }}</p>
      </template>
      <template #footer>
        <div class="flex flex-wrap justify-end gap-2.5">
          <CoreButton tone="secondary" @click="accepting = null">Annuler</CoreButton>
          <CoreButton :disabled="busy" @click="confirmAccept">{{ busy ? 'Préparation…' : 'Retenir et préparer le bail' }}</CoreButton>
        </div>
      </template>
    </CoreModal>

    <!-- Refuser : motif obligatoire, envoyé dans la conversation -->
    <CoreModal :open="!!rejecting" :title="rejecting ? `Refuser la candidature de ${name(rejecting)} ?` : ''" width="500px" :dirty="rejectMessage !== rejectInitial" @close="rejecting = null">
      <template v-if="rejecting">
        <template v-if="messageSent[rejecting.id]">
          <p class="m-0 rounded-md border border-ok-border bg-ok-bg px-3.5 py-2.5 text-[13px] font-semibold text-green-900">Votre message est déjà parti. Il reste à enregistrer le refus.</p>
        </template>
        <template v-else-if="rejecting.conversation_id">
          <p class="m-0 text-[13.5px] leading-[1.6] text-[var(--text-muted)]">L'application ne prévient pas le candidat d'un refus : ce message lui est envoyé dans votre conversation, qui est ensuite archivée.</p>
          <p class="mb-2 mt-4 text-[12.5px] font-bold">Motif</p>
          <div class="flex flex-wrap gap-1.5">
            <button
              v-for="reason in REJECT_REASONS"
              :key="reason"
              type="button"
              class="rounded-pill border px-3 py-1.5 text-left text-[12.5px] font-semibold"
              :class="rejectReason === reason ? 'border-green-600 bg-green-50 text-green-800' : 'border-[var(--border-default)] bg-white text-[var(--text-secondary)]'"
              :aria-pressed="rejectReason === reason"
              @click="pickReason(reason)"
            >{{ reason }}</button>
          </div>
          <label class="mt-3.5 block">
            <span class="mb-[7px] block text-[12.5px] font-bold">Message au candidat</span>
            <textarea v-model="rejectMessage" rows="4" maxlength="1000" placeholder="Choisissez un motif ci-dessus, ou écrivez le vôtre." class="w-full resize-none rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] p-3 text-sm outline-none" />
            <span class="mt-[7px] block text-[12.5px] text-[var(--text-faint)]">Obligatoire : le candidat saura pourquoi sa candidature n'est pas retenue.</span>
          </label>
        </template>
        <p v-else class="m-0 text-[13.5px] leading-[1.6] text-[var(--text-muted)]">Aucune conversation n'est ouverte avec ce candidat : l'application ne pourra pas lui envoyer de message, et ne le prévient pas d'un refus.</p>
        <p v-if="actionError" class="mb-0 mt-3 text-[13px] font-semibold text-danger-fg">{{ actionError }}</p>
      </template>
      <template #footer>
        <div class="flex flex-wrap justify-end gap-2.5">
          <CoreButton tone="secondary" @click="rejecting = null">Annuler</CoreButton>
          <CoreButton tone="danger" :disabled="busy || !canReject" @click="confirmReject">{{ busy ? 'Envoi…' : rejectNeedsMessage ? 'Envoyer et refuser' : 'Refuser' }}</CoreButton>
        </div>
      </template>
    </CoreModal>
  </div>
</template>
