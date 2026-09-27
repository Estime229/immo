<script setup lang="ts">
import type { InviteResult, MyTeam, RolePreset, TeamRegistry } from '~/types/team'
import { ApiRequestError } from '~/utils/authenticatedFetcher'
import { errorText } from '~/utils/apiErrors'
import { ENFORCED_PERMISSIONS, groupPermissions, inviteLink, inviteOutcome, validateInvite } from '~/utils/team'

/**
 * Invitation d'un membre (Lot 53) — remplace l'écran « indisponible » du Lot 39.
 * `POST /team/invite` enregistre l'invitation puis répond 500 (envoi de l'e-mail
 * en échec, #4) : on relit l'équipe et on dit honnêtement ce qui a été écrit.
 */
const props = defineProps<{
  registry: TeamRegistry
  team: MyTeam | null
  presets: RolePreset[]
  properties: { id: string; name: string }[]
}>()
const emit = defineEmits<{ close: []; invited: [] }>()

const teamApi = useTeamApi()

const email = ref('')
const choice = ref('gestionnaire')
const permissions = ref<string[]>([...(props.registry.presets.gestionnaire?.permissions ?? [])])
const propertyIds = ref<string[]>(props.properties.length === 1 ? [props.properties[0]!.id] : [])
const teamName = ref('')
const loading = ref(false)
const errorMessage = ref('')
const result = ref<{ kind: 'link'; link: string; expires: string } | { kind: 'in_app' } | { kind: 'recorded'; member: boolean } | null>(null)
const copied = ref(false)

const groups = computed(() => groupPermissions(props.registry.permissions))
const customPreset = computed(() => props.presets.find(p => `custom:${p.id}` === choice.value) ?? null)
watch(choice, c => {
  if (c.startsWith('custom:')) permissions.value = [...(customPreset.value?.permissions ?? [])]
  else permissions.value = [...(props.registry.presets[c]?.permissions ?? [])]
})

function permTitle(key: string) {
  return ENFORCED_PERMISSIONS[key] ? `Permet de ${ENFORCED_PERMISSIONS[key]}` : "Sans effet côté serveur pour l'instant"
}

