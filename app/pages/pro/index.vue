<script setup lang="ts">
import { ArrowRight, Building, ChevronRight, CircleCheck, Lock, ShieldCheck } from '@lucide/vue'
import type { LandlordStats } from '~/types/landlord'
import { alertTarget, severityCountLabel } from '~/utils/proAlerts'
import { verificationLink } from '~/utils/kycStatus'

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

/* ---- Démarrage : compte sans aucun bien ---- */
const { canAct, requireVerified } = useVerification()
const isNewAccount = computed(() => !!stats.value && stats.value.totalProperties === 0)
function addFirstProperty() {
  if (requireVerified('publier un bien')) navigateTo('/pro/biens/ajouter')
}

/* ---- Alertes réelles : chacune mène à l'objet qu'elle concerne (voir utils/proAlerts) ---- */
const TONE_BG: Record<string, string> = { danger: 'bg-danger-bg', warn: 'bg-warn-bg', info: 'bg-info-bg' }
const TONE_FG: Record<string, string> = { danger: 'text-danger-fg-deep', warn: 'text-warn-fg-deep', info: 'text-info-fg-deep' }
const TONE_DOT: Record<string, string> = { danger: 'bg-danger-fg', warn: 'bg-clay-500', info: 'bg-info-fg' }

const alerts = computed(() => (stats.value?.alerts ?? []).map((a, i) => ({ ...a, key: i, target: alertTarget(a) })))
const severityCounts = computed(() => {
  const out: Record<string, number> = {}
  for (const a of alerts.value) out[a.severity] = (out[a.severity] ?? 0) + 1
  return out
})

/* ---- Chiffres clés réels ---- */
const kpis = computed(() => {
  if (!stats.value) return []
  const s = stats.value
  const list: { value: string; label: string; to: string }[] = [
    { value: String(s.totalProperties), label: s.totalProperties > 1 ? 'biens' : 'bien', to: '/pro/biens' },
    { value: String(s.totalUnits), label: s.totalUnits > 1 ? 'logements' : 'logement', to: '/pro/biens' },
    { value: `${s.occupancyRate}%`, label: 'occupation', to: '/pro/biens' },
    { value: String(s.activeLeases), label: s.activeLeases > 1 ? 'baux actifs' : 'bail actif', to: '/pro/baux' },
    // Sans bail actif, l'API renvoie 100 % (rien n'était dû) : un « 100 % encaissés » serait trompeur.
    { value: s.activeLeases > 0 ? `${s.collectionRate}%` : '—', label: 'loyers encaissés', to: '/pro/baux' }
  ]
  if (s.averageRating !== undefined && s.averageRating > 0) list.push({ value: s.averageRating.toFixed(1).replace('.', ','), label: 'note moyenne', to: '/pro/biens' })
  return list
})

/* ---- Revenus réels — un seul jeu de données (l'API ne donne qu'un pourcentage de comparaison agrégé) ---- */
const revenue = computed(() => {
  const months = stats.value?.monthlyRevenue ?? []
  const max = Math.max(1, ...months.map(m => m.revenue))
  return months.map((m, i) => ({
    h: `${Math.round((m.revenue / max) * 100)}%`,
    month: new Date(`${m.month}-01T12:00:00`).toLocaleDateString('fr-FR', { month: 'short' }),
    amount: formatFcfa(m.revenue),
    current: i === months.length - 1
  }))
})
const comparisonLabel = computed(() => {
  const c = stats.value?.comparison
  if (!c) return null
  const pct = c.revenue_change_percent
  return `${pct >= 0 ? '+' : ''}${pct}% vs le mois précédent`
})

/* ---- Occupation réelle ---- */
const occupancyDeg = computed(() => (stats.value ? Math.round((stats.value.occupancyRate / 100) * 360) : 0))

/* ---- Top biens — topProperties si /stats/advanced a répondu, sinon les biens triés côté client ---- */
const topBiens = computed(() => {
  if (!stats.value) return []
  const source = stats.value.topProperties ?? [...stats.value.properties].sort((a, b) => b.revenueThisMonth - a.revenueThisMonth)
  const maxRev = Math.max(1, ...source.map(p => p.revenueThisMonth))
  return source.slice(0, 5).map(p => ({
    id: p.id,
    name: p.title,
    units: [`${p.totalUnits} logement${p.totalUnits > 1 ? 's' : ''}`, p.city].filter(Boolean).join(' · '),
    rev: formatFcfa(p.revenueThisMonth),
    pct: `${Math.round((p.revenueThisMonth / maxRev) * 100)}%`
  }))
})
</script>

