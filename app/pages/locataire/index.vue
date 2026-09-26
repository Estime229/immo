<script setup lang="ts">
import type { LeaseStatus } from '~/types/tenant'
import { buildActivityFeed, buildNextSteps, findLateLeaseInvoice } from '~/utils/tenantDashboard'

definePageMeta({ layout: 'locataire' })

const wallet = useTenantWallet()
const { openPay } = usePaymentModal()

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
  navigateTo('/locataire/bail')
}

/* ---- Mes logements ---- */
const LEASE_STATUS_LABEL: Record<LeaseStatus, string> = {
  draft: 'Brouillon',
  pending_signature: 'En attente de signature',
  signed: 'Paiement en attente',
  active: 'Actif',
  terminated: 'Résilié'
}

const leaseCards = computed(() => leasesBlock.leases.value.map((l, i) => {
  const late = lateInfo.value?.lease.id === l.id
  return {
    id: l.id,
    title: [l.unit?.name, l.property?.name].filter(Boolean).join(' — ') || 'Logement',
    rentFmt: formatFcfaShort(Number(l.signed_rent)),
    photo: TENANT_PHOTOS[i % TENANT_PHOTOS.length],
    statusLabel: late ? 'En retard' : LEASE_STATUS_LABEL[l.status],
    tone: late ? 'danger' as const : l.status === 'active' ? 'ok' as const : 'neutral' as const
  }
}))

function openLease() {
  navigateTo('/locataire/bail')
}

/* ---- Prochaines étapes (dérivées de baux + réservations + demandes + liste d'attente) ---- */
const nextSteps = computed(() => buildNextSteps({
  leases: leasesBlock.leases.value,
  bookings: bookingsBlock.items.value,
  housingRequests: housingRequestsBlock.items.value,
  waitlist: waitlistBlock.items.value
}))
const nextStepsLoading = computed(() =>
  [leasesBlock.state.value, bookingsBlock.state.value, housingRequestsBlock.state.value, waitlistBlock.state.value].includes('loading')
)

/* ---- Activité récente (signalements + notifications fusionnés) ---- */
const activity = computed(() => buildActivityFeed(signalsBlock.items.value, notificationsBlock.items.value, localizeNotification))
const activityLoading = computed(() => signalsBlock.state.value === 'loading' || notificationsBlock.state.value === 'loading')
</script>

<template>
  <div class="animate-[im-fade_.3s_ease_both]">
    <LayoutKycNotice space="locataire" />
    <FeedbackAlertBanner v-if="lateInfo" tone="danger" action-label="Payer maintenant" class="mb-5" @action="payLateLease">
      {{ dashAlert }}
    </FeedbackAlertBanner>

    <div class="grid grid-cols-1 gap-4.5 lg:grid-cols-[1.35fr_1fr]">
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

        <div v-else class="flex flex-col gap-2.5">
          <div
            v-for="l in leaseCards"
            :key="l.id"
            class="flex cursor-pointer gap-3.5 rounded-lg border border-[var(--border-subtle)] p-3 transition-shadow hover:shadow-raised"
            @click="openLease"
          >
            <div class="h-[66px] w-[78px] flex-none rounded-md bg-cover bg-center" :style="{ backgroundImage: l.photo }" />
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <p class="m-0 truncate text-[14.5px] font-bold tracking-[-.01em]">{{ l.title }}</p>
                <CoreBadge :tone="l.tone" class="flex-none">{{ l.statusLabel }}</CoreBadge>
              </div>
              <div class="mt-2 flex items-baseline gap-3">
                <span class="font-mono text-sm font-bold">{{ l.rentFmt }}<span class="font-body text-[11px] font-medium text-[var(--text-faint)]"> / mois</span></span>
              </div>
            </div>
            <span class="self-center text-[15px] text-[var(--text-faint)]">→</span>
          </div>
        </div>
      </div>

      <div class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
        <div class="mb-4 flex items-center justify-between">
          <p class="m-0 text-xs font-black uppercase tracking-[.06em] text-[var(--text-faint)]">Mon wallet</p>
          <NuxtLink to="/locataire/wallet" class="text-[12.5px] font-bold text-green-700">Détail →</NuxtLink>
        </div>
        <div v-if="wallet.state.value === 'loading'"><DataSkeletonCard :height="70" :lines="1" /></div>
        <div v-else class="grid grid-cols-2 gap-3">
          <div class="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-page)] p-3.5">
            <p class="m-0 text-[11.5px] font-bold text-[var(--text-muted)]">Solde disponible</p>
            <p class="mb-0 mt-1.5 font-mono text-lg font-bold">{{ formatFcfaShort(wallet.balanceTotal.value) }}</p>
          </div>
          <div class="rounded-md border border-green-100 bg-green-50 p-3.5">
            <p class="m-0 text-[11.5px] font-bold text-green-700">Tirelire</p>
            <p class="mb-0 mt-1.5 font-mono text-lg font-bold text-green-900">{{ formatFcfaShort(wallet.balanceSavings.value) }}</p>
          </div>
        </div>
        <p class="mb-0 mt-3 text-[12.5px] leading-[1.5] text-[var(--text-muted)]">
          La tirelire est la part réservée au logement : c'est elle qui sert à payer un loyer ou une réservation.
        </p>
        <button type="button" class="mt-3.5 block w-full rounded-md bg-[image:var(--action-primary)] py-3 text-center text-sm font-bold text-white shadow-action" @click="openPay('recharge')">Recharger</button>
      </div>
    </div>

    <div class="mt-4.5 grid grid-cols-1 gap-4.5 lg:grid-cols-2">
      <div class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
        <p class="mb-1.5 mt-0 text-xs font-black uppercase tracking-[.06em] text-[var(--text-faint)]">Prochaines étapes</p>
        <div v-if="nextStepsLoading" class="flex flex-col gap-2 pt-2">
          <DataSkeletonCard v-for="i in 2" :key="i" :height="50" :lines="1" />
        </div>
        <p v-else-if="!nextSteps.length" class="mb-0 mt-3 text-[13px] text-[var(--text-muted)]">Rien de particulier à faire pour l'instant.</p>
        <div v-else v-for="n in nextSteps" :key="n.key" class="flex items-center gap-3.5 border-b border-sand-200 py-3.5 last:border-b-0">
          <div class="grid h-[34px] w-[34px] flex-none place-items-center rounded-sm bg-warn-bg text-sm">◷</div>
          <div class="min-w-0 flex-1">
            <p class="m-0 truncate text-sm font-semibold">{{ n.label }}</p>
            <p class="mb-0 mt-0.5 truncate text-xs text-[var(--text-faint)]">{{ n.hint }}</p>
          </div>
          <NuxtLink :to="n.to" class="flex-none rounded-pill border border-[var(--border-default)] bg-white px-3.5 py-2 text-xs font-bold">{{ n.cta }}</NuxtLink>
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
          <p class="m-0 flex-1 truncate text-[13.5px]">{{ a.label }}</p>
          <span class="flex-none whitespace-nowrap text-xs text-[var(--text-faint)]">{{ formatDate(a.date) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
