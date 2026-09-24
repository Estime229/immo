<script setup lang="ts">
import { ApiRequestError } from '~/utils/authenticatedFetcher'

const leaseModal = useLeaseModal()
const { activeLease } = useTenantLeases()
const leasesApi = useLeasesApi()

const open = computed(() => leaseModal.value === 'preavis')
const step = ref<'form' | 'done'>('form')
const loading = ref(false)
const errorMessage = ref('')
const noticeDate = ref<string | null>(null)

watch(open, v => {
  if (v) {
    step.value = 'form'
    errorMessage.value = ''
    noticeDate.value = null
  }
})

function formatDate(iso: string | null) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
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
    noticeDate.value = result.renewal_intent_date
    step.value = 'done'
  } catch (e) {
    errorMessage.value = e instanceof ApiRequestError ? (e.mapped.bannerMessage ?? 'Le préavis n\'a pas pu être enregistré.') : 'Le préavis n\'a pas pu être enregistré.'
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
            C'est une <strong>déclaration d'intention</strong> : le bail ne s'arrête pas aujourd'hui. La date de départ (aujourd'hui + durée de préavis du bail) et les loyers dus jusque-là sont calculés par le serveur après confirmation.
          </p>
          <p v-if="errorMessage" class="mb-0 mt-3 text-[13px] font-semibold text-danger-fg">{{ errorMessage }}</p>
          <div class="mt-5 flex gap-2.5">
            <CoreButton tone="secondary" size="lg" full-width @click="close">Annuler</CoreButton>
            <CoreButton tone="accent" size="lg" full-width :disabled="loading" @click="submit">{{ loading ? 'Envoi…' : 'Confirmer le préavis' }}</CoreButton>
          </div>
        </template>
        <template v-else>
          <div class="px-0.5 py-1 text-center">
            <div class="mx-auto grid h-15 w-15 animate-[im-pop_.5s_ease] place-items-center rounded-pill bg-green-600 text-[28px] text-white">✓</div>
            <p class="mb-0 mt-4.5 text-lg font-bold">Préavis enregistré</p>
            <p class="mx-auto mb-0 mt-2.5 max-w-[320px] text-sm leading-[1.6] text-[var(--text-muted)]">
              Votre propriétaire est notifié. {{ noticeDate ? `Fin de bail estimée au ${formatDate(noticeDate)}.` : '' }}
            </p>
            <CoreButton size="lg" full-width class="mt-5" @click="close">Terminé</CoreButton>
          </div>
        </template>
      </div>
    </div>
  </Teleport>
</template>
