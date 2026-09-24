/**
 * Voir 12-INTEGRATION-LOCATAIRE.md, IL4, point 4 : cinq types déclarés dans
 * le schéma Swagger, trois de plus observés en réalité et absents du schéma
 * — précisément les trois mouvements les plus importants du produit. Les
 * huit sont couverts ici ; un type inconnu retombe sur une mise en forme
 * lisible plutôt que d'afficher le snake_case brut.
 */
export const TRANSACTION_TYPE_LABELS: Record<string, string> = {
  rent: 'Loyer',
  saving: 'Épargne / recharge',
  commission: 'Commission',
  withdrawal: 'Retrait',
  service_fee: 'Frais de service',
  lease_entry_payment: "Paiement d'entrée (bail)",
  short_stay_booking_payment: 'Réservation courte durée',
  artisan_intervention_payment: "Intervention d'artisan"
}

function humanizeSnakeCase(value: string): string {
  const words = value.replace(/_/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

export function transactionTypeLabel(type: string): string {
  return TRANSACTION_TYPE_LABELS[type] ?? humanizeSnakeCase(type)
}