<template>
  <div class="animate-[im-fade_.3s_ease_backwards]">
    <LayoutKycNotice space="pro" />

    <div v-if="state === 'loading'" class="flex flex-col gap-4.5">
      <DataSkeletonCard :height="100" :lines="1" />
      <DataSkeletonCard :height="200" :lines="1" />
    </div>

    <FeedbackAlertBanner v-else-if="state === 'error' || !stats" tone="danger">
      Impossible de charger votre tableau de bord pour le moment.
      <button type="button" class="ml-2 font-bold underline" @click="load">Réessayer</button>
    </FeedbackAlertBanner>

    <!-- Compte neuf : les deux étapes qui mènent à la première annonce -->
    <section v-else-if="isNewAccount" class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
      <h2 class="m-0 text-[15px] font-bold">Bien démarrer</h2>
      <p class="mb-4 mt-1 text-[13.5px] text-[var(--text-muted)]">Deux étapes avant de recevoir vos premières demandes de visite.</p>
      <div class="flex flex-col">
        <div class="flex flex-wrap items-center gap-3.5 border-b border-sand-200 py-3.5 first:pt-0">
          <span class="grid h-[42px] w-[42px] flex-none place-items-center rounded-pill" :class="canAct ? 'bg-ok-bg text-ok-fg' : 'bg-green-50 text-green-700'">
            <CircleCheck v-if="canAct" class="h-5 w-5" :stroke-width="1.9" />
            <ShieldCheck v-else class="h-5 w-5" :stroke-width="1.9" />
          </span>
          <div class="min-w-0 flex-1">
            <p class="m-0 text-sm font-bold">1. Vérifier mon identité</p>
            <p class="mb-0 mt-0.5 text-xs text-[var(--text-faint)]">{{ canAct ? 'Identité vérifiée.' : "Une pièce d'identité suffit ; la validation prend généralement moins de 24 h." }}</p>
          </div>
          <NuxtLink v-if="!canAct" :to="verificationLink('/pro')" class="inline-flex items-center gap-1.5 rounded-pill bg-[image:var(--action-primary)] px-4 py-[9px] text-[13px] font-bold text-white shadow-action">
            Vérifier mon identité <ArrowRight class="h-4 w-4" :stroke-width="1.9" />
          </NuxtLink>
        </div>
        <div class="flex flex-wrap items-center gap-3.5 py-3.5 pb-0">
          <span class="grid h-[42px] w-[42px] flex-none place-items-center rounded-pill bg-green-50 text-green-700">
            <Building class="h-5 w-5" :stroke-width="1.9" />
          </span>
          <div class="min-w-0 flex-1">
            <p class="m-0 text-sm font-bold">2. Ajouter un bien</p>
            <p class="mb-0 mt-0.5 text-xs text-[var(--text-faint)]">Le bâtiment, 5 photos, un premier logement et son prix : l'annonce est en ligne à la fin.</p>
          </div>
          <CoreButton :tone="canAct ? 'primary' : 'secondary'" size="sm" class="inline-flex items-center gap-1.5" @click="addFirstProperty">
            <Lock v-if="!canAct" class="h-3.5 w-3.5" :stroke-width="1.9" />Ajouter un bien
          </CoreButton>
        </div>
      </div>
    </section>

    <template v-else>
      <!-- À traiter -->
      <section class="mb-5.5 rounded-2xl border border-[var(--border-subtle)] bg-white px-5 py-4.5">
        <div class="mb-3.5 flex flex-wrap items-center gap-3">
          <h2 class="m-0 text-[15px] font-bold">À traiter</h2>
          <span v-if="alerts.length" class="rounded-pill bg-danger-fg px-2.5 py-0.5 font-mono text-xs font-black text-white">{{ alerts.length }}</span>
          <div class="flex-1" />
          <div v-if="alerts.length" class="flex flex-wrap items-center gap-2.5">
            <span v-for="(count, sev) in severityCounts" :key="sev" class="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-[var(--text-muted)]">
              <span class="h-2 w-2 rounded-pill" :class="TONE_DOT[sev] ?? 'bg-sand-400'" />{{ severityCountLabel(String(sev), count) }}
            </span>
          </div>
        </div>
        <div v-if="alerts.length" class="grid grid-cols-1 gap-2.5 md:grid-cols-2">
          <NuxtLink
            v-for="a in alerts"
            :key="a.key"
            :to="a.target.to"
            class="group flex items-center gap-3 rounded-md p-3.5 transition-transform hover:-translate-y-px"
            :class="TONE_BG[a.severity] ?? 'bg-sand-100'"
          >
            <span class="h-[9px] w-[9px] flex-none rounded-pill" :class="TONE_DOT[a.severity] ?? 'bg-sand-400'" />
            <p class="m-0 line-clamp-2 min-w-0 flex-1 text-[13px] font-semibold leading-[1.4]" :class="TONE_FG[a.severity] ?? 'text-[var(--text-primary)]'">{{ a.message }}</p>
            <span class="flex flex-none items-center gap-1 whitespace-nowrap rounded-pill bg-white/70 px-3.5 py-2 text-xs font-bold" :class="TONE_FG[a.severity] ?? 'text-[var(--text-primary)]'">
              {{ a.target.label }} <ArrowRight class="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" :stroke-width="1.9" />
            </span>
          </NuxtLink>
        </div>
        <div v-else class="flex items-center gap-3 rounded-md bg-ok-bg p-3.5 text-green-900">
          <CircleCheck class="h-5 w-5 flex-none text-ok-fg" :stroke-width="1.9" />
          <p class="m-0 text-[13.5px] font-semibold">Aucune alerte en cours sur vos biens.</p>
        </div>
      </section>

      <!-- Chiffres clés -->
      <div class="mb-4.5 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <NuxtLink v-for="k in kpis" :key="k.label" :to="k.to" class="rounded-lg border border-[var(--border-subtle)] bg-white p-4 transition-colors hover:border-[var(--border-default)]">
          <p class="m-0 truncate font-mono text-xl font-bold tracking-[-.02em] text-green-900">{{ k.value }}</p>
          <p class="mb-0 mt-1.5 text-[11.5px] leading-[1.3] text-[var(--text-muted)]">{{ k.label }}</p>
        </NuxtLink>
      </div>

      <div class="grid grid-cols-1 gap-4.5 lg:grid-cols-[1.5fr_1fr]">
        <section class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
          <div class="mb-1 flex flex-wrap items-baseline justify-between gap-2">
            <h2 class="m-0 text-[15px] font-bold">Revenus</h2>
            <span v-if="comparisonLabel" class="text-[12.5px] font-bold" :class="(stats.comparison?.revenue_change_percent ?? 0) >= 0 ? 'text-ok-fg' : 'text-danger-fg'">{{ comparisonLabel }}</span>
          </div>
          <p class="mb-4 mt-0 text-xs text-[var(--text-faint)]">Ce mois <strong class="font-mono text-[13px] text-[var(--text-primary)]">{{ formatFcfa(stats.revenueThisMonth) }}</strong></p>
          <div v-if="revenue.length" class="flex h-[150px] items-end gap-1.5">
            <div v-for="b in revenue" :key="b.month" class="flex h-full flex-1 flex-col items-center justify-end gap-1.5" :title="`${b.month} : ${b.amount}`">
              <div class="relative flex h-full w-full items-end justify-center">
                <div class="w-[70%] rounded-t" :class="b.current ? 'bg-green-600' : 'bg-green-300'" :style="{ height: b.h }" />
              </div>
              <span class="text-[10px] text-[var(--text-faint)]">{{ b.month }}</span>
            </div>
          </div>
          <p v-else class="m-0 text-[13.5px] text-[var(--text-muted)]">Aucun revenu enregistré pour l'instant : les loyers payés apparaîtront ici mois par mois.</p>
        </section>

        <section class="flex flex-col rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
          <h2 class="mb-4 mt-0 text-[15px] font-bold">Occupation</h2>
          <div class="flex flex-1 items-center justify-center">
            <div class="relative h-[136px] w-[136px] rounded-pill" :style="{ background: `conic-gradient(var(--color-green-600) 0deg ${occupancyDeg}deg, var(--color-sand-300) ${occupancyDeg}deg 360deg)` }">
              <div class="absolute inset-[18px] flex flex-col items-center justify-center rounded-pill bg-white">
                <span class="font-mono text-2xl font-bold text-green-900">{{ stats.occupancyRate }}%</span>
                <span class="text-[11.5px] text-[var(--text-faint)]"><span class="font-mono">{{ stats.occupiedUnits }} / {{ stats.totalUnits }}</span> logements</span>
              </div>
            </div>
          </div>
        </section>
      </div>

      <section class="mt-4.5 rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
        <div class="mb-2 flex items-baseline justify-between gap-3">
          <h2 class="m-0 text-[15px] font-bold">Top biens par revenu</h2>
          <NuxtLink to="/pro/biens" class="text-[12.5px] font-bold text-green-700">Tous mes biens</NuxtLink>
        </div>
        <p v-if="!topBiens.length" class="m-0 py-3 text-[13.5px] text-[var(--text-muted)]">Aucun revenu par bien pour l'instant.</p>
        <NuxtLink
          v-for="t in topBiens"
          v-else
          :key="t.id"
          :to="`/pro/biens/fiche?id=${t.id}`"
          class="group flex items-center gap-3.5 border-b border-sand-200 py-3 last:border-b-0"
        >
          <div class="min-w-0 flex-1">
            <p class="m-0 truncate text-sm font-bold group-hover:text-green-700">{{ t.name }}</p>
            <p class="mb-0 mt-0.5 truncate text-xs text-[var(--text-faint)]">{{ t.units }}</p>
          </div>
          <div class="hidden h-2 max-w-[200px] flex-1 overflow-hidden rounded-pill bg-sand-200 sm:block">
            <div class="h-full rounded-pill bg-[image:linear-gradient(90deg,var(--color-green-500),var(--color-green-800))]" :style="{ width: t.pct }" />
          </div>
          <span class="min-w-[90px] text-right font-mono text-sm font-bold">{{ t.rev }}</span>
          <ChevronRight class="h-4 w-4 flex-none text-[var(--text-faint)]" :stroke-width="1.9" />
        </NuxtLink>
      </section>
    </template>
  </div>
</template>
