import type { LeaseInvoice } from '../types/tenant'

/**
 * Retard de paiement d'un bail, pour la liste des baux du propriétaire.
 *
 * Ne compte que les échéances que le serveur a lui-même passées `overdue`
 * (après son délai de grâce) : c'est ce statut qui déclenche ses relances et
 * l'alerte du tableau de bord, le propriétaire voit donc le même chiffre partout.
 * `amount` arrive en chaîne décimale (« 70000.00 ») ; une valeur illisible est
 * ignorée plutôt que de rendre tout le total `NaN`.
 */
export function overdueSummary(invoices: ReadonlyArray<Pick<LeaseInvoice, 'status' | 'amount'>> | null | undefined): { count: number; total: number } {
  let count = 0
  let total = 0
  for (const inv of invoices ?? []) {
    if (inv.status !== 'overdue') continue
    count++
    const n = Number(inv.amount)
    if (Number.isFinite(n)) total += n
  }
  return { count, total }
}
