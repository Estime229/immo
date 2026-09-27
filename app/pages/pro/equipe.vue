<script setup lang="ts">
import type { Membership, MyTeam, RolePreset, TeamMember, TeamRegistry } from '~/types/team'
import { ApiRequestError } from '~/utils/authenticatedFetcher'
import { errorText } from '~/utils/apiErrors'
import { ENFORCED_PERMISSIONS, expiryLabel, groupPermissions, MEMBER_STATUS, memberName, roleLabel } from '~/utils/team'

definePageMeta({ layout: 'pro' })

/**
 * Équipe — branchée sur l'API au Lot 53. Avant : membres, postes et droits
 * écrits en dur, identiques pour tous les comptes.
 */
const teamApi = useTeamApi()
const propertiesApi = useLandlordPropertiesApi()
const authUser = useAuthUser()

const registry = ref<TeamRegistry | null>(null)
const team = ref<MyTeam | null>(null)
const presets = ref<RolePreset[]>([])
const properties = ref<{ id: string; name: string }[]>([])
const memberships = ref<Membership[]>([])
const state = ref<'loading' | 'error' | 'ready'>('loading')

/** L'API ne laisse inviter que les comptes propriétaire ou agence (403 sinon). */
const canManage = computed(() => ['landlord', 'agency', 'admin'].includes(authUser.value?.role ?? ''))

async function load() {
  if (!registry.value) state.value = 'loading'
  const [reg, my, pre, props, mem] = await Promise.allSettled([
    teamApi.fetchRegistry(),
    canManage.value ? teamApi.fetchMyTeam() : Promise.resolve(null),
    canManage.value ? teamApi.fetchPresets() : Promise.resolve([]),
    canManage.value ? propertiesApi.fetchMine({ limit: 100 }) : Promise.resolve(null),
    teamApi.fetchMemberships()
  ])
  if (reg.status === 'rejected') { state.value = 'error'; return }
  registry.value = reg.value
  team.value = my.status === 'fulfilled' ? my.value : null
  presets.value = pre.status === 'fulfilled' ? pre.value : []
  properties.value = props.status === 'fulfilled' && props.value ? props.value.data.map(p => ({ id: p.id, name: p.name })) : []
  memberships.value = mem.status === 'fulfilled' ? mem.value : []
  state.value = my.status === 'rejected' && canManage.value ? 'error' : 'ready'
}
onMounted(load)

const labels = computed(() => Object.fromEntries((registry.value?.permissions ?? []).map(p => [p.key, p.label])))
const groups = computed(() => groupPermissions(registry.value?.permissions ?? []))
const members = computed(() => (team.value?.members ?? []).filter(m => m.status !== 'revoked'))

const inviting = ref(false)
const flash = ref('')
const actionError = ref('')

/* ---- Modifier / retirer un membre ---- */
const editingId = ref<string | null>(null)
const edit = reactive({ preset: '', permissions: [] as string[], propertyIds: [] as string[] })
function startEdit(m: TeamMember) {
  editingId.value = m.id
  edit.preset = m.role_preset
  edit.permissions = [...m.permissions]
  edit.propertyIds = m.properties.map(p => p.id)
  actionError.value = ''
}
watch(() => edit.preset, p => {
  const perms = registry.value?.presets[p]?.permissions
  if (perms && editingId.value) edit.permissions = [...perms]
})
function toggle(list: string[], v: string) {
  const i = list.indexOf(v)
  if (i >= 0) list.splice(i, 1)
  else list.push(v)
}
const busy = ref(false)
async function saveMember(m: TeamMember) {
  if (!edit.permissions.length) { actionError.value = 'Gardez au moins une permission.'; return }
  busy.value = true
  actionError.value = ''
  try {
    const presetPerms = registry.value?.presets[edit.preset]?.permissions ?? []
    const samePreset = presetPerms.length === edit.permissions.length && edit.permissions.every(p => presetPerms.includes(p))
    await teamApi.updateMember(m.id, { ...(samePreset ? { role_preset: edit.preset } : { permissions: edit.permissions }), property_ids: edit.propertyIds })
    editingId.value = null
    flash.value = `Accès de ${memberName(m)} mis à jour.`
    await load()
  } catch (e) {
    actionError.value = e instanceof ApiRequestError ? errorText(e.mapped, "La modification n'a pas pu être enregistrée.") : "La modification n'a pas pu être enregistrée."
  } finally {
    busy.value = false
  }
}
const removingId = ref<string | null>(null)
async function removeMember(m: TeamMember) {
  busy.value = true
  actionError.value = ''
  try {
    await teamApi.revokeMember(m.id)
    removingId.value = null
    flash.value = `${memberName(m)} a été retiré de l'équipe et prévenu.`
    await load()
  } catch (e) {
    actionError.value = e instanceof ApiRequestError ? errorText(e.mapped, "Le membre n'a pas pu être retiré.") : "Le membre n'a pas pu être retiré."
  } finally {
    busy.value = false
  }
}

