<script setup lang="ts">
import type { HousingRequestOpenItem } from '~/types/tenant'
import { ApiRequestError } from '~/utils/authenticatedFetcher'
import { errorText } from '~/utils/apiErrors'
import { REQUEST_FREQUENCY_LABEL, budgetFit, daysAgoLabel, requestBudgetLabel, type AnsweredEntry } from '~/utils/housingRequest'

const props = defineProps<{
  request: HousingRequestOpenItem
  myUnits: { id: string; label: string; price: number; occupied: boolean }[]
  unitsLoaded: boolean
  answered: AnsweredEntry | null
}>()
const emit = defineEmits<{ close: []; answered: [payload: { requestId: string; unitId: string; conversationId: string | null }] }>()

const housingRequestsApi = useHousingRequestsApi()
const refData = useReferenceData()

const requesterName = computed(() => props.request.requester_display_name ?? 'Locataire')
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

/* ---- Critères renvoyés par l'API (jamais affichés avant le Lot 47 au-delà du budget et de la fréquence) ---- */
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
    { label: 'Budget', value: requestBudgetLabel(r) ?? 'Non précisé' },
    { label: 'Location', value: r.desired_billing_frequency ? (REQUEST_FREQUENCY_LABEL[r.desired_billing_frequency] ?? r.desired_billing_frequency) : 'Peu importe' },
    { label: 'Où', value: [r.neighborhood?.name, r.city?.name].filter(Boolean).join(', ') || 'Non précisé' },
    { label: 'Emménagement', value: r.move_in_date ? formatDate(r.move_in_date) : 'Non précisé' }
  ]
  if (unitTypeLabel.value) out.push({ label: 'Type', value: unitTypeLabel.value })
  if (furnishedLabel.value) out.push({ label: 'Ameublement', value: furnishedLabel.value })
  if (r.min_bedrooms) out.push({ label: 'Chambres min.', value: String(r.min_bedrooms) })
  return out
})

/* ---- Proposer un logement ---- */
const alreadyProposed = computed(() => new Set(props.answered?.unitIds ?? []))
const proposable = computed(() => props.myUnits.filter(u => !u.occupied && !alreadyProposed.value.has(u.id)))
const occupiedCount = computed(() => props.myUnits.filter(u => u.occupied).length)
function fitLabel(price: number) {
  const fit = budgetFit(price, props.request)
  return fit === 'in' ? 'dans le budget' : fit === 'above' ? 'au-dessus du budget' : fit === 'below' ? 'sous le budget' : ''
}

const selectedUnitId = ref('')
const message = ref('')
const loading = ref(false)
const errorMessage = ref('')
const justSent = ref(false)
const showForm = computed(() => !props.answered || !justSent.value)

