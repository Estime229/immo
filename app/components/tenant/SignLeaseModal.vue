<script setup lang="ts">
import { ApiRequestError } from '~/utils/authenticatedFetcher'
import { errorText } from '~/utils/apiErrors'
import { canTenantSign, entryBreakdown, RENT_SUFFIX } from '~/utils/leases'

const leaseModal = useLeaseModal()
const { activeLease, reload } = useTenantLeases()
const leasesApi = useLeasesApi()
const doc = useOpenDocument()

const open = computed(() => leaseModal.value === 'signer-bail')
const step = ref<'form' | 'done'>('form')
const agreed = ref(false)
const loading = ref(false)
const errorMessage = ref('')
const docError = ref('')

watch(open, v => {
  if (v) {
    step.value = 'form'
    agreed.value = false
    errorMessage.value = ''
    docError.value = ''
  }
})

const entry = computed(() => (activeLease.value ? entryBreakdown(activeLease.value) : null))

function close() {
  leaseModal.value = ''
}

/**
 * La route de signature ne prend aucun corps : l'API n'enregistre que la date.
 * On demande donc un consentement explicite, après lecture possible du contrat,
 * plutôt qu'un faux tracé qui n'était conservé nulle part.
 */
async function submit() {
  const l = activeLease.value
  if (!agreed.value || !l) return
  // L'API accepte aussi la signature d'un brouillon ou d'un bail actif (#54, #55) : jamais proposée ici.
  if (!canTenantSign(l)) {
    errorMessage.value = "Ce bail n'est pas en attente de votre signature."
    return
  }
  loading.value = true
  errorMessage.value = ''
  try {
    await leasesApi.sign(l.id)
    await reload()
    step.value = 'done'
  } catch (e) {
    errorMessage.value = e instanceof ApiRequestError ? errorText(e.mapped, 'La signature a échoué.') : 'La signature a échoué.'
  } finally {
    loading.value = false
  }
}

async function readContract() {
  if (!activeLease.value) return
  const url = `/leases/${activeLease.value.id}/pdf`
  docError.value = (await doc.open('contract', url, url)) ?? ''
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="fixed inset-0 z-[90] grid animate-[im-veil_.22s_ease_both] place-items-center bg-black/50 p-6 backdrop-blur-[3px]" @click="close">
      <div class="w-[460px] max-w-[calc(100vw-3rem)] animate-[im-rise_.28s_var(--ease-standard)_both] rounded-2xl bg-[var(--surface-page)] p-6.5" @click.stop>
        <template v-if="step === 'form'">
          <h3 class="m-0 font-display text-[19px] font-bold tracking-[-.02em]">Signer mon bail</h3>
          <p class="mb-0 mt-2.5 text-[13.5px] leading-[1.55] text-[var(--text-muted)]">
            Votre signature vaut engagement. Le bail devient <strong>actif</strong> une fois l'entrée payée.
          </p>
          <div v-if="activeLease && entry" class="mt-4 rounded-md border border-[var(--border-default)] bg-white px-4 py-3.5">
            <DataMoneyLine label="Loyer" :value="`${formatFcfa(Number(activeLease.signed_rent))} ${RENT_SUFFIX[activeLease.billing_frequency ?? 'monthly']}`" />
            <DataMoneyLine label="Caution" :value="formatFcfa(entry.deposit)" />
            <DataMoneyLine v-if="entry.advance" label="Avance sur loyer" :value="formatFcfa(entry.advance)" />
            <DataMoneyLine v-if="entry.prepaid" label="Loyers prépayés" :value="formatFcfa(entry.prepaid)" />
            <DataMoneyLine label="À payer à l'entrée, après signature" :value="formatFcfa(entry.total)" total />
          </div>
          <button type="button" class="mt-3 text-[13px] font-bold text-green-700 underline disabled:opacity-60" :disabled="doc.loadingKey.value === 'contract'" @click="readContract">
            {{ doc.loadingKey.value === 'contract' ? 'Préparation du contrat…' : 'Lire le contrat avant de signer ↗' }}
          </button>
          <p v-if="docError" class="mb-0 mt-1.5 text-[12.5px] font-semibold text-danger-fg">{{ docError }}</p>
          <label class="mt-4 flex cursor-pointer items-start gap-2.5 rounded-md border border-[var(--border-default)] bg-white p-3.5">
            <input v-model="agreed" type="checkbox" class="mt-0.5 h-4 w-4 flex-none accent-green-600">
            <span class="text-[13px] leading-[1.5]">J'ai pris connaissance du contrat et je le signe.</span>
          </label>
          <p v-if="errorMessage" class="mb-0 mt-3 rounded-md border border-danger-border bg-danger-bg px-3.5 py-2.5 text-[13px] font-semibold text-danger-fg">{{ errorMessage }}</p>
          <div class="mt-5 flex gap-2.5">
            <CoreButton tone="secondary" size="lg" full-width @click="close">Annuler</CoreButton>
            <CoreButton size="lg" full-width :disabled="!agreed || loading" @click="submit">{{ loading ? 'Signature…' : 'Signer' }}</CoreButton>
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
