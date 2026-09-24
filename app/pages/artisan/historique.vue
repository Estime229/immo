<script setup lang="ts">
import type { ArtisanProfile, ArtisanReview } from '~/types/artisan'
import { computeRatingBars, reviewerInitials, reviewerName } from '~/utils/artisanReviews'

definePageMeta({ layout: 'artisan' })

const profileApi = useArtisanProfileApi()

const profile = ref<ArtisanProfile | null>(null)
const profileState = ref<'loading' | 'error' | 'loaded'>('loading')
const reviews = ref<ArtisanReview[]>([])
const reviewsState = ref<'loading' | 'error' | 'loaded'>('loading')

onMounted(async () => {
  try {
    profile.value = await profileApi.fetchMine()
    profileState.value = 'loaded'
  } catch {
    profileState.value = 'error'
    return
  }
  if (!profile.value?.id) {
    reviewsState.value = 'loaded'
    return
  }
  reviewsState.value = 'loading'
  try {
    reviews.value = await profileApi.fetchReviews(profile.value.id)
    reviewsState.value = 'loaded'
  } catch {
    reviewsState.value = 'error'
  }
})

/** `reputation_score`/`review_count` viennent du profil (agrégés côté serveur) — la distribution par étoile, elle, n'a pas d'endpoint dédié, calculée depuis la vraie liste d'avis (voir utils/artisanReviews.ts). */
const ratingBars = computed(() => computeRatingBars(reviews.value))

const AVATAR_COLORS = ['var(--color-green-700)', 'var(--color-clay-500)', 'var(--color-info-fg)']
function reviewerColor(r: ArtisanReview) {
  return AVATAR_COLORS[reviews.value.indexOf(r) % AVATAR_COLORS.length]
}
</script>

<template>
  <div class="animate-[im-fade_.3s_ease_both]">
    <FeedbackAlertBanner v-if="profileState === 'error'" tone="danger">Impossible de charger votre profil artisan.</FeedbackAlertBanner>
    <template v-else>
      <div class="grid grid-cols-1 items-start gap-4.5 lg:grid-cols-[280px_1fr]">
        <div class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
          <div class="mb-4 text-center">
            <p class="m-0 font-display text-[40px] font-extrabold leading-none text-green-900">{{ profile?.reputation_score != null ? profile.reputation_score.toFixed(1).replace('.', ',') : '—' }}</p>
            <p class="mb-0 mt-1.5 text-[13px] text-[var(--text-muted)]">{{ profile?.review_count ?? 0 }} avis</p>
          </div>
          <div v-for="r in ratingBars" :key="r.star" class="flex items-center gap-2.5 py-1">
            <span class="w-[26px] text-xs text-[var(--text-faint)]">{{ r.star }}★</span>
            <div class="h-[7px] flex-1 overflow-hidden rounded-pill bg-sand-200">
              <div class="h-full rounded-pill bg-green-500" :style="{ width: r.pct }" />
            </div>
            <span class="w-[22px] text-right text-[11px] text-[var(--text-faint)]">{{ r.n }}</span>
          </div>
        </div>

        <div>
          <div v-if="reviewsState === 'loading'" class="flex flex-col gap-2.5">
            <DataSkeletonCard v-for="i in 3" :key="i" :height="90" :lines="2" />
          </div>
          <FeedbackAlertBanner v-else-if="reviewsState === 'error'" tone="danger">Impossible de charger vos avis.</FeedbackAlertBanner>
          <p v-else-if="!reviews.length" class="m-0 text-[13.5px] text-[var(--text-muted)]">Aucun avis pour l'instant.</p>
          <div v-for="r in reviews" :key="r.id" class="mb-3 rounded-xl border border-[var(--border-subtle)] bg-white p-4.5">
            <div class="flex items-center gap-2.5">
              <div class="grid h-9 w-9 place-items-center rounded-pill text-xs font-bold text-white" :style="{ background: reviewerColor(r) }">{{ reviewerInitials(r) }}</div>
              <div class="flex-1">
                <p class="m-0 text-sm font-bold">{{ reviewerName(r) }}</p>
                <p class="mb-0 mt-px text-xs text-[var(--text-faint)]">{{ new Date(r.created_at).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }) }}</p>
              </div>
              <span class="text-[13px] font-bold">★ {{ r.rating }}</span>
            </div>
            <p v-if="r.comment" class="mb-0 mt-2.5 text-[13.5px] leading-[1.6] text-[var(--text-secondary)]">{{ r.comment }}</p>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
