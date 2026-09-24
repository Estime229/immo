/**
 * Sous-système artisans — demandes d'intervention, offres, paiement, avis,
 * partenariats. Découvert au Lot 20 (recherche `artisan` dans le Swagger),
 * câblé au Lot 24. Voir 13-INTEGRATION-PRO-ET-ARTISAN.md.
 * Statuts non documentés par une énumération Swagger formelle — observés en
 * direct : 'open' (posté), 'agreed' (offre acceptée, à payer), 'in_progress'
 * (payée — `pay()` fait directement passer le statut à `in_progress`, il ne
 * reste jamais `agreed` avec `paid_at` renseigné, vérifié en direct au Lot 29),
 * 'completed' (marqué terminé par l'artisan), 'cancelled'. `string` en repli
 * pour ne jamais planter sur une valeur non encore vue.
 */
export type ArtisanRequestStatus = 'open' | 'agreed' | 'in_progress' | 'completed' | 'cancelled' | (string & {})

export interface ArtisanRequestParty {
  id: string
  first_name: string | null
  last_name: string | null
}

export interface ArtisanRequestUnit {
  id: string
  name: string
}

export interface ArtisanRequestSummary {
  id: string
  requester_id: string
  requester_role?: string
  target_artisan_id: string | null
  trade_reference_id?: string
  unit_id?: string
  property_id?: string
  status: ArtisanRequestStatus
  description?: string
  unit?: ArtisanRequestUnit
  requester?: ArtisanRequestParty
  target_artisan?: ArtisanRequestParty
  conversation_id?: string
  /** Poste ouvert d'origine dont cette ligne est une candidature (`apply()`) — absent sur une demande directe ou sur le poste ouvert lui-même. */
  public_posting_id?: string | null
  restricted_to_partners?: boolean
  agreed_offer_id?: string | null
  /** Source de vérité pour « payé » — le statut reste `agreed` après paiement, seul `paid_at` change (vérifié en direct, Lot 27). */
  paid_at?: string | null
  retained_amount?: string | null
  completed_at?: string | null
  warranty_expires_at?: string | null
  disputed_at?: string | null
  dispute_reason?: string | null
  closed_at?: string | null
  created_at: string
  updated_at?: string
}

export interface CreateArtisanRequestPayload {
  target_artisan_id?: string
  trade_reference_id: string
  unit_id: string
  description: string
  restricted_to_partners?: boolean
}

export interface ArtisanOffer {
  id: string
  artisan_request_id: string
  proposed_by: string
  price: string
  warranty_days: number
  retention_percentage: number
  status: 'pending' | 'accepted' | 'rejected' | (string & {})
  created_at: string
  updated_at?: string
}

export interface ArtisanPayResult {
  success: boolean
  transactionId: string
  immediateAmount: number
  retainedAmount: number
}

export interface ArtisanPortfolioItem {
  /** Absent sur le résumé renvoyé par `GET /artisans` (annuaire) — présent sur `GET/PATCH /artisans/me`, seul cas où la suppression (par id) a un sens. */
  id?: string
  url: string
  description: Record<string, string> | null
  rank?: number
}

/**
 * `GET /artisans` (annuaire, résumé) n'expose que `user_id` — `GET/PATCH
 * /artisans/me` (son propre profil complet) ajoute `id` (id du profil,
 * différent de `user_id`), `trade_reference_id`, `is_visible`. Tous
 * optionnels ici pour couvrir les deux formes avec un seul type.
 */
export interface ArtisanProfile {
  id?: string
  user_id: string
  trade_reference_id?: string
  /** Absents sur `GET/PATCH /artisans/me` (profil artisan seul, pas joint à l'identité) — présents uniquement sur le résumé de `GET /artisans` (annuaire). */
  first_name?: string | null
  last_name?: string | null
  avatar_url?: string | null
  bio: string | null
  years_experience: number | null
  /** `null` tant que l'artisan n'a aucun avis — vérifié en direct, jamais 0 par défaut côté API. */
  reputation_score: number | null
  review_count: number
  trust_badge: boolean
  is_visible?: boolean
  portfolio: ArtisanPortfolioItem[]
}

export interface ArtisanSearchPage {
  data: ArtisanProfile[]
  total: number
  page: number
  limit: number
  totalPages: number
}

export interface ArtisanReview {
  id: string
  artisan_request_id: string
  reviewer_id: string
  artisan_id: string
  rating: number
  comment: string | null
  created_at: string
  /** Présent uniquement sur `GET /artisans/:id/reviews` (annuaire) — absent de la réponse de création (`POST /artisan-requests/:id/review`), où l'appelant est déjà l'auteur. */
  reviewer?: { id: string; first_name: string | null; last_name: string | null; avatar_url: string | null }
}

export interface ArtisanPartnershipMember {
  id: string
  first_name: string | null
  last_name: string | null
  trade_reference_id?: string
}

export interface ArtisanPartnership {
  id: string
  manager_id: string
  manager_role: string
  artisan_id: string
  status: 'pending' | 'active' | 'ended' | 'rejected' | (string & {})
  manager?: ArtisanPartnershipMember
  artisan?: ArtisanPartnershipMember
  created_at: string
  updated_at?: string
}
