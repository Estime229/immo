<script setup lang="ts">
import { FileText, MessageSquare, Search, X } from '@lucide/vue'
import type { LeaseSummary, RentalRequestSummary } from '~/types/tenant'
import { ApiRequestError } from '~/utils/authenticatedFetcher'
import { errorText } from '~/utils/apiErrors'
import { CANDIDATURE_LABEL, CANDIDATURE_TONE, draftLeaseFor } from '~/utils/rentalRequests'
import { leasePhase } from '~/utils/leases'

definePageMeta({ layout: 'locataire' })

const route = useRoute()
const router = useRouter()
const rentalApi = useRentalRequestsApi()
const leasesApi = useLeasesApi()
const authUser = useAuthUser()

const requests = ref<RentalRequestSummary[]>([])
const leases = ref<LeaseSummary[]>([])
/** Baux introuvables : le suivi « où en est le bail » n'est pas affiché plutôt qu'inventé. */
const leasesFailed = ref(false)
const state = ref<'loading' | 'error' | 'ready'>('loading')
const highlight = ref<string | null>(null)

async function load() {
  state.value = 'loading'
  try {
    const [r, l] = await Promise.all([
      rentalApi.fetchMine('tenant'),
      leasesApi.fetchMine().then(list => { leasesFailed.value = false; return list }).catch(() => { leasesFailed.value = true; return [] as LeaseSummary[] })
    ])
    requests.value = r
    leases.value = l
    state.value = 'ready'
    focusFromQuery()
  } catch {
    state.value = 'error'
  }
}
onMounted(load)
onMounted(() => useCandidaturesBadge().markAllSeen())

const CLOSED_STATUSES = ['rejected', 'withdrawn']
const tab = ref<'open' | 'closed'>(route.query.tab === 'closed' ? 'closed' : 'open')
const open = computed(() => requests.value.filter(r => !CLOSED_STATUSES.includes(r.status)))
const closed = computed(() => requests.value.filter(r => CLOSED_STATUSES.includes(r.status)))
const shown = computed(() => (tab.value === 'open' ? open.value : closed.value))
const tabOptions = computed(() => [
  { value: 'open', label: `En cours (${open.value.length})` },
  { value: 'closed', label: `Non retenues (${closed.value.length})` }
])
function setTab(v: string) {
  tab.value = v === 'closed' ? 'closed' : 'open'
  if (route.query.tab !== tab.value) router.replace({ query: { ...route.query, tab: tab.value } })
}

