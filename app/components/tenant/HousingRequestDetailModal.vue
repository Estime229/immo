<script setup lang="ts">
import { ExternalLink, MessageSquare } from '@lucide/vue'
import type { HousingRequestResponse, HousingRequestSummary } from '~/types/tenant'
import { ApiRequestError } from '~/utils/authenticatedFetcher'
import { errorText } from '~/utils/apiErrors'
import { REQUEST_FREQUENCY_LABEL, budgetFit, requestBudgetLabel } from '~/utils/housingRequest'

const props = defineProps<{ request: HousingRequestSummary }>()
const emit = defineEmits<{ close: []; closed: [] }>()

const housingRequestsApi = useHousingRequestsApi()
const refData = useReferenceData()

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

/* ---- Critères (libellés des référentiels, chargés à l'ouverture) ---- */
const unitTypeLabel = ref('')
const furnishedLabel = ref('')
onMounted(async () => {
  try {
    const [ut, f] = await Promise.all([refData.fetchRef('UNIT_TYPE'), refData.fetchRef('FURNISHED_LEVEL')])
    unitTypeLabel.value = ut.find(e => e.id === props.request.unit_type_reference_id)?.labels.fr ?? ''
    furnishedLabel.value = f.find(e => e.code === props.request.desired_furnished_level)?.labels.fr ?? ''
  } catch {
    // libellés facultatifs
  }
})
const criteria = computed(() => {
  const r = props.request
  const out: { label: string; value: string }[] = [
    { label: 'Location', value: r.desired_billing_frequency ? (REQUEST_FREQUENCY_LABEL[r.desired_billing_frequency] ?? r.desired_billing_frequency) : 'Peu importe' },
    { label: 'Où', value: [r.neighborhood?.name, r.city?.name].filter(Boolean).join(', ') || 'Non précisé' },
    { label: 'Budget', value: requestBudgetLabel(r) ?? 'Non précisé' },
    { label: 'Emménagement', value: r.move_in_date ? formatDate(r.move_in_date) : 'Non précisé' }
  ]
  if (unitTypeLabel.value) out.push({ label: 'Type', value: unitTypeLabel.value })
  if (furnishedLabel.value) out.push({ label: 'Ameublement', value: furnishedLabel.value })
  if (r.min_bedrooms) out.push({ label: 'Chambres min.', value: String(r.min_bedrooms) })
  return out
})
const missingKeyCriteria = computed(() => props.request.status === 'open' && (!props.request.city_id || !props.request.desired_billing_frequency))

/* ---- Réponses reçues : le logement proposé et son propriétaire (joints par l'API) ---- */
const responses = ref<HousingRequestResponse[]>([])
const responsesState = ref<'loading' | 'error' | 'success'>('loading')
async function loadResponses() {
  responsesState.value = 'loading'
  try {
    responses.value = await housingRequestsApi.fetchResponses(props.request.id)
    responsesState.value = 'success'
  } catch {
    responsesState.value = 'error'
  }
}
onMounted(loadResponses)
function ownerName(resp: HousingRequestResponse) {
  const l = resp.landlord
  const name = l ? `${l.first_name ?? ''} ${l.last_name ? `${l.last_name[0]}.` : ''}`.trim() : ''
  return name || 'Un propriétaire'
}
function fitLabel(resp: HousingRequestResponse) {
  if (!resp.unit) return ''
  const fit = budgetFit(Number(resp.unit.price), props.request)
  return fit === 'in' ? 'Dans votre budget' : fit === 'above' ? 'Au-dessus de votre budget' : fit === 'below' ? 'Sous votre budget' : ''
}

/* ---- Fermeture : définitive (aucune réouverture côté API), donc confirmée ---- */
const confirmClose = ref(false)
const closing = ref(false)
const closeError = ref('')
async function closeRequest() {
  closing.value = true
  closeError.value = ''
  try {
    await housingRequestsApi.close(props.request.id)
    emit('closed')
  } catch (e) {
    closeError.value = e instanceof ApiRequestError ? errorText(e.mapped, 'Fermeture impossible.') : 'Fermeture impossible.'
  } finally {
    closing.value = false
  }
}
</script>

