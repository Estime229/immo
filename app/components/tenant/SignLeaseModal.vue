<script setup lang="ts">
import { Check, ExternalLink } from '@lucide/vue'
import { ApiRequestError } from '~/utils/authenticatedFetcher'
import { errorText } from '~/utils/apiErrors'
import { canTenantSign, entryBreakdown, RENT_SUFFIX } from '~/utils/leases'

const leaseModal = useLeaseModal()
const leaseFlash = useLeaseFlash()
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
    leaseFlash.value = { leaseId: l.id, text: "Bail signé. Dernière étape : le paiement d'entrée, qui l'active." }
  } catch (e) {
    errorMessage.value = e instanceof ApiRequestError ? errorText(e.mapped, 'La signature a échoué.') : 'La signature a échoué.'
  } finally {
    loading.value = false
  }
}

/** Après signature : l'écran du bail montre déjà le paiement d'entrée, on y amène directement. */
async function goToEntryPayment() {
  close()
  await nextTick()
  document.getElementById('paiement-entree')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

async function readContract() {
  if (!activeLease.value) return
  const url = `/leases/${activeLease.value.id}/pdf`
  docError.value = (await doc.open('contract', url, url)) ?? ''
}
</script>

<template>
  <CoreModal :open="open" :title="step === 'form' ? 'Signer mon bail' : 'Bail signé'" width="460px" :dirty="step === 'form' && agreed" @close="close">
    <template v-if="step === 'form'">
      <p class="m-0 text-[13.5px] leading-[1.55] text-[var(--text-muted)]">
        Votre signature vaut engagement. Le bail devient <strong>actif</strong> une fois l'entrée payée.
      </p>
      <div v-if="activeLease && entry" class="mt-4 rounded-lg border border-[var(--border-subtle)] bg-white px-4 py-3.5">
        <DataMoneyLine label="Loyer" :value="`${formatFcfa(Number(activeLease.signed_rent))} ${RENT_SUFFIX[activeLease.billing_frequency ?? 'monthly']}`" />
        <DataMoneyLine label="Caution" :value="formatFcfa(entry.deposit)" />
        <DataMoneyLine v-if="entry.advance" label="Avance sur loyer" :value="formatFcfa(entry.advance)" />
        <DataMoneyLine v-if="entry.prepaid" label="Loyers prépayés" :value="formatFcfa(entry.prepaid)" />
        <DataMoneyLine label="À payer à l'entrée, après signature" :value="formatFcfa(entry.total)" total />
      </div>
      <button type="button" class="mt-3 inline-flex items-center gap-1.5 text-[13px] font-bold text-green-700 disabled:opacity-60" :disabled="doc.loadingKey.value === 'contract'" @click="readContract">
        {{ doc.loadingKey.value === 'contract' ? 'Préparation du contrat…' : 'Lire le contrat avant de signer' }}
        <ExternalLink class="h-3.5 w-3.5" :stroke-width="1.9" />
      </button>
      <p v-if="docError" class="mb-0 mt-1.5 text-[12.5px] font-semibold text-danger-fg">{{ docError }}</p>
      <label class="mt-4 flex cursor-pointer items-start gap-2.5 rounded-md border border-[var(--border-default)] bg-white p-3.5">
        <input v-model="agreed" type="checkbox" class="mt-0.5 h-4 w-4 flex-none accent-green-600">
        <span class="text-[13px] leading-[1.5]">J'ai pris connaissance du contrat et je le signe.</span>
      </label>
      <p v-if="errorMessage" class="mb-0 mt-3 text-[13px] font-semibold text-danger-fg">{{ errorMessage }}</p>
    </template>
    <div v-else class="py-1 text-center">
      <div class="mx-auto grid h-14 w-14 animate-[im-pop_.5s_ease] place-items-center rounded-pill bg-green-600 text-white"><Check class="h-7 w-7" :stroke-width="2.4" /></div>
      <p class="mb-0 mt-4 text-base font-bold">Votre signature est enregistrée</p>
      <p class="mx-auto mb-0 mt-2 max-w-[320px] text-[13.5px] leading-[1.55] text-[var(--text-muted)]">
        Dernière étape : le paiement d'entrée<template v-if="entry"> (<span class="font-mono">{{ formatFcfa(entry.total) }}</span>)</template>, prélevé sur votre tirelire. Il active le bail.
      </p>
    </div>

    <template #footer>
      <div class="flex gap-2.5">
        <template v-if="step === 'form'">
          <CoreButton tone="secondary" full-width @click="close">Annuler</CoreButton>
          <CoreButton full-width :disabled="!agreed || loading" @click="submit">{{ loading ? 'Signature…' : 'Signer' }}</CoreButton>
        </template>
        <template v-else>
          <CoreButton tone="secondary" full-width @click="close">Plus tard</CoreButton>
          <CoreButton full-width @click="goToEntryPayment">Passer au paiement d'entrée</CoreButton>
        </template>
      </div>
    </template>
  </CoreModal>
</template>