/* ---- Postes nommés ---- */
const presetForm = ref<{ id: string | null; name: string; permissions: string[] } | null>(null)
const presetError = ref('')
function newPreset() {
  presetForm.value = { id: null, name: '', permissions: [] }
  presetError.value = ''
}
function editPreset(p: RolePreset) {
  presetForm.value = { id: p.id, name: p.name, permissions: [...p.permissions] }
  presetError.value = ''
}
async function savePreset() {
  const f = presetForm.value
  if (!f) return
  if (!f.name.trim()) { presetError.value = 'Donnez un nom au poste.'; return }
  if (!f.permissions.length) { presetError.value = 'Cochez au moins une permission.'; return }
  busy.value = true
  presetError.value = ''
  try {
    if (f.id) await teamApi.updatePreset(f.id, { name: f.name.trim(), permissions: f.permissions })
    else await teamApi.createPreset({ name: f.name.trim(), permissions: f.permissions })
    presetForm.value = null
    presets.value = await teamApi.fetchPresets()
  } catch (e) {
    presetError.value = e instanceof ApiRequestError ? errorText(e.mapped, "Le poste n'a pas pu être enregistré.") : "Le poste n'a pas pu être enregistré."
  } finally {
    busy.value = false
  }
}
const deletingPresetId = ref<string | null>(null)
async function deletePreset(p: RolePreset) {
  busy.value = true
  try {
    await teamApi.deletePreset(p.id)
    deletingPresetId.value = null
    presets.value = await teamApi.fetchPresets()
  } catch (e) {
    presetError.value = e instanceof ApiRequestError ? errorText(e.mapped, "Le poste n'a pas pu être supprimé.") : "Le poste n'a pas pu être supprimé."
  } finally {
    busy.value = false
  }
}

function ownerName(m: Membership) {
  return `${m.team.owner.first_name ?? ''} ${m.team.owner.last_name ?? ''}`.trim() || 'le propriétaire'
}
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}
</script>

