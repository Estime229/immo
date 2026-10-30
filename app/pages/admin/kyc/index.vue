<script setup lang="ts">
/**
 * File des vérifications d'identité. Statut, recherche et page vivent dans l'URL.
 * « En attente » ne montre que les dossiers réellement déposés (`fetchSubmittedKycQueue`),
 * le plus ancien dépôt d'abord, paginés ici ; les autres statuts sont paginés par l'API.
 */
import { Search } from '@lucide/vue'
import { fetchSubmittedKycQueue, KYC_QUEUE_MAX_PAGES, KYC_QUEUE_QUERY, userRolesLabel, type KycStatus, type SubmittedKycQueue, type UserListItem, type UsersSortQuery } from '~/composables/useUsers'

definePageMeta({ layout: 'admin', middleware: 'require-admin', requiredPermission: 'manage:kyc' })

const { fetchUsers } = useUsers()
const route = useRoute()
const router = useRouter()

/** Résultat de la dernière décision, quand la fiche revient ici parce que la file est vide. */
const carriedFlash = useState('admin-kyc-flash', () => '')
const flash = ref(carriedFlash.value)
carriedFlash.value = ''

const PAGE_SIZE = 10
const STATUSES: Array<{ value: KycStatus; label: string }> = [
  { value: 'pending', label: 'En attente' },
  { value: 'verified', label: 'Vérifiés' },
  { value: 'rejected', label: 'Refusés' }
]
const STATUS_BADGE: Record<KycStatus, { label: string; tone: 'warning' | 'success' | 'danger' }> = {
  pending: { label: 'À vérifier', tone: 'warning' },
  verified: { label: 'Vérifié', tone: 'success' },
  rejected: { label: 'Refusé', tone: 'danger' }
}

const status = computed<KycStatus>(() => STATUSES.some(s => s.value === route.query.status) ? route.query.status as KycStatus : 'pending')
const q = computed(() => typeof route.query.q === 'string' ? route.query.q.trim() : '')
const page = computed(() => Math.max(1, Number(route.query.page) || 1))

/** Remplace les paramètres de l'URL ; une valeur vide les retire. */
function setQuery(patch: Record<string, string | number | undefined>) {
  const next: Record<string, string> = {}
  for (const [k, v] of Object.entries({ ...route.query, ...patch })) {
    if (typeof v === 'string' && v) next[k] = v
    else if (typeof v === 'number') next[k] = String(v)
  }
  router.replace({ query: next })
}

/** Vérifiés / refusés : une page de l'API. */
const users = ref<UserListItem[]>([])
const total = ref(0)
/** En attente : toute la file des dossiers déposés, découpée en pages ici. */
const queue = ref<SubmittedKycQueue | null>(null)
/** Statut des données affichées : évite de montrer les lignes d'un autre onglet pendant le chargement. */
const loadedFor = ref<KycStatus | null>(null)
const state = ref<'loading' | 'ready' | 'error'>('loading')
let requestId = 0

async function load() {
  const current = ++requestId
  const target = status.value
  state.value = 'loading'
  try {
    if (target === 'pending') {
      const res = await fetchSubmittedKycQueue(fetchUsers, { search: q.value || undefined })
      if (current !== requestId) return
      queue.value = res
    } else {
      const query: UsersSortQuery = { kycStatus: target, search: q.value || undefined, page: page.value, limit: PAGE_SIZE, sortBy: 'created_at', sortOrder: 'DESC' }
      const res = await fetchUsers(query)
      if (current !== requestId) return
      users.value = res.data
      total.value = res.total
    }
    loadedFor.value = target
    state.value = 'ready'
  } catch {
    if (current === requestId) state.value = 'error'
  }
}
onMounted(load)
// En attente, changer de page ne recharge pas : la file est déjà entière.
watch(() => [status.value, q.value, status.value === 'pending' ? 0 : page.value], load)

/* ---------- Recherche (saisie différée, puis dans l'URL) ---------- */
const search = ref(q.value)
let debounce: ReturnType<typeof setTimeout> | undefined
watch(search, value => {
  clearTimeout(debounce)
  debounce = setTimeout(() => {
    if (value.trim() !== q.value) setQuery({ q: value.trim(), page: undefined })
  }, 350)
})
watch(q, value => { if (value !== search.value.trim()) search.value = value })
onBeforeUnmount(() => clearTimeout(debounce))