/** `?request=` (notification, modale de candidature) : bon onglet, carte mise en avant — suivi aussi sur place. */
function focusFromQuery() {
  highlight.value = typeof route.query.request === 'string' ? route.query.request : null
  const target = highlight.value ? requests.value.find(r => r.id === highlight.value) : null
  if (!target) return
  tab.value = CLOSED_STATUSES.includes(target.status) ? 'closed' : 'open'
  nextTick(() => document.getElementById(`request-${target.id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }))
}
watch(() => route.query.request, () => { if (state.value === 'ready') load() })
watch(() => route.query.tab, t => { tab.value = t === 'closed' ? 'closed' : 'open' })

/* ---- Retirer sa candidature (#69) : confirmation en ligne, sur la carte ---- */
const withdrawingId = ref<string | null>(null)
const withdrawBusy = ref(false)
const withdrawError = ref('')
const flash = ref('')
async function confirmWithdraw(r: RentalRequestSummary) {
  withdrawBusy.value = true
  withdrawError.value = ''
  try {
    await rentalApi.withdraw(r.id)
    withdrawingId.value = null
    flash.value = `Candidature retirée pour ${r.unit?.name ?? 'ce logement'} : elle ne peut plus être retenue.`
    await load()
  } catch (e) {
    withdrawError.value = e instanceof ApiRequestError ? errorText(e.mapped, "La candidature n'a pas pu être retirée.") : "La candidature n'a pas pu être retirée."
  } finally {
    withdrawBusy.value = false
  }
}

function formatDate(iso: string | null) {
  if (!iso) return ''
  return new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}
function listingLink(r: RentalRequestSummary) {
  const pid = r.unit?.property_id ?? r.unit?.property?.id
  return pid ? `/biens/${pid}?unit=${r.unit_id}` : null
}
/** Où en est le bail né de la candidature : le texte suit (brouillon → à signer → entrée → actif). */
function leaseStep(r: RentalRequestSummary): string {
  if (leasesFailed.value) return "L'état de votre bail n'a pas pu être chargé : ouvrez « Mon bail » pour le voir."
  const l = draftLeaseFor(leases.value, r.unit_id, authUser.value?.id ?? r.tenant_id)
  switch (l ? leasePhase(l) : 'draft') {
    case 'awaiting_tenant': return 'Le propriétaire vous a envoyé le bail : lisez-le et signez-le.'
    case 'awaiting_entry': return "Bail signé : il reste le paiement d'entrée pour l'activer."
    case 'active':
    case 'notice': return 'Votre bail est actif.'
    default: return "Le propriétaire prépare le bail. Vous le lirez et le signerez dès qu'il vous l'aura envoyé."
  }
}
function leaseLink(r: RentalRequestSummary) {
  const l = draftLeaseFor(leases.value, r.unit_id, authUser.value?.id ?? r.tenant_id)
  return l ? `/locataire/bail?lease=${l.id}` : '/locataire/bail'
}
</script>

<template>
  <div class="animate-[im-fade_.3s_ease_backwards]">
    <div v-if="state === 'loading'" class="flex flex-col gap-3.5">
      <DataSkeletonCard v-for="i in 2" :key="i" :height="110" :lines="0" />
    </div>
    <FeedbackAlertBanner v-else-if="state === 'error'" tone="danger">
      Impossible de charger vos candidatures pour le moment.
      <button type="button" class="ml-2 font-bold underline" @click="load">Réessayer</button>
    </FeedbackAlertBanner>
    <div v-else-if="!requests.length" class="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-[var(--border-default)] bg-white px-4 py-12 text-center">
      <div class="grid h-[46px] w-[46px] place-items-center rounded-pill bg-green-50 text-green-700"><FileText class="h-5 w-5" :stroke-width="1.9" /></div>
      <p class="m-0 text-[15px] font-bold">Aucune candidature pour l'instant</p>
      <p class="m-0 max-w-[420px] text-[13.5px] text-[var(--text-muted)]">Un logement vous plaît après la visite ? Depuis son annonce, « Déposer ma candidature » : le propriétaire vous répond ici.</p>
      <NuxtLink to="/recherche" class="inline-flex items-center gap-1.5 rounded-pill border border-[var(--border-default)] bg-white px-4 py-2 text-[13px] font-bold text-sand-900"><Search class="h-4 w-4" :stroke-width="1.9" />Trouver un logement</NuxtLink>
    </div>

    <template v-else>
      <div class="mb-4.5 overflow-x-auto">
        <FormsSegmentedControl :model-value="tab" :options="tabOptions" size="sm" @update:model-value="setTab" />
      </div>
      <div v-if="flash" class="mb-4.5 flex items-start gap-3 rounded-md border border-ok-border bg-ok-bg px-3.5 py-2.5 text-[13px] font-semibold text-green-900">
        <p class="m-0 flex-1">{{ flash }}</p>
        <button type="button" aria-label="Masquer" class="flex-none text-green-900/70 hover:text-green-900" @click="flash = ''"><X class="h-4 w-4" :stroke-width="1.9" /></button>
      </div>
      <p v-if="!shown.length" class="m-0 rounded-md border border-dashed border-[var(--border-default)] bg-white px-4 py-10 text-center text-[13.5px] text-[var(--text-muted)]">
        {{ tab === 'open' ? 'Aucune candidature en cours : toutes ont reçu une réponse.' : 'Aucune candidature non retenue ni retirée.' }}
      </p>

      <article
        v-for="r in shown"
        :id="`request-${r.id}`"
        :key="r.id"
        class="mb-3.5 rounded-2xl border bg-white p-5.5"
        :class="r.id === highlight ? 'border-green-600 ring-2 ring-green-600/15' : 'border-[var(--border-subtle)]'"
      >
        <div class="flex flex-wrap items-start gap-3">
          <div class="min-w-0 flex-1">
            <h2 class="m-0 text-[15px] font-bold tracking-[-.01em]">{{ r.unit?.name ?? 'Logement supprimé' }}<template v-if="r.unit?.property?.name"> — {{ r.unit.property.name }}</template></h2>
            <p class="mb-0 mt-1 text-xs text-[var(--text-faint)]">
              <template v-if="r.unit"><span class="font-mono">{{ formatFcfa(Number(r.unit.price)) }}</span> / mois · </template>envoyée le <span class="font-mono">{{ formatDate(r.created_at) }}</span><template v-if="r.desired_move_in_at"> · emménagement souhaité le <span class="font-mono">{{ formatDate(r.desired_move_in_at) }}</span></template>
            </p>
          </div>
          <CoreBadge :tone="CANDIDATURE_TONE[r.status]">{{ CANDIDATURE_LABEL[r.status] }}</CoreBadge>
        </div>
        <p v-if="r.message" class="mb-0 mt-3 rounded-md bg-[var(--surface-page)] p-3 text-[13px] leading-[1.55] text-[var(--text-secondary)] [overflow-wrap:anywhere]">« {{ r.message }} »</p>

        <p v-if="r.status === 'pending'" class="mb-0 mt-3 text-[13.5px] text-[var(--text-muted)]">Le propriétaire n'a pas encore répondu.</p>
        <div v-else-if="r.status === 'accepted'" class="mt-3 rounded-md border border-ok-border bg-ok-bg px-3.5 py-2.5 text-[13px] leading-[1.55] text-green-900">
          <p class="m-0 font-bold">Retenue le <span class="font-mono">{{ formatDate(r.responded_at) }}</span></p>
          <p class="mb-0 mt-1">{{ leaseStep(r) }}</p>
        </div>
        <p v-else-if="r.status === 'withdrawn'" class="mb-0 mt-3 text-[13.5px] text-[var(--text-muted)]">
          Vous avez retiré cette candidature<template v-if="r.responded_at"> le <span class="font-mono">{{ formatDate(r.responded_at) }}</span></template>.
        </p>
        <p v-else class="mb-0 mt-3 text-[13.5px] text-[var(--text-muted)]">
          Non retenue<template v-if="r.responded_at"> le <span class="font-mono">{{ formatDate(r.responded_at) }}</span></template> : le propriétaire a choisi un autre candidat ou décliné.
        </p>

        <CoreInlineConfirm
          v-if="withdrawingId === r.id"
          class="mt-3.5"
          tone="danger"
          message="Retirer cette candidature ? Le propriétaire ne pourra plus la retenir. Vous pourrez en déposer une nouvelle si le logement est encore disponible."
          confirm-label="Retirer"
          cancel-label="Garder"
          :loading="withdrawBusy"
          @confirm="confirmWithdraw(r)"
          @cancel="withdrawingId = null"
        />
        <p v-if="withdrawingId === r.id && withdrawError" class="mb-0 mt-2 text-[13px] font-semibold text-danger-fg">{{ withdrawError }}</p>

        <div class="mt-3.5 flex flex-wrap items-center gap-2 border-t border-sand-200 pt-3.5">
          <NuxtLink v-if="r.status === 'accepted'" :to="leaseLink(r)" class="rounded-pill bg-[image:var(--action-primary)] px-4 py-[9px] text-[13px] font-bold text-white shadow-action">Voir mon bail</NuxtLink>
          <NuxtLink v-if="r.conversation_id" :to="`/locataire/messages?conversation=${r.conversation_id}`" class="inline-flex items-center gap-1.5 rounded-pill border border-[var(--border-default)] bg-white px-4 py-[9px] text-[13px] font-bold text-sand-900"><MessageSquare class="h-4 w-4" :stroke-width="1.9" />Conversation</NuxtLink>
          <NuxtLink v-if="listingLink(r)" :to="listingLink(r) ?? ''" class="rounded-pill border border-[var(--border-default)] bg-white px-4 py-[9px] text-[13px] font-bold text-sand-900">Voir l'annonce</NuxtLink>
          <CoreButton v-if="r.status === 'pending' && withdrawingId !== r.id" size="sm" tone="ghost" class="ml-auto" @click="withdrawingId = r.id; withdrawError = ''">Retirer ma candidature</CoreButton>
        </div>
      </article>
    </template>
  </div>
</template>
