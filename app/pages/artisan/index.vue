<script setup lang="ts">
import { ArrowRight, SearchX, Star, Wrench } from '@lucide/vue'
import type { ArtisanRequestSummary } from '~/types/artisan'
import { interventionPhase, PHASE_LABEL_ARTISAN } from '~/utils/artisanRequests'
import { useArtisanProfile } from '~/composables/useArtisanProfile'

definePageMeta({ layout: 'artisan' })

const artisanApi = useArtisanRequestsApi()
const currentUser = useAuthUser()
const artisan = useArtisanProfile()
const { tradeLabel } = artisan
onMounted(() => {
  artisan.ensureLoaded()
  artisan.ensureTrades()
})

const firstName = computed(() => currentUser.value?.first_name?.trim() || '')

const mineBlock = useFetchBlock(() => artisanApi.listMine())
onMounted(mineBlock.load)
const mineSettled = computed(() => ['success', 'empty'].includes(mineBlock.state.value))

// Mêmes regroupements que les onglets de Mes missions.
const DONE_PHASES = ['warranty', 'closed', 'cancelled']
const inProgress = computed(() => mineBlock.items.value.filter(r => !DONE_PHASES.includes(interventionPhase(r))))
const completed = computed(() => mineBlock.items.value.filter(r => r.status === 'completed' || r.status === 'closed'))
/** La plus urgente : à réaliser, puis litige, puis en attente du paiement, puis en négociation. */
const URGENCY = ['in_progress', 'disputed', 'agreed', 'open']
const currentMission = computed(() => [...inProgress.value].sort((a, b) => URGENCY.indexOf(interventionPhase(a)) - URGENCY.indexOf(interventionPhase(b)))[0] ?? null)
const others = computed(() => Math.max(0, inProgress.value.length - 1))

const ratingTile = computed(() => {
  if (artisan.state.value === 'error') return { value: '—', label: 'Avis indisponibles' }
  const p = artisan.profile.value
  if (!artisan.loaded.value) return { value: '…', label: 'avis' }
  if (!p || p.reputation_score == null || !p.review_count) return { value: '—', label: 'Aucun avis' }
  return { value: p.reputation_score.toFixed(1).replace('.', ','), label: `${p.review_count} avis` }
})

/* ---- Nouvelles demandes de son métier, sans les postes déjà candidatés ---- */
const openBlock = useFetchBlock(() => artisanApi.listOpen(artisan.tradeId.value ?? undefined).then(r => r.data))
watch(artisan.tradeId, id => { if (id && import.meta.client) openBlock.load() }, { immediate: true })
const myPostingIds = computed(() => new Set(mineBlock.items.value.map(r => r.public_posting_id).filter(Boolean)))
const openReqs = computed(() => openBlock.items.value.filter(o => !myPostingIds.value.has(o.id)).slice(0, 4))

function missionLink(r: ArtisanRequestSummary) {
  return `/artisan/missions?tab=encours&request=${r.id}`
}
function formatDay(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}
</script>

