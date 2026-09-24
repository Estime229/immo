<script setup lang="ts">
import { ApiRequestError } from '~/utils/authenticatedFetcher'

const modal = useArtisanModal()
const targetId = useArtisanModalTarget()
const open = computed(() => modal.value === 'offre')

const artisanApi = useArtisanRequestsApi()
const refresh = useArtisanRequestsRefresh()

const step = ref<'form' | 'done'>('form')
const loading = ref(false)
const errorMessage = ref('')

const prix = ref('40 000')
const warrantyDays = ref(7)
const retenue = ref(20)

const DELAIS = [
  { label: '24 h', days: 1 },
  { label: '7 jours', days: 7 },
  { label: '30 jours', days: 30 }
]

watch(open, v => {
  if (v) {
    step.value = 'form'
    errorMessage.value = ''
    prix.value = '40 000'
    warrantyDays.value = 7
    retenue.value = 20
  }
})

function onPrixInput(e: Event) {
  const digits = (e.target as HTMLInputElement).value.replace(/\D/g, '')
  prix.value = digits ? Number(digits).toLocaleString('fr-FR').replace(/ |,/g, ' ') : ''
}

const prixNum = computed(() => Number(prix.value.replace(/\D/g, '')) || 0)
const heldNum = computed(() => Math.round((prixNum.value * retenue.value) / 100))
function fmt(n: number) {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' F'
}

const canSubmit = computed(() => prixNum.value > 0 && !!targetId.value)

function close() {
  modal.value = ''
  targetId.value = null
}

async function submit() {
  if (!canSubmit.value || !targetId.value) return
  loading.value = true
  errorMessage.value = ''
  try {
    await artisanApi.submitOffer(targetId.value, { price: prixNum.value, warranty_days: warrantyDays.value, retention_percentage: retenue.value })
    refresh.value++
    step.value = 'done'
  } catch (e) {
    errorMessage.value = e instanceof ApiRequestError ? (e.mapped.bannerMessage ?? "L'offre a échoué.") : "L'offre a échoué."
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="fixed inset-0 z-[90] grid animate-[im-veil_.22s_ease_both] place-items-center bg-black/50 p-6 backdrop-blur-[3px]" @click="close">
      <div class="w-[460px] max-w-[calc(100vw-3rem)] overflow-hidden rounded-2xl bg-[var(--surface-page)] shadow-panel animate-[im-rise_.28s_var(--ease-standard)_both]" @click.stop>
        <div class="flex items-center justify-between border-b border-[var(--border-subtle)] px-6 py-4.5">
          <h3 class="m-0 font-display text-[19px] font-bold tracking-[-.02em]">{{ step === 'done' ? 'Offre envoyée' : 'Faire une offre' }}</h3>
          <button type="button" class="grid h-[34px] w-[34px] place-items-center rounded-pill bg-sand-200 text-[15px] text-sand-800" @click="close">✕</button>
        </div>

        <div class="p-6">
          <template v-if="step === 'form'">
            <p class="mb-2 mt-0 text-[13px] font-bold">Votre prix</p>
            <div class="flex items-baseline gap-2 rounded-md border border-[var(--border-default)] bg-white px-4 py-3.5">
              <input :value="prix" inputmode="numeric" class="min-w-0 flex-1 border-0 bg-transparent font-mono text-[22px] font-bold outline-none" @input="onPrixInput">
              <span class="font-mono text-[15px] font-bold text-[var(--text-faint)]">FCFA</span>
            </div>

            <p class="mb-2 mt-4.5 text-[13px] font-bold">Garantie proposée</p>
            <div class="flex gap-2">
              <button
                v-for="d in DELAIS"
                :key="d.days"
                type="button"
                class="flex-1 rounded-md border-[1.5px] py-2.5 text-[13px] font-bold transition-all"
                :class="warrantyDays === d.days ? 'border-green-600 bg-green-50 text-green-700' : 'border-[var(--border-default)] bg-white text-[var(--text-secondary)]'"
                @click="warrantyDays = d.days"
              >{{ d.label }}</button>
            </div>

            <div class="mb-2 mt-4.5 flex items-baseline justify-between">
              <p class="m-0 text-[13px] font-bold">Retenue proposée</p>
              <span class="font-mono text-[13.5px] font-bold text-clay-700">{{ retenue }} %</span>
            </div>
            <input v-model.number="retenue" type="range" min="0" max="30" step="5" class="w-full accent-green-600">

            <div class="mt-4.5 rounded-md border border-[var(--border-escrow)] bg-[var(--surface-escrow)] p-4">
              <div class="flex justify-between py-0.5 font-mono text-[13.5px] text-ok-fg"><span>Perçu immédiatement</span><span>{{ fmt(prixNum - heldNum) }}</span></div>
              <div class="flex justify-between py-0.5 font-mono text-[13.5px] text-clay-700"><span>🔒 Retenu en garantie</span><span>{{ fmt(heldNum) }}</span></div>
            </div>

            <p v-if="errorMessage" class="mb-0 mt-3 text-[13px] font-semibold text-danger-fg">{{ errorMessage }}</p>
            <CoreButton size="lg" full-width class="mt-5" :disabled="!canSubmit || loading" @click="submit">{{ loading ? 'Envoi…' : 'Envoyer mon offre' }}</CoreButton>
          </template>

          <template v-else>
            <div class="px-0.5 py-1 text-center">
              <div class="mx-auto grid h-15 w-15 animate-[im-pop_.5s_ease] place-items-center rounded-pill bg-green-600 text-[28px] text-white">✓</div>
              <p class="mb-0 mt-4.5 text-lg font-bold">Offre envoyée</p>
              <p class="mx-auto mb-0 mt-2.5 max-w-[320px] text-sm leading-[1.6] text-[var(--text-muted)]">Le demandeur compare les offres reçues. Vous serez notifié de sa décision.</p>
              <CoreButton size="lg" full-width class="mt-5" @click="close">Terminé</CoreButton>
            </div>
          </template>
        </div>
      </div>
    </div>
  </Teleport>
</template>