<template>
  <CoreModal :open="true" title="Ma demande de logement" width="560px" @close="emit('close')">
        <div class="mb-3.5 flex flex-wrap items-center gap-2.5">
          <CoreBadge :tone="request.status === 'open' ? 'ok' : 'neutral'">{{ request.status === 'open' ? 'Ouverte' : 'Fermée' }}</CoreBadge>
          <span class="text-xs text-[var(--text-faint)]">Publiée le {{ formatDate(request.created_at) }}<template v-if="request.closed_at"> · fermée le {{ formatDate(request.closed_at) }}</template></span>
        </div>
        <div>
          <p class="m-0 text-[15px] leading-[1.6] text-[var(--text-primary)] [overflow-wrap:anywhere]">« {{ request.description }} »</p>

          <div class="mt-4.5 grid grid-cols-2 gap-2.5">
            <div v-for="c in criteria" :key="c.label" class="rounded-md border border-[var(--border-subtle)] bg-white p-3">
              <p class="m-0 text-[11px] font-black uppercase tracking-[.05em] text-[var(--text-faint)]">{{ c.label }}</p>
              <p class="mb-0 mt-1 text-[13.5px] font-bold">{{ c.value }}</p>
            </div>
          </div>
          <p v-if="missingKeyCriteria" class="mb-0 mt-3 rounded-md bg-warn-bg px-3.5 py-2.5 text-[12.5px] text-warn-fg">Sans ville ni type de location, les propriétaires qui filtrent les demandes ne voient pas la vôtre. Une demande ne se modifie pas : fermez-la et publiez-en une plus précise si besoin.</p>

          <div class="mt-5 border-t border-sand-200 pt-5">
            <p class="mb-2.5 mt-0 text-[13.5px] font-bold">Logements proposés ({{ request.response_count }})</p>
            <DataSkeletonCard v-if="responsesState === 'loading'" :height="90" :lines="0" />
            <p v-else-if="responsesState === 'error'" class="m-0 text-[13px] text-danger-fg">Impossible de charger les réponses. <button type="button" class="font-bold underline" @click="loadResponses">Réessayer</button></p>
            <p v-else-if="!responses.length" class="m-0 text-[13px] text-[var(--text-muted)]">Aucune réponse pour l'instant. Vous serez notifié dès qu'un propriétaire vous propose un logement.</p>
            <div v-for="resp in responses" :key="resp.id" class="mt-2.5 rounded-md border border-[var(--border-subtle)] bg-white p-3.5">
              <div class="flex items-start gap-3">
                <div class="min-w-0 flex-1">
                  <p class="m-0 text-[14px] font-bold">{{ resp.unit?.name ?? 'Logement proposé' }}</p>
                  <p class="mb-0 mt-0.5 text-[12.5px] text-[var(--text-muted)]">
                    Proposé par {{ ownerName(resp) }} · {{ formatDate(resp.created_at) }}
                  </p>
                </div>
                <span v-if="resp.unit" class="flex-none font-mono text-[14px] font-bold">{{ formatFcfaShort(Number(resp.unit.price)) }}</span>
              </div>
              <div class="mt-2 flex flex-wrap gap-1.5">
                <CoreBadge v-if="fitLabel(resp)" :tone="fitLabel(resp) === 'Dans votre budget' ? 'ok' : 'neutral'">{{ fitLabel(resp) }}</CoreBadge>
                <CoreBadge v-if="resp.unit?.unit_status === 'occupied'" tone="warn">Actuellement occupé</CoreBadge>
              </div>
              <p v-if="resp.message" class="mb-0 mt-2 text-[12.5px] italic text-[var(--text-secondary)] [overflow-wrap:anywhere]">« {{ resp.message }} »</p>
              <div class="mt-3 flex flex-wrap gap-2">
                <NuxtLink v-if="resp.unit?.property_id" :to="`/biens/${resp.unit.property_id}`" target="_blank" class="inline-flex items-center gap-1.5 rounded-pill border border-[var(--border-default)] bg-white px-3.5 py-2 text-[12.5px] font-bold">Voir le logement <ExternalLink class="h-3.5 w-3.5" :stroke-width="1.9" /></NuxtLink>
                <NuxtLink :to="`/locataire/messages?conversation=${resp.conversation_id}`" class="inline-flex items-center gap-1.5 rounded-pill bg-[image:var(--action-primary)] px-3.5 py-2 text-[12.5px] font-bold text-white"><MessageSquare class="h-3.5 w-3.5" :stroke-width="1.9" />Répondre au propriétaire</NuxtLink>
              </div>
            </div>
          </div>

          <template v-if="request.status === 'open'">
            <CoreInlineConfirm
              v-if="confirmClose"
              class="mt-5"
              tone="danger"
              message="Fermer cette demande ? Elle disparaît de la liste consultée par les propriétaires et ne peut pas être rouverte. Vos conversations restent accessibles."
              confirm-label="Fermer la demande"
              cancel-label="Garder"
              :loading="closing"
              @confirm="closeRequest"
              @cancel="confirmClose = false"
            />
            <CoreButton v-else tone="secondary" full-width class="mt-5" @click="confirmClose = true">J'ai trouvé : fermer cette demande</CoreButton>
            <p v-if="closeError" class="mb-0 mt-3 text-[13px] font-semibold text-danger-fg">{{ closeError }}</p>
          </template>
        </div>
  </CoreModal>
</template>
