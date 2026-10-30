<script setup lang="ts">
import { FileText, Lock, Receipt } from '@lucide/vue'
import type { DocumentResult } from '~/composables/usePdfDocument'
import type { ArtisanRequestSummary } from '~/types/artisan'
import { interventionPhase } from '~/utils/artisanRequests'
import { useArtisanProfile } from '~/composables/useArtisanProfile'

definePageMeta({ layout: 'artisan' })

const modal = useArtisanModal()
const wallet = useTenantWallet()
const withdrawals = useWithdrawals()
const artisanApi = useArtisanRequestsApi()
const pdfDoc = usePdfDocument()
const preview = useProtectedFile()
const artisan = useArtisanProfile()
const { tradeLabel } = artisan

onMounted(wallet.ensureLoaded)
onMounted(artisan.ensureTrades)

/** Solde connu seulement une fois chargé : jamais « 0 FCFA » pendant le chargement ou après une panne. */
const balanceKnown = computed(() => wallet.state.value === 'success')

const missionsBlock = useFetchBlock(() => artisanApi.listMine())
onMounted(missionsBlock.load)
const missionsSettled = computed(() => ['success', 'empty'].includes(missionsBlock.state.value))

const paidMissions = computed(() => missionsBlock.items.value
  .filter((r): r is ArtisanRequestSummary & { paid_at: string } => !!r.paid_at)
  .sort((a, b) => new Date(b.paid_at).getTime() - new Date(a.paid_at).getTime()))

/**
 * Retenues encore bloquées. `retained_amount` n'est jamais remis à zéro par l'API une fois la part versée
 * ou partagée après litige (constaté en live, Lot 54) : seules les missions pas encore clôturées comptent.
 */
const stillHeld = computed(() => paidMissions.value.filter(r => r.status === 'in_progress' || r.status === 'completed'))
const retainedTotal = computed(() => stillHeld.value.reduce((sum, r) => sum + (Number(r.retained_amount) || 0), 0))
const nextRelease = computed(() => stillHeld.value
  .filter((r): r is typeof r & { warranty_expires_at: string } => !!r.warranty_expires_at && Number(r.retained_amount) > 0 && !r.disputed_at)
  .sort((a, b) => new Date(a.warranty_expires_at).getTime() - new Date(b.warranty_expires_at).getTime())[0])
const frozenCount = computed(() => stillHeld.value.filter(r => !!r.disputed_at && Number(r.retained_amount) > 0).length)

/* ---- Historique du wallet : rechargé à la fermeture de la modale de retrait (comme pro/wallet.vue) ---- */
const history = ref<{ load: () => Promise<void> } | null>(null)
watch(modal, (v, prev) => { if (prev === 'retrait' && v === '') history.value?.load() })

/* ---- Facture : l'onglet s'ouvre AVANT l'appel (sinon bloqué comme pop-up sur mobile), puis reçoit le document ---- */
const openingKey = ref<string | null>(null)
const openError = ref('')
async function openInvoice(r: ArtisanRequestSummary) {
  openingKey.value = r.id
  openError.value = ''
  const tab = window.open('', '_blank')
  tab?.document.write('<p style="font-family:system-ui,sans-serif;padding:24px;color:#555">Ouverture de la facture…</p>')
  const fail = (message: string) => {
    tab?.close()
    openError.value = message
  }
  try {
    const result: DocumentResult = await pdfDoc.fetchDocument(`/artisan-requests/${r.id}/invoice`)
    let url: string | null = null
    if (result.mode === 'pdf') {
      await preview.load(result.downloadUrl)
      url = preview.objectUrl.value
      if (!url) return fail(preview.errorMessage.value ?? 'Aperçu de la facture indisponible.')
    } else if (result.mode === 'html') {
      url = URL.createObjectURL(new Blob([result.html], { type: 'text/html' }))
    } else {
      return fail(result.message)
    }
    if (tab) tab.location.href = url
    else window.location.href = url
  } catch {
    fail("La facture n'a pas pu être ouverte.")
  } finally {
    openingKey.value = null
  }
}