async function submit() {
  if (!selectedUnitId.value) {
    errorMessage.value = 'Choisissez le logement à proposer.'
    return
  }
  loading.value = true
  errorMessage.value = ''
  const unitId = selectedUnitId.value
  try {
    const res = await housingRequestsApi.respond(props.request.id, unitId, message.value.trim() || undefined)
    emit('answered', { requestId: props.request.id, unitId, conversationId: res.conversation_id })
    justSent.value = true
    selectedUnitId.value = ''
    message.value = ''
  } catch (e) {
    // Déjà proposé depuis un autre appareil : l'API le dit (400), on s'en souvient.
    if (e instanceof ApiRequestError && e.status === 400 && /déjà proposé/i.test(e.mapped.bannerMessage ?? '')) {
      emit('answered', { requestId: props.request.id, unitId, conversationId: null })
    }
    errorMessage.value = e instanceof ApiRequestError ? errorText(e.mapped, "La proposition n'a pas pu être envoyée.") : "La proposition n'a pas pu être envoyée."
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-[90] grid animate-[im-veil_.22s_ease_both] place-items-center bg-black/50 p-6 backdrop-blur-[3px]" @click="emit('close')">
      <div class="flex max-h-[88vh] w-[560px] max-w-[calc(100vw-3rem)] animate-[im-rise_.28s_var(--ease-standard)_both] flex-col overflow-hidden rounded-2xl bg-[var(--surface-page)] shadow-panel" @click.stop>
        <div class="flex items-center gap-3.5 border-b border-[var(--border-subtle)] px-6 py-4.5">
          <CoreAvatar :name="requesterName" :size="44" color="var(--color-info-fg)" />
          <div class="min-w-0 flex-1">
            <p class="m-0 truncate text-[16px] font-bold">{{ requesterName }}</p>
            <p class="mb-0 mt-0.5 text-[12.5px] text-[var(--text-faint)]">Recherche publiée {{ daysAgoLabel(request.created_at) }}</p>
          </div>
          <button type="button" class="grid h-9 w-9 flex-none place-items-center rounded-pill bg-sand-200 text-base text-sand-800" aria-label="Fermer la fenêtre" @click="emit('close')">✕</button>
        </div>

        <div class="overflow-y-auto p-6">
          <p class="m-0 text-[15px] leading-[1.6] text-[var(--text-primary)]">« {{ request.description }} »</p>

          <div class="mt-4.5 grid grid-cols-2 gap-2.5">
            <div v-for="c in criteria" :key="c.label" class="rounded-md border border-[var(--border-subtle)] bg-white p-3">
              <p class="m-0 text-[11px] font-black uppercase tracking-[.05em] text-[var(--text-faint)]">{{ c.label }}</p>
              <p class="mb-0 mt-1 text-[13.5px] font-bold">{{ c.value }}</p>
            </div>
          </div>

          <div class="mt-5 border-t border-sand-200 pt-5">
            <div v-if="answered" class="mb-3.5 rounded-md border border-ok-border bg-ok-bg px-3.5 py-3">
              <p class="m-0 text-[13.5px] font-semibold text-green-900">✓ Vous avez proposé {{ answered.unitIds.length }} logement{{ answered.unitIds.length > 1 ? 's' : '' }} — le locataire a été notifié.</p>
              <NuxtLink v-if="answered.conversationId" :to="`/pro/messages?conversation=${answered.conversationId}`" class="mt-2 inline-block rounded-pill bg-[image:var(--action-primary)] px-3.5 py-2 text-[12.5px] font-bold text-white">Ouvrir la conversation</NuxtLink>
              <NuxtLink v-else to="/pro/messages" class="mt-2 inline-block text-[12.5px] font-bold text-green-800 underline">Voir mes messages</NuxtLink>
            </div>

            <template v-if="showForm">
              <p class="mb-2.5 mt-0 text-[13.5px] font-bold">{{ answered ? 'Proposer un autre logement' : 'Proposer un de mes logements' }}</p>
              <p v-if="!unitsLoaded" class="m-0 text-[13px] text-[var(--text-muted)]">Chargement de vos logements…</p>
              <p v-else-if="!myUnits.length" class="m-0 text-[13px] text-[var(--text-muted)]">Vous n'avez pas encore de logement. <NuxtLink to="/pro/biens/ajouter" class="font-bold text-green-700">Ajouter un bien</NuxtLink></p>
              <p v-else-if="!proposable.length" class="m-0 text-[13px] text-[var(--text-muted)]">Aucun autre logement libre à proposer.</p>
              <template v-else>
                <div class="flex max-h-[220px] flex-col gap-2 overflow-y-auto">
                  <label
                    v-for="u in proposable"
                    :key="u.id"
                    class="flex cursor-pointer items-center gap-3 rounded-md border bg-white px-3.5 py-2.5"
                    :class="selectedUnitId === u.id ? 'border-2 border-green-600' : 'border-[var(--border-subtle)]'"
                  >
                    <input v-model="selectedUnitId" type="radio" name="unit" :value="u.id" class="h-4 w-4 accent-[var(--color-green-600)]">
                    <span class="min-w-0 flex-1">
                      <span class="block truncate text-[13.5px] font-semibold">{{ u.label }}</span>
                      <span v-if="fitLabel(u.price)" class="block text-[11.5px]" :class="fitLabel(u.price) === 'dans le budget' ? 'text-ok-fg' : 'text-[var(--text-faint)]'">{{ fitLabel(u.price) }}</span>
                    </span>
                    <span class="font-mono text-[13px] font-bold">{{ formatFcfaShort(u.price) }}</span>
                  </label>
                </div>
                <p v-if="occupiedCount" class="mb-0 mt-2 text-[11.5px] text-[var(--text-faint)]">{{ occupiedCount }} logement{{ occupiedCount > 1 ? 's' : '' }} occupé{{ occupiedCount > 1 ? 's' : '' }} non proposé{{ occupiedCount > 1 ? 's' : '' }}.</p>
                <textarea v-model="message" rows="3" maxlength="1000" placeholder="Message au locataire (conseillé : disponibilité, visite possible…)" class="mt-2.5 w-full resize-none rounded-sm border border-[var(--border-default)] bg-white px-3 py-2.5 text-[13.5px] outline-none" />
                <p v-if="errorMessage" class="mb-0 mt-2.5 text-[13px] font-semibold text-danger-fg">{{ errorMessage }}</p>
                <CoreButton size="lg" full-width class="mt-3.5" :disabled="loading" @click="submit">{{ loading ? 'Envoi…' : 'Envoyer la proposition' }}</CoreButton>
              </template>
            </template>
            <button v-else type="button" class="text-[13px] font-bold text-green-700" @click="justSent = false">+ Proposer un autre logement</button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
