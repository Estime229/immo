<script setup lang="ts">
import { ArrowRight, BedDouble, CalendarDays, ChevronRight, ClipboardCheck, FileSignature, Home, Megaphone, MessageSquare, Search, Wallet as WalletIcon } from '@lucide/vue'
import type { Component } from 'vue'
import type { BookingSummary } from '~/types/tenant'
import { ApiRequestError } from '~/utils/authenticatedFetcher'
import { errorText } from '~/utils/apiErrors'
import { bookingPhase, PHASE_LABEL, PHASE_TONE } from '~/utils/bookings'
import { leasePhase, LEASE_PHASE_TONE, TENANT_LEASE_PHASE_LABEL } from '~/utils/leases'
import { buildActivityFeed, buildNextSteps, findLateLeaseInvoice, inventorySignSteps, type DashboardStepKind } from '~/utils/tenantDashboard'

definePageMeta({ layout: 'locataire' })

const wallet = useTenantWallet()
const { openPay } = usePaymentModal()

/** Explication complète (solde vs tirelire) montrée une fois sur le tableau de bord, puis
 * remplacée par la ligne courte habituelle — cookie plutôt que localStorage pour que le
 * serveur la lise au rendu et évite le flash d'affichage avant hydratation (voir AppDownloadBanner). */
const walletIntroDismissed = useCookie<string | null>('immo_wallet_intro_dismissed', {
  default: () => null,
  sameSite: 'lax',
  maxAge: 60 * 60 * 24 * 365
})
function dismissWalletIntro() {
  walletIntroDismissed.value = '1'
}

const bookingsApi = useBookingsApi()
const housingRequestsApi = useHousingRequestsApi()
const waitlistApi = useWaitlistApi()
const signalsApi = useSignalsApi()
const notificationsApi = useNotificationsApi()
const messagingApi = useMessagingApi()

// Baux et wallet : état partagé avec la sidebar / l'écran de bail / la modale de paiement.
const leasesBlock = useTenantLeases()
const bookingsBlock = useFetchBlock(() => bookingsApi.fetchMine())
const housingRequestsBlock = useFetchBlock(() => housingRequestsApi.fetchMine())
const waitlistBlock = useFetchBlock(() => waitlistApi.fetchMine())
const signalsBlock = useFetchBlock(() => signalsApi.list())
const notificationsBlock = useFetchBlock(() => notificationsApi.list())

onMounted(() => {
  // Promise.allSettled : un échec sur un bloc (ex. liste d'attente) ne doit
  // jamais vider le reste du tableau de bord — voir 12-INTEGRATION-LOCATAIRE.md, IL1.
  Promise.allSettled([
    leasesBlock.ensureLoaded(),
    wallet.ensureLoaded(),
    bookingsBlock.load(),
    housingRequestsBlock.load(),
    waitlistBlock.load(),
    signalsBlock.load(),
    notificationsBlock.load()
  ])
})

