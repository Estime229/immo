<script setup lang="ts">
import { CircleCheck, Lock } from '@lucide/vue'
import type { ArtisanRequestSummary } from '~/types/artisan'
import { ApiRequestError } from '~/utils/authenticatedFetcher'
import { errorText } from '~/utils/apiErrors'
import { useArtisanProfile } from '~/composables/useArtisanProfile'

/**
 * « Marquer terminée » : étape de vérification (mission, part retenue), puis ce qui se passe
 * vraiment. Avant : « Le demandeur peut maintenant valider le travail » — aucune étape de
 * validation n'existe ; la garantie démarre et le demandeur peut signaler un problème d'ici sa fin.
 */
const modal = useArtisanModal()
const targetId = useArtisanModalTarget()
const snapshot = useArtisanModalRequest()
const open = computed(() => modal.value === 'terminer')

const artisanApi = useArtisanRequestsApi()
const refresh = useArtisanRequestsRefresh()
const { tradeLabel } = useArtisanProfile()

const step = ref<'confirm' | 'done'>('confirm')
const loading = ref(false)
const errorMessage = ref('')
const result = ref<ArtisanRequestSummary | null>(null)

watch(open, v => {
  if (!v) return
  step.value = 'confirm'
  errorMessage.value = ''
  result.value = null
})

const retained = computed(() => Number((result.value ?? snapshot.value)?.retained_amount ?? 0))
const missionName = computed(() => {
  const r = snapshot.value
  return r ? `${tradeLabel(r.trade_reference_id)} — ${r.unit?.name ?? 'Logement'}` : ''
})
const warrantyEnd = computed(() => (result.value?.warranty_expires_at
  ? new Date(result.value.warranty_expires_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
  : null))

function close() {
  modal.value = ''
  targetId.value = null
  snapshot.value = null
}

async function submit() {
  if (!targetId.value) return
  loading.value = true
  errorMessage.value = ''
  try {
    result.value = await artisanApi.complete(targetId.value)
    refresh.value++
    step.value = 'done'
  } catch (e) {
    errorMessage.value = e instanceof ApiRequestError ? errorText(e.mapped, "L'intervention n'a pas pu être marquée terminée.") : "L'intervention n'a pas pu être marquée terminée."
  } finally {
    loading.value = false
  }
}

function seeMission() {
  const id = result.value?.id ?? targetId.value
  close()
  if (id) navigateTo({ path: '/artisan/missions', query: { tab: 'terminees', request: id } })
}
</script>

<template>
  <CoreModal :open="open" :title="step === 'done' ? 'Intervention terminée' : 'Marquer terminée'" width="480px" @close="close">
    <template v-if="step === 'confirm'">
      <div v-if="missionName" class="mb-3.5 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-page)] px-3.5 py-3">
        <p class="m-0 text-label font-bold uppercase tracking-label text-[var(--text-faint)]">Mission</p>
        <p class="mb-0 mt-1 text-sm font-bold">{{ missionName }}</p>
        <p v-if="retained > 0" class="mb-0 mt-1.5 inline-flex items-center gap-1.5 text-[12.5px] text-clay-700">
          <Lock class="h-3.5 w-3.5" :stroke-width="1.9" aria-hidden="true" />
          <span><span class="font-mono font-bold">{{ formatFcfa(retained) }}</span> retenus jusqu'à la fin de la garantie</span>
        </p>
      </div>
      <p class="m-0 text-[13.5px] leading-[1.6] text-[var(--text-muted)]">
        Ne le faites qu'une fois le travail fini : la garantie convenue démarre maintenant.
        <template v-if="retained > 0">La part retenue vous sera versée à son terme, sauf si le demandeur signale un problème d'ici là.</template>
        <template v-else>Le demandeur peut signaler un problème jusqu'à la fin de la garantie.</template>
        Il pourra laisser un avis une fois la demande clôturée.
      </p>
      <p v-if="errorMessage" class="mb-0 mt-3.5 text-[13px] font-semibold text-danger-fg">{{ errorMessage }}</p>
    </template>

    <div v-else class="py-2 text-center">
      <div class="mx-auto grid h-[46px] w-[46px] animate-[im-pop_.5s_ease] place-items-center rounded-pill bg-green-50 text-green-700">
        <CircleCheck class="h-6 w-6" :stroke-width="1.9" />
      </div>
      <p v-if="warrantyEnd" class="mx-auto mb-0 mt-3.5 max-w-[360px] text-[13.5px] leading-[1.6] text-[var(--text-muted)]">
        Garantie jusqu'au <strong class="font-mono text-[var(--text-primary)]">{{ warrantyEnd }}</strong>. D'ici là, le demandeur peut signaler un problème<template v-if="retained > 0"> ; sans signalement, les <span class="font-mono">{{ formatFcfa(retained) }}</span> retenus vous sont versés à cette date</template>.
      </p>
      <p v-else class="mx-auto mb-0 mt-3.5 max-w-[360px] text-[13.5px] leading-[1.6] text-[var(--text-muted)]">
        Aucune période de garantie n'a été convenue : la mission est terminée.
      </p>
      <p class="mx-auto mb-0 mt-2 max-w-[360px] text-xs text-[var(--text-faint)]">Le demandeur pourra laisser un avis une fois la demande clôturée.</p>
    </div>

    <template #footer>
      <div v-if="step === 'confirm'" class="flex flex-wrap justify-end gap-2.5">
        <CoreButton tone="secondary" :disabled="loading" @click="close">Annuler</CoreButton>
        <CoreButton :disabled="loading" @click="submit">{{ loading ? 'Enregistrement…' : 'Confirmer : travail terminé' }}</CoreButton>
      </div>
      <div v-else class="flex flex-wrap justify-end gap-2.5">
        <CoreButton tone="secondary" @click="close">Fermer</CoreButton>
        <CoreButton @click="seeMission">Voir la mission</CoreButton>
      </div>
    </template>
  </CoreModal>
</template>
