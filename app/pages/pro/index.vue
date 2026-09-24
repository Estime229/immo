<script setup lang="ts">
import type { LandlordStats } from '~/types/landlord'

definePageMeta({ layout: 'pro' })

const statsApi = useLandlordStatsApi()
const stats = ref<LandlordStats | null>(null)
const state = ref<'loading' | 'success' | 'error'>('loading')

async function load() {
  state.value = 'loading'
  try {
    stats.value = await statsApi.fetchStats()
    state.value = 'success'
  } catch {
    state.value = 'error'
  }
}
onMounted(load)

/* ---- Alertes réelles, groupées par sévérité ---- */
const SEVERITY_ICON: Record<string, string> = { danger: '⚠', warn: '◷', info: 'ℹ' }
const SEVERITY_BG: Record<string, string> = { danger: 'bg-danger-bg', warn: 'bg-warn-bg', info: 'bg-info-bg' }
const SEVERITY_FG: Record<string, string> = { danger: 'text-danger-fg-deep', warn: 'text-warn-fg-deep', info: 'text-info-fg-deep' }
const SEVERITY_BTN: Record<string, string> = { danger: 'bg-danger-fg', warn: 'bg-clay-500', info: 'bg-info-fg' }
/** Pas d'action dédiée par type d'alerte dans ce lot (relancer, voir le motif…) — chaque alerte pointe vers l'écran le plus pertinent, câblé dans les lots IP suivants. */
const SEVERITY_LINK: Record<string, string> = { danger: '/pro/baux', warn: '/pro/baux', info: '/pro/demandes' }

const alerts = computed(() => stats.value?.alerts ?? [])
const severityCounts = computed(() => {
  const out: Record<string, number> = {}
  for (const a of alerts.value) out[a.severity] = (out[a.severity] ?? 0) + 1
  return out
})

/* ---- KPIs réels ---- */
const kpis = computed(() => {
  if (!stats.value) return []
  const s = stats.value
  const list: { value: string; label: string }[] = [
    { value: String(s.totalProperties), label: s.totalProperties > 1 ? 'biens' : 'bien' },
    { value: String(s.totalUnits), label: s.totalUnits > 1 ? 'unités' : 'unité' },
    { value: `${s.occupancyRate}%`, label: 'occupation' },
    { value: String(s.activeLeases), label: s.activeLeases > 1 ? 'baux actifs' : 'bail actif' },
    { value: `${s.collectionRate}%`, label: 'recouvrement' }
  ]
  if (s.averageRating !== undefined) list.push({ value: s.averageRating > 0 ? s.averageRating.toFixed(1).replace('.', ',') : '—', label: 'note moyenne' })
  return list
})

/* ---- Revenus réels — un seul jeu de données (pas de comparaison mois par mois, l'API ne fournit qu'un pourcentage agrégé) ---- */
const revenue = computed(() => {
  const months = stats.value?.monthlyRevenue ?? []
  const max = Math.max(1, ...months.map(m => m.revenue))
  return months.map((m, i) => ({
    h: `${Math.round((m.revenue / max) * 100)}%`,
    month: new Date(`${m.month}-01`).toLocaleDateString('fr-FR', { month: 'short' }),
    current: i === months.length - 1,
    overdue: m.overdue
  }))
})
const revenueThisMonthFmt = computed(() => stats.value ? formatFcfa(stats.value.revenueThisMonth) : '')
const comparisonLabel = computed(() => {
  const c = stats.value?.comparison
  if (!c) return null
  const pct = c.revenue_change_percent
  return `${pct >= 0 ? '+' : ''}${pct}% vs le mois précédent`
})

/* ---- Occupation réelle ---- */
const occupancyDeg = computed(() => (stats.value ? Math.round((stats.value.occupancyRate / 100) * 360) : 0))

/* ---- Top biens réels — topProperties si /stats/advanced a réussi, sinon les biens triés côté client ---- */
const topBiens = computed(() => {
  if (!stats.value) return []
  const source = stats.value.topProperties ?? [...stats.value.properties].sort((a, b) => b.revenueThisMonth - a.revenueThisMonth)
  const maxRev = Math.max(1, ...source.map(p => p.revenueThisMonth))
  return source.slice(0, 5).map(p => ({
    name: p.title,
    units: `${p.totalUnits} unité${p.totalUnits > 1 ? 's' : ''} · ${p.city}`,
    rev: formatFcfa(p.revenueThisMonth),
    pct: `${Math.round((p.revenueThisMonth / maxRev) * 100)}%`
  }))
})
</script>

