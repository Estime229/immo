import { describe, expect, it } from 'vitest'
import { computeRatingBars, reviewerInitials, reviewerName } from '~/utils/artisanReviews'
import type { ArtisanReview } from '~/types/artisan'

function review(rating: number, reviewer?: ArtisanReview['reviewer']): ArtisanReview {
  return { id: `r-${rating}-${Math.random()}`, artisan_request_id: 'req1', reviewer_id: 'u1', artisan_id: 'a1', rating, comment: null, created_at: '2026-08-01T00:00:00.000Z', reviewer }
}

describe('computeRatingBars', () => {
  it('renvoie 0% pour chaque étoile sans aucun avis', () => {
    const bars = computeRatingBars([])
    expect(bars).toHaveLength(5)
    expect(bars.every(b => b.n === 0 && b.pct === '0%')).toBe(true)
  })

  it('répartit correctement les vrais avis par étoile, du plus haut au plus bas', () => {
    const bars = computeRatingBars([review(5), review(5), review(5), review(4), review(1)])
    expect(bars.map(b => b.star)).toEqual([5, 4, 3, 2, 1])
    expect(bars[0]).toMatchObject({ star: 5, n: 3, pct: '60%' })
    expect(bars[1]).toMatchObject({ star: 4, n: 1, pct: '20%' })
    expect(bars[4]).toMatchObject({ star: 1, n: 1, pct: '20%' })
  })
})

describe('reviewerName / reviewerInitials', () => {
  it('replie sur "Client" quand reviewer est absent (réponse de création, jamais joint)', () => {
    const r = review(5)
    expect(reviewerName(r)).toBe('Client')
    expect(reviewerInitials(r)).toBe('C')
  })

  it('compose le nom réel et ses initiales quand reviewer est présent', () => {
    const r = review(4, { id: 'u2', first_name: 'Sèna', last_name: 'Ahouansou', avatar_url: null })
    expect(reviewerName(r)).toBe('Sèna Ahouansou')
    expect(reviewerInitials(r)).toBe('SA')
  })

  it('replie sur "Client" quand reviewer est présent mais sans aucun nom', () => {
    const r = review(3, { id: 'u3', first_name: null, last_name: null, avatar_url: null })
    expect(reviewerName(r)).toBe('Client')
  })
})
