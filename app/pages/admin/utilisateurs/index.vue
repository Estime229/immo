<script setup lang="ts">
/**
 * Comptes de la plateforme. Recherche, filtres et page vivent dans l'URL (`?q=&status=&role=&page=`) :
 * la recherche de l'en-tête arrive ici, et le retour depuis une fiche retrouve la même vue.
 */
import { ChevronRight, Plus, Search, X } from '@lucide/vue'
import { ADMIN_ROLE_LABELS, E164_PHONE, USER_STATUS, normalizePhone, userKycBadge, userRolesLabel, type AdminUserRole, type UserListItem, type UserStatus } from '~/composables/useUsers'

definePageMeta({ layout: 'admin', middleware: 'require-admin', requiredPermission: 'view:users' })

const route = useRoute()
const router = useRouter()
const { fetchUsers, createUser, createAdminUser } = useUsers()
const { auth, hasPermission } = useAdminAuth()
const { levels } = useAdminLevels()

const PAGE_SIZE = 20

const STATUS_OPTIONS: Array<{ value: UserStatus; label: string }> = [
  { value: 'active', label: 'Actifs' },
  { value: 'restricted', label: 'Restreints' },
  { value: 'banned', label: 'Bannis' }
]
/** L'API filtre sur le rôle principal : un propriétaire qui est aussi locataire sort sous « Propriétaires ». */
const ROLE_OPTIONS: Array<{ value: AdminUserRole; label: string }> = [
  { value: 'tenant', label: 'Locataires' },
  { value: 'landlord', label: 'Propriétaires' },
  { value: 'agent', label: 'Agents' },
  { value: 'agency', label: 'Agences' },
  { value: 'artisan', label: 'Artisans' },
  { value: 'admin', label: 'Administrateurs' }
]

/* ---------- Vue courante, lue dans l'URL ---------- */
function str(v: unknown) {
  return typeof v === 'string' ? v : ''
}
const q = computed(() => str(route.query.q).trim())
const status = computed(() => (STATUS_OPTIONS.some(o => o.value === route.query.status) ? (route.query.status as UserStatus) : ''))
const role = computed(() => (ROLE_OPTIONS.some(o => o.value === route.query.role) ? (route.query.role as AdminUserRole) : ''))
const page = computed(() => Math.max(1, Number.parseInt(str(route.query.page), 10) || 1))
const hasFilters = computed(() => !!(q.value || status.value || role.value))

/** `replace` et non `push` : taper une recherche ne doit pas empiler une entrée d'historique par lettre. */
function setQuery(patch: { q?: string; status?: string; role?: string; page?: number }) {
  const merged = { q: q.value, status: status.value as string, role: role.value as string, page: page.value, ...patch }
  const next: Record<string, string> = {}
  if (merged.q) next.q = merged.q
  if (merged.status) next.status = merged.status
  if (merged.role) next.role = merged.role
  if (merged.page > 1) next.page = String(merged.page)
  router.replace({ query: next })
}
function setFilter(patch: { q?: string; status?: string; role?: string }) {
  setQuery({ ...patch, page: 1 })
}
function onSelect(key: 'status' | 'role', e: Event) {
  setFilter({ [key]: (e.target as HTMLSelectElement).value })
}
function goToPage(p: number) {
  setQuery({ page: p })
  if (import.meta.client) window.scrollTo({ top: 0, behavior: 'smooth' })
}
function clearFilters() {
  search.value = ''
  router.replace({ query: {} })
}

const search = ref(q.value)
let debounce: ReturnType<typeof setTimeout> | undefined
watch(search, v => {
  clearTimeout(debounce)
  debounce = setTimeout(() => {
    if (v.trim() !== q.value) setFilter({ q: v.trim() })
  }, 350)
})
/** Recherche lancée depuis l'en-tête alors qu'on est déjà sur la page. */
watch(q, v => {
  if (v !== search.value.trim()) search.value = v
})
onBeforeUnmount(() => clearTimeout(debounce))

