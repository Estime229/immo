<script setup lang="ts">
/**
 * Rôles & accès : les rôles en cartes, le détail du rôle choisi à côté (`?role=`). Les
 * permissions d'un rôle personnalisé se cochent par domaine et s'enregistrent explicitement ;
 * un rôle système est en lecture seule et ne se supprime pas. La vue « Niveaux administrateur »
 * (`?vue=niveaux`) montre, en lecture, les permissions par défaut de chaque niveau.
 */
import { Check, Lock } from '@lucide/vue'
import { groupRbacPermissions, permissionLabel, type AdminLevelDetail, type RbacPermission, type RbacRole } from '~/composables/useRbac'

definePageMeta({ layout: 'admin', middleware: 'require-admin', requiredPermission: 'manage:rbac' })

const route = useRoute()
const router = useRouter()
const { fetchRoles, fetchPermissions, createRole, updateRole, deleteRole, fetchAdminLevels } = useRbac()
const { auth } = useAdminAuth()

function setQuery(patch: Record<string, string | undefined>) {
  const query: Record<string, string> = {}
  for (const [k, v] of Object.entries({ ...route.query, ...patch })) if (typeof v === 'string' && v) query[k] = v
  return router.replace({ query })
}

const VIEW_OPTIONS = [
  { value: 'roles', label: 'Rôles' },
  { value: 'niveaux', label: 'Niveaux administrateur' }
]
const view = computed(() => (route.query.vue === 'niveaux' ? 'niveaux' : 'roles'))

/* ---------- Chargement ---------- */
const roles = ref<RbacRole[]>([])
const permissions = ref<RbacPermission[]>([])
const state = ref<'loading' | 'ready' | 'error'>('loading')
const levels = ref<AdminLevelDetail[]>([])
const levelsState = ref<'loading' | 'ready' | 'error'>('loading')

async function load() {
  if (!roles.value.length) state.value = 'loading'
  try {
    const [r, p] = await Promise.all([fetchRoles(), fetchPermissions()])
    roles.value = r
    permissions.value = p
    state.value = 'ready'
  } catch {
    state.value = 'error'
  }
}
async function loadLevels() {
  levelsState.value = 'loading'
  try {
    levels.value = await fetchAdminLevels()
    levelsState.value = 'ready'
  } catch {
    levelsState.value = 'error'
  }
}
onMounted(() => {
  load()
  loadLevels()
})

/** Rôles personnalisés d'abord (ce sont eux qu'on modifie), puis les rôles système. */
const sortedRoles = computed(() => [...roles.value].sort((a, b) => Number(a.is_system) - Number(b.is_system) || a.name.localeCompare(b.name, 'fr')))
const customCount = computed(() => roles.value.filter(r => !r.is_system).length)
const permissionById = computed(() => new Map(permissions.value.map(p => [p.id, p])))
const permissionByName = computed(() => new Map(permissions.value.map(p => [p.name, p])))
const allGroups = computed(() => groupRbacPermissions(permissions.value))

function plural(n: number, one: string, many: string) {
  return `${n} ${n > 1 ? many : one}`
}

/* ---------- Rôle choisi ---------- */
const selectedId = computed(() => (typeof route.query.role === 'string' ? route.query.role : ''))
const selected = computed(() => roles.value.find(r => r.id === selectedId.value) ?? null)
const flash = ref('')
const detailEl = ref<HTMLElement | null>(null)

const draftIds = ref<string[]>([])
const permError = ref('')
const savingPerms = ref(false)
const confirmingDelete = ref(false)
const deleting = ref(false)
const deleteError = ref('')
/** Rôle demandé alors que des cases cochées ne sont pas enregistrées : confirmation en ligne. */
const pendingSwitch = ref<string | null>(null)

watch(selected, r => {
  draftIds.value = r ? r.permissions.map(p => p.id) : []
  permError.value = ''
  confirmingDelete.value = false
  deleteError.value = ''
  pendingSwitch.value = null
}, { immediate: true })

const savedIds = computed(() => new Set(selected.value?.permissions.map(p => p.id) ?? []))
const changeCount = computed(() => {
  const draft = new Set(draftIds.value)
  let n = 0
  for (const id of draft) if (!savedIds.value.has(id)) n++
  for (const id of savedIds.value) if (!draft.has(id)) n++
  return n
})

