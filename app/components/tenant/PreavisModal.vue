<script setup lang="ts">
import { ApiRequestError } from '~/utils/authenticatedFetcher'
import { errorText } from '~/utils/apiErrors'
import { departureIfNoticeToday, noticeDepartureDate } from '~/utils/leases'

const leaseModal = useLeaseModal()
const { activeLease, reload } = useTenantLeases()
const leasesApi = useLeasesApi()

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

async function submit() {
  if (!activeLease.value) return
  loading.value = true
  errorMessage.value = ''
  try {
    const result = await leasesApi.giveNotice(activeLease.value.id)
    // `renewal_intent_date` est la date du préavis, pas celle du départ (vérifié en live, Lot 50).
    departure.value = noticeDepartureDate({ ...result, notice_period: noticeMonths.value })
    step.value = 'done'
    reload()
  } catch (e) {
    errorMessage.value = e instanceof ApiRequestError ? errorText(e.mapped, "Le préavis n'a pas pu être enregistré.") : "Le préavis n'a pas pu être enregistré."
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
          <div class="grid h-12 w-12 place-items-center rounded-pill bg-warn-bg text-[22px] text-warn-fg-deep">✎</div>
          <h3 class="mb-0 mt-4.5 font-display text-xl font-bold tracking-[-.02em]">Donner mon préavis</h3>
          <p class="mb-0 mt-2.5 text-sm leading-[1.6] text-[var(--text-muted)]">
            Vous prévenez votre propriétaire que vous quitterez le logement. Le bail continue jusqu'à la date de départ : les loyers restent dus jusque-là.
          </p>
          <div class="mt-4 rounded-md border border-[var(--border-default)] bg-white px-4 py-3.5">
            <DataMoneyLine label="Préavis prévu au bail" :value="`${noticeMonths} mois`" />
            <DataMoneyLine label="Départ prévu" :value="formatDate(plannedDeparture)" total />
          </div>
          <p class="mb-0 mt-3 text-[12.5px] leading-[1.55] text-[var(--text-muted)]">
            Le logement sera proposé à d'autres locataires à partir de cette date. Vous pourrez annuler ce préavis tant que le bail est en cours.
          </p>
          <p v-if="errorMessage" class="mb-0 mt-3 rounded-md border border-danger-border bg-danger-bg px-3.5 py-2.5 text-[13px] font-semibold text-danger-fg">{{ errorMessage }}</p>
          <div class="mt-5 flex gap-2.5">
            <CoreButton tone="secondary" size="lg" full-width @click="close">Annuler</CoreButton>
            <CoreButton tone="accent" size="lg" full-width :disabled="loading" @click="submit">{{ loading ? 'Envoi…' : 'Confirmer le préavis' }}</CoreButton>
          </div>
        </template>
        <template v-else>
          <div class="px-0.5 py-1 text-center">
            <div class="mx-auto grid h-15 w-15 animate-[im-pop_.5s_ease] place-items-center rounded-pill bg-green-600 text-[28px] text-white">✓</div>
            <p class="mb-0 mt-4.5 text-lg font-bold">Préavis enregistré</p>
            <p class="mx-auto mb-0 mt-2.5 max-w-[340px] text-sm leading-[1.6] text-[var(--text-muted)]">
              Votre propriétaire est prévenu.{{ departure ? ` Départ prévu le ${formatDate(departure)}.` : '' }} Pensez à convenir avec lui de l'état des lieux de sortie.
            </p>
            <CoreButton size="lg" full-width class="mt-5" @click="close">Terminé</CoreButton>
          </div>
        </template>
      </div>
    </div>
  </Teleport>
</template>