/* ---------- Chargement ---------- */
const users = ref<UserListItem[]>([])
const total = ref(0)
const state = ref<'loading' | 'ready' | 'error'>('loading')
const refreshing = ref(false)
let requestId = 0

async function load() {
  const id = ++requestId
  if (state.value !== 'ready') state.value = 'loading'
  refreshing.value = true
  try {
    const res = await fetchUsers({
      page: page.value,
      limit: PAGE_SIZE,
      search: q.value || undefined,
      status: status.value || undefined,
      role: role.value || undefined
    })
    if (id !== requestId) return
    users.value = res.data
    total.value = res.total
    state.value = 'ready'
    // Lien vers une page qui n'existe plus (comptes filtrés entre-temps) : retour à la dernière.
    if (!res.data.length && res.total > 0 && page.value > 1) setQuery({ page: pageCount(res.total, PAGE_SIZE) })
  } catch {
    if (id === requestId) state.value = 'error'
  } finally {
    if (id === requestId) refreshing.value = false
  }
}

watch(() => [q.value, status.value, role.value, page.value].join('|'), load)
onMounted(load)

const pages = computed(() => pageCount(total.value, PAGE_SIZE))

const noResultText = computed(() => {
  if (q.value && (status.value || role.value)) return `Aucun compte ne correspond à « ${q.value} » avec ces filtres.`
  if (q.value) return `Aucun compte ne correspond à « ${q.value} ».`
  return 'Aucun compte ne correspond à ces filtres.'
})

const rows = computed(() => users.value.map(u => {
  const name = personName(u.first_name, u.last_name)
  return {
    ...u,
    name: name || u.email || 'Compte sans nom',
    secondary: [userRolesLabel(u), name ? u.email : 'profil non renseigné'].filter(Boolean).join(' · '),
    kyc: userKycBadge(u),
    statusBadge: USER_STATUS[u.status] ?? { label: u.status, tone: 'neutral' as const }
  }
}))

function formatDay(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}

/* ---------- Création d'un compte ---------- */
const canCreateUser = computed(() => hasPermission('manage:users'))
const canCreateAdmin = computed(() => hasPermission('manage:rbac'))

const CREATE_ROLES = (['tenant', 'landlord', 'agent', 'agency', 'artisan'] as AdminUserRole[]).map(r => ({ value: r, label: ADMIN_ROLE_LABELS[r] }))

/** Un admin ne crée qu'un niveau strictement inférieur au sien ; le niveau 7 est réservé au seeder. */
const levelOptions = computed(() => {
  const mine = auth.value.adminLevel
  if (mine == null) return []
  return levels.value.filter(l => !l.seederOnly && l.level < mine).sort((a, b) => b.level - a.level)
})

const creationOpen = ref(false)
const creating = ref(false)
const createError = ref('')
const submitted = ref(false)
const kind = ref<'user' | 'admin'>('user')
const form = reactive({ firstName: '', lastName: '', phone: '', email: '', role: 'tenant' as AdminUserRole, adminLevel: '' as number | '', password: '' })
const created = ref<{ id: string; text: string } | null>(null)

const KIND_OPTIONS = [{ value: 'user', label: 'Utilisateur' }, { value: 'admin', label: 'Administrateur' }]

function openCreation() {
  Object.assign(form, { firstName: '', lastName: '', phone: '', email: '', role: 'tenant', adminLevel: '', password: '' })
  kind.value = canCreateUser.value ? 'user' : 'admin'
  submitted.value = false
  createError.value = ''
  creationOpen.value = true
}
function closeCreation() {
  if (!creating.value) creationOpen.value = false
}

