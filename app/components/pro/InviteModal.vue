<script setup lang="ts">
import { Check, Copy, MailCheck, Link2 } from '@lucide/vue'
import type { InviteResult, MyTeam, RolePreset, TeamRegistry } from '~/types/team'
import { ApiRequestError } from '~/utils/authenticatedFetcher'
import { errorText } from '~/utils/apiErrors'
import { ENFORCED_PERMISSIONS, groupPermissions, inviteDelivery, inviteLink, inviteOutcome, validateInvite } from '~/utils/team'

/**
 * Invitation d'un membre. Depuis les correctifs du 06/10/2026 (#4, #74), l'API
 * renvoie un lien `/invite/<token>` pour toute invitation et dit si l'e-mail est
 * parti (`email_sent`). Le lien est montré une seule fois : l'API ne le relit pas.
 */
const props = defineProps<{
  registry: TeamRegistry
  team: MyTeam | null
  presets: RolePreset[]
  properties: { id: string; name: string }[]
  /** E-mail prérempli (lien « Inviter aussi dans mon équipe » depuis un mandat). */
  initialEmail?: string
}>()
const emit = defineEmits<{ close: []; invited: [] }>()

const teamApi = useTeamApi()

const email = ref(props.initialEmail ?? '')
const choice = ref('gestionnaire')
const permissions = ref<string[]>([...(props.registry.presets.gestionnaire?.permissions ?? [])])
const propertyIds = ref<string[]>(props.properties.length === 1 ? [props.properties[0]!.id] : [])
const teamName = ref('')
const loading = ref(false)
const errorMessage = ref('')
const touched = ref(false)
const result = ref<
  | { kind: 'link'; link: string; expires: string; delivery: 'sent' | 'link'; existing: boolean }
  | { kind: 'no_link'; delivery: 'sent' | 'none' }
  | { kind: 'recorded' }
  | null
>(null)
const copied = ref(false)

const groups = computed(() => groupPermissions(props.registry.permissions))
const customPreset = computed(() => props.presets.find(p => `custom:${p.id}` === choice.value) ?? null)
watch(choice, c => {
  touched.value = true
  if (c.startsWith('custom:')) permissions.value = [...(customPreset.value?.permissions ?? [])]
  else permissions.value = [...(props.registry.presets[c]?.permissions ?? [])]
})
watch([email, teamName], () => { touched.value = true })

/** Saisie entamée : un clic sur le voile ne ferme plus la fenêtre. */
const dirty = computed(() => !result.value && touched.value)

function permTitle(key: string) {
  return ENFORCED_PERMISSIONS[key] ? `Permet de ${ENFORCED_PERMISSIONS[key]}` : "Sans effet pour l'instant"
}

function toggle(list: string[], v: string) {
  touched.value = true
  const i = list.indexOf(v)
  if (i >= 0) list.splice(i, 1)
  else list.push(v)
}

function formatDay(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
}

async function submit() {
  const form = {
    email: email.value,
    preset: customPreset.value ? '' : choice.value,
    customPresetId: customPreset.value?.id ?? '',
    permissions: permissions.value,
    propertyIds: propertyIds.value
  }
  errorMessage.value = validateInvite(form, props.team) ?? ''
  if (errorMessage.value) return
  loading.value = true
  try {
    const presetPerms = props.registry.presets[form.preset]?.permissions ?? []
    const custom = !form.customPresetId && (permissions.value.length !== presetPerms.length || permissions.value.some(p => !presetPerms.includes(p)))
    const res: InviteResult = await teamApi.invite({
      email: email.value.trim(),
      ...(form.customPresetId ? { custom_preset_id: form.customPresetId } : { role_preset: form.preset }),
      ...(custom ? { permissions: permissions.value } : {}),
      property_ids: propertyIds.value,
      ...(!props.team?.team && teamName.value.trim() ? { team_name: teamName.value.trim() } : {})
    })
    const delivery = inviteDelivery(res)
    result.value = res.token
      ? { kind: 'link', link: inviteLink(window.location.origin, res.token), expires: res.expires_at ?? '', delivery: delivery === 'sent' ? 'sent' : 'link', existing: res.type === 'in_app' }
      : { kind: 'no_link', delivery: delivery === 'sent' ? 'sent' : 'none' }
    emit('invited')
  } catch (e) {
    // Filet : une 5xx peut arriver après l'enregistrement — on vérifie avant d'annoncer un échec.
    if (e instanceof ApiRequestError && (e.status ?? 0) >= 500) {
      try {
        if (inviteOutcome(await teamApi.fetchMyTeam(), email.value) !== 'missing') {
          result.value = { kind: 'recorded' }
          emit('invited')
          return
        }
      } catch {
        // on retombe sur le message d'erreur
      }
    }
    errorMessage.value = e instanceof ApiRequestError ? errorText(e.mapped, "L'invitation n'a pas pu être envoyée. Réessayez.") : "L'invitation n'a pas pu être envoyée. Réessayez."
  } finally {
    loading.value = false
  }
}

