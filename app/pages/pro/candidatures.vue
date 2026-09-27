<script setup lang="ts">
import type { LeaseSummary, RentalRequestSummary, VisitSummary } from '~/types/tenant'
import { ApiRequestError } from '~/utils/authenticatedFetcher'
import { errorText } from '~/utils/apiErrors'
import { leasePhase, LEASE_PHASE_LABEL } from '~/utils/leases'
import { visitDate } from '~/utils/visits'
import { acceptancePreview, CANDIDATURE_LABEL, CANDIDATURE_TONE, conflictingLease, draftLeaseFor, groupByUnit, leaseStartIfAccepted, visitOf } from '~/utils/rentalRequests'

definePageMeta({ layout: 'pro' })

const route = useRoute()
const rentalApi = useRentalRequestsApi()
const leasesApi = useLeasesApi()
const visitsApi = useVisitsApi()
const messagingApi = useMessagingApi()

const requests = ref<RentalRequestSummary[]>([])
const leases = ref<LeaseSummary[]>([])
const visits = ref<VisitSummary[]>([])
const state = ref<'loading' | 'error' | 'ready'>('loading')
const highlight = typeof route.query.request === 'string' ? route.query.request : null

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
onMounted(async () => {
  await load()
  if (highlight) {
    if (requests.value.find(r => r.id === highlight)?.status !== 'pending') tab.value = 'done'
    nextTick(() => document.getElementById(`request-${highlight}`)?.scrollIntoView({ block: 'center' }))
  }
})

const tab = ref<'todo' | 'done'>('todo')
const pendingGroups = computed(() => groupByUnit(requests.value.filter(r => r.status === 'pending')))
const done = computed(() => requests.value.filter(r => r.status !== 'pending').sort((a, b) => (b.responded_at ?? '').localeCompare(a.responded_at ?? '')))

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
    else await load()
  } catch (e) {
    actionError.value = e instanceof ApiRequestError
      ? (e.status === 409 ? 'Ce logement vient d\'être attribué : rechargez la page.' : errorText(e.mapped, "La candidature n'a pas pu être acceptée."))
      : "La candidature n'a pas pu être acceptée."
  } finally {
    busy.value = false
  }
}

/* ---- Refuser : l'API ne prévient pas le candidat, on lui écrit avant (la conversation est archivée au refus) ---- */
const rejecting = ref<RentalRequestSummary | null>(null)
const rejectMessage = ref('')
function openReject(r: RentalRequestSummary) {
  rejecting.value = r
  rejectMessage.value = `Bonjour ${r.tenant?.first_name ?? ''}, merci pour votre candidature pour ${r.unit?.name ?? 'ce logement'}. Je ne peux malheureusement pas y donner suite.`.replace('Bonjour ,', 'Bonjour,')
  actionError.value = ''
}
async function confirmReject() {
  const r = rejecting.value
  if (!r) return
  busy.value = true
  actionError.value = ''
  try {
    if (rejectMessage.value.trim() && r.conversation_id) await messagingApi.sendMessage(r.conversation_id, rejectMessage.value.trim())
    await rentalApi.reject(r.id)
    rejecting.value = null
    await load()
  } catch (e) {
    actionError.value = e instanceof ApiRequestError ? errorText(e.mapped, "La candidature n'a pas pu être refusée.") : "La candidature n'a pas pu être refusée."
  } finally {
    busy.value = false
  }
}

function leaseLinkFor(r: RentalRequestSummary) {
  const l = draftLeaseFor(leases.value, r.unit_id, r.tenant_id)
  return l ? `/pro/baux/${l.id}` : null
}
</script>