function formatDate(iso: string) {
  return new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

/* ---- Bannière loyer en retard ---- */
const lateInfo = computed(() => findLateLeaseInvoice(leasesBlock.leases.value))
const dashAlert = computed(() => {
  const info = lateInfo.value
  if (!info) return ''
  return `Le loyer de ${info.lease.unit?.name ?? 'votre logement'} — ${formatFcfa(Number(info.invoice.amount))} — était dû le ${formatDate(info.invoice.due_date)}`
})
function payLateLease() {
  const info = lateInfo.value
  navigateTo(info ? `/locataire/bail?lease=${info.lease.id}&pay=${info.invoice.id}` : '/locataire/bail')
}

/* ---- Mes logements : baux, puis séjours courte durée en cours ou à venir ---- */
const leaseCards = computed(() => leasesBlock.leases.value.map(l => {
  const late = lateInfo.value?.lease.id === l.id
  return {
    id: l.id,
    title: [l.unit?.name, l.property?.name].filter(Boolean).join(' — ') || 'Logement',
    rentFmt: formatFcfaShort(Number(l.signed_rent)),
    statusLabel: late ? 'En retard' : TENANT_LEASE_PHASE_LABEL[leasePhase(l)],
    tone: late ? 'danger' as const : LEASE_PHASE_TONE[leasePhase(l)]
  }
}))

/** Séjours confirmés en cours ou à venir — avant, un voyageur en plein séjour lisait « Aucun bail ». */
const stays = computed(() => bookingsBlock.items.value
  .filter(b => ['ongoing', 'upcoming'].includes(bookingPhase(b)))
  .sort((a, b) => a.check_in.localeCompare(b.check_in)))

const housingLoading = computed(() => leasesBlock.state.value === 'loading' || bookingsBlock.state.value === 'loading')
const housingCount = computed(() => {
  const parts: string[] = []
  if (leaseCards.value.length) parts.push(`${leaseCards.value.length} ${leaseCards.value.length > 1 ? 'baux' : 'bail'}`)
  if (stays.value.length) parts.push(`${stays.value.length} séjour${stays.value.length > 1 ? 's' : ''}`)
  return parts.join(' · ')
})
const housingEmpty = computed(() => !housingLoading.value && leasesBlock.state.value !== 'error' && bookingsBlock.state.value !== 'error' && !leaseCards.value.length && !stays.value.length)

const hostBusyId = ref<string | null>(null)
const hostError = ref<{ id: string; text: string } | null>(null)
async function writeHost(b: BookingSummary) {
  if (!b.landlord_id) return
  hostBusyId.value = b.id
  hostError.value = null
  try {
    const conv = await messagingApi.openConversation(b.unit_id, b.landlord_id)
    await navigateTo({ path: '/locataire/messages', query: { conversation: conv.id } })
  } catch (e) {
    hostError.value = { id: b.id, text: e instanceof ApiRequestError ? errorText(e.mapped, "La conversation n'a pas pu être ouverte.") : "La conversation n'a pas pu être ouverte." }
  } finally {
    hostBusyId.value = null
  }
}

/* ---- Prochaines étapes (dérivées de baux + réservations + demandes + liste d'attente) ---- */
/* États des lieux à signer : un appel par bail en cours, et par séjour confirmé en cours ou à venir. */
const inventoriesApi = useInventoriesApi()
const inventorySteps = ref<ReturnType<typeof inventorySignSteps>>([])
const inventoriesFailed = ref(false)
async function loadInventorySteps() {
  inventoriesFailed.value = false
  const relevant = leasesBlock.leases.value.filter(l => ['awaiting_entry', 'active', 'notice', 'terminated'].includes(leasePhase(l)))
  const fail = () => { inventoriesFailed.value = true; return [] }
  const fromLeases = relevant.map(async l => (await inventoriesApi.fetchByLease(l.id).catch(fail)).map(inv => ({ inv, place: l.unit?.name ?? 'votre logement' })))
  const fromStays = stays.value.map(async b => (await inventoriesApi.fetchByBooking(b.id).catch(fail)).map(inv => ({ inv, place: b.unit?.name ?? 'votre séjour' })))
  const lists = await Promise.all([...fromLeases, ...fromStays])
  inventorySteps.value = inventorySignSteps(lists.flat())
}
watch(() => [leasesBlock.leases.value, stays.value.map(b => b.id).join()], loadInventorySteps, { immediate: true })

const nextSteps = computed(() => [...inventorySteps.value, ...buildNextSteps({
  leases: leasesBlock.leases.value,
  bookings: bookingsBlock.items.value,
  housingRequests: housingRequestsBlock.items.value,
  waitlist: waitlistBlock.items.value
})])
const nextStepsLoading = computed(() =>
  [leasesBlock.state.value, bookingsBlock.state.value, housingRequestsBlock.state.value, waitlistBlock.state.value].includes('loading')
)
const STEP_ICON: Record<DashboardStepKind, Component> = {
  sign: FileSignature,
  pay: WalletIcon,
  stay: BedDouble,
  waitlist: Home,
  request: Megaphone,
  inventory: ClipboardCheck
}

/** Sources en échec : une erreur ne se lit jamais « Rien à faire ». */
const failedSteps = computed(() => [
  leasesBlock.state.value === 'error' ? 'baux' : '',
  bookingsBlock.state.value === 'error' ? 'réservations' : '',
  housingRequestsBlock.state.value === 'error' ? 'demandes' : '',
  waitlistBlock.state.value === 'error' ? "liste d'attente" : '',
  inventoriesFailed.value ? 'états des lieux' : ''
].filter(Boolean))
function retrySteps() {
  if (leasesBlock.state.value === 'error') leasesBlock.reload()
  if (bookingsBlock.state.value === 'error') bookingsBlock.load()
  if (housingRequestsBlock.state.value === 'error') housingRequestsBlock.load()
  if (waitlistBlock.state.value === 'error') waitlistBlock.load()
  if (inventoriesFailed.value) loadInventorySteps()
}

/* ---- Activité récente (signalements + notifications fusionnés) ---- */
const activity = computed(() => buildActivityFeed(signalsBlock.items.value, notificationsBlock.items.value, localizeNotification))
const activityLoading = computed(() => signalsBlock.state.value === 'loading' || notificationsBlock.state.value === 'loading')
const failedActivity = computed(() => [
  signalsBlock.state.value === 'error' ? 'signalements' : '',
  notificationsBlock.state.value === 'error' ? 'notifications' : ''
].filter(Boolean))
function retryActivity() {
  if (signalsBlock.state.value === 'error') signalsBlock.load()
  if (notificationsBlock.state.value === 'error') notificationsBlock.load()
}
</script>

<!--
  Mise en page pilotée par la largeur réellement disponible (container queries
  sur la racine), pas par celle de l'écran : sur tablette, la barre latérale
  apparaît en paysage (lg) et disparaît en portrait, si bien que l'espace utile
  est presque le même (≈ 700 px) dans les deux sens.
  - < @xl (576 px)    : une colonne (téléphone) ;
  - @xl → @5xl        : tablette — logements en grille, wallet à l'horizontale,
                        prochaines étapes et activité côte à côte ;
  - ≥ @5xl (1024 px)  : bureau — logements | wallet, puis étapes | activité.
-->
<template>
  <div class="@container animate-[im-fade_.3s_ease_backwards]">
    <LayoutKycNotice space="locataire" />
    <FeedbackAlertBanner v-if="lateInfo" tone="danger" action-label="Payer maintenant" class="mb-5" @action="payLateLease">
      {{ dashAlert }}
    </FeedbackAlertBanner>

    <div class="grid grid-cols-1 gap-4.5 @5xl:grid-cols-[1.35fr_1fr]">
      <section class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
        <div class="mb-4 flex items-baseline justify-between gap-3">
          <h2 class="m-0 text-[15px] font-bold">Mes logements</h2>
          <span v-if="housingCount" class="text-xs text-[var(--text-faint)]">{{ housingCount }}</span>
        </div>

        <div v-if="housingLoading" class="flex flex-col gap-2.5">
          <DataSkeletonCard v-for="i in 2" :key="i" :height="66" :lines="1" />
        </div>

        <template v-else>
          <FeedbackAlertBanner v-if="leasesBlock.state.value === 'error'" tone="danger" class="mb-2.5">
            Impossible de charger vos baux pour le moment.
            <button type="button" class="ml-2 font-bold underline" @click="leasesBlock.reload()">Réessayer</button>
          </FeedbackAlertBanner>
          <FeedbackAlertBanner v-if="bookingsBlock.state.value === 'error'" tone="danger" class="mb-2.5">
            Impossible de charger vos séjours pour le moment.
            <button type="button" class="ml-2 font-bold underline" @click="bookingsBlock.load()">Réessayer</button>
          </FeedbackAlertBanner>

          <div v-if="housingEmpty" class="flex flex-col items-center gap-3 rounded-md border border-dashed border-[var(--border-default)] px-4 py-8 text-center">
            <div class="grid h-[46px] w-[46px] place-items-center rounded-pill bg-green-50 text-green-700"><Home class="h-5 w-5" :stroke-width="1.9" /></div>
            <p class="m-0 max-w-[360px] text-[13.5px] text-[var(--text-muted)]">Aucun bail ni séjour pour l'instant. Un bail envoyé par un propriétaire ou une réservation confirmée apparaîtra ici.</p>
            <NuxtLink to="/recherche" class="inline-flex items-center gap-1.5 rounded-pill border border-[var(--border-default)] bg-white px-4 py-2 text-[13px] font-bold text-sand-900"><Search class="h-4 w-4" :stroke-width="1.9" />Trouver un logement</NuxtLink>
          </div>

          <!-- Plusieurs logements sur tablette : deux cartes par ligne ; le titre passe sur deux lignes et le statut sous le loyer, plutôt que de tout tronquer sur une seule ligne. -->
          <div v-else class="grid grid-cols-1 gap-2.5" :class="leaseCards.length + stays.length > 1 ? '@xl:grid-cols-2 @5xl:grid-cols-1' : ''">
            <NuxtLink
              v-for="l in leaseCards"
              :key="l.id"
              :to="`/locataire/bail?lease=${l.id}`"
              class="group flex w-full min-w-0 items-center gap-3.5 rounded-lg border border-[var(--border-subtle)] p-3 text-left transition-shadow hover:shadow-raised"
            >
              <div class="grid h-[52px] w-[52px] flex-none place-items-center self-start rounded-md bg-green-50 text-green-700"><Home class="h-5 w-5" :stroke-width="1.9" /></div>
              <div class="min-w-0 flex-1">
                <p class="m-0 line-clamp-2 text-sm font-bold leading-snug">{{ l.title }}</p>
                <div class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <span class="whitespace-nowrap font-mono text-sm font-bold">{{ l.rentFmt }}<span class="font-body text-[11px] font-medium text-[var(--text-faint)]"> / mois</span></span>
                  <CoreBadge :tone="l.tone">{{ l.statusLabel }}</CoreBadge>
                </div>
              </div>
              <ChevronRight class="h-4 w-4 flex-none text-[var(--text-faint)] transition-transform group-hover:translate-x-0.5" :stroke-width="1.9" />
            </NuxtLink>

            <div v-for="b in stays" :key="b.id" class="flex min-w-0 flex-col gap-3 rounded-lg border border-[var(--border-subtle)] p-3">
              <div class="flex min-w-0 items-center gap-3.5">
                <div class="flex h-[52px] w-[52px] flex-none flex-col items-center justify-center self-start rounded-md bg-info-bg text-info-fg-deep">
                  <span class="font-mono text-base font-bold leading-none">{{ new Date(b.check_in).toLocaleDateString('fr-FR', { day: '2-digit' }) }}</span>
                  <span class="text-[10.5px] font-bold uppercase">{{ new Date(b.check_in).toLocaleDateString('fr-FR', { month: 'short' }) }}</span>
                </div>
                <div class="min-w-0 flex-1">
                  <p class="m-0 line-clamp-2 text-sm font-bold leading-snug">{{ b.unit?.name ?? 'Logement retiré de la plateforme' }}</p>
                  <div class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    <span class="whitespace-nowrap font-mono text-[12.5px] text-[var(--text-muted)]">{{ formatDate(b.check_in) }} – {{ formatDate(b.check_out) }}</span>
                    <CoreBadge :tone="PHASE_TONE[bookingPhase(b)]">{{ PHASE_LABEL[bookingPhase(b)] }}</CoreBadge>
                  </div>
                </div>
              </div>
              <div class="flex flex-wrap gap-2">
                <NuxtLink :to="`/locataire/reservations?booking=${b.id}`" class="inline-flex items-center gap-1.5 rounded-pill border border-[var(--border-default)] bg-white px-3.5 py-2 text-[12.5px] font-bold text-sand-900"><CalendarDays class="h-3.5 w-3.5" :stroke-width="1.9" />Ma réservation</NuxtLink>
                <button v-if="b.landlord_id" type="button" class="inline-flex items-center gap-1.5 rounded-pill px-3 py-2 text-[12.5px] font-bold text-[var(--text-secondary)] hover:text-green-700 disabled:opacity-60" :disabled="hostBusyId === b.id" @click="writeHost(b)">
                  <MessageSquare class="h-3.5 w-3.5" :stroke-width="1.9" />{{ hostBusyId === b.id ? 'Ouverture…' : "Écrire à l'hôte" }}
                </button>
              </div>
              <p v-if="hostError?.id === b.id" class="m-0 text-[12.5px] font-semibold text-danger-fg">{{ hostError.text }}</p>
            </div>
          </div>
        </template>
      </section>

      <section class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
        <div class="mb-4 flex items-baseline justify-between gap-3">
          <h2 class="m-0 text-[15px] font-bold">Mon wallet</h2>
          <NuxtLink to="/locataire/wallet" class="inline-flex items-center gap-1 text-[12.5px] font-bold text-green-700">Détail <ArrowRight class="h-3.5 w-3.5" :stroke-width="1.9" /></NuxtLink>
        </div>
        <!--
          Tablette : le wallet occupe toute la largeur — soldes puis « Recharger » à gauche,
          explication à droite (sinon un grand vide restait sous les soldes). Téléphone et
          bureau : une seule colonne, dans l'ordre soldes, explication, bouton.
        -->
        <div class="grid grid-cols-1 gap-3 @xl:grid-cols-2 @xl:gap-x-5 @5xl:grid-cols-1 @5xl:gap-x-0">
          <div v-if="wallet.state.value === 'loading' || wallet.state.value === 'idle'" class="@xl:col-start-1 @xl:row-start-1 @5xl:col-start-auto @5xl:row-start-auto"><DataSkeletonCard :height="70" :lines="1" /></div>
          <!-- Un solde inconnu ne s'affiche jamais « 0 F ». -->
          <p v-else-if="wallet.state.value === 'error'" class="m-0 rounded-md border border-danger-border bg-danger-bg px-3.5 py-3 text-[13px] font-semibold text-danger-fg @xl:col-start-1 @xl:row-start-1 @5xl:col-start-auto @5xl:row-start-auto">
            Soldes indisponibles pour le moment.
            <button type="button" class="ml-1 font-bold underline" @click="wallet.reload()">Réessayer</button>
          </p>
          <div v-else class="grid grid-cols-2 gap-3 @xl:col-start-1 @xl:row-start-1 @5xl:col-start-auto @5xl:row-start-auto">
            <div class="min-w-0 rounded-lg border border-[var(--border-subtle)] bg-white p-4">
              <p class="m-0 truncate font-mono text-xl font-bold tracking-[-.02em] text-green-900">{{ formatFcfaShort(wallet.balanceTotal.value) }}</p>
              <p class="mb-0 mt-1.5 text-[11.5px] text-[var(--text-muted)]">Solde disponible</p>
            </div>
            <div class="min-w-0 rounded-lg border border-green-100 bg-green-50 p-4">
              <p class="m-0 truncate font-mono text-xl font-bold tracking-[-.02em] text-green-900">{{ formatFcfaShort(wallet.balanceSavings.value) }}</p>
              <p class="mb-0 mt-1.5 text-[11.5px] text-green-700">Tirelire</p>
            </div>
          </div>
          <div v-if="!walletIntroDismissed" class="self-start rounded-md border border-green-100 bg-green-50 px-3.5 py-3 @xl:col-start-2 @xl:row-span-2 @xl:row-start-1 @5xl:col-start-auto @5xl:row-span-1 @5xl:row-start-auto">
            <p class="mb-0 text-[12.5px] leading-[1.5] text-green-900">
              La tirelire est la part réservée au logement : c'est elle qui sert à payer un loyer ou une réservation. Les deux soldes ne bougent pas ensemble — une recharge crédite les deux, un revenu locatif ne crédite que le solde disponible.
            </p>
            <button type="button" class="mt-2 text-[12px] font-bold text-green-700 underline" @click="dismissWalletIntro">Compris</button>
          </div>
          <p v-else class="m-0 self-start text-[12.5px] leading-[1.5] text-[var(--text-muted)] @xl:col-start-2 @xl:row-span-2 @xl:row-start-1 @5xl:col-start-auto @5xl:row-span-1 @5xl:row-start-auto">
            La tirelire est la part réservée au logement : c'est elle qui sert à payer un loyer ou une réservation.
          </p>
          <button type="button" class="mt-0.5 block w-full self-start rounded-md bg-[image:var(--action-primary)] py-3 text-center text-sm font-bold text-white shadow-action @xl:col-start-1 @xl:row-start-2 @5xl:col-start-auto @5xl:row-start-auto" @click="openPay('recharge')">Recharger</button>
        </div>
      </section>
    </div>

    <div class="mt-4.5 grid grid-cols-1 gap-4.5 @xl:grid-cols-2">
      <section class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
        <h2 class="mb-2 mt-0 text-[15px] font-bold">Prochaines étapes</h2>
        <div v-if="nextStepsLoading" class="flex flex-col gap-2 pt-2">
          <DataSkeletonCard v-for="i in 2" :key="i" :height="50" :lines="1" />
        </div>
        <template v-else>
          <FeedbackAlertBanner v-if="failedSteps.length" tone="danger" class="my-2">
            Certaines informations n'ont pas pu être chargées ({{ failedSteps.join(', ') }}) : la liste peut être incomplète.
            <button type="button" class="ml-2 font-bold underline" @click="retrySteps">Réessayer</button>
          </FeedbackAlertBanner>
          <p v-if="!nextSteps.length && !failedSteps.length" class="mb-0 mt-3 flex items-center gap-2.5 rounded-md bg-ok-bg p-3.5 text-[13.5px] font-semibold text-green-900">
            Rien n'attend de votre part : baux, séjours et demandes sont à jour.
          </p>
          <div v-for="n in nextSteps" :key="n.key" class="flex items-center gap-3 border-b border-sand-200 py-3 last:border-b-0">
            <div class="grid h-9 w-9 flex-none place-items-center rounded-md" :class="n.kind === 'pay' ? 'bg-warn-bg text-warn-fg' : n.kind === 'stay' ? 'bg-info-bg text-info-fg' : 'bg-green-50 text-green-700'">
              <component :is="STEP_ICON[n.kind ?? 'sign']" class="h-[18px] w-[18px]" :stroke-width="1.9" />
            </div>
            <div class="min-w-0 flex-1">
              <p class="m-0 line-clamp-2 text-sm font-bold leading-snug">{{ n.label }}</p>
              <p v-if="n.hint" class="mb-0 mt-0.5 truncate text-xs text-[var(--text-faint)]">{{ n.hint }}</p>
            </div>
            <NuxtLink :to="n.to" class="inline-flex min-h-9 flex-none items-center rounded-pill border border-[var(--border-default)] bg-white px-3.5 text-xs font-bold text-sand-900">{{ n.cta }}</NuxtLink>
          </div>
        </template>
      </section>
      <section class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
        <h2 class="mb-2 mt-0 text-[15px] font-bold">Activité récente</h2>
        <div v-if="activityLoading" class="flex flex-col gap-2 pt-2">
          <DataSkeletonCard v-for="i in 3" :key="i" :height="30" :lines="1" />
        </div>
        <template v-else>
          <FeedbackAlertBanner v-if="failedActivity.length" tone="danger" class="my-2">
            Impossible de charger vos {{ failedActivity.join(' et ') }} pour le moment.
            <button type="button" class="ml-2 font-bold underline" @click="retryActivity">Réessayer</button>
          </FeedbackAlertBanner>
          <p v-if="!activity.length && !failedActivity.length" class="mb-0 mt-3 text-[13px] text-[var(--text-muted)]">Aucune activité récente : vos notifications et signalements apparaîtront ici.</p>
          <div v-for="a in activity" :key="a.key" class="flex items-center gap-3 border-b border-sand-200 py-3 last:border-b-0">
            <span class="h-2 w-2 flex-none rounded-pill" :class="a.dot" />
            <p class="m-0 line-clamp-2 min-w-0 flex-1 text-[13.5px] leading-snug">{{ a.label }}</p>
            <span class="flex-none whitespace-nowrap font-mono text-xs text-[var(--text-faint)]">{{ formatDate(a.date) }}</span>
          </div>
        </template>
      </section>
    </div>
  </div>
</template>
