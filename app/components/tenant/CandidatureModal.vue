<script setup lang="ts">
import type { RentalRequestSummary } from '~/types/tenant'
import { ApiRequestError } from '~/utils/authenticatedFetcher'
import { errorText } from '~/utils/apiErrors'
import { acceptancePreview, validateCandidature } from '~/utils/rentalRequests'

const props = defineProps<{
  unit: { id: string; name: string; price: string | number; caution_months?: number | null; avance_months?: number | null; prepaye_months?: number | null }
  propertyName?: string
}>()
const emit = defineEmits<{ close: []; created: [request: RentalRequestSummary] }>()

const rentalApi = useRentalRequestsApi()
const currentUser = useAuthUser()
/** `POST /rental/requests` exige une identité vérifiée (403 `error.KYC_REQUIRED`) : dit avant de remplir. */
const notVerified = computed(() => currentUser.value?.is_verified === false)

function localIso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const todayIso = localIso(new Date())
const moveIn = ref('')
const message = ref('')
const loading = ref(false)
const errorMessage = ref('')
const created = ref<RentalRequestSummary | null>(null)

const preview = computed(() => acceptancePreview({ ...props.unit, price: String(props.unit.price) }))

async function submit() {
  errorMessage.value = validateCandidature({ moveIn: moveIn.value, message: message.value }, todayIso) ?? ''
  if (errorMessage.value) return
  loading.value = true
  try {
    created.value = await rentalApi.create({
      unit_id: props.unit.id,
      message: message.value.trim() || undefined,
      desired_move_in_at: moveIn.value || undefined
    })
  } catch (e) {
    errorMessage.value = e instanceof ApiRequestError ? errorText(e.mapped, "La candidature n'a pas pu être envoyée.") : "La candidature n'a pas pu être envoyée."
  } finally {
    loading.value = false
  }
}

function close() {
  if (created.value) emit('created', created.value)
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-[90] grid animate-[im-veil_.22s_ease_both] place-items-center bg-black/50 p-6 backdrop-blur-[3px]" @click="close">
      <div class="w-[480px] max-w-[calc(100vw-3rem)] animate-[im-rise_.28s_var(--ease-standard)_both] rounded-2xl bg-[var(--surface-page)] p-6.5" @click.stop>
        <template v-if="notVerified">
          <h3 class="m-0 font-display text-lg font-bold tracking-[-.02em]">Vérifiez votre identité d'abord</h3>
          <p class="mb-0 mt-2.5 text-[13.5px] leading-[1.6] text-[var(--text-muted)]">Pour protéger les propriétaires, seules les personnes dont l'identité a été vérifiée par Immo peuvent candidater. La validation prend généralement moins de 24 h.</p>
          <div class="mt-5 flex gap-2.5">
            <CoreButton tone="secondary" size="lg" full-width @click="close">Plus tard</CoreButton>
            <NuxtLink to="/kyc" class="flex w-full items-center justify-center rounded-md bg-[image:var(--action-primary)] px-4 text-[14px] font-bold text-white">Vérifier mon compte</NuxtLink>
          </div>
        </template>

        <template v-else-if="!created">
          <h3 class="m-0 font-display text-lg font-bold tracking-[-.02em]">Déposer ma candidature</h3>
          <p class="mb-0 mt-1.5 text-[13px] text-[var(--text-muted)]">{{ [unit.name, propertyName].filter(Boolean).join(' — ') }}</p>
          <p class="mb-0 mt-3 text-[13px] leading-[1.6] text-[var(--text-secondary)]">
            Le propriétaire voit votre nom, votre identité vérifiée et votre note de confiance. S'il vous retient, il prépare le bail : vous le relirez et le signerez en ligne.
          </p>

          <div class="mt-4 rounded-md border border-[var(--border-default)] bg-white px-4 py-3">
            <p class="mb-1 mt-0 text-[11.5px] font-black uppercase tracking-[.05em] text-[var(--text-faint)]">Si vous êtes retenu</p>
            <DataMoneyLine label="Loyer mensuel" :value="formatFcfa(preview.rent)" />
            <DataMoneyLine :label="`Caution (${preview.depositMonths} mois)`" :value="formatFcfa(preview.deposit)" />
            <DataMoneyLine v-if="preview.advance" :label="`Avance (${preview.advanceMonths} mois)`" :value="formatFcfa(preview.advance)" />
            <DataMoneyLine label="À payer à l'entrée, après signature" :value="formatFcfa(preview.deposit + preview.advance)" total />
          </div>

          <label class="mt-4 block">
            <span class="mb-1.5 block text-[13px] font-bold text-[var(--text-muted)]">Date d'emménagement souhaitée (facultatif)</span>
            <input v-model="moveIn" type="date" :min="todayIso" class="h-11 w-full rounded-sm border border-[var(--border-default)] bg-white px-3.5 text-[13.5px] outline-none">
          </label>
          <label class="mt-3.5 block">
            <span class="mb-1.5 block text-[13px] font-bold text-[var(--text-muted)]">Message au propriétaire</span>
            <textarea v-model="message" rows="4" maxlength="2000" placeholder="Présentez-vous en quelques lignes : situation, nombre d'occupants, pourquoi ce logement…" class="w-full resize-none rounded-md border border-[var(--border-default)] bg-white p-3 text-sm outline-none" />
            <span class="mt-1 block text-right text-[11.5px] text-[var(--text-faint)]">{{ message.length }} / 2000</span>
          </label>

          <p v-if="errorMessage" class="mb-0 mt-2 rounded-md border border-danger-border bg-danger-bg px-3.5 py-2.5 text-[13px] font-semibold text-danger-fg">{{ errorMessage }}</p>
          <div class="mt-5 flex gap-2.5">
            <CoreButton tone="secondary" size="lg" full-width @click="close">Annuler</CoreButton>
            <CoreButton size="lg" full-width :disabled="loading" @click="submit">{{ loading ? 'Envoi…' : 'Envoyer ma candidature' }}</CoreButton>
          </div>
        </template>

        <template v-else>
          <div class="px-0.5 py-1 text-center">
            <div class="mx-auto grid h-15 w-15 animate-[im-pop_.5s_ease] place-items-center rounded-pill bg-green-600 text-[28px] text-white">✓</div>
            <p class="mb-0 mt-4.5 text-lg font-bold">Candidature envoyée</p>
            <p class="mx-auto mb-0 mt-2.5 max-w-[340px] text-sm leading-[1.6] text-[var(--text-muted)]">
              Le propriétaire la retrouve dans ses candidatures et peut vous écrire. Suivez-la dans « Mes candidatures ».
            </p>
            <div class="mt-5 flex gap-2.5">
              <CoreButton tone="secondary" size="lg" full-width @click="close">Fermer</CoreButton>
              <NuxtLink :to="`/locataire/candidatures?request=${created.id}`" class="flex w-full items-center justify-center rounded-md bg-[image:var(--action-primary)] px-4 text-[14px] font-bold text-white">Mes candidatures</NuxtLink>
            </div>
          </div>
        </template>
      </div>
    </div>
  </Teleport>
</template>
