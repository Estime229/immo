/**
 * Types pour le tableau de bord locataire (IL1) et les modules qui s'y
 * branchent. Écrits à la main à partir des `example` du Swagger live
 * (réponses non typées en `properties` côté API) — vérifiés le 2026-09-17.
 * Les montants sont des chaînes ("75000.00") : ne convertir qu'à l'affichage,
 * jamais refaire d'arithmétique dessus (socle §1).
 */

/**
 * Cinq valeurs réelles, confirmées sur le Swagger. Pas de sixième valeur
 * `expired` — un bail arrivé à terme est `terminated` (voir 12-INTEGRATION-LOCATAIRE.md, IL2).
 */
export type LeaseStatus = 'draft' | 'pending_signature' | 'signed' | 'active' | 'terminated'

/** `status` réel : pending · paid · overdue · partially_paid · refunded · cancelled (`InvoiceStatus` côté API, Lot 50). */
export interface LeaseInvoice {
  id: string
  amount: string
  due_date: string
  status: string
  paid_at?: string | null
  title?: string | null
}

export interface LeasePartyRef {
  id: string
  first_name?: string
  last_name?: string
}

/**
 * `signed_rent`, pas `monthly_rent` — l'exemple Swagger de `GET /leases/my`
 * montrait `monthly_rent`, mais aucun bail réel n'existait pour le vérifier
 * avant qu'un vrai bail ne soit créé (Lot 23) : la réponse réelle n'a pas ce
 * champ du tout. Bug latent resté indétecté dans tout le module baux
 * (tableau de bord locataire, fiche de bail, modale d'alimentation) jusqu'à
 * ce premier bail réel — corrigé partout d'un coup, voir grep `monthly_rent`
 * dans le journal du Lot 23 pour la liste des fichiers touchés. `end_date`
 * est réellement `null` sur un bail sans terme (confirmé sur ce même bail
 * réel) — pas une chaîne garantie comme le supposait ce type jusqu'ici.
 * `property`/`unit` sont réellement `null` sur au moins un bail réel
 * (signalé par l'utilisateur, Lot 37 : `TypeError: Cannot read properties
 * of null (reading 'name')`) — élargis en conséquence, jamais supposés
 * présents sans vérification.
 */
export interface LeaseSummary {
  id: string
  status: LeaseStatus
  signed_rent: string
  deposit_amount: string
  start_date: string
  end_date: string | null
  auto_debit_enabled: boolean
  contract_type: string
  tenant: LeasePartyRef
  landlord: LeasePartyRef
  property: { id: string; name: string } | null
  unit: { id: string; name: string } | null
  invoices?: LeaseInvoice[]
  /**
   * Champs renvoyés par `GET /leases/my` (vérifiés en live, Lot 50) et jusqu'ici
   * ignorés : le préavis (`renewal_intent`, `renewal_intent_date` = date où il
   * a été donné, `notice_period` en mois), les signatures, le paiement
   * d'entrée et ses montants cibles.
   */
  billing_frequency?: LeaseBillingFrequency
  notice_period?: number | null
  renewal_intent?: RenewalIntent | null
  renewal_intent_date?: string | null
  signed_at_landlord?: string | null
  signed_at_tenant?: string | null
  entry_paid_at?: string | null
  advance_target?: string | null
  prepaid_target?: string | null
  advance_balance?: string | null
  prepaid_balance?: string | null
  next_billing_date?: string | null
  contract_content?: string | null
  tenant_id?: string
  landlord_id?: string
  created_at?: string
}

export type LeaseBillingFrequency = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'semi_annual' | 'annual'
export type LeaseContractType = 'standard' | 'compact' | 'detailed'

/**
 * Corps de POST /leases — seul endpoint du module baux à utiliser des noms de
 * champs en camelCase (`tenantId`, `depositAmount`…) au lieu du snake_case
 * systématique ailleurs dans l'API. Vérifié sur le Swagger, pas une coquille.
 * `monthlyRent` optionnel seulement si `unitId` + un tarif `unit_pricing`
 * actif existent pour cette fréquence, sinon 400.
 */
