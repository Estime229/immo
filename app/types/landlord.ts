/**
 * Types pour le tableau de bord Pro (IP1). `GET /property/landlord/stats`
 * fonctionne toujours, y compris sur un compte sans aucun bien (tout à 0).
 * `GET /property/landlord/stats/advanced` — vérifié en direct le 2026-09-20 —
 * renvoie une **500** sur un compte vide (probable division par zéro côté
 * serveur sur une moyenne/comparaison sans données). Les deux endpoints
 * partagent la même base ; `advanced` ajoute des champs optionnels
 * (`comparison`, `topProperties`, `averageRating`…) qu'on ne doit donc
 * jamais supposer présents.
 */

export interface LandlordAlert {
  type: string
  severity: 'danger' | 'warn' | 'info' | string
  message: string
  metadata: Record<string, unknown> | null
}

export interface LandlordMonthlyRevenue {
  month: string
  revenue: number
  overdue: number
}

export interface LandlordPropertySummary {
  id: string
  title: string
  city: string
  totalUnits: number
  occupiedUnits: number
  occupancyRate: number
  revenueThisMonth: number
  overdueAmount: number
  averageRating?: number
}

export interface LandlordStats {
  totalProperties: number
  totalUnits: number
  occupiedUnits: number
  occupancyRate: number
  activeLeases: number
  totalRevenue: number
  revenueThisMonth: number
  overdueInvoices: number
  overdueAmount: number
  collectionRate: number
  alerts: LandlordAlert[]
  monthlyRevenue: LandlordMonthlyRevenue[]
  properties: LandlordPropertySummary[]
  /** Champs présents uniquement via /stats/advanced — absents si on est retombé sur /stats. */
  pendingVisits?: number
  confirmedVisits?: number
  completedVisits?: number
  averageRating?: number
  totalReviews?: number
  comparison?: {
    revenue_change_percent: number
    overdue_change_percent: number
    current_month: string
    previous_month: string
  }
  topProperties?: LandlordPropertySummary[]
  problemProperties?: LandlordPropertySummary[]
}
