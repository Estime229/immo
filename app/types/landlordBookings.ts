/**
 * Réservations courte durée reçues (IP6) et codes promo (IP7) — côté
 * propriétaire. Écrits à partir du Swagger : `GET /bookings/landlord` fournit
 * un `example` réel (repris tel quel ci-dessous), mais aucun des endpoints
 * `/promo-codes/*` n'en fournit — leur forme est déduite de
 * `CreatePromoCodeCommand`/`UpdatePromoCodeCommand` (mêmes noms de champs,
 * pattern REST standard) car ce compte de test n'a aucun bien pour en créer
 * un réel à vérifier (même mur KYC que IP1/IP2, IL6). À corriger dès qu'un
 * compte propriétaire avec un vrai code promo est disponible.
 */

export type LandlordBookingStatus = 'pending_payment' | 'confirmed' | 'cancelled'

/** `tenant` n'a que `first_name` dans l'exemple Swagger — pas de nom de famille garanti. */
export interface LandlordBookingSummary {
  id: string
  unit_id: string
  tenant_id: string
  check_in: string
  check_out: string
  total_price: string
  status: LandlordBookingStatus
  tenant?: { id: string; first_name?: string | null; last_name?: string | null }
}

export type PromoDiscountType = 'percentage' | 'fixed'

export interface PromoCodeConstraints {
  newTenantsOnly?: boolean
  maxUsesPerTenant?: number
  restrictedToTenantId?: string
  stayDateFrom?: string
  stayDateUntil?: string
  allowedDaysOfWeek?: string[]
  minNights?: number
  maxNights?: number
  minTotalPrice?: number
  excludeExtensions?: boolean
  maxDiscountAmount?: number
  maxRewardAmount?: number
}

/**
 * Portée : exactement un des trois (`unit_id`/`property_id`/`landlord_id`) —
 * imposé côté API, pas côté client. Forme confirmée en direct (`POST /promo-codes`
 * avec `landlord_id` seul, sans bien réel — la portée « portefeuille » ne
 * dépend d'aucune unité existante) : `referred_discount_value`/
 * `referrer_reward_value` reviennent en chaîne malgré un `number` en entrée
 * (convention montants du projet), et deux champs absents des DTO Create/Update
 * apparaissent bien sur l'entité réelle : `created_by`, `updated_at`.
 */
export interface PromoCodeSummary {
  id: string
  unit_id: string | null
  property_id: string | null
  landlord_id: string | null
  created_by: string
  code: string | null
  referred_discount_type: PromoDiscountType | null
  referred_discount_value: string | null
  referrer_reward_type: PromoDiscountType | null
  referrer_reward_value: string | null
  owner_user_id: string | null
  valid_from: string | null
  valid_until: string | null
  max_uses: number | null
  uses_count: number
  is_active: boolean
  created_at: string
  updated_at: string
  constraints?: PromoCodeConstraints | null
}

export interface CreatePromoCodePayload {
  unit_id?: string
  property_id?: string
  landlord_id?: string
  code?: string
  referred_discount_type?: PromoDiscountType
  referred_discount_value?: number
  referrer_reward_type?: PromoDiscountType
  referrer_reward_value?: number
  owner_user_id?: string
  valid_from?: string
  valid_until?: string
  max_uses?: number
}

export interface UpdatePromoCodePayload extends Partial<CreatePromoCodePayload> {
  is_active?: boolean
}