const formErrors = computed(() => {
  const e: Partial<Record<'firstName' | 'lastName' | 'phone' | 'email' | 'adminLevel' | 'password', string>> = {}
  if (!form.firstName.trim()) e.firstName = 'Indiquez le prénom.'
  if (!form.lastName.trim()) e.lastName = 'Indiquez le nom.'
  const phone = normalizePhone(form.phone)
  if (!phone) e.phone = 'Indiquez le téléphone.'
  else if (!E164_PHONE.test(phone)) e.phone = 'Format international attendu, ex. +22990123456.'
  const email = form.email.trim()
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) e.email = 'Adresse email invalide.'
  if (kind.value === 'admin') {
    if (!email) e.email = 'Obligatoire pour un compte administrateur.'
    if (!form.adminLevel) e.adminLevel = "Choisissez un niveau d'accès."
    if (form.password.trim().length < 8) e.password = '8 caractères au moins.'
  }
  return e
})

function fieldError(key: keyof typeof formErrors.value) {
  return submitted.value ? formErrors.value[key] ?? '' : ''
}

async function submitCreation() {
  submitted.value = true
  if (Object.keys(formErrors.value).length) return
  creating.value = true
  createError.value = ''
  const base = { first_name: form.firstName.trim(), last_name: form.lastName.trim(), phone_number: normalizePhone(form.phone) }
  const email = form.email.trim()
  try {
    const res = kind.value === 'admin'
      ? await createAdminUser({ ...base, email, role: 'admin', admin_level: Number(form.adminLevel), password: form.password })
      : await createUser({ ...base, ...(email ? { email } : {}), role: form.role })
    const level = levelOptions.value.find(l => l.level === Number(form.adminLevel))
    created.value = {
      id: res.id,
      text: kind.value === 'admin'
        ? `Compte administrateur de ${base.first_name} ${base.last_name} créé (niveau ${form.adminLevel}${level ? ` · ${level.name}` : ''}). Aucun message ne lui a été envoyé : transmettez-lui ses identifiants.`
        : `Compte de ${base.first_name} ${base.last_name} créé (${ADMIN_ROLE_LABELS[form.role]}). Aucun message ne lui a été envoyé.`
    }
    creationOpen.value = false
    load()
  } catch (e: any) {
    createError.value = e?.message || "Le compte n'a pas pu être créé."
  } finally {
    creating.value = false
  }
}
</script>