<template>
  <div class="animate-[im-fade_.3s_ease_both]">
    <div v-if="state === 'loading'" class="flex flex-col gap-3.5">
      <DataSkeletonCard v-for="i in 2" :key="i" :height="120" :lines="1" />
    </div>
    <FeedbackAlertBanner v-else-if="state === 'error'" tone="danger">
      Impossible de charger votre équipe pour le moment.
      <button type="button" class="ml-2 font-bold underline" @click="load">Réessayer</button>
    </FeedbackAlertBanner>

    <template v-else-if="registry">
      <p v-if="flash" class="mb-3.5 rounded-md border border-ok-border bg-ok-bg px-3.5 py-2.5 text-[13px] font-semibold text-green-900">{{ flash }}</p>
      <p v-if="actionError" class="mb-3.5 rounded-md border border-danger-border bg-danger-bg px-3.5 py-2.5 text-[13px] font-semibold text-danger-fg">{{ actionError }}</p>

      <template v-if="canManage">
        <div class="mb-4.5 flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
          <div class="min-w-0 flex-1">
            <p class="m-0 text-[17px] font-bold tracking-[-.015em]">{{ team?.team?.name ?? "Vous n'avez pas encore d'équipe" }}</p>
            <p class="mb-0 mt-1 text-[13px] text-[var(--text-muted)]">
              {{ team?.team ? `${members.length} membre${members.length > 1 ? 's' : ''} · ${team.invitations.length} invitation${team.invitations.length > 1 ? 's' : ''} en attente` : "Invitez un gestionnaire, un comptable… : chacun n'agit que sur les biens que vous lui confiez." }}
            </p>
          </div>
          <CoreButton @click="inviting = true; flash = ''">+ Inviter un membre</CoreButton>
        </div>

        <div class="grid grid-cols-1 items-start gap-4.5 lg:grid-cols-[1.5fr_1fr]">
          <div class="flex flex-col gap-4.5">
            <div class="overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-white">
              <p class="m-0 border-b border-sand-200 px-5 py-3.5 text-[15px] font-bold">Membres et invitations</p>
              <p v-if="!members.length && !team?.invitations.length" class="m-0 px-5 py-6 text-[13px] text-[var(--text-muted)]">Personne pour l'instant.</p>

              <div v-for="m in members" :key="m.id" class="border-b border-sand-200 px-5 py-4 last:border-b-0">
                <div class="flex flex-wrap items-center gap-3">
                  <CoreAvatar :name="memberName(m)" :size="40" />
                  <div class="min-w-0 flex-1">
                    <p class="m-0 text-[14.5px] font-bold">{{ memberName(m) }}</p>
                    <p v-if="m.email && m.email !== memberName(m)" class="m-0 text-[12px] text-[var(--text-faint)] [overflow-wrap:anywhere]">{{ m.email }}</p>
                    <p class="mb-0 mt-0.5 text-[12.5px] text-[var(--text-muted)]">
                      {{ roleLabel(registry, m.role_preset, m.custom_preset_name) }} · {{ m.properties.length ? m.properties.map(p => p.name).join(', ') : 'aucun bien' }}
                    </p>
                  </div>
                  <CoreBadge :tone="MEMBER_STATUS[m.status]?.tone ?? 'neutral'">{{ MEMBER_STATUS[m.status]?.label ?? m.status }}</CoreBadge>
                  <CoreButton size="sm" tone="secondary" @click="startEdit(m)">Modifier</CoreButton>
                  <CoreButton size="sm" tone="ghost" @click="removingId = m.id">Retirer</CoreButton>
                </div>
                <p v-if="m.status === 'pending'" class="mb-0 mt-2 text-[12px] leading-[1.5] text-warn-fg">
                  Cette personne a déjà un compte Immo, mais l'application ne propose encore aucun moyen d'accepter l'invitation depuis son espace (route absente côté serveur).
                </p>
                <div v-if="removingId === m.id" class="mt-3 flex flex-wrap items-center gap-2.5 rounded-md border border-warn-border bg-warn-bg px-3.5 py-2.5">
                  <p class="m-0 flex-1 text-[13px] font-semibold text-warn-fg">Retirer {{ memberName(m) }} ? Il perd tout accès à vos biens et en est prévenu.</p>
                  <CoreButton size="sm" tone="danger" :disabled="busy" @click="removeMember(m)">Retirer</CoreButton>
                  <CoreButton size="sm" tone="secondary" @click="removingId = null">Annuler</CoreButton>
                </div>
                <div v-if="editingId === m.id" class="mt-3 rounded-md border border-[var(--border-default)] bg-[var(--surface-page)] p-4">
                  <label class="block">
                    <span class="mb-1.5 block text-[12px] font-bold text-[var(--text-muted)]">Poste</span>
                    <select v-model="edit.preset" class="h-10 w-full rounded-sm border border-[var(--border-default)] bg-white px-2.5 text-[13px]">
                      <option v-for="(p, key) in registry.presets" :key="key" :value="key">{{ p.label }}</option>
                      <option value="custom">Personnalisé</option>
                    </select>
                  </label>
                  <div v-for="g in groups" :key="g.category" class="mt-2.5">
                    <p class="mb-1 mt-0 text-[11px] font-black uppercase tracking-[.04em] text-[var(--text-faint)]">{{ g.category }}</p>
                    <div class="flex flex-wrap gap-1.5">
                      <button
                        v-for="p in g.items"
                        :key="p.key"
                        type="button"
                        class="rounded-pill border px-2.5 py-1.5 text-[12px] font-semibold"
                        :class="edit.permissions.includes(p.key) ? 'border-green-600 bg-green-50 text-green-800' : 'border-[var(--border-default)] bg-white text-[var(--text-muted)]'"
                        @click="toggle(edit.permissions, p.key)"
                      >{{ edit.permissions.includes(p.key) ? '✓ ' : '' }}{{ p.label }}</button>
                    </div>
                  </div>
                  <p class="mb-1.5 mt-3 text-[12px] font-bold text-[var(--text-muted)]">Biens confiés</p>
                  <label v-for="p in properties" :key="p.id" class="mb-1 flex cursor-pointer items-center gap-2.5 text-[13px]">
                    <input type="checkbox" :checked="edit.propertyIds.includes(p.id)" class="accent-green-600" @change="toggle(edit.propertyIds, p.id)">
                    {{ p.name }}
                  </label>
                  <div class="mt-3 flex gap-2">
                    <CoreButton size="sm" :disabled="busy" @click="saveMember(m)">Enregistrer</CoreButton>
                    <CoreButton size="sm" tone="secondary" @click="editingId = null">Annuler</CoreButton>
                  </div>
                </div>
              </div>

              <div v-for="i in team?.invitations ?? []" :key="i.id" class="border-b border-sand-200 px-5 py-4 last:border-b-0">
                <div class="flex flex-wrap items-center gap-3">
                  <CoreAvatar :name="i.email" :size="40" />
                  <div class="min-w-0 flex-1">
                    <p class="m-0 text-[14.5px] font-bold [overflow-wrap:anywhere]">{{ i.email }}</p>
                    <p class="mb-0 mt-0.5 text-[12.5px] text-[var(--text-muted)]">{{ roleLabel(registry, i.role_preset, i.custom_preset_name) }} · invitation {{ expiryLabel(i.expires_at).text }}</p>
                  </div>
                  <CoreBadge tone="warn">Pas encore de compte</CoreBadge>
                </div>
                <p class="mb-0 mt-2 text-[12px] leading-[1.5] text-[var(--text-muted)]">
                  Le lien d'invitation n'a pas pu être transmis (erreur serveur à l'envoi de l'e-mail). L'application ne permet encore ni de le renvoyer ni d'annuler l'invitation : elle expire le {{ formatDate(i.expires_at) }}.
                </p>
              </div>
            </div>
          </div>

          <div class="flex flex-col gap-4.5">
            <div class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
              <p class="m-0 text-[15px] font-bold">Ce que vos membres peuvent vraiment faire</p>
              <p class="mb-2.5 mt-1 text-[12.5px] text-[var(--text-muted)]">Sur les biens que vous leur confiez, selon leurs permissions :</p>
              <ul class="m-0 list-disc space-y-1 pl-5 text-[13px] text-[var(--text-secondary)]">
                <li v-for="(what, key) in ENFORCED_PERMISSIONS" :key="key">{{ labels[key] ?? key }} : {{ what }}</li>
              </ul>
              <p class="mb-0 mt-2.5 text-[12px] leading-[1.5] text-[var(--text-faint)]">Les autres permissions (voir les paiements, la messagerie, les statistiques…) sont enregistrées mais pas encore appliquées par le serveur.</p>
            </div>

            <div class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
              <div class="flex items-center justify-between gap-2">
                <p class="m-0 text-[15px] font-bold">Vos postes</p>
                <button v-if="!presetForm" type="button" class="text-[12.5px] font-bold text-green-700" @click="newPreset">+ Nouveau poste</button>
              </div>
              <p class="mb-3 mt-1 text-[12.5px] text-[var(--text-muted)]">Des modèles de permissions réutilisables à l'invitation (ex. « Gardien »).</p>
              <p v-if="!presets.length && !presetForm" class="m-0 text-[13px] text-[var(--text-faint)]">Aucun poste pour l'instant.</p>
              <div v-for="p in presets" :key="p.id" class="mb-2.5 rounded-md border border-[var(--border-subtle)] p-3">
                <div class="flex items-center gap-2">
                  <p class="m-0 flex-1 text-[13.5px] font-bold">{{ p.name }}</p>
                  <button type="button" class="text-[12px] font-bold text-[var(--text-muted)]" @click="editPreset(p)">Modifier</button>
                  <button type="button" class="text-[12px] font-bold text-danger-fg" @click="deletingPresetId = p.id">Supprimer</button>
                </div>
                <p class="mb-0 mt-1 text-[12px] text-[var(--text-muted)]">{{ p.permissions.map(k => labels[k] ?? k).join(' · ') }}</p>
                <div v-if="deletingPresetId === p.id" class="mt-2 flex flex-wrap items-center gap-2 text-[12.5px]">
                  <span class="flex-1 text-warn-fg">Supprimer ce poste ? Les membres déjà invités gardent leurs permissions.</span>
                  <CoreButton size="sm" tone="danger" :disabled="busy" @click="deletePreset(p)">Supprimer</CoreButton>
                  <CoreButton size="sm" tone="secondary" @click="deletingPresetId = null">Non</CoreButton>
                </div>
              </div>
              <div v-if="presetForm" class="rounded-md border border-[var(--border-default)] bg-[var(--surface-page)] p-3.5">
                <input v-model="presetForm.name" maxlength="60" placeholder="Nom du poste" class="h-10 w-full rounded-sm border border-[var(--border-default)] bg-white px-3 text-[13.5px] outline-none">
                <div v-for="g in groups" :key="g.category" class="mt-2.5">
                  <p class="mb-1 mt-0 text-[11px] font-black uppercase tracking-[.04em] text-[var(--text-faint)]">{{ g.category }}</p>
                  <div class="flex flex-wrap gap-1.5">
                    <button
                      v-for="k in g.items"
                      :key="k.key"
                      type="button"
                      class="rounded-pill border px-2.5 py-1.5 text-[12px] font-semibold"
                      :class="presetForm.permissions.includes(k.key) ? 'border-green-600 bg-green-50 text-green-800' : 'border-[var(--border-default)] bg-white text-[var(--text-muted)]'"
                      @click="toggle(presetForm.permissions, k.key)"
                    >{{ presetForm.permissions.includes(k.key) ? '✓ ' : '' }}{{ k.label }}</button>
                  </div>
                </div>
                <p v-if="presetError" class="mb-0 mt-2 text-[12.5px] font-semibold text-danger-fg">{{ presetError }}</p>
                <div class="mt-3 flex gap-2">
                  <CoreButton size="sm" :disabled="busy" @click="savePreset">Enregistrer le poste</CoreButton>
                  <CoreButton size="sm" tone="secondary" @click="presetForm = null">Annuler</CoreButton>
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>

      <div v-if="memberships.length || !canManage" class="mt-4.5 rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
        <p class="m-0 text-[15px] font-bold">Équipes dont vous êtes membre</p>
        <p v-if="!memberships.length" class="mb-0 mt-2 text-[13px] text-[var(--text-muted)]">Vous ne faites partie d'aucune équipe. Un propriétaire ou une agence peut vous inviter depuis son espace « Équipe ».</p>
        <div v-for="m in memberships" :key="m.membership_id" class="mt-3 rounded-md border border-[var(--border-subtle)] p-3.5">
          <p class="m-0 text-[14px] font-bold">{{ m.team.name }} <span class="font-normal text-[var(--text-muted)]">· {{ ownerName(m) }}</span></p>
          <p class="mb-0 mt-1 text-[12.5px] text-[var(--text-muted)]">{{ roleLabel(registry, m.role_preset) }} · {{ m.properties.map(p => p.name).join(', ') || 'aucun bien' }}</p>
          <p class="mb-0 mt-1 text-[12px] text-[var(--text-secondary)]">Vous pouvez : {{ m.permissions.filter(k => ENFORCED_PERMISSIONS[k]).map(k => ENFORCED_PERMISSIONS[k]).join(' ; ') || 'consulter seulement' }}.</p>
        </div>
      </div>
    </template>

    <ProInviteModal
      v-if="inviting && registry"
      :registry="registry"
      :team="team"
      :presets="presets"
      :properties="properties"
      @close="inviting = false"
      @invited="load"
    />
  </div>
</template>
