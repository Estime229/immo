import type { ArtisanReview } from '~/types/artisan'

export interface RatingBar {
  star: number
  n: number
  pct: string
}

/** `GET /artisans/:id/reviews` n'a pas d'agrégation par étoile côté API — calculée ici depuis la vraie liste. */
export function computeRatingBars(reviews: ArtisanReview[]): RatingBar[] {
  const total = reviews.length
  return [5, 4, 3, 2, 1].map(star => {
    const n = reviews.filter(r => r.rating === star).length
    return { star, n, pct: total ? `${Math.round((n / total) * 100)}%` : '0%' }
  })
}

/** `reviewer` absent sur la réponse de création d'avis (l'appelant en est l'auteur) — jamais crashé, replié sur "Client". */
export function reviewerName(review: ArtisanReview): string {
  if (!review.reviewer) return 'Client'
  return `${review.reviewer.first_name ?? ''} ${review.reviewer.last_name ?? ''}`.trim() || 'Client'
}

export function reviewerInitials(review: ArtisanReview): string {
  const name = reviewerName(review)
  return name === 'Client' ? 'C' : name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()
}