<template>
  <div class="animate-[im-fade_.3s_ease_backwards]">
    <LayoutKycNotice space="artisan" />

    <!-- Mission la plus urgente, ou accueil -->
    <section class="mb-4.5 rounded-2xl bg-[image:var(--gradient-balance)] p-5.5 text-white sm:p-6">
      <template v-if="currentMission">
        <div class="flex flex-wrap items-center gap-2.5">
          <span class="text-label font-bold uppercase tracking-label text-white/60">Mission en cours</span>
          <CoreBadge tone="onPhoto">{{ PHASE_LABEL_ARTISAN[interventionPhase(currentMission)] }}</CoreBadge>
        </div>
        <p class="mb-0 mt-3 font-display text-[22px] font-bold tracking-[-.02em]">{{ tradeLabel(currentMission.trade_reference_id) }}</p>
        <p class="mb-0 mt-1 text-sm text-white/[.82]">{{ currentMission.unit?.name ?? 'Logement' }}<template v-if="currentMission.unit?.address"> · {{ currentMission.unit.address }}</template></p>
        <div class="mt-4.5 flex flex-wrap items-center gap-x-4 gap-y-2.5">
          <CoreButton tone="secondary" @click="navigateTo(missionLink(currentMission))">Voir la mission</CoreButton>
          <NuxtLink v-if="others" to="/artisan/planning" class="inline-flex items-center gap-1 text-[13px] font-bold text-white/90 hover:text-white">
            Et {{ others === 1 ? '1 autre mission' : `${others} autres missions` }} <ArrowRight class="h-4 w-4" :stroke-width="1.9" aria-hidden="true" />
          </NuxtLink>
        </div>
      </template>
      <template v-else>
        <span class="text-label font-bold uppercase tracking-label text-white/60">Espace artisan</span>
        <p class="mb-0 mt-3 font-display text-[22px] font-bold tracking-[-.02em]">{{ firstName ? `Bonjour ${firstName}` : 'Bonjour' }}</p>
        <template v-if="mineSettled">
          <p class="mb-0 mt-1 text-sm text-white/[.82]">Aucune mission en cours pour l'instant : candidatez sur un poste ouvert de votre métier.</p>
          <CoreButton tone="secondary" class="mt-4.5" @click="navigateTo('/artisan/missions?tab=ouvertes')">Voir les postes ouverts</CoreButton>
        </template>
      </template>
    </section>

    <!-- Chiffres -->
    <div v-if="['idle', 'loading'].includes(mineBlock.state.value)" class="mb-4.5 grid grid-cols-3 gap-3">
      <DataSkeletonCard v-for="i in 3" :key="i" :height="78" :lines="0" />
    </div>
    <FeedbackAlertBanner v-else-if="mineBlock.state.value === 'error'" tone="danger" class="mb-4.5">
      Impossible de charger vos missions pour le moment.
      <button type="button" class="ml-2 font-bold underline" @click="mineBlock.load">Réessayer</button>
    </FeedbackAlertBanner>
    <div v-else class="mb-4.5 grid grid-cols-3 gap-3">
      <NuxtLink to="/artisan/missions?tab=encours" class="min-w-0 rounded-lg border border-[var(--border-subtle)] bg-white p-3.5 transition-colors hover:border-[var(--border-default)] sm:p-4">
        <p class="m-0 font-mono text-xl font-bold tracking-[-.02em] text-green-900">{{ inProgress.length }}</p>
        <p class="mb-0 mt-1.5 text-[11.5px] leading-[1.3] text-[var(--text-muted)]">en cours</p>
      </NuxtLink>
      <NuxtLink to="/artisan/missions?tab=terminees" class="min-w-0 rounded-lg border border-[var(--border-subtle)] bg-white p-3.5 transition-colors hover:border-[var(--border-default)] sm:p-4">
        <p class="m-0 font-mono text-xl font-bold tracking-[-.02em] text-green-900">{{ completed.length }}</p>
        <p class="mb-0 mt-1.5 text-[11.5px] leading-[1.3] text-[var(--text-muted)]">{{ completed.length > 1 ? 'terminées' : 'terminée' }}</p>
      </NuxtLink>
      <NuxtLink to="/artisan/historique" class="min-w-0 rounded-lg border border-[var(--border-subtle)] bg-white p-3.5 transition-colors hover:border-[var(--border-default)] sm:p-4">
        <p class="m-0 flex items-center gap-1 font-mono text-xl font-bold tracking-[-.02em] text-green-900">
          {{ ratingTile.value }}<Star v-if="ratingTile.value !== '—' && ratingTile.value !== '…'" class="h-4 w-4 fill-current text-clay-500" :stroke-width="1.9" aria-hidden="true" />
        </p>
        <p class="mb-0 mt-1.5 truncate text-[11.5px] leading-[1.3] text-[var(--text-muted)]">{{ ratingTile.label }}</p>
      </NuxtLink>
    </div>

    <!-- Nouvelles demandes -->
    <section class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
      <div class="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div class="min-w-0">
          <h2 class="m-0 text-[15px] font-bold">Nouvelles demandes</h2>
          <p v-if="artisan.tradeId.value" class="mb-0 mt-0.5 text-xs text-[var(--text-faint)]">Postes ouverts · {{ tradeLabel(artisan.tradeId.value, 'votre métier') }}</p>
        </div>
        <NuxtLink v-if="artisan.tradeId.value" to="/artisan/missions?tab=ouvertes" class="text-[12.5px] font-bold text-green-700">Tout voir</NuxtLink>
      </div>

      <div v-if="artisan.state.value === 'idle' || artisan.state.value === 'loading'" class="flex flex-col gap-2.5">
        <DataSkeletonCard v-for="i in 2" :key="i" :height="58" :lines="0" />
      </div>
      <FeedbackAlertBanner v-else-if="artisan.state.value === 'error'" tone="danger">
        Impossible de charger votre profil.
        <button type="button" class="ml-2 font-bold underline" @click="artisan.load">Réessayer</button>
      </FeedbackAlertBanner>
      <div v-else-if="artisan.missingTrade.value" class="flex flex-wrap items-center gap-3 rounded-md border border-warn-border bg-warn-bg px-4 py-3.5">
        <p class="m-0 min-w-[200px] flex-1 text-[13.5px] leading-[1.55] text-warn-fg-deep">Renseignez votre métier pour recevoir les demandes qui vous correspondent.</p>
        <CoreButton size="sm" @click="navigateTo('/artisan/profil')">Choisir mon métier</CoreButton>
      </div>
      <div v-else-if="openBlock.state.value === 'idle' || openBlock.state.value === 'loading'" class="flex flex-col gap-2.5">
        <DataSkeletonCard v-for="i in 2" :key="i" :height="58" :lines="0" />
      </div>
      <FeedbackAlertBanner v-else-if="openBlock.state.value === 'error'" tone="danger">
        Impossible de charger les postes ouverts.
        <button type="button" class="ml-2 font-bold underline" @click="openBlock.load">Réessayer</button>
      </FeedbackAlertBanner>
      <div v-else-if="!openReqs.length" class="flex flex-col items-center px-4 py-7 text-center">
        <div class="grid h-[46px] w-[46px] place-items-center rounded-pill bg-green-50 text-green-700"><SearchX class="h-5 w-5" :stroke-width="1.9" aria-hidden="true" /></div>
        <p class="mx-auto mb-0 mt-3 max-w-[360px] text-[13.5px] leading-[1.55] text-[var(--text-muted)]">Aucun nouveau poste pour votre métier en ce moment. Les demandes publiées s'afficheront ici.</p>
      </div>
      <div v-else>
        <div v-for="r in openReqs" :key="r.id" class="flex items-center gap-3 border-b border-sand-200 py-3 last:border-b-0">
          <div class="hidden h-[38px] w-[38px] flex-none place-items-center rounded-md bg-green-50 text-green-700 sm:grid">
            <Wrench class="h-[17px] w-[17px]" :stroke-width="1.9" aria-hidden="true" />
          </div>
          <div class="min-w-0 flex-1">
            <p class="m-0 truncate text-sm font-bold">{{ r.unit?.name ?? 'Logement' }}</p>
            <p v-if="r.description" class="mb-0 mt-0.5 line-clamp-2 text-[13px] leading-[1.45] text-[var(--text-muted)] [overflow-wrap:anywhere]">{{ r.description }}</p>
            <p class="mb-0 mt-0.5 text-xs text-[var(--text-faint)]">Publié le <span class="font-mono">{{ formatDay(r.created_at) }}</span></p>
          </div>
          <CoreButton size="sm" tone="secondary" class="flex-none" @click="navigateTo(`/artisan/missions?tab=ouvertes&request=${r.id}`)">Postuler</CoreButton>
        </div>
      </div>
    </section>
  </div>
</template>
