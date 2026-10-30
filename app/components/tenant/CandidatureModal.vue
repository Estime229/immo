<script setup lang="ts">
import { Check, ShieldCheck } from '@lucide/vue'
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

/** Un message entamé ne se perd pas sur un clic à côté. */
const dirty = computed(() => !created.value && (!!message.value.trim() || !!moveIn.value))
const title = computed(() => (notVerified.value ? "Vérifiez votre identité d'abord" : created.value ? 'Candidature envoyée' : 'Déposer ma candidature'))
</script>

<template>
  <CoreModal :open="true" :title="title" width="480px" :dirty="dirty" @close="close">
    <template v-if="notVerified">
      <div class="flex items-start gap-3">
        <div class="grid h-[46px] w-[46px] flex-none place-items-center rounded-pill bg-green-50 text-green-700"><ShieldCheck class="h-5 w-5" :stroke-width="1.9" /></div>
        <p class="m-0 text-[13.5px] leading-[1.6] text-[var(--text-muted)]">Pour protéger les propriétaires, seules les personnes dont l'identité a été vérifiée par Immo peuvent candidater. La validation prend généralement moins de 24 h.</p>
      </div>
    </template>

    <template v-else-if="!created">
      <p class="m-0 text-sm font-bold">{{ [unit.name, propertyName].filter(Boolean).join(' — ') }}</p>
      <p class="mb-0 mt-1.5 text-[13.5px] leading-[1.55] text-[var(--text-muted)]">
        Le propriétaire voit votre nom, votre identité vérifiée et votre note de confiance. S'il vous retient, il prépare le bail : vous le relirez et le signerez en ligne.
      </p>

      <div class="mt-4 rounded-lg border border-[var(--border-subtle)] bg-white px-4 py-3">
        <p class="mb-1 mt-0 text-label font-bold uppercase tracking-label text-[var(--text-faint)]">Si vous êtes retenu</p>
        <DataMoneyLine label="Loyer mensuel" :value="formatFcfa(preview.rent)" />
        <DataMoneyLine :label="`Caution (${preview.depositMonths} mois)`" :value="formatFcfa(preview.deposit)" />
        <DataMoneyLine v-if="preview.advance" :label="`Avance (${preview.advanceMonths} mois)`" :value="formatFcfa(preview.advance)" />
        <DataMoneyLine label="À payer à l'entrée, après signature" :value="formatFcfa(preview.deposit + preview.advance)" total />
        <p v-if="preview.prepaidIgnored" class="mb-0 mt-2 text-[12px] leading-[1.5] text-[var(--text-muted)]">Les loyers prépayés indiqués sur l'annonce ne sont pas repris dans le bail préparé après une candidature : rien de plus ne vous sera demandé à l'entrée.</p>
      </div>

      <label class="mt-4 block">
        <span class="mb-[7px] block text-[12.5px] font-bold">Date d'emménagement souhaitée <span class="font-normal text-[var(--text-faint)]">(facultatif)</span></span>
        <input v-model="moveIn" type="date" :min="todayIso" class="h-[46px] w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-[15px] text-[14.5px] outline-none">
      </label>
      <label class="mt-3.5 block">
        <span class="mb-[7px] flex items-baseline justify-between text-[12.5px] font-bold">Message au propriétaire<span class="font-mono font-normal text-[var(--text-faint)]">{{ message.length }} / 2000</span></span>
        <textarea v-model="message" rows="4" maxlength="2000" placeholder="Présentez-vous en quelques lignes : situation, nombre d'occupants, pourquoi ce logement…" class="w-full resize-none rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] p-3 text-sm outline-none" />
      </label>

      <p v-if="errorMessage" class="mb-0 mt-2 text-[13px] font-semibold text-danger-fg">{{ errorMessage }}</p>
    </template>

    <div v-else class="py-1 text-center">
      <div class="mx-auto grid h-14 w-14 animate-[im-pop_.5s_ease] place-items-center rounded-pill bg-green-600 text-white"><Check class="h-7 w-7" :stroke-width="2.4" /></div>
      <p class="mb-0 mt-4 text-base font-bold">{{ unit.name }}</p>
      <p class="mx-auto mb-0 mt-2 max-w-[340px] text-[13.5px] leading-[1.55] text-[var(--text-muted)]">
        Votre candidature apparaît dans les candidatures du propriétaire. Suivez sa réponse dans « Mes candidatures ».
      </p>
    </div>

    <template #footer>
      <div class="flex gap-2.5">
        <template v-if="notVerified">
          <CoreButton tone="secondary" full-width @click="close">Plus tard</CoreButton>
          <NuxtLink to="/kyc" class="flex w-full items-center justify-center rounded-md bg-[image:var(--action-primary)] px-4 text-[14px] font-bold text-white shadow-action">Vérifier mon compte</NuxtLink>
        </template>
        <template v-else-if="!created">
          <CoreButton tone="secondary" full-width @click="close">Annuler</CoreButton>
          <CoreButton full-width :disabled="loading" @click="submit">{{ loading ? 'Envoi…' : 'Envoyer ma candidature' }}</CoreButton>
        </template>
        <template v-else>
          <CoreButton tone="secondary" full-width @click="close">Fermer</CoreButton>
          <NuxtLink :to="`/locataire/candidatures?request=${created.id}`" class="flex w-full items-center justify-center rounded-md bg-[image:var(--action-primary)] px-4 text-[14px] font-bold text-white shadow-action">Mes candidatures</NuxtLink>
        </template>
      </div>
    </template>
  </CoreModal>
</template>