<template>
  <div class="animate-[im-fade_.3s_ease_both]">
    <div v-if="state === 'loading'" class="flex flex-col gap-4.5">
      <DataSkeletonCard :height="100" :lines="1" />
      <DataSkeletonCard :height="200" :lines="1" />
    </div>

    <FeedbackAlertBanner v-else-if="state === 'error' || !stats" tone="danger">
      Impossible de charger votre tableau de bord pour le moment.
      <button type="button" class="ml-2 font-bold underline" @click="load">Réessayer</button>
    </FeedbackAlertBanner>

    <template v-else>
      <div v-if="alerts.length" class="mb-5.5 rounded-2xl border border-[var(--border-subtle)] bg-white px-5 py-4.5">
        <div class="mb-3.5 flex flex-wrap items-center gap-3">
          <p class="m-0 text-[15px] font-bold">À traiter</p>
          <span class="rounded-pill bg-danger-fg px-2.5 py-0.5 text-xs font-black text-white">{{ alerts.length }}</span>
          <div class="flex-1" />
          <div class="flex items-center gap-2.5">
            <span v-for="(count, sev) in severityCounts" :key="sev" class="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-[var(--text-muted)]">
              <span class="h-2 w-2 rounded-pill" :class="SEVERITY_BTN[sev] ?? 'bg-sand-400'" />{{ count }} {{ sev === 'danger' ? 'urgent(s)' : sev === 'warn' ? 'à surveiller' : 'info' }}
            </span>
          </div>
        </div>
        <div class="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <div v-for="(a, i) in alerts" :key="i" class="flex items-center gap-3 rounded-md p-3.5" :class="SEVERITY_BG[a.severity] ?? 'bg-sand-100'">
            <div class="grid h-[30px] w-[30px] flex-none place-items-center rounded-sm bg-white/60 text-sm">{{ SEVERITY_ICON[a.severity] ?? '•' }}</div>
            <p class="m-0 line-clamp-2 flex-1 text-[12.5px] font-semibold leading-[1.35]" :class="SEVERITY_FG[a.severity] ?? 'text-[var(--text-primary)]'">{{ a.message }}</p>
            <NuxtLink :to="SEVERITY_LINK[a.severity] ?? '/pro'" class="flex-none whitespace-nowrap rounded-pill px-3.5 py-2 text-xs font-bold text-white" :class="SEVERITY_BTN[a.severity] ?? 'bg-sand-600'">Voir</NuxtLink>
          </div>
        </div>
      </div>

      <div class="mb-4.5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <div v-for="k in kpis" :key="k.label" class="rounded-lg border border-[var(--border-subtle)] bg-white p-4">
          <p class="m-0 font-mono text-xl font-bold tracking-[-.02em] text-green-900">{{ k.value }}</p>
          <p class="mb-0 mt-1.5 text-[11.5px] leading-[1.3] text-[var(--text-muted)]">{{ k.label }}</p>
        </div>
      </div>

      <div class="grid grid-cols-1 gap-4.5 lg:grid-cols-[1.5fr_1fr]">
        <div class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
          <div class="mb-1.5 flex items-baseline justify-between">
            <p class="m-0 text-[15px] font-bold">Revenus</p>
            <span v-if="comparisonLabel" class="text-[12.5px] font-bold" :class="(stats.comparison?.revenue_change_percent ?? 0) >= 0 ? 'text-ok-fg' : 'text-danger-fg'">{{ comparisonLabel }}</span>
          </div>
          <p class="mb-4 mt-0 text-[12.5px] text-[var(--text-faint)]">Ce mois <strong class="font-mono text-[var(--text-primary)]">{{ revenueThisMonthFmt }}</strong></p>
          <div v-if="revenue.length" class="flex h-[150px] items-end gap-1.5">
            <div v-for="b in revenue" :key="b.month" class="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
              <div class="relative flex h-full w-full items-end justify-center">
                <div class="w-[70%] rounded-t" :class="b.current ? 'bg-green-600' : 'bg-green-300'" :style="{ height: b.h }" />
              </div>
              <span class="text-[9.5px] text-[var(--text-faint)]">{{ b.month }}</span>
            </div>
          </div>
          <p v-else class="m-0 text-[13px] text-[var(--text-muted)]">Aucun revenu enregistré pour l'instant.</p>
        </div>

        <div class="flex flex-col rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
          <p class="mb-4 mt-0 text-[15px] font-bold">Occupation</p>
          <div class="flex flex-1 items-center justify-center">
            <div class="relative h-[150px] w-[150px] rounded-pill" :style="{ background: `conic-gradient(var(--color-green-600) 0deg ${occupancyDeg}deg, var(--color-sand-300) ${occupancyDeg}deg 360deg)` }">
              <div class="absolute inset-5 flex flex-col items-center justify-center rounded-pill bg-white">
                <span class="font-mono text-2xl font-bold text-green-900">{{ stats.occupancyRate }}%</span>
                <span class="text-[11.5px] text-[var(--text-faint)]">{{ stats.occupiedUnits }} / {{ stats.totalUnits }} unités</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="mt-4.5 rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
        <p class="mb-3.5 mt-0 text-[15px] font-bold">Top biens par revenu</p>
        <p v-if="!topBiens.length" class="m-0 text-[13px] text-[var(--text-muted)]">Aucun bien publié pour l'instant.</p>
        <div v-else v-for="t in topBiens" :key="t.name" class="flex items-center gap-3.5 border-b border-sand-200 py-2.5 last:border-b-0">
          <div class="flex-1">
            <p class="m-0 text-sm font-bold">{{ t.name }}</p>
            <p class="mb-0 mt-0.5 text-xs text-[var(--text-faint)]">{{ t.units }}</p>
          </div>
          <div class="h-2 max-w-[200px] flex-1 overflow-hidden rounded-pill bg-sand-200">
            <div class="h-full rounded-pill bg-[image:linear-gradient(90deg,var(--color-green-500),var(--color-green-800))]" :style="{ width: t.pct }" />
          </div>
          <span class="min-w-[90px] text-right font-mono text-sm font-bold">{{ t.rev }}</span>
        </div>
      </div>
    </template>
  </div>
</template>
