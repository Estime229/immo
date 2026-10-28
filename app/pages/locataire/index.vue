<script setup lang="ts">
import { leasePhase, LEASE_PHASE_TONE, TENANT_LEASE_PHASE_LABEL } from '~/utils/leases'
import { buildActivityFeed, buildNextSteps, findLateLeaseInvoice, inventorySignSteps } from '~/utils/tenantDashboard'

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
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
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

/* ---- Mes logements ---- */
const leaseCards = computed(() => leasesBlock.leases.value.map((l, i) => {
  const late = lateInfo.value?.lease.id === l.id
  return {
    id: l.id,
    title: [l.unit?.name, l.property?.name].filter(Boolean).join(' — ') || 'Logement',
    rentFmt: formatFcfaShort(Number(l.signed_rent)),
    photo: TENANT_PHOTOS[i % TENANT_PHOTOS.length],
    statusLabel: late ? 'En retard' : TENANT_LEASE_PHASE_LABEL[leasePhase(l)],
    tone: late ? 'danger' as const : LEASE_PHASE_TONE[leasePhase(l)]
  }
}))

function openLease(id: string) {
  navigateTo(`/locataire/bail?lease=${id}`)
}

/* ---- Prochaines étapes (dérivées de baux + réservations + demandes + liste d'attente) ---- */
/* États des lieux à signer : un appel par bail en cours (entrée payée ou à payer, préavis, terminé récemment). */
const inventoriesApi = useInventoriesApi()
const inventorySteps = ref<ReturnType<typeof inventorySignSteps>>([])
watch(() => leasesBlock.leases.value, async leases => {
  const relevant = leases.filter(l => ['awaiting_entry', 'active', 'notice', 'terminated'].includes(leasePhase(l)))
  const lists = await Promise.all(relevant.map(async l => (await inventoriesApi.fetchByLease(l.id).catch(() => [])).map(inv => ({ inv, place: l.unit?.name ?? 'votre logement' }))))
  inventorySteps.value = inventorySignSteps(lists.flat())
}, { immediate: true })

const nextSteps = computed(() => [...inventorySteps.value, ...buildNextSteps({
  leases: leasesBlock.leases.value,
  bookings: bookingsBlock.items.value,
  housingRequests: housingRequestsBlock.items.value,
  waitlist: waitlistBlock.items.value
})])
const nextStepsLoading = computed(() =>
  [leasesBlock.state.value, bookingsBlock.state.value, housingRequestsBlock.state.value, waitlistBlock.state.value].includes('loading')
)

