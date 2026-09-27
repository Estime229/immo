<script setup lang="ts">
import { ApiRequestError } from '~/utils/authenticatedFetcher'
import { errorText } from '~/utils/apiErrors'
import { validateVisitSlot, visitTimeSlots } from '~/utils/visits'

const props = defineProps<{ unitId: string; unitName: string }>()
const emit = defineEmits<{ close: []; requested: [] }>()

const visitsApi = useVisitsApi()
const currentUser = useAuthUser()

/** `POST /visits` exige une identité vérifiée (403 `error.KYC_REQUIRED`) : dit avant de remplir, pas après. */
const notVerified = computed(() => currentUser.value?.is_verified === false)

const step = ref<'form' | 'done'>('form')
function localIso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const todayIso = localIso(new Date())
const date = ref('')
const time = ref('10:00')
const note = ref('')
const slots = visitTimeSlots()
const loading = ref(false)
const errorMessage = ref('')
const duplicate = ref(false)
const showError = ref(false)

const slotError = computed(() => validateVisitSlot(date.value, time.value))
const chosenLabel = computed(() => date.value
  ? new Date(`${date.value}T${time.value}:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
  : '')

async function submit() {
  showError.value = true
  if (slotError.value) return
  loading.value = true
  errorMessage.value = ''
  duplicate.value = false
  try {
    const requestedAt = new Date(`${date.value}T${time.value}:00`).toISOString()
    await visitsApi.create(props.unitId, requestedAt, note.value.trim() || undefined)
    step.value = 'done'
  } catch (e) {
    duplicate.value = e instanceof ApiRequestError && e.status === 400 && /déjà une demande de visite/.test(e.mapped.bannerMessage ?? '')
    errorMessage.value = e instanceof ApiRequestError ? errorText(e.mapped, 'La demande a échoué.') : 'La demande a échoué.'
  } finally {
    loading.value = false
  }
}

function close() {
  if (step.value === 'done') emit('requested')
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-[90] grid animate-[im-veil_.22s_ease_both] place-items-center bg-black/50 p-6 backdrop-blur-[3px]" @click="close">
      <div class="w-[460px] max-w-[calc(100vw-3rem)] animate-[im-rise_.28s_var(--ease-standard)_both] rounded-2xl bg-[var(--surface-page)] p-6.5" @click.stop>
        <template v-if="notVerified">
          <h3 class="m-0 font-display text-lg font-bold tracking-[-.02em]">Vérifiez votre identité d'abord</h3>
          <p class="mb-0 mt-2.5 text-[13.5px] leading-[1.6] text-[var(--text-muted)]">Pour protéger les propriétaires, seules les personnes dont l'identité a été vérifiée par Immo peuvent demander une visite. La validation prend généralement moins de 24 h.</p>
          <div class="mt-5 flex gap-2.5">
            <CoreButton tone="secondary" size="lg" full-width @click="close">Plus tard</CoreButton>
            <NuxtLink to="/kyc" class="flex w-full items-center justify-center rounded-md bg-[image:var(--action-primary)] px-4 text-[14px] font-bold text-white">Vérifier mon compte</NuxtLink>
          </div>
        </template>

        <template v-else-if="step === 'form'">
          <h3 class="m-0 font-display text-lg font-bold tracking-[-.02em]">Demander une visite</h3>
          <p class="mb-0 mt-2 text-[13px] leading-[1.6] text-[var(--text-muted)]">
            {{ unitName }}. Le propriétaire confirme, propose un autre horaire ou refuse — vous êtes notifié à chaque étape.
          </p>

          <div class="mt-4.5 grid grid-cols-2 gap-2.5">
            <label class="text-[12.5px] font-bold text-[var(--text-muted)]">Date souhaitée
              <input v-model="date" type="date" :min="todayIso" class="mt-1.5 h-11 w-full rounded-sm border border-[var(--border-default)] bg-white px-3 text-[13.5px] font-normal text-[var(--text-primary)] outline-none">
            </label>
            <label class="text-[12.5px] font-bold text-[var(--text-muted)]">Heure
              <select v-model="time" class="mt-1.5 h-11 w-full rounded-sm border border-[var(--border-default)] bg-white px-3 text-[13.5px] font-normal text-[var(--text-primary)]">
                <option v-for="s in slots" :key="s" :value="s">{{ s.replace(':', ' h ') }}</option>
              </select>
            </label>
          </div>
          <p v-if="chosenLabel && !slotError" class="mb-0 mt-2 text-[12.5px] font-semibold capitalize text-green-800">{{ chosenLabel }}</p>

          <label class="mb-1.5 mt-3.5 flex items-baseline justify-between text-[12.5px] font-bold text-[var(--text-muted)]">Message au propriétaire (optionnel)<span class="font-normal text-[var(--text-faint)]">{{ note.length }} / 500</span></label>
          <textarea v-model="note" rows="2" maxlength="500" placeholder="Ex. Je peux aussi passer en fin de journée." class="w-full resize-y rounded-md border border-[var(--border-default)] bg-white p-3.5 text-sm outline-none" />

          <div v-if="(showError && slotError) || errorMessage" class="mt-3 rounded-md border border-danger-border bg-danger-bg px-3.5 py-2.5 text-[13px] font-semibold text-danger-fg">
            {{ errorMessage || slotError }}
            <NuxtLink v-if="duplicate" to="/locataire/visites" class="mt-1 block font-bold underline">Voir mes visites</NuxtLink>
          </div>
          <div class="mt-5 flex gap-2.5">
            <CoreButton tone="secondary" size="lg" full-width @click="close">Annuler</CoreButton>
            <CoreButton size="lg" full-width :disabled="loading" @click="submit">{{ loading ? 'Envoi…' : 'Demander' }}</CoreButton>
          </div>
        </template>

        <template v-else>
          <div class="px-0.5 py-1 text-center">
            <div class="mx-auto grid h-15 w-15 animate-[im-pop_.5s_ease] place-items-center rounded-pill bg-green-600 text-[28px] text-white">✓</div>
            <p class="mb-0 mt-4.5 text-lg font-bold">Demande envoyée</p>
            <p class="mx-auto mb-0 mt-2.5 max-w-[340px] text-sm leading-[1.6] text-[var(--text-muted)]">Visite demandée pour <strong class="capitalize">{{ chosenLabel }}</strong>. Le propriétaire a été prévenu ; vous serez notifié de sa réponse.</p>
            <div class="mt-5 flex gap-2.5">
              <CoreButton tone="secondary" size="lg" full-width @click="close">Fermer</CoreButton>
              <NuxtLink to="/locataire/visites" class="flex w-full items-center justify-center rounded-md bg-[image:var(--action-primary)] px-4 text-[14px] font-bold text-white">Mes visites</NuxtLink>
            </div>
          </div>
        </template>
      </div>
    </div>
  </Teleport>
</template>
