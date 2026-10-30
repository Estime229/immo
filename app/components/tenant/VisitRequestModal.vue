<script setup lang="ts">
import { CalendarCheck, Check } from '@lucide/vue'
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
/** Pas `showError` : nom d'un auto-import Nuxt (voir le piège décrit dans ADMIN-DESIGN.md). */
const showSlotError = ref(false)
/** Erreur serveur (5xx) : la visite a pu être enregistrée malgré tout (notification envoyée avant la réponse). */
const uncertain = ref(false)

const slotError = computed(() => validateVisitSlot(date.value, time.value))
const chosenLabel = computed(() => {
  if (!date.value) return ''
  const label = new Date(`${date.value}T${time.value}:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
  return label.charAt(0).toUpperCase() + label.slice(1)
})

async function submit() {
  showSlotError.value = true
  if (slotError.value) return
  loading.value = true
  errorMessage.value = ''
  duplicate.value = false
  uncertain.value = false
  const requestedAt = new Date(`${date.value}T${time.value}:00`).toISOString()
  try {
    await visitsApi.create(props.unitId, requestedAt, note.value.trim() || undefined)
    step.value = 'done'
  } catch (e) {
    const status = e instanceof ApiRequestError ? e.status : 0
    if (!status || status >= 500) {
      // Relecture : si la demande figure bien dans « Mes visites », c'est un succès.
      const mine = await visitsApi.fetchMine('tenant').catch(() => null)
      if (mine?.some(v => v.unit_id === props.unitId && v.status === 'pending' && new Date(v.requested_at).getTime() === new Date(requestedAt).getTime())) {
        step.value = 'done'
        return
      }
      uncertain.value = true
      errorMessage.value = mine
        ? "Le serveur a répondu par une erreur et la demande n'apparaît pas dans vos visites. Vérifiez dans « Mes visites » avant de réessayer."
        : 'Le serveur a répondu par une erreur : la demande a peut-être été enregistrée. Vérifiez dans « Mes visites » avant de réessayer.'
      return
    }
    duplicate.value = status === 400 && /déjà une demande de visite/.test((e as ApiRequestError).mapped.bannerMessage ?? '')
    errorMessage.value = e instanceof ApiRequestError ? errorText(e.mapped, 'La demande a échoué.') : 'La demande a échoué.'
  } finally {
    loading.value = false
  }
}

function close() {
  if (step.value === 'done') emit('requested')
  emit('close')
}

const dirty = computed(() => step.value === 'form' && (!!date.value || !!note.value.trim()))
const title = computed(() => (notVerified.value ? "Vérifiez votre identité d'abord" : step.value === 'done' ? 'Demande envoyée' : 'Demander une visite'))
</script>

<template>
  <CoreModal :open="true" :title="title" width="460px" :dirty="dirty" @close="close">
    <template v-if="notVerified">
      <p class="m-0 text-[13.5px] leading-[1.6] text-[var(--text-muted)]">Pour protéger les propriétaires, seules les personnes dont l'identité a été vérifiée par Immo peuvent demander une visite. La validation prend généralement moins de 24 h.</p>
    </template>

    <template v-else-if="step === 'form'">
      <p class="m-0 text-sm font-bold">{{ unitName }}</p>
      <p class="mb-0 mt-1 text-[13.5px] leading-[1.55] text-[var(--text-muted)]">
        Le propriétaire reçoit une notification de votre demande. Il la confirme, propose un autre horaire ou la refuse : chaque réponse vous est notifiée.
      </p>

      <div class="mt-4 grid grid-cols-2 gap-2.5">
        <label class="block">
          <span class="mb-[7px] block text-[12.5px] font-bold">Date souhaitée</span>
          <input v-model="date" type="date" :min="todayIso" class="h-[46px] w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3 text-[14px] outline-none">
        </label>
        <label class="block">
          <span class="mb-[7px] block text-[12.5px] font-bold">Heure</span>
          <select v-model="time" class="h-[46px] w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3 font-mono text-[14px]">
            <option v-for="s in slots" :key="s" :value="s">{{ s.replace(':', ' h ') }}</option>
          </select>
        </label>
      </div>
      <p v-if="chosenLabel && !slotError" class="mb-0 mt-2 flex items-center gap-1.5 text-[12.5px] font-semibold text-green-800"><CalendarCheck class="h-3.5 w-3.5 flex-none" :stroke-width="1.9" />{{ chosenLabel }}</p>

      <label class="mt-3.5 block">
        <span class="mb-[7px] flex items-baseline justify-between text-[12.5px] font-bold">Message au propriétaire <span class="font-mono font-normal text-[var(--text-faint)]">{{ note.length }} / 500</span></span>
        <textarea v-model="note" rows="2" maxlength="500" placeholder="Ex. Je peux aussi passer en fin de journée." class="w-full resize-y rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] p-3 text-sm outline-none" />
      </label>

      <div v-if="(showSlotError && slotError) || errorMessage" class="mt-3 rounded-md border px-3.5 py-2.5 text-[13px] font-semibold" :class="uncertain ? 'border-warn-border bg-warn-bg text-warn-fg-deep' : 'border-danger-border bg-danger-bg text-danger-fg'">
        {{ errorMessage || slotError }}
        <NuxtLink v-if="duplicate || uncertain" to="/locataire/visites" class="mt-1 block font-bold underline">Voir mes visites</NuxtLink>
      </div>
    </template>

    <div v-else class="py-1 text-center">
      <div class="mx-auto grid h-14 w-14 animate-[im-pop_.5s_ease] place-items-center rounded-pill bg-green-600 text-white"><Check class="h-7 w-7" :stroke-width="2.4" /></div>
      <p class="mb-0 mt-4 text-base font-bold">{{ chosenLabel }}</p>
      <p class="mx-auto mb-0 mt-2 max-w-[340px] text-[13.5px] leading-[1.55] text-[var(--text-muted)]">Visite demandée pour {{ unitName }}. Le propriétaire reçoit une notification ; sa réponse vous sera notifiée et apparaîtra dans « Mes visites ».</p>
    </div>

    <template #footer>
      <div class="flex gap-2.5">
        <template v-if="notVerified">
          <CoreButton tone="secondary" full-width @click="close">Plus tard</CoreButton>
          <NuxtLink to="/kyc" class="flex w-full items-center justify-center rounded-md bg-[image:var(--action-primary)] px-4 text-[14px] font-bold text-white shadow-action">Vérifier mon compte</NuxtLink>
        </template>
        <template v-else-if="step === 'form'">
          <CoreButton tone="secondary" full-width @click="close">Annuler</CoreButton>
          <CoreButton full-width :disabled="loading" @click="submit">{{ loading ? 'Envoi…' : uncertain ? 'Réessayer quand même' : 'Demander' }}</CoreButton>
        </template>
        <template v-else>
          <CoreButton tone="secondary" full-width @click="close">Fermer</CoreButton>
          <NuxtLink to="/locataire/visites" class="flex w-full items-center justify-center rounded-md bg-[image:var(--action-primary)] px-4 text-[14px] font-bold text-white shadow-action">Mes visites</NuxtLink>
        </template>
      </div>
    </template>
  </CoreModal>
</template>
