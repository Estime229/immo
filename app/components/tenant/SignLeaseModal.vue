<script setup lang="ts">
import { ApiRequestError } from '~/utils/authenticatedFetcher'

const leaseModal = useLeaseModal()
const { activeLease, reload } = useTenantLeases()
const leasesApi = useLeasesApi()

const open = computed(() => leaseModal.value === 'signer-bail')
const step = ref<'form' | 'done'>('form')
const signed = ref(false)
const loading = ref(false)
const errorMessage = ref('')

watch(open, v => {
  if (v) {
    step.value = 'form'
    signed.value = false
    errorMessage.value = ''
  }
})

function close() {
  leaseModal.value = ''
}

async function submit() {
  if (!signed.value || !activeLease.value) return
  loading.value = true
  errorMessage.value = ''
  try {
    await leasesApi.sign(activeLease.value.id)
    await reload()
    step.value = 'done'
  } catch (e) {
    errorMessage.value = e instanceof ApiRequestError ? (e.mapped.bannerMessage ?? 'La signature a échoué.') : 'La signature a échoué.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="fixed inset-0 z-[90] grid animate-[im-veil_.22s_ease_both] place-items-center bg-black/50 p-6 backdrop-blur-[3px]" @click="close">
      <div class="w-[460px] max-w-[calc(100vw-3rem)] animate-[im-rise_.28s_var(--ease-standard)_both] rounded-2xl bg-[var(--surface-page)] p-6.5" @click.stop>
        <template v-if="step === 'form'">
          <h3 class="m-0 font-display text-[19px] font-bold tracking-[-.02em]">Signer mon bail</h3>
          <p class="mb-4 mt-2.5 text-[13.5px] leading-[1.55] text-[var(--text-muted)]">
            Votre signature vaut engagement. Le bail passe à « signé » une fois les deux parties signées — il ne devient <strong>actif</strong> qu'après le paiement d'entrée (caution, avance et prépayé).
          </p>
          <div
            class="grid h-[140px] cursor-pointer place-items-center rounded-md border-[1.5px] border-dashed bg-white"
            :class="signed ? 'border-green-600' : 'border-[var(--border-default)]'"
            @click="signed = true"
          >
            <span v-if="signed" class="-rotate-[4deg] font-display text-3xl italic text-green-800">Signé</span>
            <span v-else class="text-[13px] text-[var(--text-faint)]">✎ Tracez votre signature ici</span>
          </div>
          <p v-if="errorMessage" class="mb-0 mt-3 text-[13px] font-semibold text-danger-fg">{{ errorMessage }}</p>
          <div class="mt-5 flex gap-2.5">
            <CoreButton tone="secondary" size="lg" full-width @click="close">Annuler</CoreButton>
            <CoreButton size="lg" full-width :disabled="!signed || loading" @click="submit">{{ loading ? 'Signature…' : 'Signer' }}</CoreButton>
          </div>
        </template>
        <template v-else>
          <div class="px-0.5 py-1 text-center">
            <div class="mx-auto grid h-15 w-15 animate-[im-pop_.5s_ease] place-items-center rounded-pill bg-green-600 text-[28px] text-white">✓</div>
            <p class="mb-0 mt-4.5 text-lg font-bold">Bail signé</p>
            <p class="mx-auto mb-0 mt-2.5 max-w-[320px] text-sm leading-[1.6] text-[var(--text-muted)]">Votre signature est enregistrée. Reste le paiement d'entrée pour activer le bail.</p>
            <CoreButton size="lg" full-width class="mt-5" @click="close">Terminé</CoreButton>
          </div>
        </template>
      </div>
    </div>
  </Teleport>
</template>