function setStatus(value: string) {
  setQuery({ status: value === 'pending' ? undefined : value, page: undefined })
}

const count = computed(() => status.value === 'pending' ? queue.value?.dossiers.length ?? 0 : total.value)
const pages = computed(() => pageCount(count.value, PAGE_SIZE))
const currentPage = computed(() => Math.min(page.value, pages.value))
const rows = computed(() => {
  if (loadedFor.value !== status.value) return []
  return status.value === 'pending' ? paginate(queue.value?.dossiers ?? [], currentPage.value, PAGE_SIZE) : users.value
})
const examinedMax = KYC_QUEUE_MAX_PAGES * (KYC_QUEUE_QUERY.limit ?? 100)

/** La fiche reprend cette file telle quelle (« Dossier n sur N »), sans la recharger. */
const carriedQueue = useState<string[] | null>('admin-kyc-queue', () => null)

/** File entière (hors recherche) transmise à la fiche ouverte. */
function carryQueue() {
  if (status.value === 'pending' && !q.value && queue.value) carriedQueue.value = queue.value.dossiers.map(u => u.id)
}

/** Ouvre le plus ancien dossier : la fiche enchaîne ensuite sur le suivant après chaque décision. */
function startQueue() {
  const first = queue.value?.dossiers[0]
  if (!first) return
  carryQueue()
  navigateTo(`/admin/kyc/${first.id}`)
}

/* ---------- Lignes ---------- */
function displayName(u: UserListItem) {
  return personName(u.first_name, u.last_name) || u.email
}
function formatDay(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}
/** Date utile selon l'onglet : dépôt du dossier, ou décision. */
function dossierLine(u: UserListItem): string {
  const p = u.profile
  if (status.value === 'verified') return p?.kyc_reviewed_at ? `Vérifié le ${formatDay(p.kyc_reviewed_at)}` : 'Vérifié'
  if (status.value === 'rejected') return p?.kyc_reviewed_at ? `Refusé le ${formatDay(p.kyc_reviewed_at)}` : 'Refusé'
  return p?.kyc_submitted_at ? `Dossier soumis le ${formatDay(p.kyc_submitted_at)}` : 'Pièce déposée, date de soumission inconnue'
}
function kybToReview(u: UserListItem) {
  return u.landlord_kyb_status === 'pending' || u.agency_kyb_status === 'pending'
}

const notSubmittedText = computed(() => {
  const n = queue.value?.notSubmitted ?? 0
  if (!n) return ''
  if (q.value) return n > 1 ? `${n} autres comptes correspondent à la recherche mais n'ont déposé aucune pièce.` : '1 autre compte correspond à la recherche mais n\'a déposé aucune pièce.'
  return n > 1 ? `${n} comptes n'ont encore déposé aucune pièce : ils n'apparaissent pas dans la file.` : '1 compte n\'a encore déposé aucune pièce : il n\'apparaît pas dans la file.'
})

const emptyText = computed(() => {
  if (q.value) return status.value === 'pending' ? `Aucun dossier déposé ne correspond à « ${q.value} ».` : `Aucun dossier ne correspond à « ${q.value} ».`
  if (status.value === 'pending') return 'Aucun dossier en attente : la file est à jour.'
  if (status.value === 'verified') return 'Aucun dossier vérifié pour l\'instant.'
  return 'Aucun dossier refusé.'
})
</script>

