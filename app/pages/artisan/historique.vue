<script setup lang="ts">
import { ArrowRight, Star } from '@lucide/vue'
import type { ArtisanRequestSummary, ArtisanReview } from '~/types/artisan'
import { computeRatingBars, reviewerName } from '~/utils/artisanReviews'
import { useArtisanProfile } from '~/composables/useArtisanProfile'

definePageMeta({ layout: 'artisan' })

/**
 * Avis reçus (ancien « Historique », qui n'affichait déjà que les avis). Chaque avis renvoie à la
 * mission notée (`artisan_request_id`), nommée grâce à la liste de ses missions quand elle a chargé.
 */
const profileApi = useArtisanProfileApi()
const artisanApi = useArtisanRequestsApi()
const artisan = useArtisanProfile()
const { tradeLabel } = artisan

const reviews = ref<ArtisanReview[]>([])
const reviewsState = ref<'idle' | 'loading' | 'error' | 'loaded'>('idle')
async function loadReviews() {
  const id = artisan.profile.value?.id
  if (!id) {
    reviews.value = []
    reviewsState.value = 'loaded'
    return
  }
  reviewsState.value = 'loading'
  try {
    reviews.value = (await profileApi.fetchReviews(id)).sort((a, b) => b.created_at.localeCompare(a.created_at))
    reviewsState.value = 'loaded'
  } catch {
    reviewsState.value = 'error'
  }
}
onMounted(async () => {
  artisan.ensureTrades()
  // Note et nombre d'avis frais (agrégés côté serveur), sans repasser par un écran de chargement.
  if (artisan.loaded.value) await artisan.refresh()
  else await artisan.ensureLoaded()
  if (artisan.loaded.value) loadReviews()
})
async function retryProfile() {
  await artisan.load()
  if (artisan.loaded.value) loadReviews()
}

/** Missions, pour nommer celle de chaque avis — facultatif : sans elles, le lien reste. */
const missions = useFetchBlock(() => artisanApi.listMine())
onMounted(missions.load)
const missionById = computed(() => new Map<string, ArtisanRequestSummary>(missions.items.value.map(r => [r.id, r])))
function missionLabel(r: ArtisanReview) {
  const m = missionById.value.get(r.artisan_request_id)
  return m ? `${tradeLabel(m.trade_reference_id)} — ${m.unit?.name ?? 'Logement'}` : 'Voir la mission'
}

/** `reputation_score`/`review_count` viennent du profil ; la répartition par étoile est calculée depuis la vraie liste (utils/artisanReviews.ts). */
const ratingBars = computed(() => computeRatingBars(reviews.value))
const score = computed(() => artisan.profile.value?.reputation_score ?? null)
const count = computed(() => artisan.profile.value?.review_count ?? 0)

function formatMonth(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}
</script>