function missionLink(r: ArtisanRequestSummary) {
  const tab = ['warranty', 'closed', 'cancelled'].includes(interventionPhase(r)) ? 'terminees' : 'encours'
  return `/artisan/missions?tab=${tab}&request=${r.id}`
}
function formatDay(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}
function formatLong(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
}
</script>

<template>
  <div class="animate-[im-fade_.3s_ease_backwards]">
    <div class="grid grid-cols-1 gap-4.5 sm:grid-cols-2">
      <!-- Solde -->
      <section class="rounded-2xl bg-[image:var(--gradient-balance)] p-5.5 text-white sm:p-6">
        <p class="m-0 text-label font-bold uppercase tracking-label text-white/60">Solde disponible</p>
        <div v-if="wallet.state.value === 'idle' || wallet.state.value === 'loading'" class="mt-3 h-[38px] w-[180px] animate-pulse rounded-md bg-white/20" aria-label="Chargement du solde" />
        <template v-else-if="wallet.state.value === 'error'">
          <p class="mb-0 mt-3 text-lg font-bold">Solde indisponible</p>
          <p class="mb-0 mt-1 text-[13px] text-white/80">
            Le solde n'a pas pu être chargé.
            <button type="button" class="ml-1 font-bold underline" @click="wallet.reload">Réessayer</button>
          </p>
        </template>
        <p v-else class="mb-0 mt-3 font-mono text-[28px] font-bold sm:text-[32px] tracking-[-.02em]">{{ formatFcfa(wallet.balanceTotal.value) }}</p>
        <p v-if="balanceKnown && withdrawals.pending.value" class="mb-0 mt-1.5 text-[12.5px] font-semibold text-white/90"><span class="font-mono">{{ formatFcfa(Number(withdrawals.pending.value.amount)) }}</span> en cours de retrait, déjà déduits de ce solde.</p>
        <p class="mb-0 mt-2 text-[13px] leading-[1.55] text-white/75">Alimenté par les paiements de vos missions. Retirable vers Mobile Money.</p>
        <CoreButton tone="secondary" class="mt-4" :disabled="!balanceKnown" @click="modal = 'retrait'">Retirer</CoreButton>
      </section>

      <!-- Retenues -->
      <section class="rounded-2xl border border-[var(--border-escrow)] bg-[var(--surface-escrow)] p-5.5 sm:p-6">
        <p class="m-0 inline-flex items-center gap-1.5 text-label font-bold uppercase tracking-label text-clay-700">
          <Lock class="h-3.5 w-3.5" :stroke-width="1.9" aria-hidden="true" />Retenu en garantie
        </p>
        <div v-if="missionsBlock.state.value === 'idle' || missionsBlock.state.value === 'loading'" class="mt-3 h-[38px] w-[160px] animate-pulse rounded-md bg-clay-500/15" aria-label="Chargement des retenues" />
        <template v-else-if="missionsBlock.state.value === 'error'">
          <p class="mb-0 mt-3 text-lg font-bold text-clay-900">Montant indisponible</p>
          <p class="mb-0 mt-1 text-[13px] text-clay-900">
            Vos missions n'ont pas pu être chargées.
            <button type="button" class="ml-1 font-bold underline" @click="missionsBlock.load">Réessayer</button>
          </p>
        </template>
        <template v-else>
          <p class="mb-0 mt-3 font-mono text-[28px] font-bold sm:text-[32px] tracking-[-.02em] text-clay-700">{{ formatFcfa(retainedTotal) }}</p>
          <p class="mb-0 mt-2 text-[13px] leading-[1.55] text-clay-900">
            <template v-if="nextRelease">Prochain versement : <span class="font-mono font-bold">{{ formatFcfa(Number(nextRelease.retained_amount)) }}</span> le {{ formatLong(nextRelease.warranty_expires_at) }} ({{ tradeLabel(nextRelease.trade_reference_id) }}), sauf problème signalé d'ici là.</template>
            <template v-else-if="retainedTotal === 0">Aucune garantie en cours.</template>
            <template v-if="frozenCount"> {{ frozenCount === 1 ? 'Une retenue est gelée par un litige.' : `${frozenCount} retenues sont gelées par un litige.` }}</template>
          </p>
        </template>
      </section>
    </div>

    <p v-if="openError" class="mb-0 mt-4.5 rounded-md border border-danger-border bg-danger-bg px-3.5 py-2.5 text-[13px] font-semibold text-danger-fg">{{ openError }}</p>

    <!-- Paiements par mission -->
    <section class="mt-4.5 rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
      <h2 class="m-0 text-[15px] font-bold">Paiements par mission</h2>
      <p class="mb-3 mt-1 text-[13px] text-[var(--text-muted)]">Une facture par mission payée.</p>
      <div v-if="missionsBlock.state.value === 'idle' || missionsBlock.state.value === 'loading'" class="flex flex-col gap-2.5">
        <DataSkeletonCard v-for="i in 3" :key="i" :height="52" :lines="0" />
      </div>
      <FeedbackAlertBanner v-else-if="missionsBlock.state.value === 'error'" tone="danger">
        Impossible de charger vos missions payées.
        <button type="button" class="ml-2 font-bold underline" @click="missionsBlock.load">Réessayer</button>
      </FeedbackAlertBanner>
      <div v-else-if="missionsSettled && !paidMissions.length" class="flex flex-col items-center px-4 py-7 text-center">
        <div class="grid h-[46px] w-[46px] place-items-center rounded-pill bg-green-50 text-green-700"><Receipt class="h-5 w-5" :stroke-width="1.9" aria-hidden="true" /></div>
        <p class="mx-auto mb-0 mt-3 max-w-[380px] text-[13.5px] leading-[1.55] text-[var(--text-muted)]">Aucune mission payée pour l'instant. Une fois votre offre acceptée et payée, la facture se télécharge ici.</p>
        <CoreButton size="sm" tone="secondary" class="mt-4" @click="navigateTo('/artisan/missions?tab=ouvertes')">Voir les postes ouverts</CoreButton>
      </div>
      <div v-else>
        <div v-for="r in paidMissions" :key="r.id" class="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-sand-200 py-3 last:border-b-0">
          <div class="min-w-0 flex-1 basis-[160px]">
            <NuxtLink :to="missionLink(r)" class="block truncate text-sm font-bold hover:text-green-700 hover:underline">
              {{ tradeLabel(r.trade_reference_id) }} — {{ r.unit?.name ?? 'Logement' }}
            </NuxtLink>
            <p class="mb-0 mt-0.5 text-xs text-[var(--text-faint)]">Payée le <span class="font-mono">{{ formatDay(r.paid_at) }}</span></p>
          </div>
          <span v-if="Number(r.retained_amount) > 0 && (r.status === 'in_progress' || r.status === 'completed')" class="inline-flex items-center gap-1 font-mono text-[12.5px] text-clay-700">
            <Lock class="h-3.5 w-3.5" :stroke-width="1.9" aria-hidden="true" />{{ formatFcfa(Number(r.retained_amount)) }}
          </span>
          <CoreButton size="sm" tone="secondary" :disabled="openingKey === r.id" @click="openInvoice(r)">
            <span class="inline-flex items-center gap-1.5"><FileText class="h-4 w-4" :stroke-width="1.9" aria-hidden="true" />{{ openingKey === r.id ? 'Ouverture…' : 'Facture' }}</span>
          </CoreButton>
        </div>
      </div>
    </section>

    <WalletWithdrawalList class="mt-4.5" />
    <WalletTransactionHistory ref="history" class="mt-4.5" />
  </div>
</template>