<template>
  <div class="animate-[im-fade_.3s_ease_both]">
    <div v-if="state === 'loading'" class="flex flex-col gap-3.5">
      <DataSkeletonCard v-for="i in 2" :key="i" :height="140" :lines="1" />
    </div>
    <FeedbackAlertBanner v-else-if="state === 'error'" tone="danger">
      Impossible de charger les candidatures pour le moment.
      <button type="button" class="ml-2 font-bold underline" @click="load">Réessayer</button>
    </FeedbackAlertBanner>
    <div v-else-if="!requests.length" class="rounded-md border border-dashed border-[var(--border-default)] bg-white px-4 py-10 text-center">
      <p class="m-0 text-[14.5px] font-bold">Aucune candidature pour l'instant</p>
      <p class="mx-auto mb-0 mt-1.5 max-w-[440px] text-[13px] text-[var(--text-muted)]">Les locataires vérifiés candidatent depuis l'annonce d'un logement au mois. En retenant un candidat, vous obtenez un bail prêt à relire et à envoyer.</p>
    </div>

    <template v-else>
      <div class="mb-4 flex gap-1.5 rounded-pill bg-sand-200 p-1" style="width: fit-content">
        <button type="button" class="rounded-pill px-3.5 py-1.5 text-[12.5px] font-bold" :class="tab === 'todo' ? 'bg-white shadow-sm' : 'text-[var(--text-muted)]'" @click="tab = 'todo'">À traiter ({{ requests.filter(r => r.status === 'pending').length }})</button>
        <button type="button" class="rounded-pill px-3.5 py-1.5 text-[12.5px] font-bold" :class="tab === 'done' ? 'bg-white shadow-sm' : 'text-[var(--text-muted)]'" @click="tab = 'done'">Traitées ({{ done.length }})</button>
      </div>
      <p v-if="actionError && !accepting && !rejecting" class="mb-3.5 rounded-md border border-danger-border bg-danger-bg px-3.5 py-2.5 text-[13px] font-semibold text-danger-fg">{{ actionError }}</p>

      <template v-if="tab === 'todo'">
        <p v-if="!pendingGroups.length" class="rounded-md border border-dashed border-[var(--border-default)] bg-white px-4 py-8 text-center text-[13.5px] text-[var(--text-muted)]">Aucune candidature en attente.</p>
        <section v-for="g in pendingGroups" :key="g.unitId" class="mb-5 rounded-2xl border border-[var(--border-subtle)] bg-white p-5">
          <div class="flex flex-wrap items-baseline justify-between gap-2">
            <p class="m-0 text-base font-bold tracking-[-.015em]">{{ g.unit?.name ?? 'Logement supprimé' }}<template v-if="g.unit?.property?.name"> — {{ g.unit.property.name }}</template></p>
            <p class="m-0 text-[12.5px] font-bold text-[var(--text-muted)]">{{ g.pending }} candidat{{ g.pending > 1 ? 's' : '' }}<template v-if="g.unit"> · {{ formatFcfa(Number(g.unit.price)) }} / mois</template></p>
          </div>
          <div v-if="conflictFor({ unit_id: g.unitId, desired_move_in_at: null })" class="mt-3 rounded-md border border-warn-border bg-warn-bg p-3.5 text-[13px] text-warn-fg">
            Un bail existe déjà sur ce logement ({{ conflictFor({ unit_id: g.unitId, desired_move_in_at: null })?.label }}). Retenir un candidat en créerait un second sur la même période<template v-if="g.requests.some(r => !conflictFor(r))"> — sauf pour un emménagement après le départ du locataire actuel</template>.
            <NuxtLink :to="`/pro/baux/${conflictFor({ unit_id: g.unitId, desired_move_in_at: null })?.id}`" class="font-bold underline">Voir ce bail</NuxtLink>
          </div>

          <div
            v-for="r in g.requests"
            :id="`request-${r.id}`"
            :key="r.id"
            class="mt-3.5 rounded-xl border p-4"
            :class="r.id === highlight ? 'border-green-600 ring-2 ring-green-600/20' : 'border-[var(--border-subtle)]'"
          >
            <div class="flex flex-wrap items-center gap-2">
              <CoreAvatar :name="name(r)" :size="32" />
              <p class="m-0 text-[15px] font-bold">{{ name(r) }}</p>
              <CoreBadge v-if="r.tenant?.is_verified" tone="ok">Identité vérifiée</CoreBadge>
              <CoreBadge v-if="r.tenant?.profile?.trust_badge" tone="ok">Badge de confiance</CoreBadge>
              <span v-if="r.tenant?.profile" class="text-[12.5px] font-bold text-[var(--text-muted)]">Note {{ r.tenant.profile.reputation_score }}/5</span>
            </div>
            <p class="mb-0 mt-2 text-[12.5px] text-[var(--text-muted)]">
              Candidature du {{ formatDate(r.created_at) }}
              <template v-if="r.desired_move_in_at"> · emménagement souhaité le {{ formatDate(r.desired_move_in_at) }}</template>
              <template v-if="r.tenant?.email"> · {{ r.tenant.email }}</template>
              <template v-if="r.tenant?.phone_number"> · {{ r.tenant.phone_number }}</template>
            </p>
            <p class="mb-0 mt-1.5 text-[12.5px] font-semibold" :class="visitLine(r).tone === 'ok' ? 'text-ok-fg' : visitLine(r).tone === 'warn' ? 'text-warn-fg' : 'text-[var(--text-muted)]'">{{ visitLine(r).text }}</p>
            <p v-if="r.message" class="mb-0 mt-2.5 rounded-md bg-[var(--surface-page)] p-3 text-[13px] leading-[1.55] text-[var(--text-secondary)] [overflow-wrap:anywhere]">« {{ r.message }} »</p>
            <div class="mt-3 flex flex-wrap gap-2">
              <NuxtLink v-if="r.conversation_id" :to="`/pro/messages?conversation=${r.conversation_id}`" class="inline-flex items-center rounded-sm border border-[var(--border-default)] bg-white px-3.5 py-2 text-[12.5px] font-bold">Écrire</NuxtLink>
              <CoreButton size="sm" tone="secondary" @click="openReject(r)">Refuser</CoreButton>
              <CoreButton size="sm" :disabled="!!conflictFor(r) || !r.unit" @click="accepting = r; actionError = ''">Retenir ce candidat</CoreButton>
            </div>
          </div>
        </section>
      </template>

      <template v-else>
        <p v-if="!done.length" class="rounded-md border border-dashed border-[var(--border-default)] bg-white px-4 py-8 text-center text-[13.5px] text-[var(--text-muted)]">Aucune candidature traitée.</p>
        <div v-for="r in done" :id="`request-${r.id}`" :key="r.id" class="mb-2.5 flex flex-wrap items-center gap-3 rounded-xl border bg-white p-4" :class="r.id === highlight ? 'border-green-600' : 'border-[var(--border-subtle)]'">
          <div class="min-w-0 flex-1">
            <p class="m-0 text-[14px] font-bold">{{ name(r) }} — {{ r.unit?.name ?? 'logement supprimé' }}</p>
            <p class="mb-0 mt-0.5 text-[12.5px] text-[var(--text-muted)]">{{ CANDIDATURE_LABEL[r.status] }} le {{ formatDate(r.responded_at) }}</p>
          </div>
          <CoreBadge :tone="CANDIDATURE_TONE[r.status]">{{ CANDIDATURE_LABEL[r.status] }}</CoreBadge>
          <NuxtLink v-if="r.status === 'accepted' && leaseLinkFor(r)" :to="leaseLinkFor(r) ?? ''" class="text-[12.5px] font-bold text-green-700 underline">Voir le bail</NuxtLink>
        </div>
      </template>
    </template>

    <Teleport to="body">
      <div v-if="accepting || rejecting" class="fixed inset-0 z-[90] grid animate-[im-veil_.22s_ease_both] place-items-center bg-black/50 p-6 backdrop-blur-[3px]" @click="accepting = null; rejecting = null">
        <div class="w-[480px] max-w-full animate-[im-rise_.28s_var(--ease-standard)_both] rounded-2xl bg-[var(--surface-page)] p-6.5" @click.stop>
          <template v-if="accepting && acceptPreview && acceptStart">
            <h3 class="m-0 font-display text-xl font-bold tracking-[-.02em]">Retenir {{ name(accepting) }} ?</h3>
            <ul class="mb-0 mt-3 list-disc space-y-1.5 pl-5 text-[13.5px] leading-[1.55] text-[var(--text-secondary)]">
              <li>Un <strong>bail brouillon</strong> est préparé ; vous le relisez puis l'envoyez pour signature.</li>
              <li>Le logement est marqué <strong>loué</strong> et bloqué dans votre calendrier à partir du {{ formatDate(acceptStart.date) }}.</li>
              <li v-if="others">Les {{ others }} autre{{ others > 1 ? 's' : '' }} candidature{{ others > 1 ? 's' : '' }} en attente {{ others > 1 ? 'sont refusées' : 'est refusée' }} ; leurs auteurs sont prévenus.</li>
              <li>C'est définitif : l'application ne permet pas de revenir en arrière.</li>
            </ul>
            <div class="mt-4 rounded-md border border-[var(--border-default)] bg-white px-4 py-3">
              <DataMoneyLine label="Loyer mensuel" :value="formatFcfa(acceptPreview.rent)" />
              <DataMoneyLine :label="`Caution (${acceptPreview.depositMonths} mois)`" :value="formatFcfa(acceptPreview.deposit)" />
              <DataMoneyLine v-if="acceptPreview.advance" :label="`Avance (${acceptPreview.advanceMonths} mois)`" :value="formatFcfa(acceptPreview.advance)" />
              <DataMoneyLine label="Début du bail" :value="formatDate(acceptStart.date)" total />
            </div>
            <p v-if="acceptStart.past" class="mb-0 mt-2.5 rounded-md border border-warn-border bg-warn-bg px-3.5 py-2.5 text-[12.5px] text-warn-fg">La date souhaitée par le candidat est passée : modifiez la date de début dans le brouillon avant de l'envoyer.</p>
            <p v-if="acceptPreview.prepaidIgnored" class="mb-0 mt-2.5 text-[12px] text-[var(--text-muted)]">Les loyers prépayés prévus sur le logement ne sont pas repris dans ce brouillon.</p>
            <p v-if="actionError" class="mb-0 mt-3 rounded-md border border-danger-border bg-danger-bg px-3.5 py-2.5 text-[13px] font-semibold text-danger-fg">{{ actionError }}</p>
            <div class="mt-5 flex gap-2.5">
              <CoreButton tone="secondary" size="lg" full-width @click="accepting = null">Annuler</CoreButton>
              <CoreButton size="lg" full-width :disabled="busy" @click="confirmAccept">{{ busy ? 'Préparation…' : 'Retenir et préparer le bail' }}</CoreButton>
            </div>
          </template>
          <template v-else-if="rejecting">
            <h3 class="m-0 font-display text-xl font-bold tracking-[-.02em]">Refuser la candidature de {{ name(rejecting) }} ?</h3>
            <p class="mb-0 mt-2.5 text-[13.5px] leading-[1.6] text-[var(--text-muted)]">L'application ne prévient pas le candidat d'un refus : ce message lui est envoyé dans votre conversation, qui est ensuite archivée.</p>
            <textarea v-model="rejectMessage" rows="4" maxlength="1000" class="mt-3 w-full resize-none rounded-md border border-[var(--border-default)] bg-white p-3 text-sm outline-none" />
            <p v-if="actionError" class="mb-0 mt-2 rounded-md border border-danger-border bg-danger-bg px-3.5 py-2.5 text-[13px] font-semibold text-danger-fg">{{ actionError }}</p>
            <div class="mt-5 flex gap-2.5">
              <CoreButton tone="secondary" size="lg" full-width @click="rejecting = null">Annuler</CoreButton>
              <CoreButton tone="danger" size="lg" full-width :disabled="busy" @click="confirmReject">{{ busy ? 'Envoi…' : rejectMessage.trim() ? 'Envoyer et refuser' : 'Refuser' }}</CoreButton>
            </div>
          </template>
        </div>
      </div>
    </Teleport>
  </div>
</template>