<template>
  <div class="animate-[im-fade_.3s_ease_backwards]">
    <div v-if="artisan.state.value === 'idle' || artisan.state.value === 'loading'" class="grid grid-cols-1 items-start gap-4.5 lg:grid-cols-[280px_minmax(0,1fr)]">
      <DataSkeletonCard :height="220" :lines="0" />
      <div class="flex flex-col gap-3"><DataSkeletonCard v-for="i in 3" :key="i" :height="96" :lines="0" /></div>
    </div>

    <FeedbackAlertBanner v-else-if="artisan.state.value === 'error'" tone="danger">
      Impossible de charger votre profil artisan.
      <button type="button" class="ml-2 font-bold underline" @click="retryProfile">Réessayer</button>
    </FeedbackAlertBanner>

    <div v-else class="grid grid-cols-1 items-start gap-4.5 lg:grid-cols-[280px_minmax(0,1fr)]">
      <!-- Note globale -->
      <section class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5 lg:sticky lg:top-[94px]">
        <div class="flex items-center gap-4 lg:flex-col lg:items-center lg:text-center">
          <div class="min-w-[86px] text-center">
            <p class="m-0 inline-flex items-center gap-1.5 font-mono text-[34px] font-bold leading-none tracking-[-.02em] text-green-900">
              {{ score != null ? score.toFixed(1).replace('.', ',') : '—' }}
              <Star v-if="score != null" class="h-6 w-6 fill-current text-clay-500" :stroke-width="1.9" aria-hidden="true" />
            </p>
            <p class="mb-0 mt-1.5 text-[11.5px] text-[var(--text-muted)]">{{ count ? `${count} avis` : 'Aucun avis' }}</p>
          </div>
          <div class="min-w-0 flex-1 lg:mt-4 lg:w-full">
            <div v-for="r in ratingBars" :key="r.star" class="flex items-center gap-2 py-0.5">
              <span class="inline-flex w-[30px] flex-none items-center gap-0.5 font-mono text-xs text-[var(--text-faint)]">{{ r.star }}<Star class="h-3 w-3" :stroke-width="1.9" aria-hidden="true" /></span>
              <div class="h-[7px] flex-1 overflow-hidden rounded-pill bg-sand-200">
                <div class="h-full rounded-pill bg-green-500" :style="{ width: r.pct }" />
              </div>
              <span class="w-[22px] text-right font-mono text-[11px] text-[var(--text-faint)]">{{ r.n }}</span>
            </div>
          </div>
        </div>
      </section>

      <!-- Avis -->
      <section class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
        <h2 class="m-0 text-[15px] font-bold">Avis des demandeurs</h2>
        <p class="mb-2 mt-1 text-[13px] text-[var(--text-muted)]">Le demandeur peut laisser un avis une fois la mission clôturée.</p>

        <div v-if="reviewsState === 'idle' || reviewsState === 'loading'" class="flex flex-col gap-2.5 pt-2">
          <DataSkeletonCard v-for="i in 3" :key="i" :height="80" :lines="0" />
        </div>
        <FeedbackAlertBanner v-else-if="reviewsState === 'error'" tone="danger" class="mt-2">
          Impossible de charger vos avis.
          <button type="button" class="ml-2 font-bold underline" @click="loadReviews">Réessayer</button>
        </FeedbackAlertBanner>
        <div v-else-if="!reviews.length" class="flex flex-col items-center px-4 py-8 text-center">
          <div class="grid h-[46px] w-[46px] place-items-center rounded-pill bg-green-50 text-green-700"><Star class="h-5 w-5" :stroke-width="1.9" aria-hidden="true" /></div>
          <p class="mx-auto mb-0 mt-3 max-w-[380px] text-[13.5px] leading-[1.55] text-[var(--text-muted)]">Aucun avis pour l'instant. Les demandeurs peuvent en laisser un quand une mission est clôturée.</p>
          <CoreButton size="sm" tone="secondary" class="mt-4" @click="navigateTo('/artisan/missions?tab=terminees')">Voir mes missions terminées</CoreButton>
        </div>
        <div v-else>
          <article v-for="r in reviews" :key="r.id" class="border-b border-sand-200 py-3.5 last:border-b-0 last:pb-0">
            <div class="flex items-center gap-3">
              <CoreAvatar :name="reviewerName(r)" :avatar-url="r.reviewer?.avatar_url" :size="36" />
              <div class="min-w-0 flex-1">
                <p class="m-0 truncate text-sm font-bold">{{ reviewerName(r) }}</p>
                <p class="mb-0 mt-0.5 font-mono text-xs text-[var(--text-faint)]">{{ formatMonth(r.created_at) }}</p>
              </div>
              <span class="inline-flex flex-none items-center gap-1 rounded-pill bg-sand-100 px-2.5 py-1 font-mono text-[13px] font-bold text-green-900">
                <Star class="h-3.5 w-3.5 fill-current text-clay-500" :stroke-width="1.9" aria-hidden="true" />{{ r.rating }}
              </span>
            </div>
            <p v-if="r.comment" class="mb-0 mt-2.5 text-[13.5px] leading-[1.6] text-[var(--text-secondary)] [overflow-wrap:anywhere]">{{ r.comment }}</p>
            <NuxtLink :to="`/artisan/missions?tab=terminees&request=${r.artisan_request_id}`" class="mt-2 inline-flex max-w-full items-center gap-1 text-[12.5px] font-bold text-green-700">
              <span class="truncate">{{ missionLabel(r) }}</span><ArrowRight class="h-3.5 w-3.5 flex-none" :stroke-width="1.9" aria-hidden="true" />
            </NuxtLink>
          </article>
        </div>
      </section>
    </div>
  </div>
</template>
