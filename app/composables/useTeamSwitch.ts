import type { Membership } from '~/types/team'

/**
 * Bascule « Mon espace » / « équipe de … » dans l'espace pro. Les équipes viennent de
 * `GET /team/memberships` ; l'équipe active est celle du jeton (`/auth/me.active_team_id`).
 * Changer de contexte émet de nouveaux jetons puis recharge la page : toutes les listes
 * (biens, baux, réservations) repartent de zéro dans le bon contexte, sans données de l'autre.
 */
export function useTeamSwitch() {
  const memberships = useState<Membership[]>('myMemberships', () => [])
  const loaded = useState('myMembershipsLoaded', () => false)
  const teamContext = useTeamContext()
  const teamApi = useTeamApi()
  const authApi = useAuthApi()
  // Partagés avec l'écran de transition du layout : le loader reste affiché jusqu'au rechargement de la page.
  const switching = useState('teamSwitching', () => false)
  const target = useState<string>('teamSwitchTarget', () => '')
  const error = useState('teamSwitchError', () => '')

  const activeTeam = computed(() => memberships.value.find(m => m.team.id === teamContext.value) ?? null)

  async function load() {
    if (loaded.value) return
    try {
      memberships.value = await teamApi.fetchMemberships()
    } catch {
      // Sans la liste, le sélecteur reste masqué : l'espace personnel fonctionne comme avant.
      memberships.value = []
    } finally {
      loaded.value = true
    }
  }

  async function switchTo(teamId: string | null) {
    if (switching.value || teamId === teamContext.value) return
    switching.value = true
    error.value = ''
    target.value = teamId ? (memberships.value.find(m => m.team.id === teamId)?.team.name ?? 'cette équipe') : 'Mon espace'
    try {
      const minimum = new Promise(resolve => setTimeout(resolve, 900))
      await authApi.switchContext(teamId)
      // Le loader reste visible au moins un instant : sans lui, le changement passe pour un simple rechargement.
      await minimum
      await reloadNuxtApp({ path: '/pro', persistState: false })
    } catch {
      error.value = "Impossible de changer d'espace pour le moment. Réessayez."
      switching.value = false
    }
  }

  function teamLabel(m: Membership) {
    const o = m.team.owner
    const owner = [o.first_name, o.last_name].filter(Boolean).join(' ')
    return { name: m.team.name, owner }
  }

  return { memberships, activeTeam, switching, target, error, load, switchTo, teamLabel }
}
