<script setup lang="ts">
import type { ArtisanProfile, ArtisanRequestSummary } from '~/types/artisan'
import type { RefEntry } from '~/types/reference'

definePageMeta({ layout: 'artisan' })

const artisanApi = useArtisanRequestsApi()
const profileApi = useArtisanProfileApi()
const refData = useReferenceData()
const currentUser = useAuthUser()

const displayName = computed(() => {
  const u = currentUser.value
  if (!u) return ''
  return `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() || u.email
})

const profile = ref<ArtisanProfile | null>(null)
onMounted(async () => {
  try {
    profile.value = await profileApi.fetchMine()
  } catch {
    profile.value = null
  }
})

const trades = ref<RefEntry[]>([])
onMounted(async () => {
  try {
    trades.value = await refData.fetchRef('ARTISAN_TRADE')
  } catch {
    trades.value = []
  }
})
function tradeLabel(id?: string) {
  return trades.value.find(t => t.id === id)?.labels.fr ?? ''
}

const mine = ref<ArtisanRequestSummary[]>([])
const mineState = ref<'loading' | 'success' | 'error'>('loading')
async function loadMine() {
  mineState.value = 'loading'
  try {
    mine.value = await artisanApi.listMine()
    mineState.value = 'success'
  } catch {
    mineState.value = 'error'
  }
}
onMounted(loadMine)

const inProgress = computed(() => mine.value.filter(r => r.status === 'open' || r.status === 'agreed' || r.status === 'in_progress'))
const completed = computed(() => mine.value.filter(r => r.status === 'completed'))
const currentMission = computed(() => inProgress.value.find(r => r.status === 'in_progress') ?? inProgress.value[0] ?? null)

const KPIS = computed(() => [
  { value: String(inProgress.value.length), label: inProgress.value.length > 1 ? 'missions en cours' : 'mission en cours' },
  { value: String(completed.value.length), label: 'terminées' },
  { value: profile.value?.reputation_score != null ? `${profile.value.reputation_score.toFixed(1)} ★` : '—', label: profile.value ? `${profile.value.review_count} avis` : 'Aucun avis' }
])

const openReqs = ref<ArtisanRequestSummary[]>([])
watch(profile, async p => {
  if (!p?.trade_reference_id) return
  try {
    openReqs.value = (await artisanApi.listOpen(p.trade_reference_id)).data.slice(0, 4)
  } catch {
    openReqs.value = []
  }
})
</script>

<template>
  <div class="animate-[im-fade_.3s_ease_both]">
    <div class="mb-4.5 rounded-2xl bg-[image:var(--gradient-balance)] p-6 text-white">
      <div class="mb-3.5 flex items-center gap-2.5">
        <span class="text-[11px] font-extrabold uppercase tracking-[.06em] text-white/60">{{ currentMission ? 'Mission en cours' : 'Bonjour' }}</span>
      </div>
      <template v-if="currentMission">
        <p class="m-0 font-display text-[22px] font-bold tracking-[-.02em]">{{ tradeLabel(currentMission.trade_reference_id) }}</p>
        <p class="mb-0 mt-1.5 text-sm text-white/[.82]">{{ currentMission.unit?.name ?? 'Logement' }}</p>
        <NuxtLink to="/artisan/missions" class="mt-4 inline-block rounded-md bg-white px-5 py-3 text-[13.5px] font-bold text-green-900">Voir la mission</NuxtLink>
      </template>
      <template v-else>
        <p class="m-0 font-display text-[22px] font-bold tracking-[-.02em]">{{ displayName ? `Bonjour ${displayName}` : 'Bienvenue' }}</p>
        <p class="mb-0 mt-1.5 text-sm text-white/[.82]">Aucune mission en cours pour l'instant.</p>
        <NuxtLink to="/artisan/missions" class="mt-4 inline-block rounded-md bg-white px-5 py-3 text-[13.5px] font-bold text-green-900">Voir les postes ouverts</NuxtLink>
      </template>
    </div>

    <div v-if="mineState === 'loading'" class="mb-4.5 grid grid-cols-3 gap-3"><DataSkeletonCard :height="76" :lines="1" /><DataSkeletonCard :height="76" :lines="1" /><DataSkeletonCard :height="76" :lines="1" /></div>
    <div v-else class="mb-4.5 grid grid-cols-3 gap-3">
      <div v-for="k in KPIS" :key="k.label" class="rounded-lg border border-[var(--border-subtle)] bg-white p-4">
        <p class="m-0 font-mono text-[21px] font-bold text-green-900">{{ k.value }}</p>
        <p class="mb-0 mt-1.5 text-[11.5px] text-[var(--text-muted)]">{{ k.label }}</p>
      </div>
    </div>

    <div v-if="!profile?.trade_reference_id" class="rounded-md border border-warn-border bg-warn-bg px-4 py-3.5 text-[13.5px] text-warn-fg">
      Renseignez votre métier dans <NuxtLink to="/artisan/profil" class="font-bold underline">votre profil</NuxtLink> pour recevoir des demandes.
    </div>
    <div v-else class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
      <p class="m-0 mb-3.5 text-[15px] font-bold">Nouvelles demandes — {{ tradeLabel(profile.trade_reference_id) }}</p>
      <p v-if="!openReqs.length" class="m-0 text-[13px] text-[var(--text-muted)]">Aucun poste ouvert pour l'instant.</p>
      <div v-for="r in openReqs" :key="r.id" class="flex items-center gap-3.5 border-t border-sand-200 py-3 first:border-t-0">
        <div class="flex-1">
          <p class="m-0 text-[13.5px] font-bold">{{ r.unit?.name ?? 'Logement' }}</p>
          <p class="mb-0 mt-0.5 text-xs text-[var(--text-faint)]">{{ r.description }}</p>
        </div>
        <NuxtLink to="/artisan/missions" class="rounded-pill bg-[image:var(--action-primary)] px-3.5 py-2 text-xs font-bold text-white">Postuler</NuxtLink>
      </div>
    </div>
  </div>
</template>
