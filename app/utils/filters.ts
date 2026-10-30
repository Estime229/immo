export function matchesQuery(fields: Array<string | null | undefined>, q: string): boolean {
  if (!q.trim()) return true
  const needle = q.trim().toLowerCase()
  return fields.some(f => (f ?? '').toLowerCase().includes(needle))
}

export function formatPrix(prix: number): string {
  return `${prix.toLocaleString('fr-FR')} FCFA`
}

export function formatAnciennete(createdAt: string): string {
  const jours = Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000)
  if (jours < 1) return "aujourd'hui"
  if (jours < 2) return '1 jour'
  if (jours < 30) return `${jours} jours`
  if (jours < 365) return `${Math.floor(jours / 30)} mois`
  return `${(jours / 365).toFixed(1)} ans`
}