export interface CreateLeasePayload {
  tenantId: string
  propertyId: string
  unitId?: string
  billingFrequency?: LeaseBillingFrequency
  monthlyRent?: number
  depositAmount: number
  startDate: string
  endDate?: string
  contractType: LeaseContractType
  /** Confirme l'accord des deux parties pour dépasser le plafond légal de caution (3 mois, Loi 2022-30). */
  depositAcknowledged?: boolean
}

/** Réponse minimale de POST /leases — pas la forme complète de LeaseSummary (pas de tenant/landlord/unit imbriqués). */
export interface CreateLeaseResult {
  id: string
  status: LeaseStatus
  signed_rent: string
  billing_frequency: LeaseBillingFrequency
  rent_source: string
}

/** Corps de PATCH /leases/:id (brouillon seulement) — camelCase comme la création ; `noticePeriod` n'existe qu'ici. */
export interface UpdateLeaseDraftPayload {
  monthlyRent?: number
  depositAmount?: number
  startDate?: string
  endDate?: string | null
  contractType?: LeaseContractType
  noticePeriod?: number
  billingFrequency?: LeaseBillingFrequency
  depositAcknowledged?: boolean
}

/** Réponse de PATCH /leases/:id/send, /cancel-unpaid, /terminate — formes minimales, pas LeaseSummary complet. */
export interface LeaseActionResult {
  id: string
  status: LeaseStatus
  end_date?: string
}

/** Confirmées côté API : trois valeurs. `expired` est dérivé côté front depuis `expires_at` — voir IL5. */
export type BookingStatus = 'pending_payment' | 'confirmed' | 'cancelled'

/**
 * `expires_at` est bien renvoyé par `GET /bookings/mine` (vérifié en direct le
 * 2026-09-19) alors que l'exemple Swagger de cette route ne le montre pas —
 * ne pas se fier à l'exemple seul pour cette route précise. `retained_amount`
 * existe sur le modèle réel malgré la description Swagger de `pay` qui dit
 * « pas de séquestre » : dépend de `booking_retention_percentage` sur le
 * logement, nul par défaut — à n'afficher que s'il est non nul, jamais supposé.
 */
export interface BookingSummary {
  id: string
  unit_id: string
  check_in: string
  check_out: string
  nights: number
  total_price: string
  status: BookingStatus
  expires_at: string | null
  extended_from_booking_id: string | null
  retained_amount: string | null
  retention_released_at: string | null
  discount_amount?: string | null
  reward_amount?: string | null
  landlord_id?: string
  currency?: string
  /** Unité complète jointe par `GET /bookings/mine` (vérifié en live) — `null` si le logement a été supprimé. */
  unit: null | { id: string; name: string; property_id?: string | null; min_duration_days?: number | null; booking_retention_percentage?: number | string | null; requires_booking_inventory?: boolean }
}

/** Réponse de POST /bookings, POST /bookings/:id/extend, PATCH /bookings/:id/cancel — pas de `unit` imbriqué, contrairement à la liste. */
export interface BookingActionResult {
  id: string
  unit_id: string
  check_in: string
  check_out: string
  nights: number
  total_price: string
  status: BookingStatus
  expires_at: string | null
  extended_from_booking_id: string | null
}

/** Aucun débit, aucune incrémentation d'utilisation — simulation pure, vérifiée en direct (code invalide → 400 explicite). */
export interface PromoPreviewResult {
  applied: boolean
  code: string | null
  discount_amount: number
  final_price: number
}

export interface PayBookingResult {
  success: boolean
  transactionId: string
}

export type HousingRequestStatus = 'open' | 'closed'

/** Critères structurés d'une demande — renvoyés tels quels par `/my` ET `/open` (vérifié en live, Lot 47). */
export interface HousingRequestCriteria {
  city_id?: string | null
  city?: { id: string; name: string } | null
  neighborhood_id?: string | null
  neighborhood?: { id: string; name: string } | null
  budget_min?: string | null
  budget_max?: string | null
  move_in_date?: string | null
  min_bedrooms?: number | null
  desired_billing_frequency?: string | null
  unit_type_reference_id?: string | null
  desired_furnished_level?: string | null
  desired_feature_ids?: string[] | null
}

