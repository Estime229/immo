<script setup lang="ts">
import { CircleCheck } from '@lucide/vue'
import { ApiRequestError } from '~/utils/authenticatedFetcher'
import { errorText } from '~/utils/apiErrors'
import { validateOffer } from '~/utils/artisanRequests'

/**
 * « Faire une offre », ouverte juste après une candidature (Mes missions). Prix vide au départ
 * (avant : « 40 000 » prérempli, inventé), mêmes champs et même règle que le panneau de
 * négociation (ArtisanOfferForm + validateOffer).
 */
const modal = useArtisanModal()
const targetId = useArtisanModalTarget()
const open = computed(() => modal.value === 'offre')

const artisanApi = useArtisanRequestsApi()
const refresh = useArtisanRequestsRefresh()

const step = ref<'form' | 'done'>('form')
const loading = ref(false)
const errorMessage = ref('')
const sentFor = ref<string | null>(null)
const form = reactive({ price: '', warrantyDays: '7', retention: '20' })

watch(open, v => {
  if (!v) return
  step.value = 'form'
  errorMessage.value = ''
  form.price = ''
  form.warrantyDays = '7'
  form.retention = '20'
})

const dirty = computed(() => step.value === 'form' && !!form.price.trim())

function close() {
  modal.value = ''
  targetId.value = null
}

async function submit() {
  if (!targetId.value) return
  errorMessage.value = validateOffer(form) ?? ''
  if (errorMessage.value) return
  loading.value = true
  try {
    await artisanApi.submitOffer(targetId.value, {
      price: Number(form.price.replace(/\s/g, '')),
      warranty_days: Number(form.warrantyDays),
      retention_percentage: Number(form.retention)
    })
    sentFor.value = targetId.value
    refresh.value++
    step.value = 'done'
  } catch (e) {
    errorMessage.value = e instanceof ApiRequestError ? errorText(e.mapped, "L'offre n'a pas pu être envoyée.") : "L'offre n'a pas pu être envoyée."
  } finally {
    loading.value = false
  }
}

function seeMission() {
  const id = sentFor.value
  close()
  if (id) navigateTo({ path: '/artisan/missions', query: { tab: 'encours', request: id } })
}
</script>

<template>
  <CoreModal :open="open" :title="step === 'done' ? 'Offre envoyée' : 'Faire une offre'" width="480px" :dirty="dirty" @close="close">
    <template v-if="step === 'form'">
      <p class="mb-4 mt-0 text-[13.5px] leading-[1.55] text-[var(--text-muted)]">
        Le demandeur pourra l'accepter, la refuser ou vous faire une contre-proposition. Une nouvelle offre remplace la précédente.
      </p>
      <ArtisanOfferForm v-model:price="form.price" v-model:warrantyDays="form.warrantyDays" v-model:retention="form.retention" side="artisan" :error="errorMessage" />
    </template>

    <div v-else class="py-2 text-center">
      <div class="mx-auto grid h-[46px] w-[46px] animate-[im-pop_.5s_ease] place-items-center rounded-pill bg-green-50 text-green-700">
        <CircleCheck class="h-6 w-6" :stroke-width="1.9" />
      </div>
      <p class="mx-auto mb-0 mt-3.5 max-w-[340px] text-[13.5px] leading-[1.6] text-[var(--text-muted)]">
        Votre offre attend la réponse du demandeur : il peut l'accepter, la refuser ou contre-proposer. Suivez la négociation dans Mes missions, onglet En cours.
      </p>
    </div>

    <template #footer>
      <div v-if="step === 'form'" class="flex flex-wrap justify-end gap-2.5">
        <CoreButton tone="secondary" @click="close">Annuler</CoreButton>
        <CoreButton :disabled="!form.price.trim() || loading" @click="submit">{{ loading ? 'Envoi…' : 'Envoyer mon offre' }}</CoreButton>
      </div>
      <div v-else class="flex flex-wrap justify-end gap-2.5">
        <CoreButton tone="secondary" @click="close">Fermer</CoreButton>
        <CoreButton @click="seeMission">Voir la mission</CoreButton>
      </div>
    </template>
  </CoreModal>
</template>
