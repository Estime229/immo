import type { ReviewItem, ReviewStats } from '~/types/property'

/** Avis publics d'un bien — voir I4/I6. Lecture seule dans ce lot : publier un avis dépend d'une visite/d'un séjour réel (`GET /reviews/can/:visitId`), pas encore câblé. */
export function useReviewsApi() {
  const pub = usePublicApi()

  async function fetchByProperty(propertyId: string) {
    return pub.get<ReviewItem[]>(`/reviews/property/${propertyId}`)
  }

  async function fetchPropertyStats(propertyId: string) {
    return pub.get<ReviewStats>(`/reviews/property/${propertyId}/stats`)
  }

  return { fetchByProperty, fetchPropertyStats }
}
