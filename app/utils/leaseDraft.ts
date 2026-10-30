/**
 * Création d'un bail côté pro : qui peut être le locataire, ce qui manque au
 * formulaire, et les libellés du modèle de contrat.
 *
 * Aucune recherche de compte par e-mail n'est ouverte aux propriétaires
 * (`GET /user/all?search=` est réservé aux administrateurs) : les locataires
 * proposés viennent des seules sources réelles déjà accessibles — candidatures,
 * visites et conversations, chacune portant un vrai identifiant de compte.
 */
import { personName } from '~/utils/avatar'

export interface TenantCandidate {
  id: string
  name: string
  /** D'où vient le candidat, en quelques mots (« a visité A1 »). */
  hint: string
  /** Logement concerné, pour pré-remplir le formulaire quand il est vide. */
  unitId: string | null
}

interface Person { first_name?: string | null; last_name?: string | null; email?: string | null }
interface RequestLike { tenant_id: string; status: string; unit_id: string; unit?: { name: string } | null; tenant?: Person | null }
interface VisitLike { tenant_id?: string; status: string; unit_id: string; unit?: { name: string } | null; tenant?: (Person & { id: string }) | null }
interface ConversationLike { unit?: { id: string } | null; participants: { role: string; user_id: string; user?: Person | null }[] }

function nameOf(p: Person | null | undefined, fallback: string) {
  return personName(p?.first_name, p?.last_name) || p?.email || fallback
}

/**
 * Candidats au bail, sans doublon, du signal le plus fort au plus faible :
 * candidature retenue, candidature en attente, visite faite, visite prévue,
 * simple conversation. `me` écarte son propre compte.
 */
export function leaseTenantCandidates(
  src: { requests?: RequestLike[]; visits?: VisitLike[]; conversations?: ConversationLike[] },
  me?: string | null
): TenantCandidate[] {
  const out = new Map<string, TenantCandidate>()
  const add = (c: TenantCandidate) => {
    if (!c.id || c.id === me || out.has(c.id)) return
    out.set(c.id, c)
  }
  const requests = src.requests ?? []
  for (const status of ['accepted', 'pending']) {
    for (const r of requests.filter(x => x.status === status)) {
      const unit = r.unit?.name ?? 'un logement'
      add({ id: r.tenant_id, name: nameOf(r.tenant, 'Candidat'), hint: status === 'accepted' ? `candidature retenue pour ${unit}` : `a candidaté pour ${unit}`, unitId: r.unit_id })
    }
  }
  const visits = src.visits ?? []
  for (const status of ['completed', 'confirmed']) {
    for (const v of visits.filter(x => x.status === status)) {
      const id = v.tenant?.id ?? v.tenant_id
      if (!id) continue
      const unit = v.unit?.name ?? 'un logement'
      add({ id, name: nameOf(v.tenant, 'Locataire'), hint: status === 'completed' ? `a visité ${unit}` : `visite prévue de ${unit}`, unitId: v.unit_id })
    }
  }
  for (const c of src.conversations ?? []) {
    const tenant = c.participants.find(p => p.role === 'tenant')
    if (tenant) add({ id: tenant.user_id, name: nameOf(tenant.user, 'Locataire'), hint: 'conversation', unitId: c.unit?.id ?? null })
  }
  return [...out.values()]
}

/** Ce qui empêche encore de créer le bail, en clair (« Il manque le locataire et la date de début. »), ou `null`. */
export function leaseFormMissing(f: { tenantId: string; unitId: string; startDate: string }): string | null {
  const missing: string[] = []
  if (!f.tenantId.trim()) missing.push('le locataire')
  if (!f.unitId) missing.push('le logement')
  if (!f.startDate) missing.push('la date de début')
  if (!missing.length) return null
  const list = missing.length === 1 ? missing[0] : `${missing.slice(0, -1).join(', ')} et ${missing[missing.length - 1]}`
  return `Il manque ${list}.`
}

/**
 * Modèle du contrat PDF (`contractType` de `POST /leases`). Le Swagger ne
 * documente que les trois valeurs, pas leur contenu exact : les libellés
 * restent prudents (présentation du contrat, pas ses conditions).
 */
export const CONTRACT_TYPES = ['standard', 'compact', 'detailed'] as const
export const CONTRACT_TYPE_LABEL: Record<string, string> = {
  standard: 'Standard',
  compact: 'Abrégé',
  detailed: 'Détaillé'
}
export const CONTRACT_TYPE_HINT: Record<string, string> = {
  standard: 'Le modèle par défaut, avec les clauses usuelles.',
  compact: 'Une version courte du contrat, pour un bail simple.',
  detailed: 'Une version longue, où chaque clause est développée.'
}
export const CONTRACT_TYPE_HELP = 'Le modèle choisit la présentation du contrat PDF. Le loyer, la caution, les dates et le préavis sont ceux saisis ici, quel que soit le modèle. Relisez le contrat avant de l\'envoyer.'

export function contractTypeLabel(code: string | null | undefined): string {
  return (code && CONTRACT_TYPE_LABEL[code]) || 'Modèle non précisé'
}