export interface HousingRequestSummary extends HousingRequestCriteria {
  id: string
  description: string
  status: HousingRequestStatus
  response_count: number
  created_at: string
  closed_at?: string | null
}

/** `message` est quasi toujours null en pratique (optionnel côté RespondToHousingRequestDto) — vérifié en direct. */
export interface HousingRequestResponse {
  id: string
  unit_id: string
  landlord_id: string
  message: string | null
  conversation_id: string
  created_at: string
  /** Joints par `GET /:id/responses` (vérifié en live) — jamais affichés avant le Lot 47 (« Un propriétaire a proposé un logement »). */
  unit?: { id: string; name: string; price: string; unit_status: string; property_id: string | null; bedrooms_count?: number | null; surface_m2?: number | null; furnished_level?: string | null } | null
  landlord?: { id: string; first_name: string | null; last_name: string | null; avatar_url?: string | null } | null
}

/**
 * Forme renvoyée par `GET /housing-requests/open` (vitrine publique, IP5) —
 * distincte de `HousingRequestSummary` (`GET /housing-requests/my`, côté
 * auteur) : pas de `response_count`/`created_at`/`min_bedrooms`, mais
 * `requester_display_name` et `desired_billing_frequency` à la place.
 */
export interface HousingRequestOpenItem extends HousingRequestCriteria {
  id: string
  description: string
  budget_min: string | null
  budget_max: string | null
  desired_billing_frequency: string | null
  /** `null` quand le locataire n'a pas de prénom. */
  requester_display_name: string | null
  status: HousingRequestStatus
  created_at: string
}

export interface PaginatedResult<T> {
  data: T[]
  total: number
  page: number
  limit: number
  totalPages: number
}

/** Réponse de POST /housing-requests/:id/respond — crée une conversation immédiate avec le locataire. */
export interface HousingRequestRespondResult {
  id: string
  housing_request_id: string
  unit_id: string
  landlord_id: string
  conversation_id: string
  created_at: string
}

export type VisitStatus = 'pending' | 'confirmed' | 'rejected' | 'cancelled' | 'completed'

/** `tenant` n'apparaît que côté propriétaire/agent (`GET /visits?role=landlord`) — absent côté locataire. */
export interface VisitSummary {
  id: string
  unit_id: string
  status: VisitStatus
  requested_at: string
  /** Horaire confirmé ou replanifié par le propriétaire — c'est lui qui fait foi (voir utils/visits.ts). */
  confirmed_at: string | null
  note: string | null
  rejection_reason?: string | null
  tenant_id?: string
  landlord_id?: string | null
  property_id?: string | null
  cancelled_by?: string | null
  created_at?: string
  /** `property` est joint par `GET /visits` (vérifié en live, Lot 48). `null` si le logement a été supprimé depuis. */
  unit: null | { id: string; name: string; price: string; property_id?: string | null; property?: { id: string; name: string; address?: string | null } | null }
  tenant?: { id: string; email: string; first_name: string | null; last_name: string | null }
  /** Présent seulement sur `GET /visits/:id`, jamais dans la liste. */
  landlord?: { id: string; email: string; first_name: string | null; last_name: string | null } | null
}

export interface WaitlistEntry {
  id: string
  unit_id: string
  message: string
  notified_at: string | null
  created_at: string
  unit: { id: string; name: string; price: string; unit_status: string }
}

export type SignalType =
  | 'maintenance_plomberie' | 'maintenance_electricite' | 'maintenance_serrurerie' | 'maintenance_peinture' | 'maintenance_autre'
  | 'dispute_landlord' | 'dispute_neighbor' | 'nuisance_sonore' | 'insalubrite' | 'infrastructure_commune'
  | 'tenant_leaving' | 'renewal_request' | 'autre'
