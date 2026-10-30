<script setup lang="ts">
import { CircleCheck, Lock } from '@lucide/vue'
import type { ArtisanOffer, ArtisanRequestSummary } from '~/types/artisan'
import type { RefEntry } from '~/types/reference'
import { ApiRequestError } from '~/utils/authenticatedFetcher'

/**
 * Récapitulatif obligatoire avant de payer une intervention artisan — avant
 * ce composant, `doPay()` (pro/artisans.vue) débitait le wallet en un clic
 * isolé depuis la liste, sans aucun montant affiché ni confirmation. Voir
 * TEST-CASES.md, §9.1, priorité #1 : la seule action de toute la plateforme
 * qui déplace de l'argent réel sans aucun garde-fou.
 */
const modal = useProModal()
const targetId = useProModalTarget()
const open = computed(() => modal.value === 'payerIntervention')

const artisanApi = useArtisanRequestsApi()
const refData = useReferenceData()
const wallet = useTenantWallet()
const refresh = useArtisanRequestsRefresh()

const step = ref<'loading' | 'confirm' | 'done' | 'error'>('loading')
const request = ref<ArtisanRequestSummary | null>(null)
const offer = ref<ArtisanOffer | null>(null)
const trades = ref<RefEntry[]>([])
const loadError = ref('')
const submitting = ref(false)
const submitError = ref('')

function tradeLabel(id?: string) {
  return trades.value.find(t => t.id === id)?.labels.fr ?? 'Intervention'
}
function artisanName(r: ArtisanRequestSummary | null) {
  const name = [r?.target_artisan?.first_name, r?.target_artisan?.last_name].filter(Boolean).join(' ')
  return name || 'un artisan'
}

watch(open, async v => {
  if (!v) return
  step.value = 'loading'
  loadError.value = ''
  submitError.value = ''
  request.value = null
  offer.value = null
  const id = targetId.value
  if (!id) {
    step.value = 'error'
    loadError.value = 'Demande introuvable.'
    return
  }
  try {
    const [mine, offers] = await Promise.all([
      artisanApi.listMine(),
      artisanApi.listOffers(id),
      trades.value.length ? Promise.resolve() : refData.fetchRef('ARTISAN_TRADE').then(r => { trades.value = r }),
      wallet.ensureLoaded()
    ])
    request.value = mine.find(r => r.id === id) ?? null
    offer.value = offers.find(o => o.status === 'accepted') ?? null
    if (!request.value || !offer.value) {
      step.value = 'error'
      loadError.value = "Impossible de charger le détail de cette intervention."
    } else {
      step.value = 'confirm'
    }
  } catch {
    step.value = 'error'
    loadError.value = "Impossible de charger le détail de cette intervention."
  }
})

const price = computed(() => Number(offer.value?.price ?? 0))
const retentionPct = computed(() => offer.value?.retention_percentage ?? 0)
const retainedAmount = computed(() => Math.round((price.value * retentionPct.value) / 100))
const immediateAmount = computed(() => price.value - retainedAmount.value)
/** Solde inconnu (lecture du wallet en échec) : jamais affiché « 0 F », l'API vérifie au paiement. */
const balanceKnown = computed(() => wallet.state.value === 'success')
const balanceAfter = computed(() => wallet.balanceTotal.value - price.value)
const insufficientBalance = computed(() => balanceKnown.value && price.value > wallet.balanceTotal.value)

const modalTitle = computed(() => (step.value === 'done' ? 'Paiement effectué' : "Payer l'intervention"))

function close() {
  modal.value = ''
  targetId.value = null
}

