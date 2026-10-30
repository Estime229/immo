<script setup lang="ts">
/**
 * Aperçu admin : d'abord ce qui attend une action (« À traiter »), puis l'état de la
 * plateforme. Toutes les valeurs viennent de l'API — l'ancien tableau de bord affichait
 * deux graphiques aux chiffres écrits en dur, retirés.
 */
import { ArrowRight, CircleCheck } from '@lucide/vue'
import { ADMIN_ROLE_LABELS, type AdminStats, type UserListItem } from '~/composables/useUsers'
import type { AdminCounts } from '~/composables/useAdminCounts'

definePageMeta({ layout: 'admin', middleware: 'require-admin' })

const { fetchAdminStats, fetchUsers } = useUsers()
const { counts, kycPreview: kycQueue, refresh: refreshCounts } = useAdminCounts()
const { hasPermission } = useAdminAuth()

const stats = ref<AdminStats | null>(null)
const statsState = ref<'loading' | 'ready' | 'error'>('loading')
const latestUsers = ref<UserListItem[]>([])

async function load() {
  statsState.value = 'loading'
  const [s] = await Promise.allSettled([
    fetchAdminStats().then(res => { stats.value = res }),
    fetchUsers({ limit: 5, page: 1 }).then(res => { latestUsers.value = res.data }),
    refreshCounts()
  ])
  statsState.value = s.status === 'fulfilled' ? 'ready' : 'error'
}
onMounted(load)

/* ---------- À traiter ---------- */
interface TodoItem {
  key: keyof AdminCounts
  label: (n: number) => string
  detail?: () => string
  to: string
  action: string
  tone: 'danger' | 'warn' | 'info'
}

const TODO: TodoItem[] = [
  { key: 'kyc', label: n => `${n} dossier${n > 1 ? 's' : ''} KYC à vérifier`, detail: () => 'Les locataires et propriétaires attendent leur badge vérifié.', to: '/admin/kyc', action: 'Examiner', tone: 'warn' },
  { key: 'withdrawals', label: n => `${n} retrait${n > 1 ? 's' : ''} à valider`, detail: () => counts.value.withdrawalsAmount ? `${formatPrix(counts.value.withdrawalsAmount)} au total` : '', to: '/admin/wallet', action: 'Valider', tone: 'warn' },
  { key: 'disputes', label: n => `${n} litige${n > 1 ? 's' : ''} ouvert${n > 1 ? 's' : ''}`, detail: () => counts.value.disputesUrgent ? `dont ${counts.value.disputesUrgent} urgent${counts.value.disputesUrgent > 1 ? 's' : ''}` : '', to: '/admin/litiges', action: 'Arbitrer', tone: 'danger' },
  { key: 'maintenance', label: n => `${n} demande${n > 1 ? 's' : ''} de maintenance en cours`, to: '/admin/maintenance', action: 'Suivre', tone: 'info' },
  { key: 'deletions', label: n => `${n} demande${n > 1 ? 's' : ''} de suppression de compte`, detail: () => 'À instruire sous 30 jours.', to: '/admin/compliance', action: 'Instruire', tone: 'danger' },
  { key: 'contact', label: n => `${n} message${n > 1 ? 's' : ''} de contact non traité${n > 1 ? 's' : ''}`, to: '/admin/contact', action: 'Répondre', tone: 'info' }
]

const TONE_DOT = { danger: 'bg-danger-fg', warn: 'bg-warn-fg', info: 'bg-info-fg' } as const
const TONE_BG = { danger: 'bg-danger-bg', warn: 'bg-warn-bg', info: 'bg-info-bg' } as const
const TONE_FG = { danger: 'text-danger-fg-deep', warn: 'text-warn-fg-deep', info: 'text-info-fg-deep' } as const

const todos = computed(() => TODO
  .map(t => ({ ...t, n: counts.value[t.key] }))
  .filter((t): t is TodoItem & { n: number } => typeof t.n === 'number' && t.n > 0))