<template>
  <div class="animate-[im-fade_.3s_ease_backwards]">
    <!-- Recherche et filtres -->
    <div class="mb-4.5 flex flex-wrap items-center gap-2.5">
      <div class="flex h-[42px] min-w-0 flex-[1_1_240px] items-center gap-2 rounded-pill border border-[var(--border-default)] bg-white px-4 focus-within:border-green-600 sm:max-w-[360px]">
        <Search class="h-4 w-4 flex-none text-[var(--text-faint)]" :stroke-width="1.9" />
        <input
          v-model="search"
          type="search"
          aria-label="Rechercher un compte"
          placeholder="Nom, email ou téléphone…"
          class="w-full min-w-0 bg-transparent text-[13.5px] outline-none placeholder:text-[var(--text-faint)]"
        >
      </div>
      <select
        :value="status"
        aria-label="Statut du compte"
        class="h-[42px] cursor-pointer rounded-pill border border-[var(--border-default)] bg-white px-3.5 text-[13px] font-semibold text-sand-900 outline-none"
        @change="onSelect('status', $event)"
      >
        <option value="">Tous les statuts</option>
        <option v-for="o in STATUS_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
      </select>
      <select
        :value="role"
        aria-label="Rôle principal"
        class="h-[42px] cursor-pointer rounded-pill border border-[var(--border-default)] bg-white px-3.5 text-[13px] font-semibold text-sand-900 outline-none"
        @change="onSelect('role', $event)"
      >
        <option value="">Tous les rôles</option>
        <option v-for="o in ROLE_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
      </select>
      <button
        v-if="hasFilters"
        type="button"
        class="flex h-[42px] items-center gap-1.5 rounded-pill px-3 text-[13px] font-bold text-[var(--text-muted)] hover:text-danger-fg"
        @click="clearFilters"
      >
        <X class="h-3.5 w-3.5" :stroke-width="1.9" /> Effacer
      </button>
      <AdminButton v-if="canCreateUser || canCreateAdmin" size="sm" class="ml-auto" @click="openCreation">
        <Plus class="h-4 w-4" :stroke-width="1.9" /> Créer un compte
      </AdminButton>
    </div>

    <p v-if="created" class="mb-3.5 rounded-md border border-ok-border bg-ok-bg px-3.5 py-2.5 text-[13px] font-semibold text-green-900">
      {{ created.text }}
      <NuxtLink :to="`/admin/utilisateurs/${created.id}`" class="ml-1 font-bold underline">Ouvrir la fiche</NuxtLink>
    </p>

    <div v-if="state === 'loading'" class="flex flex-col gap-2.5">
      <DataSkeletonCard v-for="i in 6" :key="i" :height="68" :lines="0" />
    </div>

    <FeedbackAlertBanner v-else-if="state === 'error'" tone="danger">
      Impossible de charger les comptes pour le moment.
      <button type="button" class="ml-2 font-bold underline" @click="load">Réessayer</button>
    </FeedbackAlertBanner>

    <template v-else>
      <p v-if="!total && !hasFilters" class="rounded-md border border-dashed border-[var(--border-default)] bg-white px-4 py-10 text-center text-[13.5px] text-[var(--text-muted)]">
        Aucun compte sur la plateforme pour l'instant.
      </p>

      <div v-else-if="!total" class="rounded-md border border-dashed border-[var(--border-default)] bg-white px-4 py-10 text-center text-[13.5px] text-[var(--text-muted)]">
        <p class="m-0">{{ noResultText }}</p>
        <button type="button" class="mt-2 font-bold text-green-700 underline" @click="clearFilters">Effacer la recherche et les filtres</button>
      </div>

      <template v-else>
        <p class="mb-3 mt-0 text-[13px] text-[var(--text-muted)]">
          <span class="font-mono font-bold text-[var(--text-primary)]">{{ total.toLocaleString('fr-FR') }}</span>
          compte{{ total > 1 ? 's' : '' }}<template v-if="q"> pour « {{ q }} »</template>
        </p>

        <div class="flex flex-col gap-2.5 transition-opacity" :class="refreshing ? 'opacity-60' : ''">
          <NuxtLink
            v-for="u in rows"
            :key="u.id"
            :to="`/admin/utilisateurs/${u.id}`"
            class="group flex items-center gap-3 rounded-xl border border-[var(--border-subtle)] bg-white px-4 py-3.5 transition-colors hover:border-[var(--border-default)]"
          >
            <CoreAvatar :name="u.name" :size="42" :avatar-url="u.avatar_url" />
            <div class="min-w-0 flex-1 sm:flex sm:items-center sm:gap-4">
              <div class="min-w-0 flex-1">
                <p class="m-0 truncate text-sm font-bold">{{ u.name }}</p>
                <p class="mb-0 mt-0.5 truncate text-[13px] text-[var(--text-muted)]">{{ u.secondary }}</p>
              </div>
              <div class="mt-2 flex flex-wrap gap-1.5 sm:mt-0 sm:flex-none sm:justify-end">
                <AdminBadge v-if="u.kyc" :tone="u.kyc.tone">{{ u.kyc.label }}</AdminBadge>
                <AdminBadge :tone="u.statusBadge.tone">{{ u.statusBadge.label }}</AdminBadge>
              </div>
            </div>
            <span class="hidden w-[92px] flex-none text-right font-mono text-xs text-[var(--text-faint)] lg:block">{{ formatDay(u.created_at) }}</span>
            <ChevronRight class="hidden h-4 w-4 flex-none text-[var(--text-faint)] transition-transform group-hover:translate-x-0.5 sm:block" :stroke-width="1.9" />
          </NuxtLink>
        </div>

        <AdminPagination :page="page" :page-count="pages" @update:page="goToPage" />
      </template>
    </template>

    <!-- Création -->
    <AdminModal :open="creationOpen" title="Créer un compte" @close="closeCreation">
      <div class="flex flex-col gap-3.5">
        <FormsSegmentedControl v-if="canCreateUser && canCreateAdmin" v-model="kind" size="sm" :options="KIND_OPTIONS" class="self-start" />
        <p class="m-0 text-[12.5px] leading-[1.55] text-[var(--text-muted)]">
          <template v-if="kind === 'admin'">
            Le compte aura accès à l'espace admin, au niveau choisi (inférieur au vôtre). Aucun message n'est envoyé : transmettez l'adresse et le mot de passe initial par un canal sûr.
          </template>
          <template v-else>
            Le compte est créé tout de suite, sans mot de passe. Aucun message n'est envoyé à la personne : prévenez-la vous-même.
          </template>
        </p>

        <div class="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          <AdminInput v-model="form.firstName" label="Prénom" placeholder="Aline" :error="fieldError('firstName')" />
          <AdminInput v-model="form.lastName" label="Nom" placeholder="Houngbo" :error="fieldError('lastName')" />
        </div>
        <AdminInput v-model="form.phone" type="tel" label="Téléphone" placeholder="+22990123456" :error="fieldError('phone')" />
        <AdminInput v-model="form.email" type="email" :label="kind === 'admin' ? 'Email' : 'Email (facultatif)'" placeholder="aline@exemple.bj" :error="fieldError('email')" />

        <label v-if="kind === 'user'" class="block">
          <span class="mb-[7px] block text-[12.5px] font-bold">Rôle</span>
          <select v-model="form.role" class="h-[46px] w-full cursor-pointer rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3.5 text-[14.5px] outline-none focus:border-green-600">
            <option v-for="o in CREATE_ROLES" :key="o.value" :value="o.value">{{ o.label }}</option>
          </select>
        </label>

        <template v-else>
          <label class="block">
            <span class="mb-[7px] block text-[12.5px] font-bold">Niveau d'accès</span>
            <select
              v-model="form.adminLevel"
              :disabled="!levelOptions.length"
              class="h-[46px] w-full cursor-pointer rounded-md border bg-[var(--surface-input)] px-3.5 text-[14.5px] outline-none focus:border-green-600 disabled:opacity-50"
              :class="fieldError('adminLevel') ? 'border-danger-border' : 'border-[var(--border-default)]'"
            >
              <option value="" disabled>Choisir un niveau</option>
              <option v-for="l in levelOptions" :key="l.level" :value="l.level">Niveau {{ l.level }} · {{ l.name }}</option>
            </select>
            <span v-if="!levelOptions.length" class="mt-[7px] block text-[12.5px] text-[var(--text-muted)]">Votre niveau ne permet pas de créer un administrateur.</span>
            <span v-else-if="fieldError('adminLevel')" class="mt-[7px] block text-[12.5px] text-danger-fg">{{ fieldError('adminLevel') }}</span>
          </label>
          <AdminInput v-model="form.password" type="password" label="Mot de passe initial" placeholder="8 caractères au moins" :error="fieldError('password')" />
        </template>

        <p v-if="createError" class="m-0 text-[13px] font-semibold text-danger-fg">{{ createError }}</p>
      </div>
      <template #footer>
        <div class="flex flex-wrap justify-end gap-2">
          <AdminButton variant="secondary" :disabled="creating" @click="closeCreation">Annuler</AdminButton>
          <AdminButton :loading="creating" :disabled="kind === 'admin' && !levelOptions.length" @click="submitCreation">Créer le compte</AdminButton>
        </div>
      </template>
    </AdminModal>
  </div>
</template>