async function submit() {
  if (!targetId.value || insufficientBalance.value) return
  submitting.value = true
  submitError.value = ''
  try {
    await artisanApi.pay(targetId.value)
    await wallet.reload()
    refresh.value++
    step.value = 'done'
  } catch (e) {
    submitError.value = e instanceof ApiRequestError ? (e.mapped.bannerMessage ?? 'Le paiement a échoué.') : 'Le paiement a échoué.'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <CoreModal :open="open" :title="modalTitle" width="480px" @close="close">
    <div v-if="step === 'loading'" class="flex flex-col gap-2.5">
      <DataSkeletonCard :height="120" :lines="1" />
    </div>

    <p v-else-if="step === 'error'" class="m-0 text-[13.5px] font-semibold text-danger-fg">{{ loadError }} Fermez cette fenêtre puis réessayez depuis la liste.</p>

    <template v-else-if="step === 'confirm'">
      <p class="m-0 text-label font-bold uppercase tracking-label text-[var(--text-faint)]">{{ tradeLabel(request?.trade_reference_id) }} · {{ artisanName(request) }}</p>

      <div class="mt-3 rounded-md border border-[var(--border-default)] bg-white px-4 py-3">
        <DataMoneyLine label="Montant de l'intervention" :value="formatFcfa(price)" />
        <DataMoneyLine label="Versé à l'artisan tout de suite" :value="formatFcfa(immediateAmount)" />
        <DataMoneyLine v-if="retainedAmount > 0" :label="`Retenu en garantie (${retentionPct} %, ${offer?.warranty_days} j)`" :value="formatFcfa(retainedAmount)" />
      </div>
      <p v-if="retainedAmount > 0" class="mb-0 mt-2.5 flex items-start gap-2 text-[12.5px] leading-[1.5] text-[var(--text-muted)]">
        <Lock class="mt-0.5 h-3.5 w-3.5 flex-none" :stroke-width="1.9" />
        La part retenue est conservée par Immo et versée à l'artisan à la fin de la garantie, sauf si vous signalez un problème d'ici là.
      </p>

      <div class="mt-3.5 flex items-center justify-between gap-3 px-1">
        <span class="text-[12.5px] text-[var(--text-muted)]">Solde après paiement</span>
        <span v-if="balanceKnown" class="font-mono text-[13px] font-bold" :class="insufficientBalance ? 'text-danger-fg' : 'text-[var(--text-secondary)]'">{{ formatFcfa(balanceAfter) }}</span>
        <span v-else class="text-[12.5px] text-[var(--text-faint)]">Solde indisponible · <button type="button" class="font-bold text-green-700" @click="wallet.reload()">Réessayer</button></span>
      </div>
      <p v-if="!balanceKnown" class="mb-0 mt-1.5 px-1 text-xs text-[var(--text-faint)]">Votre solde sera vérifié au moment du paiement.</p>
      <p v-if="insufficientBalance" class="mb-0 mt-2 text-[13px] font-semibold text-danger-fg">
        Solde insuffisant pour ce paiement. <NuxtLink to="/pro/wallet" class="font-bold underline" @click="close">Voir mon wallet</NuxtLink>
      </p>
      <p v-if="submitError" class="mb-0 mt-2 text-[13px] font-semibold text-danger-fg">{{ submitError }}</p>
    </template>

    <div v-else class="flex flex-col items-center py-2 text-center">
      <span class="grid h-[46px] w-[46px] place-items-center rounded-pill bg-green-50 text-green-700"><CircleCheck class="h-6 w-6" :stroke-width="1.9" /></span>
      <p class="mb-0 mt-3.5 text-[15px] font-bold">Paiement effectué</p>
      <p class="mx-auto mb-0 mt-2 max-w-[340px] text-[13.5px] leading-[1.6] text-[var(--text-muted)]">
        <span class="font-mono">{{ formatFcfa(immediateAmount) }}</span> versés à l'artisan<template v-if="retainedAmount > 0">, <span class="font-mono">{{ formatFcfa(retainedAmount) }}</span> retenus en garantie</template>. Il réalise l'intervention puis la marque terminée.
      </p>
    </div>

    <template v-if="step === 'confirm' || step === 'done'" #footer>
      <div v-if="step === 'confirm'" class="flex flex-wrap justify-end gap-2.5">
        <CoreButton tone="secondary" :disabled="submitting" @click="close">Annuler</CoreButton>
        <CoreButton :disabled="insufficientBalance || submitting" @click="submit">{{ submitting ? 'Paiement…' : `Payer ${formatFcfa(price)}` }}</CoreButton>
      </div>
      <CoreButton v-else full-width @click="close">Terminé</CoreButton>
    </template>
  </CoreModal>
</template>