const todoTotal = computed(() => todos.value.reduce((sum, t) => sum + t.n, 0))

/* ---------- Chiffres ---------- */
const kpis = computed(() => {
  const s = stats.value
  if (!s) return []
  return [
    { label: 'Comptes', value: s.users.total.toLocaleString('fr-FR'), to: '/admin/utilisateurs' },
    { label: 'Nouveaux sur 30 jours', value: `+${s.users.newLast30Days.toLocaleString('fr-FR')}`, to: '/admin/utilisateurs' },
    { label: 'Biens publiés', value: s.platform.totalProperties.toLocaleString('fr-FR'), to: '/admin/biens' },
    { label: 'Logements occupés', value: `${s.platform.occupiedUnits} / ${s.platform.totalUnits}`, to: '/admin/biens' },
    { label: 'Revenu du mois', value: formatPrix(s.platform.revenueThisMonth), to: '/admin/wallet' },
    { label: 'Revenu cumulé', value: formatPrix(s.platform.totalRevenue), to: '/admin/wallet' }
  ]
})

/** Barre empilée : part de chaque statut, en % du total (0 si le total est nul). */
function shares(parts: Array<{ label: string; n: number; color: string }>) {
  const total = parts.reduce((sum, p) => sum + p.n, 0)
  return { total, parts: parts.map(p => ({ ...p, pct: total ? (p.n / total) * 100 : 0 })) }
}

/**
 * L'API compte « en attente » tous les comptes qui n'ont pas de KYC validé, y compris ceux qui
 * n'ont rien déposé : on distingue les dossiers à vérifier (compteur du menu) des comptes sans pièce.
 */
const kycShares = computed(() => {
  const s = stats.value
  if (!s) return null
  const toReview = counts.value.kyc
  const pending = toReview == null
    ? [{ label: 'En attente', n: s.kyc.pending, color: 'bg-clay-500' }]
    : [
        { label: 'À vérifier', n: toReview, color: 'bg-clay-500' },
        { label: 'Sans pièce déposée', n: Math.max(s.kyc.pending - toReview, 0), color: 'bg-sand-400' }
      ]
  return shares([
    { label: 'Vérifiés', n: s.kyc.verified, color: 'bg-green-600' },
    ...pending,
    { label: 'Refusés', n: s.kyc.rejected, color: 'bg-danger-fg' }
  ])
})

const accountShares = computed(() => stats.value
  ? shares([
      { label: 'Actifs', n: stats.value.users.active, color: 'bg-green-600' },
      { label: 'Restreints', n: stats.value.users.restricted, color: 'bg-warn-fg' },
      { label: 'Bannis', n: stats.value.users.banned, color: 'bg-danger-fg' }
    ])
  : null)

const shareBlocks = computed(() => [
  { title: "Vérifications d'identité", data: kycShares.value, to: '/admin/kyc' },
  { title: 'Statut des comptes', data: accountShares.value, to: '/admin/utilisateurs' }
])

const occupancy = computed(() => stats.value?.platform.occupancyRate ?? 0)

function displayName(u: UserListItem) {
  return personName(u.first_name, u.last_name) || u.email
}
function formatDay(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}
</script>

