<script setup lang="ts">
import { Check, Copy, Link2, LogOut, Plus, ShieldCheck, UserPlus, Users } from '@lucide/vue'
import type { Membership, MyTeam, RolePreset, TeamInvitation, TeamMember, TeamRegistry } from '~/types/team'
import { ApiRequestError } from '~/utils/authenticatedFetcher'
import { errorText } from '~/utils/apiErrors'
import { ENFORCED_PERMISSIONS, expiryLabel, groupPermissions, inviteDelivery, inviteLink, MEMBER_STATUS, memberName, pendingRows, reinvitePayload, roleLabel } from '~/utils/team'

definePageMeta({ layout: 'pro' })

/**
 * Équipe. Invitation, annulation et départ volontaire passent par l'API depuis
 * les correctifs du 06/10/2026 (#4, #74, #75). `?invite=<email>` ouvre
 * l'invitation préremplie (lien « Inviter aussi dans mon équipe » d'un mandat).
 */
const route = useRoute()
const router = useRouter()
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
const members = computed(() => (team.value?.members ?? []).filter(m => m.status === 'active'))
const pending = computed(() => pendingRows(team.value))
const pendingCount = computed(() => pending.value.invitations.length + pending.value.pendingMembers.length)

const flash = ref('')
/** Erreur d'action, affichée sous la ligne concernée. */
const rowError = ref<{ id: string; message: string } | null>(null)
function failure(id: string, e: unknown, fallback: string) {
  rowError.value = { id, message: e instanceof ApiRequestError ? errorText(e.mapped, fallback) : fallback }
}

/* ---- Inviter (avec `?invite=` pour un e-mail prérempli) ---- */
const inviting = ref(false)
const inviteEmail = ref('')
function openInvite(email = '') {
  inviteEmail.value = email
  flash.value = ''
  inviting.value = true
}
function closeInvite() {
  inviting.value = false
  if (route.query.invite) {
    const { invite: _, ...rest } = route.query
    router.replace({ query: rest })
  }
}
watch(() => [route.query.invite, canManage.value] as const, ([email, manage]) => {
  if (typeof email === 'string' && email && manage) openInvite(email)
}, { immediate: true })