/* ---- Activité récente (signalements + notifications fusionnés) ---- */
const activity = computed(() => buildActivityFeed(signalsBlock.items.value, notificationsBlock.items.value, localizeNotification))
const activityLoading = computed(() => signalsBlock.state.value === 'loading' || notificationsBlock.state.value === 'loading')
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
  <div class="@container animate-[im-fade_.3s_ease_both]">
    <LayoutKycNotice space="locataire" />
    <FeedbackAlertBanner v-if="lateInfo" tone="danger" action-label="Payer maintenant" class="mb-5" @action="payLateLease">
      {{ dashAlert }}
    </FeedbackAlertBanner>

    <div class="grid grid-cols-1 gap-4.5 @5xl:grid-cols-[1.35fr_1fr]">
      <div class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
        <div class="mb-4 flex items-baseline justify-between">
          <p class="m-0 text-xs font-black uppercase tracking-[.06em] text-[var(--text-faint)]">Mes logements</p>
          <span v-if="leasesBlock.state.value === 'success'" class="text-xs font-bold text-[var(--text-faint)]">{{ leaseCards.length }} bail{{ leaseCards.length > 1 ? 'x' : '' }}</span>
        </div>

        <div v-if="leasesBlock.state.value === 'loading'" class="flex flex-col gap-2.5">
          <DataSkeletonCard v-for="i in 2" :key="i" :height="66" :lines="1" />
        </div>

        <FeedbackAlertBanner v-else-if="leasesBlock.state.value === 'error'" tone="danger">
          Impossible de charger vos baux pour le moment.
          <button type="button" class="ml-2 font-bold underline" @click="leasesBlock.reload()">Réessayer</button>
        </FeedbackAlertBanner>

        <p v-else-if="leasesBlock.state.value === 'empty'" class="rounded-md border border-dashed border-[var(--border-default)] bg-[var(--surface-page)] px-4 py-6 text-center text-[13.5px] text-[var(--text-muted)]">
          Aucun bail pour l'instant.
        </p>

        <!-- Plusieurs baux sur tablette : deux cartes par ligne ; le titre passe sur deux lignes et le statut sous le loyer, plutôt que de tout tronquer sur une seule ligne. -->
        <div v-else class="grid grid-cols-1 gap-2.5" :class="leaseCards.length > 1 ? '@xl:grid-cols-2 @5xl:grid-cols-1' : ''">
          <button
            v-for="l in leaseCards"
            :key="l.id"
            type="button"
            class="flex w-full min-w-0 items-center gap-3.5 rounded-lg border border-[var(--border-subtle)] p-3 text-left transition-shadow hover:shadow-raised"
            @click="openLease(l.id)"
          >
            <div class="h-[66px] w-[78px] flex-none self-start rounded-md bg-cover bg-center" :style="{ backgroundImage: l.photo }" />
            <div class="min-w-0 flex-1">
              <p class="m-0 line-clamp-2 text-[14.5px] font-bold leading-snug tracking-[-.01em]">{{ l.title }}</p>
              <div class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <span class="whitespace-nowrap font-mono text-sm font-bold">{{ l.rentFmt }}<span class="font-body text-[11px] font-medium text-[var(--text-faint)]"> / mois</span></span>
                <CoreBadge :tone="l.tone">{{ l.statusLabel }}</CoreBadge>
              </div>
            </div>
            <span class="flex-none text-[15px] text-[var(--text-faint)]">→</span>
          </button>
        </div>
      </div>

      <div class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
        <div class="mb-4 flex items-center justify-between">
          <p class="m-0 text-xs font-black uppercase tracking-[.06em] text-[var(--text-faint)]">Mon wallet</p>
          <NuxtLink to="/locataire/wallet" class="text-[12.5px] font-bold text-green-700">Détail →</NuxtLink>
        </div>
        <!-- Tablette : le wallet occupe toute la largeur, soldes à gauche, explication et « Recharger » à droite. -->
        <div class="grid grid-cols-1 gap-3 @xl:grid-cols-2 @xl:gap-5 @5xl:grid-cols-1 @5xl:gap-3">
          <div v-if="wallet.state.value === 'loading'"><DataSkeletonCard :height="70" :lines="1" /></div>
          <div v-else class="grid grid-cols-2 content-start gap-3">
            <div class="min-w-0 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-page)] p-3.5">
              <p class="m-0 text-[11.5px] font-bold text-[var(--text-muted)]">Solde disponible</p>
              <p class="mb-0 mt-1.5 whitespace-nowrap font-mono text-lg font-bold">{{ formatFcfaShort(wallet.balanceTotal.value) }}</p>
            </div>
            <div class="min-w-0 rounded-md border border-green-100 bg-green-50 p-3.5">
              <p class="m-0 text-[11.5px] font-bold text-green-700">Tirelire</p>
              <p class="mb-0 mt-1.5 whitespace-nowrap font-mono text-lg font-bold text-green-900">{{ formatFcfaShort(wallet.balanceSavings.value) }}</p>
            </div>
          </div>
          <div>
            <div v-if="!walletIntroDismissed" class="rounded-md border border-green-100 bg-green-50 px-3.5 py-3">
              <p class="mb-0 text-[12.5px] leading-[1.5] text-green-900">
                La tirelire est la part réservée au logement : c'est elle qui sert à payer un loyer ou une réservation. Les deux soldes ne bougent pas ensemble — une recharge crédite les deux, un revenu locatif ne crédite que le solde disponible.
              </p>
              <button type="button" class="mt-2 text-[12px] font-bold text-green-700 underline" @click="dismissWalletIntro">Compris</button>
            </div>
            <p v-else class="m-0 text-[12.5px] leading-[1.5] text-[var(--text-muted)]">
              La tirelire est la part réservée au logement : c'est elle qui sert à payer un loyer ou une réservation.
            </p>
            <button type="button" class="mt-3.5 block w-full rounded-md bg-[image:var(--action-primary)] py-3 text-center text-sm font-bold text-white shadow-action" @click="openPay('recharge')">Recharger</button>
          </div>
        </div>
      </div>
    </div>

    <div class="mt-4.5 grid grid-cols-1 gap-4.5 @xl:grid-cols-2">
      <div class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
        <p class="mb-1.5 mt-0 text-xs font-black uppercase tracking-[.06em] text-[var(--text-faint)]">Prochaines étapes</p>
        <div v-if="nextStepsLoading" class="flex flex-col gap-2 pt-2">
          <DataSkeletonCard v-for="i in 2" :key="i" :height="50" :lines="1" />
        </div>
        <p v-else-if="!nextSteps.length" class="mb-0 mt-3 text-[13px] text-[var(--text-muted)]">Rien de particulier à faire pour l'instant.</p>
        <div v-else v-for="n in nextSteps" :key="n.key" class="flex items-center gap-3.5 border-b border-sand-200 py-3.5 last:border-b-0">
          <div class="grid h-[34px] w-[34px] flex-none place-items-center rounded-sm bg-warn-bg text-sm">◷</div>
          <div class="min-w-0 flex-1">
            <p class="m-0 line-clamp-2 text-sm font-semibold leading-snug">{{ n.label }}</p>
            <p class="mb-0 mt-0.5 truncate text-xs text-[var(--text-faint)]">{{ n.hint }}</p>
          </div>
          <NuxtLink :to="n.to" class="inline-flex min-h-10 flex-none items-center rounded-pill border border-[var(--border-default)] bg-white px-4 text-xs font-bold">{{ n.cta }}</NuxtLink>
        </div>
      </div>
      <div class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
        <p class="mb-1.5 mt-0 text-xs font-black uppercase tracking-[.06em] text-[var(--text-faint)]">Activité récente</p>
        <div v-if="activityLoading" class="flex flex-col gap-2 pt-2">
          <DataSkeletonCard v-for="i in 3" :key="i" :height="30" :lines="1" />
        </div>
        <p v-else-if="!activity.length" class="mb-0 mt-3 text-[13px] text-[var(--text-muted)]">Aucune activité récente.</p>
        <div v-else v-for="a in activity" :key="a.key" class="flex items-center gap-3.5 border-b border-sand-200 py-3 last:border-b-0">
          <span class="h-2 w-2 flex-none rounded-pill" :class="a.dot" />
          <p class="m-0 line-clamp-2 min-w-0 flex-1 text-[13.5px] leading-snug">{{ a.label }}</p>
          <span class="flex-none whitespace-nowrap text-xs text-[var(--text-faint)]">{{ formatDate(a.date) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
