import { verificationStage, type VerificationStage } from '~/utils/kycStatus'
import { protectedFileExists } from '~/utils/protectedFile'

/**
 * Droits liés à la vérification d'identité, partagés par tous les espaces.
 *
 * - `canAct` : l'API acceptera les actions gardées par `VerifiedUserGuard`
 *   (publier/modifier un bien, demander une visite, candidater…).
 * - `requireVerified('publier un bien')` : à appeler au clic sur une action
 *   verrouillée. Renvoie `true` si on peut continuer ; sinon ouvre la fenêtre
 *   explicative (`<LayoutVerificationGate>`, montée une fois dans app.vue) et
 *   renvoie `false`. Utilisation : `@click="requireVerified('…') && open()"`.
 *
 * Tant que l'utilisateur n'est pas chargé, on laisse passer : la page gère déjà
 * la connexion, et l'API reste le dernier rempart (403 traduit par apiErrors).
 */
export function useVerification() {
  const user = useAuthUser()
  /**
   * Dossier complet déposé (pièce d'identité + au moins un justificatif) ?
   * Même règle et mêmes sources que l'introduction de /kyc : `GET /kyc/documents/mine`
   * et `GET /user/:id/id-card` (200 = présente). `has_id_card` de /auth/me n'est pas fiable.
   * Chargé une fois par session, seulement pour un compte non vérifié.
   */
  const submitted = useState<{ userId: string; value: boolean } | null>('verification-submitted', () => null)
  const gate = useState<{ action: string; redirect: string } | null>('verification-gate', () => null)
  const route = useRoute()

  const stage = computed<VerificationStage>(() => verificationStage(user.value, submitted.value?.userId === user.value?.id && submitted.value?.value === true))
  const canAct = computed(() => !user.value || stage.value === 'verified')

  async function loadSubmitted() {
    const u = user.value
    if (!import.meta.client || !u || u.is_verified || submitted.value?.userId === u.id) return
    submitted.value = { userId: u.id, value: false }
    try {
      const kyc = useKycApi()
      const docs = await kyc.listMine()
      const idCard = docs.length ? await protectedFileExists(kyc.idCardDownloadUrl(u.id), useApiAuth().accessToken.value) : false
      submitted.value = { userId: u.id, value: docs.length > 0 && idCard === true }
    } catch {
      // Sans réponse, on reste sur « à faire » : le parcours /kyc affichera le vrai état.
    }
  }
  watch(() => user.value?.id, () => { void loadSubmitted() }, { immediate: true })

  /** Relit l'état du dossier — au montage d'un espace, pour refléter un dépôt fait entre-temps sur /kyc. */
  function refreshSubmitted() {
    if (submitted.value?.userId === user.value?.id) submitted.value = null
    return loadSubmitted()
  }

  function requireVerified(action: string) {
    if (canAct.value) return true
    gate.value = { action, redirect: route.fullPath }
    return false
  }

  function closeGate() {
    gate.value = null
  }

  return { stage, canAct, gate, requireVerified, closeGate, refreshSubmitted }
}