function toggle(list: string[], v: string) {
  const i = list.indexOf(v)
  if (i >= 0) list.splice(i, 1)
  else list.push(v)
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
    result.value = res.type === 'email' && res.token
      ? { kind: 'link', link: inviteLink(window.location.origin, res.token), expires: res.expires_at ?? '' }
      : { kind: 'in_app' }
    emit('invited')
  } catch (e) {
    // #4 : 500 alors que l'écriture a eu lieu — on vérifie avant d'afficher un échec.
    if (e instanceof ApiRequestError && (e.status ?? 0) >= 500) {
      try {
        const outcome = inviteOutcome(await teamApi.fetchMyTeam(), email.value)
        if (outcome !== 'missing') {
          result.value = { kind: 'recorded', member: outcome === 'member' }
          emit('invited')
          return
        }
      } catch {
        // on retombe sur le message d'erreur
      }
    }
    errorMessage.value = e instanceof ApiRequestError ? errorText(e.mapped, "L'invitation n'a pas pu être envoyée.") : "L'invitation n'a pas pu être envoyée."
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
  <Teleport to="body">
    <div class="fixed inset-0 z-[90] grid animate-[im-veil_.22s_ease_both] place-items-center bg-black/50 p-3 backdrop-blur-[3px] sm:p-6" @click="emit('close')">
      <div class="flex max-h-[90vh] w-[560px] max-w-full animate-[im-rise_.28s_var(--ease-standard)_both] flex-col overflow-hidden rounded-2xl bg-[var(--surface-page)] shadow-panel" @click.stop>
        <div class="flex items-center justify-between border-b border-[var(--border-subtle)] px-6 py-4.5">
          <h3 class="m-0 font-display text-lg font-bold tracking-[-.02em]">Inviter un membre</h3>
          <button type="button" class="grid h-9 w-9 place-items-center rounded-pill bg-sand-200 text-base text-sand-800" aria-label="Fermer" @click="emit('close')">✕</button>
        </div>

        <div class="overflow-y-auto p-6">
          <template v-if="!result">
            <label class="block">
              <span class="mb-1.5 block text-[12.5px] font-bold">Adresse e-mail</span>
              <input v-model="email" type="email" placeholder="prenom@exemple.bj" class="h-11 w-full rounded-sm border border-[var(--border-default)] bg-white px-3.5 text-[13.5px] outline-none">
            </label>
            <label v-if="!team?.team" class="mt-3.5 block">
              <span class="mb-1.5 block text-[12.5px] font-bold">Nom de votre équipe (facultatif)</span>
              <input v-model="teamName" maxlength="100" placeholder="ex. Agence Étoile Cotonou" class="h-11 w-full rounded-sm border border-[var(--border-default)] bg-white px-3.5 text-[13.5px] outline-none">
            </label>
            <label class="mt-3.5 block">
              <span class="mb-1.5 block text-[12.5px] font-bold">Poste</span>
              <select v-model="choice" class="h-11 w-full rounded-sm border border-[var(--border-default)] bg-white px-3 text-[13.5px]">
                <option v-for="(p, key) in registry.presets" :key="key" :value="key">{{ p.label }}</option>
                <option v-for="p in presets" :key="p.id" :value="`custom:${p.id}`">{{ p.name }} (vos postes)</option>
              </select>
            </label>

            <p class="mb-2 mt-4 text-[12.5px] font-bold">Permissions</p>
            <div v-for="g in groups" :key="g.category" class="mb-2.5">
              <p class="mb-1 mt-0 text-[11px] font-black uppercase tracking-[.04em] text-[var(--text-faint)]">{{ g.category }}</p>
              <div class="flex flex-wrap gap-1.5">
                <button
                  v-for="p in g.items"
                  :key="p.key"
                  type="button"
                  class="rounded-pill border px-2.5 py-1.5 text-[12px] font-semibold disabled:cursor-not-allowed"
                  :class="permissions.includes(p.key) ? 'border-green-600 bg-green-50 text-green-800' : 'border-[var(--border-default)] bg-white text-[var(--text-muted)]'"
                  :disabled="!!customPreset"
                  :title="permTitle(p.key)"
                  @click="toggle(permissions, p.key)"
                >{{ permissions.includes(p.key) ? '✓ ' : '' }}{{ p.label }}{{ ENFORCED_PERMISSIONS[p.key] ? '' : ' *' }}</button>
              </div>
            </div>
            <p class="mb-0 mt-1 text-[11.5px] text-[var(--text-faint)]">* sans effet pour l'instant : l'application ne vérifie encore que les permissions sans astérisque.</p>

            <p class="mb-2 mt-4 text-[12.5px] font-bold">Biens confiés</p>
            <p v-if="!properties.length" class="m-0 text-[12.5px] text-[var(--text-muted)]">Vous n'avez pas encore de bien.</p>
            <label v-for="p in properties" :key="p.id" class="mb-1.5 flex cursor-pointer items-center gap-2.5 text-[13px]">
              <input type="checkbox" :checked="propertyIds.includes(p.id)" class="accent-green-600" @change="toggle(propertyIds, p.id)">
              {{ p.name }}
            </label>

            <p v-if="errorMessage" class="mb-0 mt-3 rounded-md border border-danger-border bg-danger-bg px-3.5 py-2.5 text-[13px] font-semibold text-danger-fg">{{ errorMessage }}</p>
          </template>

          <template v-else-if="result.kind === 'link'">
            <p class="m-0 text-[15px] font-bold">Invitation créée ✓</p>
            <p class="mb-0 mt-2 text-[13px] leading-[1.6] text-[var(--text-muted)]">Envoyez ce lien à {{ email }} (WhatsApp, SMS…). Il crée son compte avec cette adresse, puis accepte.</p>
            <div class="mt-3 flex gap-2">
              <input :value="result.link" readonly class="h-10 min-w-0 flex-1 rounded-sm border border-[var(--border-default)] bg-white px-3 font-mono text-[12px]">
              <CoreButton tone="secondary" @click="copyLink(result.link)">{{ copied ? 'Copié ✓' : 'Copier' }}</CoreButton>
            </div>
          </template>
          <template v-else-if="result.kind === 'in_app'">
            <p class="m-0 text-[15px] font-bold">Invitation envoyée ✓</p>
            <p class="mb-0 mt-2 text-[13px] leading-[1.6] text-[var(--text-muted)]">{{ email }} a déjà un compte Immo : l'invitation l'attend dans son espace.</p>
          </template>
          <template v-else>
            <div class="rounded-md border border-warn-border bg-warn-bg p-4 text-[13px] leading-[1.6] text-warn-fg">
              <p class="m-0 font-bold">Invitation enregistrée, mais pas transmise</p>
              <p class="mb-0 mt-1.5">
                L'API a échoué en envoyant l'e-mail, et elle ne renvoie alors pas le lien d'invitation.
                <template v-if="result.member">{{ email }} a déjà un compte, mais l'application ne propose encore aucun moyen d'accepter une invitation depuis son espace.</template>
                <template v-else>{{ email }} ne peut donc pas encore rejoindre votre équipe.</template>
                L'invitation apparaît « en attente » dans votre équipe ; elle sera utilisable une fois ce problème corrigé côté serveur.
              </p>
            </div>
          </template>
        </div>

        <div class="flex justify-end gap-2.5 border-t border-[var(--border-subtle)] px-6 py-4">
          <CoreButton tone="secondary" @click="emit('close')">{{ result ? 'Fermer' : 'Annuler' }}</CoreButton>
          <CoreButton v-if="!result" :disabled="loading" @click="submit">{{ loading ? 'Envoi…' : 'Inviter' }}</CoreButton>
        </div>
      </div>
    </div>
  </Teleport>
</template>
