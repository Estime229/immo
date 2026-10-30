<script setup lang="ts">
import { Check, MessageSquare } from '@lucide/vue'
import { ApiRequestError } from '~/utils/authenticatedFetcher'
import { errorText } from '~/utils/apiErrors'
import { departureIfNoticeToday, noticeDepartureDate } from '~/utils/leases'

const leaseModal = useLeaseModal()
const leaseFlash = useLeaseFlash()
const { activeLease, reload } = useTenantLeases()
const leasesApi = useLeasesApi()
const messagingApi = useMessagingApi()

const open = computed(() => leaseModal.value === 'preavis')
const step = ref<'form' | 'done'>('form')
const loading = ref(false)
const errorMessage = ref('')
const departure = ref<string | null>(null)

watch(open, v => {
  if (v) {
    step.value = 'form'
    errorMessage.value = ''
    departure.value = null
  }
})

const noticeMonths = computed(() => activeLease.value?.notice_period ?? 3)
/** Même calcul que l'API (aujourd'hui + préavis du bail) — montré avant de confirmer. */
const plannedDeparture = computed(() => departureIfNoticeToday(noticeMonths.value))

function formatDate(iso: string | null) {
  if (!iso) return ''
  return new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

function close() {
  leaseModal.value = ''
}

/** Convenir de l'état des lieux de sortie : la conversation du logement s'ouvre directement. */
const writing = ref(false)
const writeError = ref('')
async function writeLandlord() {
  const l = activeLease.value
  const landlordId = l?.landlord_id ?? l?.landlord?.id
  if (!l?.unit?.id || !landlordId) return
  writing.value = true
  writeError.value = ''
  try {
    const conv = await messagingApi.openConversation(l.unit.id, landlordId)
    close()
    await navigateTo({ path: '/locataire/messages', query: { conversation: conv.id } })
  } catch (e) {
    writeError.value = e instanceof ApiRequestError ? errorText(e.mapped, "La conversation n'a pas pu être ouverte.") : "La conversation n'a pas pu être ouverte."
  } finally {
    writing.value = false
  }
}

async function submit() {
  if (!activeLease.value) return
  loading.value = true
  errorMessage.value = ''
  try {
    const result = await leasesApi.giveNotice(activeLease.value.id)
    // `renewal_intent_date` est la date du préavis, pas celle du départ (vérifié en live, Lot 50).
    departure.value = noticeDepartureDate({ ...result, notice_period: noticeMonths.value })
    step.value = 'done'
    leaseFlash.value = { leaseId: activeLease.value.id, text: `Préavis enregistré${departure.value ? ` : départ prévu le ${formatDate(departure.value)}` : ''}. Votre propriétaire en a reçu la notification.` }
    reload()
  } catch (e) {
    errorMessage.value = e instanceof ApiRequestError ? errorText(e.mapped, "Le préavis n'a pas pu être enregistré.") : "Le préavis n'a pas pu être enregistré."
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <CoreModal :open="open" :title="step === 'form' ? 'Donner mon préavis' : 'Préavis enregistré'" width="460px" @close="close">
    <template v-if="step === 'form'">
      <p class="m-0 text-[13.5px] leading-[1.55] text-[var(--text-muted)]">
        Vous indiquez à votre propriétaire que vous quitterez le logement. Le bail continue jusqu'à la date de départ : les loyers restent dus jusque-là.
      </p>
      <div class="mt-4 grid grid-cols-2 gap-3">
        <div class="rounded-lg border border-[var(--border-subtle)] bg-white p-4">
          <p class="m-0 font-mono text-xl font-bold tracking-[-.02em] text-green-900">{{ noticeMonths }} mois</p>
          <p class="mb-0 mt-1.5 text-[11.5px] text-[var(--text-muted)]">Préavis prévu au bail</p>
        </div>
        <div class="rounded-lg border border-[var(--border-subtle)] bg-white p-4">
          <p class="m-0 font-mono text-[15px] font-bold leading-7 text-green-900">{{ formatDate(plannedDeparture) }}</p>
          <p class="mb-0 mt-1.5 text-[11.5px] text-[var(--text-muted)]">Départ prévu</p>
        </div>
      </div>
      <p class="mb-0 mt-3 text-[12.5px] leading-[1.55] text-[var(--text-faint)]">
        Votre propriétaire reçoit une notification. Le logement redevient réservable à partir de cette date. Vous pourrez annuler ce préavis tant que le bail est en cours.
      </p>
      <p v-if="errorMessage" class="mb-0 mt-3 text-[13px] font-semibold text-danger-fg">{{ errorMessage }}</p>
    </template>
    <div v-else class="py-1 text-center">
      <div class="mx-auto grid h-14 w-14 animate-[im-pop_.5s_ease] place-items-center rounded-pill bg-green-600 text-white"><Check class="h-7 w-7" :stroke-width="2.4" /></div>
      <p v-if="departure" class="mb-0 mt-4 text-base font-bold">Départ prévu le <span class="font-mono">{{ formatDate(departure) }}</span></p>
      <p class="mx-auto mb-0 mt-2 max-w-[340px] text-[13.5px] leading-[1.55] text-[var(--text-muted)]">
        Votre propriétaire en a reçu la notification. Convenez avec lui de la date de l'état des lieux de sortie.
      </p>
      <p v-if="writeError" class="mb-0 mt-2 text-[13px] font-semibold text-danger-fg">{{ writeError }}</p>
    </div>

    <template #footer>
      <div class="flex gap-2.5">
        <template v-if="step === 'form'">
          <CoreButton tone="secondary" full-width @click="close">Annuler</CoreButton>
          <CoreButton tone="accent" full-width :disabled="loading" @click="submit">{{ loading ? 'Envoi…' : 'Confirmer le préavis' }}</CoreButton>
        </template>
        <template v-else>
          <CoreButton tone="secondary" full-width @click="close">Terminé</CoreButton>
          <CoreButton full-width :disabled="writing" @click="writeLandlord"><span class="inline-flex items-center justify-center gap-2"><MessageSquare class="h-4 w-4" :stroke-width="1.9" />{{ writing ? 'Ouverture…' : 'Écrire au propriétaire' }}</span></CoreButton>
        </template>
      </div>
    </template>
  </CoreModal>
</template>