<template>
  <div class="animate-[im-fade_.3s_ease_backwards]">
    <p v-if="flash" class="mb-4 rounded-md border border-ok-border bg-ok-bg px-3.5 py-2.5 text-[13px] font-semibold text-green-900">{{ flash }}</p>

    <div class="mb-4.5 flex flex-wrap items-center gap-2.5">
      <FormsSegmentedControl :options="STATUSES" :model-value="status" size="sm" @update:model-value="setStatus" />
      <div class="flex h-[42px] min-w-[220px] flex-1 items-center gap-2 rounded-pill border border-[var(--border-default)] bg-white px-4 focus-within:border-green-600 md:max-w-[340px]">
        <Search class="h-4 w-4 shrink-0 text-[var(--text-faint)]" :stroke-width="1.9" />
        <input v-model="search" type="search" placeholder="Nom, e-mail, téléphone…" aria-label="Rechercher un dossier" class="w-full min-w-0 bg-transparent text-[13.5px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-faint)]">
      </div>
    </div>

    <div v-if="state === 'loading' && !rows.length" class="flex flex-col gap-2.5">
      <DataSkeletonCard v-for="i in 4" :key="i" :height="76" :lines="0" />
    </div>

    <FeedbackAlertBanner v-else-if="state === 'error'" tone="danger">
      Impossible de charger les dossiers KYC pour le moment.
      <button type="button" class="ml-2 font-bold underline" @click="load">Réessayer</button>
    </FeedbackAlertBanner>

    <p v-else-if="state === 'ready' && !rows.length" class="rounded-md border border-dashed border-[var(--border-default)] bg-white px-4 py-10 text-center text-[13.5px] text-[var(--text-muted)]">
      {{ emptyText }}
    </p>

    <template v-else>
      <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p class="m-0 text-[13px] text-[var(--text-muted)]">
          <span class="font-mono font-bold text-[var(--text-primary)]">{{ count }}</span> dossier{{ count > 1 ? 's' : '' }}
          <template v-if="status === 'pending'">en attente, le plus ancien dépôt d'abord</template>
          <template v-else-if="status === 'verified'">vérifié{{ count > 1 ? 's' : '' }}</template>
          <template v-else>refusé{{ count > 1 ? 's' : '' }}</template>
        </p>
        <AdminButton v-if="status === 'pending' && !q && currentPage === 1" size="sm" @click="startQueue">Traiter la file</AdminButton>
      </div>

      <div class="flex flex-col gap-2.5" :class="state === 'loading' ? 'opacity-60' : ''">
        <NuxtLink
          v-for="u in rows"
          :key="u.id"
          :to="`/admin/kyc/${u.id}`"
          @click="carryQueue"
          class="flex items-center gap-3.5 rounded-2xl border border-[var(--border-subtle)] bg-white px-5 py-4 transition-colors hover:border-[var(--border-default)]"
        >
          <CoreAvatar :name="displayName(u)" :size="42" :avatar-url="u.avatar_url" />
          <div class="min-w-0 flex-1">
            <p class="m-0 truncate text-sm font-bold">{{ displayName(u) }}</p>
            <p class="mb-0 mt-0.5 truncate text-[13px] text-[var(--text-muted)]">{{ userRolesLabel(u) }}<template v-if="personName(u.first_name, u.last_name)"> · {{ u.email }}</template><template v-else> · profil non renseigné</template></p>
            <p class="mb-0 mt-1 truncate text-xs text-[var(--text-secondary)]">{{ dossierLine(u) }}</p>
          </div>
          <div class="flex flex-none flex-col items-end gap-1.5">
            <AdminBadge :tone="STATUS_BADGE[status].tone">{{ STATUS_BADGE[status].label }}</AdminBadge>
            <span v-if="kybToReview(u)" class="text-[11.5px] font-bold text-warn-fg">Entreprise à vérifier</span>
          </div>
        </NuxtLink>
      </div>

      <AdminPagination :page="currentPage" :page-count="pages" @update:page="p => setQuery({ page: p > 1 ? p : undefined })" />
    </template>

    <!-- Comptes « en attente » côté API mais sans dossier : comptés, pas listés. -->
    <p v-if="status === 'pending' && loadedFor === 'pending' && queue && state !== 'error' && (notSubmittedText || queue.truncated)" class="mb-0 mt-3.5 text-xs leading-[1.5] text-[var(--text-faint)]">
      {{ notSubmittedText }}
      <template v-if="queue.truncated">Seuls les {{ examinedMax.toLocaleString('fr-FR') }} comptes en attente les plus anciens ont été examinés : des dossiers plus récents peuvent manquer.</template>
    </p>
  </div>
</template>
