<script setup lang="ts">
import { ApiRequestError } from '~/utils/authenticatedFetcher'

const leaseModal = useLeaseModal()
const { activeLease } = useTenantLeases()
const leasesApi = useLeasesApi()

const kind = computed<'advance' | 'prepaid'>(() => (leaseModal.value === 'alimenter-prepaye' ? 'prepaid' : 'advance'))
const open = computed(() => leaseModal.value === 'alimenter-avance' || leaseModal.value === 'alimenter-prepaye')
const title = computed(() => (kind.value === 'advance' ? "Alimenter le tampon d'avance" : 'Alimenter le tampon prépayé'))

const step = ref<'form' | 'done'>('form')
const amount = ref('')
const loading = ref(false)
const errorMessage = ref('')

watch(open, v => {
  if (v) {
    step.value = 'form'
    errorMessage.value = ''
    amount.value = activeLease.value ? String(Math.round(Number(activeLease.value.signed_rent) / 2)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') : ''
  }
})

function onAmountInput(e: Event) {
  const digits = (e.target as HTMLInputElement).value.replace(/\D/g, '')
  amount.value = digits ? Number(digits).toLocaleString('fr-FR').replace(/ |,/g, ' ') : ''
}

const presets = computed(() => {
  if (!activeLease.value) return []
  const rent = Number(activeLease.value.signed_rent)
  return [
    { value: Math.round(rent / 2), label: formatFcfaShort(Math.round(rent / 2)) },
    { value: rent, label: formatFcfaShort(rent) }
  ]
})
function pickPreset(v: number) {
  amount.value = v.toLocaleString('fr-FR').replace(/ |,/g, ' ')
}

function close() {
  leaseModal.value = ''
}

async function submit() {
  const amountNum = Number(amount.value.replace(/\D/g, ''))
  if (!activeLease.value || !amountNum) return
  loading.value = true
  errorMessage.value = ''
  try {
    if (kind.value === 'advance') {
      await leasesApi.topUpAdvanceBuffer(activeLease.value.id, amountNum)
    } else {
      await leasesApi.topUpPrepaidBuffer(activeLease.value.id, amountNum)
    }
    step.value = 'done'
  } catch (e) {
    errorMessage.value = e instanceof ApiRequestError ? (e.mapped.bannerMessage ?? "L'alimentation a échoué.") : "L'alimentation a échoué."
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="fixed inset-0 z-[90] grid animate-[im-veil_.22s_ease_both] place-items-center bg-black/50 p-6 backdrop-blur-[3px]" @click="close">
      <div class="w-[440px] max-w-[calc(100vw-3rem)] animate-[im-rise_.28s_var(--ease-standard)_both] rounded-2xl bg-[var(--surface-page)] p-6.5" @click.stop>
        <template v-if="step === 'form'">
          <h3 class="m-0 font-display text-[19px] font-bold tracking-[-.02em]">{{ title }}</h3>
          <p class="mb-4.5 mt-2.5 text-[13.5px] leading-[1.55] text-[var(--text-muted)]">
            {{ kind === 'advance' ? 'Le tampon couvre automatiquement une échéance manquée.' : 'Le tampon prépayé est consommé en priorité sur vos prochains loyers.' }}
            Prélevé sur votre tirelire, plafonné au montant cible du bail.
          </p>
          <div class="flex items-baseline gap-2 rounded-md border border-[var(--border-default)] bg-white px-[17px] py-3.5">
            <input :value="amount" inputmode="numeric" class="min-w-0 flex-1 border-0 bg-transparent font-mono text-2xl font-bold outline-none" @input="onAmountInput">
            <span class="font-mono text-[15px] font-bold text-[var(--text-faint)]">FCFA</span>
          </div>
          <div v-if="presets.length" class="mt-3 flex gap-2">
            <button v-for="p in presets" :key="p.value" type="button" class="flex-1 rounded-sm border border-[var(--border-default)] bg-white py-2.5 font-mono text-[13px] font-bold" @click="pickPreset(p.value)">{{ p.label }}</button>
          </div>
          <p v-if="errorMessage" class="mb-0 mt-3 text-[13px] font-semibold text-danger-fg">{{ errorMessage }}</p>
          <CoreButton size="lg" full-width class="mt-5" :disabled="loading" @click="submit">{{ loading ? 'Alimentation…' : 'Alimenter' }}</CoreButton>
        </template>
        <template v-else>
          <div class="px-0.5 py-1 text-center">
            <div class="mx-auto grid h-15 w-15 animate-[im-pop_.5s_ease] place-items-center rounded-pill bg-green-600 text-[28px] text-white">✓</div>
            <p class="mb-0 mt-4.5 text-lg font-bold">Tampon alimenté</p>
            <p class="mx-auto mb-0 mt-2.5 max-w-[300px] text-sm leading-[1.6] text-[var(--text-muted)]">
              {{ kind === 'advance' ? "Votre tampon d'avance est complété : une échéance manquée sera couverte automatiquement." : 'Votre tampon prépayé est complété.' }}
            </p>
            <CoreButton size="lg" full-width class="mt-5" @click="close">Terminé</CoreButton>
          </div>
        </template>
      </div>
    </div>
  </Teleport>
</template>
