import { needsOnboarding, safeRedirect } from '~/utils/onboarding'
import { roleHomePath } from '~/utils/roleRoutes'

/**
 * Page de connexion (Lot 56) : un compte déjà connecté part vers la page
 * demandée ou son espace, avant même l'affichage du formulaire (côté serveur
 * comme côté client). Une redirection faite au montage se faisait doubler en
 * production par la fin de l'hydratation. Une inscription inachevée reste sur
 * la page pour être reprise.
 */
export default defineNuxtRouteMiddleware(to => {
  const user = useAuthUser()
  if (user.value && !needsOnboarding(user.value)) {
    return navigateTo(safeRedirect(to.query.redirect) ?? roleHomePath(user.value.role), { replace: true })
  }
})