export type SignalPriority = 'low' | 'medium' | 'high' | 'urgent'
export type SignalStatus = 'open' | 'in_review' | 'resolved' | 'closed' | 'cancelled'
export type SignalVisibility = 'private' | 'anonymous_count' | 'public'

/**
 * `attachment_count` (nombre), pas `attachments` (tableau) — vérifié en direct :
 * ni la liste ni le détail d'un signalement ne renvoient les URLs des pièces
 * jointes, contrairement à l'exemple Swagger qui montre `attachments: []`.
 * Chaque pièce se récupère à part, par index, via `GET /signals/:id/attachments/:index/download`
 * (fichier protégé — même motif que les documents KYC, socle §5).
 */
export interface SignalSummary {
  id: string
  author_id: string
  landlord_id: string
  unit_id: string
  property_id: string
  lease_id: string | null
  signal_type: SignalType
  priority: SignalPriority
  title: string
  description: string
  attachment_count: number
  visibility: SignalVisibility
  status: SignalStatus
  resolved_by: string | null
  resolved_at: string | null
  resolution_notes: string | null
  assigned_to: string | null
  created_at: string
  updated_at?: string
  /** Renvoyés par la liste comme par le détail (vérifié en live, Lot 55) — évitent de recroiser avec la liste des biens. */
  unit?: { id: string; name: string } | null
  property?: { id: string; name: string } | null
  author?: { id: string; first_name: string | null; last_name: string | null; email: string | null } | null
}

/** Corps de PATCH /signals/:id — traitement côté propriétaire (13-INTEGRATION-PRO-ET-ARTISAN.md, IP8). `assigned_to` est un nom libre (artisan/prestataire), pas un id d'équipe — donc non bloqué par I2. */
export interface UpdateSignalPayload {
  status?: SignalStatus
  priority?: SignalPriority
  assigned_to?: string
  resolution_notes?: string
}

/** Réponse de POST /files — `url` est une URL Cloudinary complète, jamais un chemin relatif (vérifié en direct). */
export interface FileUploadResult {
  id: string
  url: string
  thumbnail_url?: string
  original_filename: string
  mimetype: string
  size: number
  type: string
  created_at: string
}

/**
 * `title`/`message` sont multilingues, { fr, en, ... } — toujours prévoir un repli.
 * `createdAt` (camelCase) — vérifié en direct via POST /notifications/test :
 * contrairement à `created_at` que montre l'exemple Swagger et que le reste
 * de l'API utilise systématiquement partout ailleurs. Seul ce endpoint diverge.
 */
export interface NotificationItem {
  id: string
  title: Record<string, string>
  message: Record<string, string>
  type: string
  isRead: boolean
  createdAt: string
  /** Identifiants liés (ex. `housing_request_id`, `response_id`) — sert au lien de destination. */
  metadata?: Record<string, unknown> | null
}

/* ---- IL2 : actions sur un bail ---- */

export interface LeaseSignResult {
  id: string
  status: LeaseStatus
  signed_at_landlord: string | null
  signed_at_tenant: string | null
  tenant_id: string
  landlord_id: string
}

export interface EntryPaymentResult {
  success: boolean
  transactionId: string
}

export type RenewalIntent = 'undecided' | 'leave' | 'stay'

export interface NoticeResult {
  id: string
  renewal_intent: RenewalIntent
  renewal_intent_date: string | null
}

export interface AutoDebitResult {
  id: string
  auto_debit_enabled: boolean
}

/** Le tampon d'avance porte aussi `deposit_amount` — miroir imparfait du tampon prépayé. */
export interface AdvanceBufferStatus {
  advance_balance: number
  advance_target: number
  deposit_amount: number
  entry_paid_at: string | null
}

export interface PrepaidBufferStatus {
  prepaid_balance: number
  prepaid_target: number
  entry_paid_at: string | null
}

export interface BufferTopUpResult {
  id: string
  wallet_id: string
  amount: string
  type: string
  status: string
  gateway_ref: string | null
  currency: string
  payment_method: string
}