<template>
  <div class="animate-[im-fade_.3s_ease_backwards]">
    <div v-if="statsState === 'loading' && !stats" class="flex flex-col gap-4.5">
      <DataSkeletonCard :height="110" :lines="1" />
      <DataSkeletonCard :height="90" :lines="1" />
      <DataSkeletonCard :height="200" :lines="1" />
    </div>

    <FeedbackAlertBanner v-else-if="statsState === 'error' && !stats" tone="danger">
      Impossible de charger l'aperçu pour le moment.
      <button type="button" class="ml-2 font-bold underline" @click="load">Réessayer</button>
    </FeedbackAlertBanner>

    <template v-else>
      <!-- À traiter -->
      <section class="mb-5.5 rounded-2xl border border-[var(--border-subtle)] bg-white px-5 py-4.5">
        <div class="mb-3.5 flex flex-wrap items-center gap-3">
          <h2 class="m-0 text-[15px] font-bold">À traiter</h2>
          <span v-if="todoTotal" class="rounded-pill bg-danger-fg px-2.5 py-0.5 text-xs font-black text-white">{{ todoTotal > 99 ? '99+' : todoTotal }}</span>
        </div>

        <div v-if="todos.length" class="grid grid-cols-1 gap-2.5 md:grid-cols-2">
          <NuxtLink
            v-for="t in todos"
            :key="t.key"
            :to="t.to"
            class="group flex items-center gap-3 rounded-md p-3.5 transition-transform hover:-translate-y-px"
            :class="TONE_BG[t.tone]"
          >
            <span class="h-[9px] w-[9px] flex-none rounded-pill" :class="TONE_DOT[t.tone]" />
            <div class="min-w-0 flex-1" :class="TONE_FG[t.tone]">
              <p class="m-0 text-[13.5px] font-bold leading-[1.35]">{{ t.label(t.n) }}</p>
              <p v-if="t.detail?.()" class="mb-0 mt-0.5 truncate text-[12px] opacity-80">{{ t.detail() }}</p>
            </div>
            <span class="flex flex-none items-center gap-1 whitespace-nowrap rounded-pill bg-white/70 px-3.5 py-2 text-xs font-bold" :class="TONE_FG[t.tone]">
              {{ t.action }} <ArrowRight class="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </span>
          </NuxtLink>
        </div>

        <div v-else class="flex items-center gap-3 rounded-md bg-ok-bg p-3.5 text-green-900">
          <CircleCheck class="h-5 w-5 flex-none text-ok-fg" />
          <p class="m-0 text-[13.5px] font-semibold">Rien n'attend de décision : vérifications, retraits et litiges sont à jour.</p>
        </div>
      </section>

      <!-- Chiffres clés -->
      <div v-if="kpis.length" class="mb-4.5 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <NuxtLink v-for="k in kpis" :key="k.label" :to="k.to" class="rounded-lg border border-[var(--border-subtle)] bg-white p-4 transition-colors hover:border-[var(--border-default)]">
          <p class="m-0 truncate font-mono text-xl font-bold tracking-[-.02em] text-green-900">{{ k.value }}</p>
          <p class="mb-0 mt-1.5 text-[11.5px] leading-[1.3] text-[var(--text-muted)]">{{ k.label }}</p>
        </NuxtLink>
      </div>

      <!-- Répartitions -->
      <div v-if="stats" class="grid grid-cols-1 gap-4.5 lg:grid-cols-3">
        <div v-for="block in shareBlocks" :key="block.title" class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
          <div class="mb-4 flex items-baseline justify-between gap-3">
            <p class="m-0 text-[15px] font-bold">{{ block.title }}</p>
            <NuxtLink :to="block.to" class="text-[12.5px] font-bold text-green-700">Voir</NuxtLink>
          </div>
          <template v-if="block.data && block.data.total">
            <div class="flex h-2.5 overflow-hidden rounded-pill bg-sand-200">
              <div v-for="p in block.data.parts" :key="p.label" class="h-full" :class="p.color" :style="{ width: `${p.pct}%` }" />
            </div>
            <ul class="mb-0 mt-4 flex list-none flex-col gap-2.5 p-0">
              <li v-for="p in block.data.parts" :key="p.label" class="flex items-center gap-2.5 text-[13px]">
                <span class="h-2.5 w-2.5 flex-none rounded-pill" :class="p.color" />
                <span class="flex-1 text-[var(--text-secondary)]">{{ p.label }}</span>
                <span class="font-mono font-bold">{{ p.n }}</span>
              </li>
            </ul>
          </template>
          <p v-else class="m-0 text-[13px] text-[var(--text-muted)]">Aucune donnée pour l'instant.</p>
        </div>

        <div class="flex flex-col rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
          <p class="mb-4 mt-0 text-[15px] font-bold">Occupation des logements</p>
          <div class="flex flex-1 items-center justify-center">
            <div class="relative h-[136px] w-[136px] rounded-pill" :style="{ background: `conic-gradient(var(--color-green-600) 0deg ${occupancy * 3.6}deg, var(--color-sand-300) ${occupancy * 3.6}deg 360deg)` }">
              <div class="absolute inset-[18px] flex flex-col items-center justify-center rounded-pill bg-white">
                <span class="font-mono text-2xl font-bold text-green-900">{{ occupancy }}%</span>
                <span class="text-[11.5px] text-[var(--text-faint)]">{{ stats.platform.occupiedUnits }} / {{ stats.platform.totalUnits }} logements</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Files -->
      <div class="mt-4.5 grid grid-cols-1 gap-4.5 lg:grid-cols-2">
        <section v-if="hasPermission('manage:kyc')" class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
          <div class="mb-3 flex items-baseline justify-between gap-3">
            <h2 class="m-0 text-[15px] font-bold">Prochains dossiers KYC</h2>
            <NuxtLink to="/admin/kyc" class="text-[12.5px] font-bold text-green-700">Toute la file</NuxtLink>
          </div>
          <p v-if="!kycQueue.length" class="m-0 py-3 text-[13px] text-[var(--text-muted)]">Aucun dossier en attente.</p>
          <NuxtLink v-for="u in kycQueue" :key="u.id" :to="`/admin/kyc/${u.id}`" class="flex items-center gap-3 border-b border-sand-200 py-3 last:border-b-0">
            <CoreAvatar :name="displayName(u)" :size="36" :avatar-url="u.avatar_url" />
            <div class="min-w-0 flex-1">
              <p class="m-0 truncate text-sm font-bold">{{ displayName(u) }}</p>
              <p class="mb-0 mt-0.5 truncate text-xs text-[var(--text-faint)]">{{ ADMIN_ROLE_LABELS[u.role] }} · {{ personName(u.first_name, u.last_name) ? u.email : 'profil non renseigné' }}</p>
            </div>
            <span class="flex-none rounded-pill border border-[var(--border-default)] px-3 py-1.5 text-xs font-bold text-sand-900">Examiner</span>
          </NuxtLink>
        </section>

        <section class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
          <div class="mb-3 flex items-baseline justify-between gap-3">
            <h2 class="m-0 text-[15px] font-bold">Derniers comptes créés</h2>
            <NuxtLink to="/admin/utilisateurs" class="text-[12.5px] font-bold text-green-700">Tous les comptes</NuxtLink>
          </div>
          <p v-if="!latestUsers.length" class="m-0 py-3 text-[13px] text-[var(--text-muted)]">Aucun compte pour l'instant.</p>
          <NuxtLink v-for="u in latestUsers" :key="u.id" :to="`/admin/utilisateurs/${u.id}`" class="flex items-center gap-3 border-b border-sand-200 py-3 last:border-b-0">
            <CoreAvatar :name="displayName(u)" :size="36" :avatar-url="u.avatar_url" />
            <div class="min-w-0 flex-1">
              <p class="m-0 truncate text-sm font-bold">{{ displayName(u) }}</p>
              <p class="mb-0 mt-0.5 truncate text-xs text-[var(--text-faint)]">{{ ADMIN_ROLE_LABELS[u.role] }} · {{ personName(u.first_name, u.last_name) ? u.email : 'profil non renseigné' }}</p>
            </div>
            <span class="flex-none font-mono text-xs text-[var(--text-faint)]">{{ formatDay(u.created_at) }}</span>
          </NuxtLink>
        </section>
      </div>
    </template>
  </div>
</template>