/** Permissions accordées par un rôle système, avec leur description quand l'API la donne. */
const grantedGroups = computed(() => groupRbacPermissions((selected.value?.permissions ?? []).map(p => permissionById.value.get(p.id) ?? { ...p, description: '' })))

async function selectRole(id: string, force = false) {
  if (id === selectedId.value) return
  if (!force && changeCount.value) {
    pendingSwitch.value = id
    return
  }
  flash.value = ''
  await setQuery({ role: id })
  if (import.meta.client && window.matchMedia('(max-width: 1023px)').matches) {
    await nextTick()
    detailEl.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}

function togglePermission(id: string) {
  draftIds.value = draftIds.value.includes(id) ? draftIds.value.filter(x => x !== id) : [...draftIds.value, id]
}
function allChecked(items: RbacPermission[]) {
  return items.every(p => draftIds.value.includes(p.id))
}
function toggleGroup(items: RbacPermission[]) {
  const ids = items.map(p => p.id)
  draftIds.value = allChecked(items) ? draftIds.value.filter(id => !ids.includes(id)) : [...new Set([...draftIds.value, ...ids])]
}

async function savePermissions() {
  const role = selected.value
  if (!role) return
  savingPerms.value = true
  permError.value = ''
  try {
    await updateRole(role.id, { permissionIds: draftIds.value })
    flash.value = `Permissions du rôle « ${role.name} » enregistrées : ${plural(draftIds.value.length, 'permission', 'permissions')}.`
    await load()
  } catch (e) {
    permError.value = e instanceof Error && e.message ? e.message : "Les permissions n'ont pas pu être enregistrées."
  } finally {
    savingPerms.value = false
  }
}

async function removeRole() {
  const role = selected.value
  if (!role) return
  deleting.value = true
  deleteError.value = ''
  try {
    await deleteRole(role.id)
    flash.value = `Rôle « ${role.name} » supprimé.`
    await setQuery({ role: undefined })
    await load()
  } catch (e) {
    deleteError.value = e instanceof Error && e.message ? e.message : "Le rôle n'a pas pu être supprimé."
  } finally {
    deleting.value = false
  }
}

/* ---------- Créer / renommer (formulaire en modale) ---------- */
const form = reactive({ open: false, mode: 'create' as 'create' | 'edit', name: '', description: '', template: '', error: '', busy: false })

const templateLevels = computed(() => levels.value.filter(l => !l.seederOnly))
const templateRoles = computed(() => sortedRoles.value.filter(r => r.permissions.length))

function templateIds(template: string): string[] {
  const [kind, sourceId] = template.split(':')
  if (kind === 'niveau') {
    const names = new Set(levels.value.find(l => String(l.level) === sourceId)?.defaultPermissions ?? [])
    return permissions.value.filter(p => names.has(p.name)).map(p => p.id)
  }
  if (kind === 'role') return roles.value.find(r => r.id === sourceId)?.permissions.map(p => p.id) ?? []
  return []
}

function openCreate() {
  Object.assign(form, { open: true, mode: 'create', name: '', description: '', template: '', error: '', busy: false })
  flash.value = ''
}
function openEdit() {
  if (!selected.value) return
  Object.assign(form, { open: true, mode: 'edit', name: selected.value.name, description: selected.value.description ?? '', template: '', error: '', busy: false })
  flash.value = ''
}

async function submitForm() {
  const name = form.name.trim()
  if (!name) {
    form.error = 'Donnez un nom au rôle.'
    return
  }
  const otherId = form.mode === 'edit' ? selected.value?.id : null
  if (roles.value.some(r => r.id !== otherId && r.name.trim().toLowerCase() === name.toLowerCase())) {
    form.error = 'Un rôle porte déjà ce nom.'
    return
  }
  form.busy = true
  form.error = ''
  try {
    if (form.mode === 'create') {
      const ids = templateIds(form.template)
      const created = await createRole({ name, description: form.description.trim() || undefined, permissionIds: ids })
      await load()
      const id = created?.id ?? roles.value.find(r => r.name === name)?.id
      form.open = false
      if (id) await selectRole(id, true)
      flash.value = `Rôle « ${name} » créé avec ${plural(ids.length, 'permission', 'permissions')}. Ajustez-les ci-dessous, puis attribuez-le depuis la fiche d'un compte.`
    } else if (selected.value) {
      await updateRole(selected.value.id, { name, description: form.description.trim() })
      form.open = false
      flash.value = `Rôle « ${name} » mis à jour.`
      await load()
    }
  } catch (e) {
    form.error = e instanceof Error && e.message ? e.message : "Le rôle n'a pas pu être enregistré."
  } finally {
    form.busy = false
  }
}

/* ---------- Niveaux administrateur ---------- */
const openLevels = ref<number[]>([])
function toggleLevel(level: number) {
  openLevels.value = openLevels.value.includes(level) ? openLevels.value.filter(l => l !== level) : [...openLevels.value, level]
}
function levelGroups(level: AdminLevelDetail) {
  return groupRbacPermissions(level.defaultPermissions.map(name => permissionByName.value.get(name) ?? { name, description: '' }))
}
</script>

<template>
  <div class="animate-[im-fade_.3s_ease_backwards]">
    <div class="mb-4.5 flex flex-wrap items-center gap-3">
      <div class="max-w-full overflow-x-auto [&_button]:whitespace-nowrap">
        <FormsSegmentedControl :options="VIEW_OPTIONS" :model-value="view" size="sm" @update:model-value="v => setQuery({ vue: v === 'niveaux' ? 'niveaux' : undefined })" />
      </div>
    </div>

    <!-- Rôles -->
    <template v-if="view === 'roles'">
      <div v-if="state === 'loading'" class="grid grid-cols-1 gap-4.5 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        <div class="flex flex-col gap-3">
          <DataSkeletonCard v-for="i in 4" :key="i" :height="92" :lines="0" />
        </div>
        <DataSkeletonCard :height="360" :lines="0" />
      </div>

      <FeedbackAlertBanner v-else-if="state === 'error'" tone="danger">
        Impossible de charger les rôles pour le moment.
        <button type="button" class="ml-2 font-bold underline" @click="load">Réessayer</button>
      </FeedbackAlertBanner>

      <template v-else>
        <p v-if="flash" class="mb-4.5 mt-0 rounded-md border border-ok-border bg-ok-bg px-3.5 py-2.5 text-[13px] font-semibold text-green-900">{{ flash }}</p>

        <div class="grid grid-cols-1 items-start gap-4.5 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
          <!-- Liste des rôles -->
          <div class="flex flex-col gap-3">
            <div class="flex flex-wrap items-center gap-3">
              <p class="m-0 flex-1 text-[13px] text-[var(--text-muted)]">
                {{ plural(roles.length, 'rôle', 'rôles') }}<template v-if="roles.length"> · {{ plural(customCount, 'personnalisé', 'personnalisés') }}</template>
              </p>
              <AdminButton size="sm" @click="openCreate">+ Créer un rôle</AdminButton>
            </div>
            <p class="m-0 text-[12.5px] leading-[1.5] text-[var(--text-faint)]">Un rôle regroupe des permissions d'administration. Il s'attribue depuis la fiche d'un compte, en plus de son niveau admin.</p>

            <p v-if="!roles.length" class="m-0 rounded-md border border-dashed border-[var(--border-default)] bg-white px-4 py-10 text-center text-[13.5px] text-[var(--text-muted)]">
              Aucun rôle pour l'instant : créez-en un pour regrouper des permissions.
            </p>

            <button
              v-for="r in sortedRoles"
              :key="r.id"
              type="button"
              class="w-full rounded-2xl border bg-white px-5 py-4.5 text-left transition-colors"
              :class="r.id === selectedId ? 'border-green-600 shadow-[0_0_0_1px_var(--color-green-600)]' : 'border-[var(--border-subtle)] hover:border-[var(--border-default)]'"
              :aria-pressed="r.id === selectedId"
              @click="selectRole(r.id)"
            >
              <div class="flex items-start gap-3">
                <div class="min-w-0 flex-1">
                  <p class="m-0 truncate text-sm font-bold">{{ r.name }}</p>
                  <p class="mb-0 mt-0.5 line-clamp-2 text-[13px] leading-[1.45] text-[var(--text-muted)]">{{ r.description || 'Sans description' }}</p>
                </div>
                <AdminBadge :tone="r.is_system ? 'neutral' : 'primary'">
                  <Lock v-if="r.is_system" class="h-3 w-3" :stroke-width="2.2" />{{ r.is_system ? 'Système' : 'Personnalisé' }}
                </AdminBadge>
              </div>
              <p class="mb-0 mt-2.5 text-xs text-[var(--text-faint)]">
                <span class="font-mono font-bold text-[var(--text-secondary)]">{{ r.permissions.length }}</span> permission{{ r.permissions.length > 1 ? 's' : '' }}
              </p>
            </button>
          </div>

          <!-- Détail du rôle -->
          <section ref="detailEl" class="scroll-mt-[94px] rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
            <template v-if="selected">
              <div class="flex flex-wrap items-start gap-3">
                <div class="min-w-0 flex-1">
                  <p class="m-0 flex flex-wrap items-center gap-2 text-[17px] font-bold tracking-[-.015em]">
                    {{ selected.name }}
                    <AdminBadge :tone="selected.is_system ? 'neutral' : 'primary'">{{ selected.is_system ? 'Système' : 'Personnalisé' }}</AdminBadge>
                  </p>
                  <p class="mb-0 mt-1 text-[13.5px] text-[var(--text-muted)]">{{ selected.description || 'Sans description' }}</p>
                </div>
                <div v-if="!selected.is_system && !confirmingDelete" class="flex flex-none items-center gap-3">
                  <AdminButton size="sm" variant="secondary" @click="openEdit">Renommer</AdminButton>
                  <button type="button" class="text-[12.5px] font-bold text-danger-fg" @click="confirmingDelete = true; deleteError = ''">Supprimer</button>
                </div>
              </div>

              <AdminInlineConfirm
                v-if="confirmingDelete"
                class="mt-3.5"
                tone="danger"
                :message="`Supprimer le rôle « ${selected.name} » ? Les comptes à qui il est attribué perdent les permissions qu'il donne.`"
                confirm-label="Supprimer"
                :loading="deleting"
                @confirm="removeRole"
                @cancel="confirmingDelete = false"
              />
              <p v-if="deleteError" class="mb-0 mt-2 text-[13px] font-semibold text-danger-fg">{{ deleteError }}</p>

              <p v-if="selected.is_system" class="mb-0 mt-3.5 flex items-start gap-2 rounded-md bg-sand-100 px-3.5 py-2.5 text-[12.5px] leading-[1.5] text-[var(--text-secondary)]">
                <Lock class="mt-0.5 h-3.5 w-3.5 flex-none" :stroke-width="2.2" />
                Rôle système, défini par la plateforme : ses permissions s'affichent en lecture seule et il ne peut pas être supprimé.
              </p>

              <div class="mb-1 mt-5 flex items-baseline justify-between gap-3">
                <h2 class="m-0 text-[15px] font-bold">Permissions</h2>
                <span class="text-xs text-[var(--text-faint)]"><span class="font-mono font-bold text-[var(--text-secondary)]">{{ draftIds.length }}</span> sur <span class="font-mono">{{ permissions.length }}</span></span>
              </div>

              <!-- Rôle système : lecture seule -->
              <template v-if="selected.is_system">
                <p v-if="!selected.permissions.length" class="mb-0 mt-2 text-[13px] text-[var(--text-muted)]">Ce rôle n'accorde aucune permission d'administration.</p>
                <div v-for="g in grantedGroups" :key="g.key" class="mt-3.5">
                  <p class="mb-1 mt-0 text-label font-bold uppercase tracking-label text-[var(--text-faint)]">{{ g.label }}</p>
                  <div v-for="p in g.items" :key="p.name" class="flex items-start gap-2.5 border-b border-sand-200 py-2.5 last:border-b-0">
                    <Check class="mt-0.5 h-4 w-4 flex-none text-ok-fg" :stroke-width="2.4" />
                    <div class="min-w-0">
                      <p class="m-0 text-[13.5px] font-semibold">{{ permissionLabel(p.name, p.description) }}</p>
                      <p class="mb-0 mt-0.5 font-mono text-[11.5px] text-[var(--text-faint)]">{{ p.name }}</p>
                    </div>
                  </div>
                </div>
              </template>

              <!-- Rôle personnalisé : cases à cocher, enregistrement explicite -->
              <template v-else>
                <p v-if="!permissions.length" class="mb-0 mt-2 text-[13px] text-[var(--text-muted)]">L'API ne renvoie aucune permission à attribuer.</p>
                <div v-for="g in allGroups" :key="g.key" class="mt-4">
                  <div class="mb-1.5 flex items-center justify-between gap-2">
                    <p class="m-0 text-label font-bold uppercase tracking-label text-[var(--text-faint)]">{{ g.label }}</p>
                    <button type="button" class="text-[12px] font-bold text-green-700" @click="toggleGroup(g.items)">{{ allChecked(g.items) ? 'Tout décocher' : 'Tout cocher' }}</button>
                  </div>
                  <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <label
                      v-for="p in g.items"
                      :key="p.id"
                      class="flex cursor-pointer items-start gap-2.5 rounded-md border px-3 py-2.5 transition-colors"
                      :class="draftIds.includes(p.id) ? 'border-green-600 bg-green-50' : 'border-[var(--border-subtle)] bg-white hover:border-[var(--border-default)]'"
                    >
                      <input type="checkbox" :checked="draftIds.includes(p.id)" class="mt-0.5 h-[18px] w-[18px] flex-none cursor-pointer accent-[var(--color-green-600)]" @change="togglePermission(p.id)">
                      <span class="min-w-0">
                        <span class="block text-[13.5px] font-semibold leading-[1.35]">{{ permissionLabel(p.name, p.description) }}</span>
                        <span class="mt-0.5 block font-mono text-[11.5px] text-[var(--text-faint)]">{{ p.name }}</span>
                      </span>
                    </label>
                  </div>
                </div>

                <div v-if="changeCount || permError" class="sticky bottom-[calc(var(--mobile-tabbar-space)+12px)] z-10 mt-4.5 lg:bottom-4">
                  <AdminInlineConfirm
                    v-if="pendingSwitch"
                    tone="warning"
                    :message="`Quitter ce rôle sans enregistrer ${plural(changeCount, 'modification', 'modifications')} ?`"
                    confirm-label="Quitter sans enregistrer"
                    cancel-label="Rester"
                    @confirm="selectRole(pendingSwitch ?? '', true)"
                    @cancel="pendingSwitch = null"
                  />
                  <div v-else class="rounded-md border border-warn-border bg-warn-bg px-3.5 py-3 shadow-card">
                    <div class="flex flex-wrap items-center gap-2.5">
                      <p v-if="changeCount" class="m-0 min-w-[160px] flex-1 text-[13px] font-semibold text-warn-fg-deep">
                        {{ plural(changeCount, 'modification non enregistrée', 'modifications non enregistrées') }}
                      </p>
                      <AdminButton v-if="changeCount" size="sm" :loading="savingPerms" @click="savePermissions">Enregistrer les permissions</AdminButton>
                      <AdminButton v-if="changeCount" size="sm" variant="secondary" :disabled="savingPerms" @click="draftIds = [...savedIds]; permError = ''">Annuler</AdminButton>
                    </div>
                    <p v-if="permError" class="mb-0 mt-2 text-[13px] font-semibold text-danger-fg">{{ permError }}</p>
                  </div>
                </div>
              </template>
            </template>

            <p v-else class="m-0 py-10 text-center text-[13.5px] text-[var(--text-muted)]">Choisissez un rôle pour voir ses permissions.</p>
          </section>
        </div>
      </template>
    </template>

    <!-- Niveaux administrateur -->
    <template v-else>
      <p class="mb-4.5 mt-0 max-w-[760px] text-[13px] leading-[1.55] text-[var(--text-muted)]">
        Chaque compte admin a un niveau qui fixe ses permissions par défaut, et donc les rubriques de son menu. Les niveaux sont définis par la plateforme et ne se modifient pas ici ; le niveau d'un compte se change depuis sa fiche.
      </p>

      <div v-if="levelsState === 'loading'" class="grid grid-cols-1 gap-4.5 lg:grid-cols-2">
        <DataSkeletonCard v-for="i in 4" :key="i" :height="110" :lines="0" />
      </div>
      <FeedbackAlertBanner v-else-if="levelsState === 'error'" tone="danger">
        Impossible de charger les niveaux administrateur.
        <button type="button" class="ml-2 font-bold underline" @click="loadLevels">Réessayer</button>
      </FeedbackAlertBanner>
      <p v-else-if="!levels.length" class="rounded-md border border-dashed border-[var(--border-default)] bg-white px-4 py-10 text-center text-[13.5px] text-[var(--text-muted)]">
        L'API ne renvoie aucun niveau administrateur.
      </p>

      <div v-else class="grid grid-cols-1 items-start gap-4.5 lg:grid-cols-2">
        <section v-for="l in levels" :key="l.level" class="rounded-2xl border border-[var(--border-subtle)] bg-white px-5 py-4.5">
          <div class="flex items-start gap-3">
            <span class="grid h-10 w-10 flex-none place-items-center rounded-md bg-green-50 font-mono text-[15px] font-bold text-green-800">{{ l.level }}</span>
            <div class="min-w-0 flex-1">
              <p class="m-0 flex flex-wrap items-center gap-2 text-sm font-bold">
                {{ l.name }}
                <AdminBadge v-if="auth.adminLevel === l.level" tone="primary">Votre niveau</AdminBadge>
                <AdminBadge v-if="l.seederOnly" tone="neutral">Attribué à l'installation</AdminBadge>
              </p>
              <p v-if="l.description" class="mb-0 mt-0.5 text-[13px] leading-[1.45] text-[var(--text-muted)]">{{ l.description }}</p>
            </div>
          </div>
          <button
            type="button"
            class="mt-3 text-[12.5px] font-bold text-green-700"
            :aria-expanded="openLevels.includes(l.level)"
            @click="toggleLevel(l.level)"
          >
            {{ openLevels.includes(l.level) ? 'Masquer les permissions' : `Voir ${l.defaultPermissions.length > 1 ? `les ${l.defaultPermissions.length} permissions` : 'la permission'}` }}
          </button>
          <div v-if="openLevels.includes(l.level)" class="mt-1">
            <div v-for="g in levelGroups(l)" :key="g.key" class="mt-3">
              <p class="mb-1.5 mt-0 text-label font-bold uppercase tracking-label text-[var(--text-faint)]">{{ g.label }}</p>
              <div class="flex flex-wrap gap-1.5">
                <span v-for="p in g.items" :key="p.name" class="rounded-pill bg-sand-100 px-2.5 py-1 text-[12px] font-semibold text-[var(--text-secondary)]" :title="p.name">
                  {{ permissionLabel(p.name, p.description) }}
                </span>
              </div>
            </div>
          </div>
        </section>
      </div>
    </template>

    <AdminModal :open="form.open" :title="form.mode === 'create' ? 'Créer un rôle' : 'Renommer le rôle'" @close="form.open = false">
      <form id="role-form" class="flex flex-col gap-3.5" @submit.prevent="submitForm">
        <AdminInput v-model="form.name" label="Nom du rôle" placeholder="Ex. Comptable" />
        <AdminInput v-model="form.description" label="Description (facultative)" placeholder="Ex. Suit les paiements et les retraits" />
        <label v-if="form.mode === 'create'" class="block">
          <span class="mb-[7px] block text-[12.5px] font-bold">Partir des permissions de</span>
          <select v-model="form.template" class="h-[46px] w-full cursor-pointer rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3.5 text-[14px] outline-none focus:border-green-600">
            <option value="">Aucune permission (à cocher ensuite)</option>
            <optgroup v-if="templateLevels.length" label="Niveaux administrateur">
              <option v-for="l in templateLevels" :key="l.level" :value="`niveau:${l.level}`">Niveau {{ l.level }} · {{ l.name }} ({{ l.defaultPermissions.length }})</option>
            </optgroup>
            <optgroup v-if="templateRoles.length" label="Rôles existants">
              <option v-for="r in templateRoles" :key="r.id" :value="`role:${r.id}`">{{ r.name }} ({{ r.permissions.length }})</option>
            </optgroup>
          </select>
          <span class="mt-[7px] block text-[12px] text-[var(--text-faint)]">Les cases restent modifiables une fois le rôle créé.</span>
        </label>
        <p v-if="form.error" class="m-0 text-[13px] font-semibold text-danger-fg">{{ form.error }}</p>
      </form>
      <template #footer>
        <div class="flex flex-wrap gap-2">
          <AdminButton type="submit" form="role-form" :loading="form.busy">{{ form.mode === 'create' ? 'Créer le rôle' : 'Enregistrer' }}</AdminButton>
          <AdminButton variant="secondary" :disabled="form.busy" @click="form.open = false">Annuler</AdminButton>
        </div>
      </template>
    </AdminModal>
  </div>
</template>