async function copyLink(link: string) {
  try {
    await navigator.clipboard.writeText(link)
    copied.value = true
  } catch {
    copied.value = false
  }
}
</script>

<template>
  <CoreModal :open="true" title="Inviter un membre" width="560px" :dirty="dirty" @close="emit('close')">
    <div v-if="!result" class="flex flex-col gap-4">
      <FormsInput v-model="email" type="email" label="Adresse e-mail" placeholder="prenom@exemple.bj" hint="Avec ou sans compte Immo : la personne reçoit un lien pour rejoindre votre équipe." />
      <FormsInput v-if="!team?.team" v-model="teamName" label="Nom de votre équipe (facultatif)" placeholder="ex. Agence Étoile Cotonou" />

      <label class="block">
        <span class="mb-[7px] block text-[12.5px] font-bold">Poste</span>
        <select v-model="choice" class="h-[46px] w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3 text-[14px] text-sand-900 outline-none">
          <option v-for="(p, key) in registry.presets" :key="key" :value="key">{{ p.label }}</option>
          <option v-for="p in presets" :key="p.id" :value="`custom:${p.id}`">{{ p.name }} (vos postes)</option>
        </select>
        <span v-if="customPreset" class="mt-[7px] block text-[12.5px] text-[var(--text-faint)]">Les permissions de ce poste s'appliquent telles quelles.</span>
      </label>

      <div>
        <p class="mb-2 mt-0 text-[12.5px] font-bold">Permissions</p>
        <div v-for="g in groups" :key="g.category" class="mb-2.5">
          <p class="mb-1.5 mt-0 text-label font-bold uppercase tracking-label text-[var(--text-faint)]">{{ g.category }}</p>
          <div class="flex flex-wrap gap-1.5">
            <button
              v-for="p in g.items"
              :key="p.key"
              type="button"
              class="inline-flex items-center gap-1.5 rounded-pill border px-3 py-1.5 text-[12.5px] font-semibold disabled:cursor-not-allowed"
              :class="permissions.includes(p.key) ? 'border-green-600 bg-green-50 text-green-800' : 'border-[var(--border-default)] bg-white text-[var(--text-muted)]'"
              :disabled="!!customPreset"
              :title="permTitle(p.key)"
              :aria-pressed="permissions.includes(p.key)"
              @click="toggle(permissions, p.key)"
            >
              <Check v-if="permissions.includes(p.key)" class="h-3.5 w-3.5" :stroke-width="2.2" />
              {{ p.label }}{{ ENFORCED_PERMISSIONS[p.key] ? '' : ' *' }}
            </button>
          </div>
        </div>
        <p class="m-0 text-xs leading-[1.5] text-[var(--text-faint)]">* Sans effet pour l'instant : seules les permissions sans astérisque changent ce que le membre peut faire.</p>
      </div>

      <div>
        <p class="mb-2 mt-0 text-[12.5px] font-bold">Biens confiés</p>
        <p v-if="!properties.length" class="m-0 text-[13px] text-[var(--text-muted)]">
          Vous n'avez pas encore de bien : un membre n'agit que sur les biens que vous lui confiez.
          <NuxtLink to="/pro/biens/ajouter" class="font-bold text-green-700">Ajouter un bien</NuxtLink>
        </p>
        <label v-for="p in properties" :key="p.id" class="flex cursor-pointer items-center gap-2.5 border-b border-sand-200 py-2.5 text-[13.5px] last:border-b-0">
          <input type="checkbox" :checked="propertyIds.includes(p.id)" class="h-4 w-4 accent-green-600" @change="toggle(propertyIds, p.id)">
          {{ p.name }}
        </label>
      </div>

      <p v-if="errorMessage" class="m-0 text-[13px] font-semibold text-danger-fg">{{ errorMessage }}</p>
    </div>

    <!-- Lien d'invitation : montré une seule fois -->
    <div v-else-if="result.kind === 'link'">
      <div class="flex items-start gap-3">
        <span class="grid h-[46px] w-[46px] flex-none place-items-center rounded-pill bg-green-50 text-green-700">
          <MailCheck v-if="result.delivery === 'sent'" class="h-5 w-5" :stroke-width="1.9" />
          <Link2 v-else class="h-5 w-5" :stroke-width="1.9" />
        </span>
        <div class="min-w-0">
          <p class="m-0 text-[15px] font-bold">Invitation créée</p>
          <p class="mb-0 mt-1 text-[13.5px] leading-[1.55] text-[var(--text-muted)]">
            <template v-if="result.delivery === 'sent'">Un e-mail avec ce lien vient de partir vers <strong class="[overflow-wrap:anywhere]">{{ email }}</strong>. Vous pouvez aussi le lui transmettre vous-même.</template>
            <template v-else>Transmettez ce lien à <strong class="[overflow-wrap:anywhere]">{{ email }}</strong> (WhatsApp, SMS…) : aucun e-mail n'a pu lui être envoyé.</template>
            {{ result.existing ? 'Cette personne a déjà un compte : elle se connecte, puis accepte.' : 'Elle crée son compte avec cette adresse, puis accepte.' }}
          </p>
        </div>
      </div>
      <div class="mt-4 flex flex-wrap gap-2">
        <input :value="result.link" readonly aria-label="Lien d'invitation" class="h-[42px] min-w-0 flex-[1_1_220px] rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3 font-mono text-[12px]" @focus="($event.target as HTMLInputElement).select()">
        <CoreButton tone="secondary" @click="copyLink(result.link)">
          <span class="inline-flex items-center gap-1.5"><component :is="copied ? Check : Copy" class="h-4 w-4" :stroke-width="1.9" />{{ copied ? 'Copié' : 'Copier' }}</span>
        </CoreButton>
      </div>
      <p class="mb-0 mt-2.5 text-xs leading-[1.5] text-[var(--text-faint)]">
        Ce lien ne sera plus affiché après fermeture<template v-if="result.expires"> ; il est valable jusqu'au <span class="font-mono">{{ formatDay(result.expires) }}</span></template>. S'il se perd, « Nouveau lien » dans votre équipe en crée un autre.
      </p>
    </div>

    <div v-else-if="result.kind === 'no_link'" class="flex items-start gap-3">
      <span class="grid h-[46px] w-[46px] flex-none place-items-center rounded-pill bg-green-50 text-green-700"><MailCheck class="h-5 w-5" :stroke-width="1.9" /></span>
      <div class="min-w-0">
        <p class="m-0 text-[15px] font-bold">Invitation enregistrée</p>
        <p class="mb-0 mt-1 text-[13.5px] leading-[1.55] text-[var(--text-muted)]">
          <template v-if="result.delivery === 'sent'">Un e-mail avec le lien d'acceptation vient de partir vers <strong class="[overflow-wrap:anywhere]">{{ email }}</strong>.</template>
          <template v-else>Le lien n'a pas pu être transmis à <strong class="[overflow-wrap:anywhere]">{{ email }}</strong>. Dans votre équipe, « Nouveau lien » en crée un que vous pourrez lui envoyer vous-même.</template>
        </p>
      </div>
    </div>

    <div v-else class="flex items-start gap-3">
      <span class="grid h-[46px] w-[46px] flex-none place-items-center rounded-pill bg-warn-bg text-warn-fg"><Link2 class="h-5 w-5" :stroke-width="1.9" /></span>
      <div class="min-w-0">
        <p class="m-0 text-[15px] font-bold">Invitation enregistrée, lien à récupérer</p>
        <p class="mb-0 mt-1 text-[13.5px] leading-[1.55] text-[var(--text-muted)]">L'invitation de <strong class="[overflow-wrap:anywhere]">{{ email }}</strong> existe bien, mais son lien n'a pas pu être affiché. Dans votre équipe, « Nouveau lien » en crée un à lui transmettre.</p>
      </div>
    </div>

    <template #footer>
      <div class="flex flex-wrap justify-end gap-2.5">
        <CoreButton tone="secondary" @click="emit('close')">{{ result ? 'Fermer' : 'Annuler' }}</CoreButton>
        <CoreButton v-if="!result" :disabled="loading" @click="submit">{{ loading ? 'Envoi…' : "Envoyer l'invitation" }}</CoreButton>
      </div>
    </template>
  </CoreModal>
</template>
