<script setup lang="ts">
import { ApiRequestError } from '~/utils/authenticatedFetcher'

const modal = useArtisanModal()
const targetId = useArtisanModalTarget()
const open = computed(() => modal.value === 'terminer')

const artisanApi = useArtisanRequestsApi()
const refresh = useArtisanRequestsRefresh()

const step = ref<'confirm' | 'done'>('confirm')
const loading = ref(false)
const errorMessage = ref('')

watch(open, v => {
  if (v) {
    step.value = 'confirm'
    errorMessage.value = ''
  }
})

function close() {
  modal.value = ''
  targetId.value = null
}

async function submit() {
  if (!targetId.value) return
  loading.value = true
  errorMessage.value = ''
  try {
    await artisanApi.complete(targetId.value)
    refresh.value++
    step.value = 'done'
  } catch (e) {
    errorMessage.value = e instanceof ApiRequestError ? (e.mapped.bannerMessage ?? "L'action a échoué.") : "L'action a échoué."
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
          <h3 class="m-0 font-display text-[19px] font-bold tracking-[-.02em]">{{ step === 'done' ? 'Intervention terminée' : 'Marquer terminée' }}</h3>
          <button type="button" class="grid h-[34px] w-[34px] place-items-center rounded-pill bg-sand-200 text-[15px] text-sand-800" @click="close">✕</button>
        </div>

        <div class="p-6">
          <template v-if="step === 'confirm'">
            <p class="m-0 text-[13.5px] leading-[1.55] text-[var(--text-muted)]">
              Le demandeur sera notifié et pourra laisser un avis. La part de garantie retenue sur cette intervention sera libérée à la date convenue avec l'offre acceptée.
            </p>
            <p v-if="errorMessage" class="mb-0 mt-3.5 text-[13px] font-semibold text-danger-fg">{{ errorMessage }}</p>
            <CoreButton size="lg" full-width class="mt-5" :disabled="loading" @click="submit">{{ loading ? 'Enregistrement…' : 'Marquer terminée' }}</CoreButton>
          </template>

          <template v-else>
            <div class="px-0.5 py-1 text-center">
              <div class="mx-auto grid h-15 w-15 animate-[im-pop_.5s_ease] place-items-center rounded-pill bg-green-600 text-[28px] text-white">✓</div>
              <p class="mb-0 mt-4.5 text-lg font-bold">Intervention terminée</p>
              <p class="mx-auto mb-0 mt-2.5 max-w-[340px] text-sm leading-[1.6] text-[var(--text-muted)]">Le demandeur peut maintenant valider le travail et laisser un avis.</p>
              <CoreButton size="lg" full-width class="mt-5" @click="close">Terminé</CoreButton>
            </div>
          </template>
        </div>
      </div>
    </div>
  </Teleport>
</template>