/* ---- Modifier / retirer un membre ---- */
const editingId = ref<string | null>(null)
const edit = reactive({ preset: '', permissions: [] as string[], propertyIds: [] as string[] })
function startEdit(m: TeamMember) {
  editingId.value = m.id
  confirming.value = null
  edit.preset = m.role_preset
  edit.permissions = [...m.permissions]
  edit.propertyIds = m.properties.map(p => p.id)
  rowError.value = null
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
const busyId = ref<string | null>(null)
async function saveMember(m: TeamMember) {
  if (!edit.permissions.length) { rowError.value = { id: m.id, message: 'Gardez au moins une permission.' }; return }
  busyId.value = m.id
  rowError.value = null
  try {
    const presetPerms = registry.value?.presets[edit.preset]?.permissions ?? []
    const samePreset = presetPerms.length === edit.permissions.length && edit.permissions.every(p => presetPerms.includes(p))
    await teamApi.updateMember(m.id, { ...(samePreset ? { role_preset: edit.preset } : { permissions: edit.permissions }), property_ids: edit.propertyIds })
    editingId.value = null
    flash.value = `Accès de ${memberName(m)} mis à jour.`
    await load()
  } catch (e) {
    failure(m.id, e, "La modification n'a pas pu être enregistrée.")
  } finally {
    busyId.value = null
  }
}

/** Un seul panneau de confirmation ouvert à la fois. */
const confirming = ref<{ id: string; kind: 'remove' | 'cancel' | 'renew' | 'leave' | 'preset' } | null>(null)
function ask(id: string, kind: 'remove' | 'cancel' | 'renew' | 'leave' | 'preset') {
  confirming.value = { id, kind }
  editingId.value = null
  rowError.value = null
}
function isAsking(id: string, kind: string) {
  return confirming.value?.id === id && confirming.value.kind === kind
}

async function removeMember(m: TeamMember) {
  busyId.value = m.id
  rowError.value = null
  try {
    await teamApi.revokeMember(m.id)
    confirming.value = null
    flash.value = m.status === 'pending' ? `Invitation de ${memberName(m)} annulée.` : `${memberName(m)} a été retiré de l'équipe : il n'a plus accès à vos biens.`
    await load()
  } catch (e) {
    failure(m.id, e, m.status === 'pending' ? "L'invitation n'a pas pu être annulée." : "Le membre n'a pas pu être retiré.")
  } finally {
    busyId.value = null
  }
}

/* ---- Invitations : annuler, ou créer un nouveau lien ---- */
async function cancelInvitation(inv: TeamInvitation) {
  busyId.value = inv.id
  rowError.value = null
  try {
    await teamApi.cancelInvitation(inv.id)
    confirming.value = null
    flash.value = `Invitation de ${inv.email} annulée : son lien ne fonctionne plus.`
    await load()
  } catch (e) {
    failure(inv.id, e, "L'invitation n'a pas pu être annulée.")
  } finally {
    busyId.value = null
  }
}

/** Nouveau lien montré sous la ligne de l'invitation (par e-mail, l'id change à la recréation). */
const freshLink = ref<{ email: string; link: string; sent: boolean } | null>(null)
const copied = ref(false)
/** L'ancienne invitation a été annulée mais la nouvelle a échoué : on propose de réinviter. */
const lostInvite = ref<string | null>(null)
async function renewInvitation(inv: TeamInvitation) {
  busyId.value = inv.id
  rowError.value = null
  lostInvite.value = null
  try {
    await teamApi.cancelInvitation(inv.id)
  } catch (e) {
    failure(inv.id, e, "Le nouveau lien n'a pas pu être créé.")
    busyId.value = null
    return
  }
  try {
    const res = await teamApi.invite(reinvitePayload(inv, presets.value))
    confirming.value = null
    copied.value = false
    freshLink.value = res.token ? { email: inv.email, link: inviteLink(window.location.origin, res.token), sent: inviteDelivery(res) === 'sent' } : null
    flash.value = res.token
      ? `Nouveau lien créé pour ${inv.email} : l'ancien ne fonctionne plus.`
      : `Invitation de ${inv.email} renouvelée${inviteDelivery(res) === 'sent' ? ' : un e-mail est parti avec le nouveau lien' : ''}.`
  } catch {
    confirming.value = null
    flash.value = ''
    lostInvite.value = inv.email
  } finally {
    busyId.value = null
    await load()
  }
}
async function copyFresh() {
  if (!freshLink.value) return
  try {
    await navigator.clipboard.writeText(freshLink.value.link)
    copied.value = true
  } catch {
    copied.value = false
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
  busyId.value = 'preset-form'
  presetError.value = ''
  try {
    if (f.id) await teamApi.updatePreset(f.id, { name: f.name.trim(), permissions: f.permissions })
    else await teamApi.createPreset({ name: f.name.trim(), permissions: f.permissions })
    presetForm.value = null
    presets.value = await teamApi.fetchPresets()
  } catch (e) {
    presetError.value = e instanceof ApiRequestError ? errorText(e.mapped, "Le poste n'a pas pu être enregistré.") : "Le poste n'a pas pu être enregistré."
  } finally {
    busyId.value = null
  }
}
async function deletePreset(p: RolePreset) {
  busyId.value = p.id
  rowError.value = null
  try {
    await teamApi.deletePreset(p.id)
    confirming.value = null
    presets.value = await teamApi.fetchPresets()
  } catch (e) {
    failure(p.id, e, "Le poste n'a pas pu être supprimé.")
  } finally {
    busyId.value = null
  }
}

/* ---- Équipes dont je suis membre ---- */
async function leave(m: Membership) {
  busyId.value = m.membership_id
  rowError.value = null
  try {
    await teamApi.leaveTeam(m.membership_id)
    confirming.value = null
    flash.value = `Vous avez quitté l'équipe ${m.team.name} : vous n'avez plus accès à ses biens.`
    await load()
  } catch (e) {
    failure(m.membership_id, e, "Vous n'avez pas pu quitter cette équipe.")
  } finally {
    busyId.value = null
  }
}

function ownerName(m: Membership) {
  return `${m.team.owner.first_name ?? ''} ${m.team.owner.last_name ?? ''}`.trim() || 'le propriétaire'
}
function propertyList(list: { name: string }[]) {
  return list.length ? list.map(p => p.name).join(', ') : 'aucun bien confié'
}
</script>

<template>
  <div class="animate-[im-fade_.3s_ease_backwards]">
    <div v-if="state === 'loading'" class="flex flex-col gap-4.5">
      <DataSkeletonCard :height="96" :lines="1" />
      <DataSkeletonCard :height="180" :lines="2" />
    </div>
    <FeedbackAlertBanner v-else-if="state === 'error'" tone="danger">
      Impossible de charger votre équipe pour le moment.
      <button type="button" class="ml-2 font-bold underline" @click="load">Réessayer</button>
    </FeedbackAlertBanner>

    <template v-else-if="registry">
      <p v-if="flash" class="mb-4.5 mt-0 rounded-md border border-ok-border bg-ok-bg px-3.5 py-2.5 text-[13px] font-semibold text-green-900">{{ flash }}</p>
      <div v-if="lostInvite" class="mb-4.5 flex flex-wrap items-center gap-2.5 rounded-md border border-danger-border bg-danger-bg px-3.5 py-2.5">
        <p class="m-0 min-w-[200px] flex-1 text-[13px] font-semibold text-danger-fg-deep">L'ancienne invitation de {{ lostInvite }} est annulée, mais la nouvelle n'a pas pu être créée.</p>
        <CoreButton size="sm" tone="secondary" @click="openInvite(lostInvite); lostInvite = null">Inviter à nouveau</CoreButton>
      </div>

      <template v-if="canManage">
        <!-- En-tête de l'équipe -->
        <section class="mb-4.5 flex flex-wrap items-center gap-4 rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
          <span class="grid h-[46px] w-[46px] flex-none place-items-center rounded-pill bg-green-50 text-green-700"><Users class="h-5 w-5" :stroke-width="1.9" /></span>
          <div class="min-w-0 flex-1">
            <h2 class="m-0 text-[15px] font-bold">{{ team?.team?.name ?? "Vous n'avez pas encore d'équipe" }}</h2>
            <p class="mb-0 mt-1 text-[13.5px] text-[var(--text-muted)]">
              <template v-if="team?.team">
                <span class="font-mono">{{ members.length }}</span> membre{{ members.length > 1 ? 's' : '' }} actif{{ members.length > 1 ? 's' : '' }}
                · <span class="font-mono">{{ pendingCount }}</span> invitation{{ pendingCount > 1 ? 's' : '' }} en attente
              </template>
              <template v-else>Invitez un gestionnaire, un comptable… : chacun n'agit que sur les biens que vous lui confiez.</template>
            </p>
          </div>
          <CoreButton @click="openInvite()">
            <span class="inline-flex items-center gap-1.5"><UserPlus class="h-4 w-4" :stroke-width="1.9" />Inviter un membre</span>
          </CoreButton>
        </section>

        <div class="grid grid-cols-1 items-start gap-4.5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <div class="flex min-w-0 flex-col gap-4.5">
            <!-- Membres actifs -->
            <section class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
              <h2 class="m-0 text-[15px] font-bold">Membres</h2>
              <div v-if="!members.length" class="flex flex-col items-center px-2 py-6 text-center">
                <span class="grid h-[46px] w-[46px] place-items-center rounded-pill bg-green-50 text-green-700"><Users class="h-5 w-5" :stroke-width="1.9" /></span>
                <p class="mb-0 mt-3 max-w-[360px] text-[13.5px] text-[var(--text-muted)]">
                  {{ pendingCount ? "Personne n'a encore accepté : les invitations en attente sont listées ci-dessous." : "Aucun membre pour l'instant. Invitez quelqu'un pour lui confier vos baux, logements ou demandes." }}
                </p>
              </div>

              <div v-for="m in members" :key="m.id" class="border-b border-sand-200 py-3.5 last:border-b-0">
                <div class="flex flex-wrap items-center gap-3">
                  <CoreAvatar :name="memberName(m)" :avatar-url="m.avatar_url" :size="40" />
                  <div class="min-w-0 flex-[1_1_200px]">
                    <p class="m-0 text-sm font-bold">{{ memberName(m) }}</p>
                    <p v-if="m.email && m.email !== memberName(m)" class="m-0 text-xs text-[var(--text-faint)] [overflow-wrap:anywhere]">{{ m.email }}</p>
                    <p class="mb-0 mt-0.5 text-[13px] text-[var(--text-muted)]">{{ roleLabel(registry, m.role_preset, m.custom_preset_name) }} · {{ propertyList(m.properties) }}</p>
                  </div>
                  <CoreBadge :tone="MEMBER_STATUS[m.status]?.tone ?? 'neutral'">{{ MEMBER_STATUS[m.status]?.label ?? 'Statut inconnu' }}</CoreBadge>
                  <div class="flex gap-2">
                    <CoreButton size="sm" tone="secondary" @click="startEdit(m)">Modifier</CoreButton>
                    <CoreButton size="sm" tone="ghost" @click="ask(m.id, 'remove')">Retirer</CoreButton>
                  </div>
                </div>
                <CoreInlineConfirm
                  v-if="isAsking(m.id, 'remove')"
                  class="mt-3"
                  tone="danger"
                  :message="`Retirer ${memberName(m)} ? Il perd tout accès à vos biens immédiatement.`"
                  confirm-label="Retirer"
                  :loading="busyId === m.id"
                  @confirm="removeMember(m)"
                  @cancel="confirming = null"
                />
                <div v-if="editingId === m.id" class="mt-3 rounded-md border border-[var(--border-default)] bg-[var(--surface-page)] p-4">
                  <label class="block">
                    <span class="mb-[7px] block text-[12.5px] font-bold">Poste</span>
                    <select v-model="edit.preset" class="h-[42px] w-full rounded-md border border-[var(--border-default)] bg-white px-3 text-[13.5px]">
                      <option v-for="(p, key) in registry.presets" :key="key" :value="key">{{ p.label }}</option>
                      <option value="custom">Personnalisé</option>
                    </select>
                  </label>
                  <div v-for="g in groups" :key="g.category" class="mt-3">
                    <p class="mb-1.5 mt-0 text-label font-bold uppercase tracking-label text-[var(--text-faint)]">{{ g.category }}</p>
                    <div class="flex flex-wrap gap-1.5">
                      <button
                        v-for="p in g.items"
                        :key="p.key"
                        type="button"
                        class="inline-flex items-center gap-1.5 rounded-pill border px-3 py-1.5 text-[12.5px] font-semibold"
                        :class="edit.permissions.includes(p.key) ? 'border-green-600 bg-green-50 text-green-800' : 'border-[var(--border-default)] bg-white text-[var(--text-muted)]'"
                        :aria-pressed="edit.permissions.includes(p.key)"
                        @click="toggle(edit.permissions, p.key)"
                      ><Check v-if="edit.permissions.includes(p.key)" class="h-3.5 w-3.5" :stroke-width="2.2" />{{ p.label }}</button>
                    </div>
                  </div>
                  <p class="mb-1 mt-3.5 text-[12.5px] font-bold">Biens confiés</p>
                  <label v-for="p in properties" :key="p.id" class="flex cursor-pointer items-center gap-2.5 py-1.5 text-[13.5px]">
                    <input type="checkbox" :checked="edit.propertyIds.includes(p.id)" class="h-4 w-4 accent-green-600" @change="toggle(edit.propertyIds, p.id)">
                    {{ p.name }}
                  </label>
                  <div class="mt-3.5 flex flex-wrap gap-2">
                    <CoreButton size="sm" :disabled="busyId === m.id" @click="saveMember(m)">{{ busyId === m.id ? 'Enregistrement…' : 'Enregistrer' }}</CoreButton>
                    <CoreButton size="sm" tone="secondary" @click="editingId = null">Annuler</CoreButton>
                  </div>
                </div>
                <p v-if="rowError?.id === m.id" class="mb-0 mt-2 text-[13px] font-semibold text-danger-fg">{{ rowError.message }}</p>
              </div>
            </section>

            <!-- Invitations en attente -->
            <section v-if="pendingCount" class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
              <h2 class="m-0 text-[15px] font-bold">Invitations en attente</h2>
              <p class="mb-1 mt-1 text-[13.5px] text-[var(--text-muted)]">La personne rejoint l'équipe en ouvrant son lien d'invitation. Un lien perdu ? Créez-en un nouveau.</p>

              <div v-for="i in pending.invitations" :key="i.id" class="border-b border-sand-200 py-3.5 last:border-b-0">
                <div class="flex flex-wrap items-center gap-3">
                  <CoreAvatar :name="i.email" :size="40" />
                  <div class="min-w-0 flex-[1_1_200px]">
                    <p class="m-0 text-sm font-bold [overflow-wrap:anywhere]">{{ i.email }}</p>
                    <p class="mb-0 mt-0.5 text-[13px] text-[var(--text-muted)]">{{ roleLabel(registry, i.role_preset, i.custom_preset_name) }}</p>
                    <p class="mb-0 mt-0.5 text-xs text-[var(--text-faint)]">Invitation {{ expiryLabel(i.expires_at).text }}</p>
                  </div>
                  <CoreBadge :tone="expiryLabel(i.expires_at).expired ? 'neutral' : 'warn'">{{ expiryLabel(i.expires_at).expired ? 'Expirée' : 'En attente' }}</CoreBadge>
                  <div class="flex gap-2">
                    <CoreButton size="sm" tone="secondary" @click="ask(i.id, 'renew')">
                      <span class="inline-flex items-center gap-1.5"><Link2 class="h-4 w-4" :stroke-width="1.9" />Nouveau lien</span>
                    </CoreButton>
                    <CoreButton size="sm" tone="ghost" @click="ask(i.id, 'cancel')">Annuler</CoreButton>
                  </div>
                </div>
                <CoreInlineConfirm
                  v-if="isAsking(i.id, 'renew')"
                  class="mt-3"
                  tone="neutral"
                  :message="`Créer un nouveau lien pour ${i.email} ? L'ancien lien cessera de fonctionner.`"
                  confirm-label="Créer le lien"
                  :loading="busyId === i.id"
                  @confirm="renewInvitation(i)"
                  @cancel="confirming = null"
                />
                <CoreInlineConfirm
                  v-if="isAsking(i.id, 'cancel')"
                  class="mt-3"
                  tone="danger"
                  :message="`Annuler l'invitation de ${i.email} ? Son lien ne permettra plus de rejoindre l'équipe.`"
                  confirm-label="Annuler l'invitation"
                  :loading="busyId === i.id"
                  @confirm="cancelInvitation(i)"
                  @cancel="confirming = null"
                />
                <div v-if="freshLink && freshLink.email.toLowerCase() === i.email.toLowerCase()" class="mt-3 rounded-md border border-ok-border bg-ok-bg p-3.5">
                  <p class="m-0 text-[13px] font-semibold text-green-900">
                    {{ freshLink.sent ? 'Un e-mail est parti avec ce lien. Vous pouvez aussi le transmettre vous-même :' : 'Transmettez ce lien (WhatsApp, SMS…) : aucun e-mail n\'a pu partir.' }}
                  </p>
                  <div class="mt-2.5 flex flex-wrap gap-2">
                    <input :value="freshLink.link" readonly aria-label="Nouveau lien d'invitation" class="h-[38px] min-w-0 flex-[1_1_200px] rounded-md border border-[var(--border-default)] bg-white px-3 font-mono text-[12px]" @focus="($event.target as HTMLInputElement).select()">
                    <CoreButton size="sm" tone="secondary" @click="copyFresh">
                      <span class="inline-flex items-center gap-1.5"><component :is="copied ? Check : Copy" class="h-4 w-4" :stroke-width="1.9" />{{ copied ? 'Copié' : 'Copier' }}</span>
                    </CoreButton>
                  </div>
                  <p class="mb-0 mt-2 text-xs text-[var(--text-faint)]">Ce lien ne sera plus affiché après avoir quitté la page.</p>
                </div>
                <p v-if="rowError?.id === i.id" class="mb-0 mt-2 text-[13px] font-semibold text-danger-fg">{{ rowError.message }}</p>
              </div>

              <!-- Comptes invités avant l'arrivée des liens : on ne peut que les annuler -->
              <div v-for="m in pending.pendingMembers" :key="m.id" class="border-b border-sand-200 py-3.5 last:border-b-0">
                <div class="flex flex-wrap items-center gap-3">
                  <CoreAvatar :name="memberName(m)" :avatar-url="m.avatar_url" :size="40" />
                  <div class="min-w-0 flex-[1_1_200px]">
                    <p class="m-0 text-sm font-bold">{{ memberName(m) }}</p>
                    <p v-if="m.email && m.email !== memberName(m)" class="m-0 text-xs text-[var(--text-faint)] [overflow-wrap:anywhere]">{{ m.email }}</p>
                    <p class="mb-0 mt-0.5 text-[13px] text-[var(--text-muted)]">{{ roleLabel(registry, m.role_preset, m.custom_preset_name) }} · {{ propertyList(m.properties) }}</p>
                  </div>
                  <CoreBadge tone="warn">En attente</CoreBadge>
                  <CoreButton size="sm" tone="ghost" @click="ask(m.id, 'remove')">Annuler</CoreButton>
                </div>
                <p class="mb-0 mt-2 text-xs leading-[1.5] text-[var(--text-faint)]">Pour lui envoyer un lien, annulez cette invitation puis invitez-le à nouveau.</p>
                <CoreInlineConfirm
                  v-if="isAsking(m.id, 'remove')"
                  class="mt-3"
                  tone="danger"
                  :message="`Annuler l'invitation de ${memberName(m)} ?`"
                  confirm-label="Annuler l'invitation"
                  :loading="busyId === m.id"
                  @confirm="removeMember(m)"
                  @cancel="confirming = null"
                />
                <p v-if="rowError?.id === m.id" class="mb-0 mt-2 text-[13px] font-semibold text-danger-fg">{{ rowError.message }}</p>
              </div>
            </section>
          </div>

          <div class="flex min-w-0 flex-col gap-4.5">
            <section class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
              <div class="flex items-center gap-2.5">
                <ShieldCheck class="h-[18px] w-[18px] flex-none text-green-700" :stroke-width="1.9" />
                <h2 class="m-0 text-[15px] font-bold">Ce que vos membres peuvent faire</h2>
              </div>
              <p class="mb-2.5 mt-1 text-[13.5px] text-[var(--text-muted)]">Sur les biens que vous leur confiez, selon leurs permissions :</p>
              <ul class="m-0 flex list-none flex-col gap-2 p-0">
                <li v-for="(what, key) in ENFORCED_PERMISSIONS" :key="key" class="flex gap-2 text-[13px] leading-[1.5] text-[var(--text-secondary)]">
                  <Check class="mt-0.5 h-4 w-4 flex-none text-ok-fg" :stroke-width="2" />
                  <span><strong>{{ labels[key] ?? 'Permission' }}</strong> : {{ what }}</span>
                </li>
              </ul>
              <p class="mb-0 mt-3 text-xs leading-[1.5] text-[var(--text-faint)]">Les autres permissions (voir les paiements, la messagerie, les statistiques…) sont enregistrées mais n'ont pas encore d'effet.</p>
            </section>

            <section class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
              <div class="flex items-baseline justify-between gap-2">
                <h2 class="m-0 text-[15px] font-bold">Vos postes</h2>
                <button v-if="!presetForm" type="button" class="inline-flex items-center gap-1 text-[12.5px] font-bold text-green-700" @click="newPreset"><Plus class="h-3.5 w-3.5" :stroke-width="2.2" />Nouveau poste</button>
              </div>
              <p class="mb-2 mt-1 text-[13.5px] text-[var(--text-muted)]">Des modèles de permissions réutilisables à l'invitation (ex. « Gardien »).</p>
              <p v-if="!presets.length && !presetForm" class="m-0 py-2 text-[13px] text-[var(--text-muted)]">Aucun poste pour l'instant.</p>
              <div v-for="p in presets" :key="p.id" class="border-b border-sand-200 py-3 last:border-b-0">
                <div class="flex flex-wrap items-center gap-2">
                  <p class="m-0 min-w-0 flex-1 text-sm font-bold">{{ p.name }}</p>
                  <CoreButton size="sm" tone="ghost" @click="editPreset(p)">Modifier</CoreButton>
                  <CoreButton size="sm" tone="ghost" @click="ask(p.id, 'preset')">Supprimer</CoreButton>
                </div>
                <p class="mb-0 mt-1 text-xs leading-[1.5] text-[var(--text-faint)]">{{ p.permissions.map(k => labels[k] ?? k).join(' · ') }}</p>
                <CoreInlineConfirm
                  v-if="isAsking(p.id, 'preset')"
                  class="mt-2.5"
                  tone="danger"
                  message="Supprimer ce poste ? Les membres déjà invités gardent leurs permissions."
                  confirm-label="Supprimer"
                  :loading="busyId === p.id"
                  @confirm="deletePreset(p)"
                  @cancel="confirming = null"
                />
                <p v-if="rowError?.id === p.id" class="mb-0 mt-2 text-[13px] font-semibold text-danger-fg">{{ rowError.message }}</p>
              </div>
              <div v-if="presetForm" class="mt-2 rounded-md border border-[var(--border-default)] bg-[var(--surface-page)] p-3.5">
                <FormsInput v-model="presetForm.name" label="Nom du poste" placeholder="ex. Gardien" />
                <div v-for="g in groups" :key="g.category" class="mt-3">
                  <p class="mb-1.5 mt-0 text-label font-bold uppercase tracking-label text-[var(--text-faint)]">{{ g.category }}</p>
                  <div class="flex flex-wrap gap-1.5">
                    <button
                      v-for="k in g.items"
                      :key="k.key"
                      type="button"
                      class="inline-flex items-center gap-1.5 rounded-pill border px-3 py-1.5 text-[12.5px] font-semibold"
                      :class="presetForm.permissions.includes(k.key) ? 'border-green-600 bg-green-50 text-green-800' : 'border-[var(--border-default)] bg-white text-[var(--text-muted)]'"
                      :aria-pressed="presetForm.permissions.includes(k.key)"
                      @click="toggle(presetForm.permissions, k.key)"
                    ><Check v-if="presetForm.permissions.includes(k.key)" class="h-3.5 w-3.5" :stroke-width="2.2" />{{ k.label }}</button>
                  </div>
                </div>
                <p v-if="presetError" class="mb-0 mt-2.5 text-[13px] font-semibold text-danger-fg">{{ presetError }}</p>
                <div class="mt-3.5 flex flex-wrap gap-2">
                  <CoreButton size="sm" :disabled="busyId === 'preset-form'" @click="savePreset">Enregistrer le poste</CoreButton>
                  <CoreButton size="sm" tone="secondary" @click="presetForm = null">Annuler</CoreButton>
                </div>
              </div>
            </section>
          </div>
        </div>
      </template>

      <!-- Équipes dont je suis membre -->
      <section v-if="memberships.length || !canManage" class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5" :class="canManage ? 'mt-5.5' : ''">
        <h2 class="m-0 text-[15px] font-bold">Équipes dont vous êtes membre</h2>
        <div v-if="!memberships.length" class="flex flex-col items-center px-2 py-6 text-center">
          <span class="grid h-[46px] w-[46px] place-items-center rounded-pill bg-green-50 text-green-700"><Users class="h-5 w-5" :stroke-width="1.9" /></span>
          <p class="mb-0 mt-3 max-w-[380px] text-[13.5px] text-[var(--text-muted)]">Vous ne faites partie d'aucune équipe. Un propriétaire ou une agence vous envoie un lien d'invitation : ouvrez-le pour la rejoindre.</p>
        </div>
        <div v-for="m in memberships" :key="m.membership_id" class="border-b border-sand-200 py-3.5 last:border-b-0">
          <div class="flex flex-wrap items-center gap-3">
            <CoreAvatar :name="m.team.name" :size="40" />
            <div class="min-w-0 flex-[1_1_200px]">
              <p class="m-0 text-sm font-bold">{{ m.team.name }} <span class="font-normal text-[var(--text-muted)]">· {{ ownerName(m) }}</span></p>
              <p class="mb-0 mt-0.5 text-[13px] text-[var(--text-muted)]">{{ roleLabel(registry, m.role_preset) }} · {{ propertyList(m.properties) }}</p>
              <p class="mb-0 mt-0.5 text-xs leading-[1.5] text-[var(--text-faint)]">Vous pouvez : {{ m.permissions.filter(k => ENFORCED_PERMISSIONS[k]).map(k => ENFORCED_PERMISSIONS[k]).join(' ; ') || 'consulter seulement' }}.</p>
            </div>
            <CoreButton size="sm" tone="ghost" @click="ask(m.membership_id, 'leave')">
              <span class="inline-flex items-center gap-1.5"><LogOut class="h-4 w-4" :stroke-width="1.9" />Quitter</span>
            </CoreButton>
          </div>
          <CoreInlineConfirm
            v-if="isAsking(m.membership_id, 'leave')"
            class="mt-3"
            tone="danger"
            :message="`Quitter l'équipe ${m.team.name} ? Vous perdez l'accès à ses biens ; il faudra une nouvelle invitation pour revenir.`"
            confirm-label="Quitter l'équipe"
            :loading="busyId === m.membership_id"
            @confirm="leave(m)"
            @cancel="confirming = null"
          />
          <p v-if="rowError?.id === m.membership_id" class="mb-0 mt-2 text-[13px] font-semibold text-danger-fg">{{ rowError.message }}</p>
        </div>
      </section>
    </template>

    <ProInviteModal
      v-if="inviting && registry"
      :registry="registry"
      :team="team"
      :presets="presets"
      :properties="properties"
      :initial-email="inviteEmail"
      @close="closeInvite"
      @invited="load"
    />
  </div>
</template>