/**
 * États des lieux — voir Swagger `Inventory (Etat des lieux)`. Rattaché à
 * exactement un bail (`lease_id`) OU une réservation courte durée
 * (`booking_id`), jamais les deux (400 sinon, contrainte serveur documentée
 * en description de `POST /inventories`, absente de tout schéma formel).
 */
export type InventoryType = 'entry' | 'exit'
export type InventoryStatus = 'draft' | 'pending_signature' | 'signed'

/**
 * `photo_count` (nombre), pas `photos` (tableau) sur la réponse réelle —
 * même motif que `SignalSummary.attachment_count` (Lot 12) : aucune URL de
 * photo n'est jamais renvoyée, et envoyer `photos: []` en écriture n'a aucun
 * effet (aucun endpoint d'upload de photo d'objet documenté sur ce module —
 * seul un téléchargement par index existe, `GET /inventories/:id/rooms/:i/items/:j/photos/:k/download`).
 * Vérifié en direct (Lot 28) : jamais construit dans ce lot faute d'endpoint d'upload.
 */
export interface InventoryRoomItem {
  name: string
  /** `new/good/fair/damaged/missing` côté API (`ItemState`, non validé) — voir `INVENTORY_ITEM_STATES`. */
  state: string
  /** Lecture : nombre de photos seulement (URLs masquées par l'API). */
  photo_count?: number
  /** Écriture : URLs issues de `POST /files` (Lot 52). Absentes d'un `PATCH`, les photos existantes sont effacées (#71). */
  photos?: string[]
  comment: string
  /** Côté front seulement : position d'origine et photos serveur pas encore récupérées (jamais envoyés). */
  _origin?: { ri: number; ii: number }
  _existing?: number[]
}

export interface InventoryRoom {
  name: string
  items: InventoryRoomItem[]
}

export interface InventoryDetail {
  id: string
  lease_id: string | null
  booking_id: string | null
  type: InventoryType
  status: InventoryStatus
  rooms: InventoryRoom[]
  general_comment: string | null
  meter_readings: { electricity?: string; water?: string } | null
  tenant_id: string
  landlord_id: string
  tenant_signature: string | null
  landlord_signature: string | null
  signed_at: string | null
  created_at: string
  updated_at: string
}

/** `lease_id` XOR `booking_id` — jamais les deux, voir la contrainte serveur ci-dessus. */
export interface CreateInventoryPayload {
  lease_id?: string
  booking_id?: string
  type: InventoryType
}

export interface UpdateInventoryPayload {
  rooms?: InventoryRoom[]
  general_comment?: string
  meter_readings?: { electricity?: string; water?: string }
}

/**
 * Candidature sur un logement (`/rental/requests`) — module API jamais branché
 * avant le Lot 51. Trois statuts seulement : un candidat écarté parce qu'un
 * autre a été retenu est `rejected` comme un refus explicite (vérifié en live).
 * `unit` est joint complet (règles d'entrée comprises) ; `tenant` seulement
 * côté propriétaire (`for=landlord`), avec réputation et badge de confiance.
 */
export type RentalRequestStatus = 'pending' | 'accepted' | 'rejected'

export interface RentalRequestSummary {
  id: string
  unit_id: string
  tenant_id: string
  status: RentalRequestStatus
  message: string | null
  desired_move_in_at: string | null
  created_at: string
  responded_at: string | null
  conversation_id: string | null
  unit: null | {
    id: string
    name: string
    price: string
    property_id?: string | null
    unit_status?: string
    caution_months?: number | null
    avance_months?: number | null
    prepaye_months?: number | null
    property?: { id: string; name: string; address?: string | null } | null
    city?: { name?: string } | null
  }
  tenant?: {
    id: string
    first_name: string | null
    last_name: string | null
    email: string
    phone_number: string | null
    avatar_url: string | null
    is_verified: boolean
    profile?: { reputation_score: number; trust_badge: boolean }
  } | null
}
