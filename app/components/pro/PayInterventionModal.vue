<script setup lang="ts">
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
const balanceAfter = computed(() => wallet.balanceTotal.value - price.value)
const insufficientBalance = computed(() => price.value > wallet.balanceTotal.value)

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
  <Teleport to="body">
    <div v-if="open" class="fixed inset-0 z-[90] grid animate-[im-veil_.22s_ease_both] place-items-center bg-black/50 p-6 backdrop-blur-[3px]" @click="close">
      <div class="w-[460px] max-w-[calc(100vw-3rem)] overflow-hidden rounded-2xl bg-[var(--surface-page)] shadow-panel animate-[im-rise_.28s_var(--ease-standard)_both]" @click.stop>
        <div class="flex items-center justify-between border-b border-[var(--border-subtle)] px-6 py-4.5">
          <h3 class="m-0 font-display text-[19px] font-bold tracking-[-.02em]">{{ step === 'done' ? 'Paiement effectué' : "Payer l'intervention" }}</h3>
          <button type="button" class="grid h-[34px] w-[34px] place-items-center rounded-pill bg-sand-200 text-[15px] text-sand-800" @click="close">✕</button>
        </div>

        <div class="p-6">
          <template v-if="step === 'loading'">
            <p class="m-0 text-[13.5px] text-[var(--text-muted)]">Chargement…</p>
          </template>

          <template v-else-if="step === 'error'">
            <p class="m-0 text-[13.5px] font-semibold text-danger-fg">{{ loadError }}</p>
          </template>

          <template v-else-if="step === 'confirm'">
            <p class="m-0 text-[13px] font-bold uppercase tracking-[.04em] text-[var(--text-faint)]">{{ tradeLabel(request?.trade_reference_id) }} — {{ artisanName(request) }}</p>

            <div class="mt-3.5 rounded-md border border-[var(--border-subtle)] bg-white p-4">
              <div class="flex items-center justify-between py-1">
                <span class="text-[13px] text-[var(--text-muted)]">Montant de l'intervention</span>
                <span class="font-mono text-[15px] font-bold">{{ formatFcfa(price) }}</span>
              </div>
              <div class="flex items-center justify-between py-1">
                <span class="text-[13px] text-[var(--text-muted)]">Versé à l'artisan immédiatement</span>
                <span class="font-mono text-[13.5px]">{{ formatFcfa(immediateAmount) }}</span>
              </div>
              <div v-if="retainedAmount > 0" class="flex items-center justify-between py-1">
                <span class="text-[13px] text-[var(--text-muted)]">Retenu en garantie ({{ retentionPct }} %, {{ offer?.warranty_days }} j)</span>
                <span class="font-mono text-[13.5px]">{{ formatFcfa(retainedAmount) }}</span>
              </div>
            </div>

            <div class="mt-3.5 flex items-center justify-between rounded-md px-1 py-1">
              <span class="text-[12.5px] text-[var(--text-faint)]">Solde après paiement</span>
              <span class="font-mono text-[12.5px] font-bold" :class="insufficientBalance ? 'text-danger-fg' : 'text-[var(--text-secondary)]'">{{ formatFcfa(balanceAfter) }}</span>
            </div>
            <p v-if="insufficientBalance" class="mb-0 mt-2 text-[12.5px] font-semibold text-danger-fg">Solde insuffisant pour ce paiement.</p>
            <p v-if="submitError" class="mb-0 mt-2 text-[12.5px] font-semibold text-danger-fg">{{ submitError }}</p>

            <div class="mt-5 flex gap-2.5">
              <button type="button" class="flex-1 rounded-md border border-[var(--border-default)] bg-white py-3.5 text-sm font-bold" :disabled="submitting" @click="close">Annuler</button>
              <button
                type="button"
                class="flex-1 rounded-md py-3.5 text-sm font-bold text-white transition-colors"
                :class="insufficientBalance || submitting ? 'cursor-not-allowed bg-sand-400' : 'cursor-pointer bg-[image:var(--action-primary)] shadow-action'"
                :disabled="insufficientBalance || submitting"
                @click="submit"
              >{{ submitting ? 'Paiement…' : `Payer ${formatFcfa(price)}` }}</button>
            </div>
          </template>

          <template v-else>
            <div class="px-0.5 py-1 text-center">
              <div class="mx-auto grid h-15 w-15 animate-[im-pop_.5s_ease] place-items-center rounded-pill bg-green-600 text-[28px] text-white">✓</div>
              <p class="mb-0 mt-4.5 text-lg font-bold">Paiement effectué</p>
              <p class="mx-auto mb-0 mt-2.5 max-w-[320px] text-sm leading-[1.6] text-[var(--text-muted)]">
                {{ formatFcfa(immediateAmount) }} versés à l'artisan{{ retainedAmount > 0 ? `, ${formatFcfa(retainedAmount)} retenus en garantie.` : '.' }}
              </p>
              <CoreButton size="lg" full-width class="mt-5" @click="close">Terminé</CoreButton>
            </div>
          </template>
        </div>
      </div>
    </div>
  </Teleport>
</template>
