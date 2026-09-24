import type {
  AuthSession,
  AuthUser,
  CheckEmailResult,
  RequestOtpResult,
  RolesResult,
  SetPasswordResult,
  SimpleSuccessResult,
  SwitchRoleResult,
  UserRole
} from '~/types/auth'
import { decideSessionOutcome, type SessionOutcome } from '~/utils/sessionOutcome'
import { ApiRequestError } from '~/utils/authenticatedFetcher'

/** Profil du connecté, alimenté par GET /auth/me. Null tant qu'on ne l'a pas résolu. */
export function useAuthUser() {
  return useState<AuthUser | null>('authUser', () => null)
}

/**
 * Toutes les opérations d'authentification. Voir 11-INTEGRATION-AUTH-ET-PUBLIC.md, I1.
 *
 * Les routes non authentifiées (check-email, login, request-otp, verify-otp,
 * google, forgot-password, reset-password) passent par usePublicApi() —
 * jamais par useApi(), pour ne pas déclencher un rafraîchissement de jeton
 * sur un simple échec de connexion.
 */
export function useAuthApi() {
  const pub = usePublicApi()
  const api = useApi()
  const { setTokens, clearTokens, refreshToken, isAuthenticated } = useApiAuth()
  const user = useAuthUser()

  async function checkEmail(email: string) {
    return pub.get<CheckEmailResult>('/auth/check-email', { email })
  }

  async function login(email: string, password: string): Promise<SessionOutcome> {
    const session = await pub.post<AuthSession>('/auth/login', { email, password })
    return afterAuth(session)
  }

  async function requestOtp(email: string, phoneNumber?: string) {
    return pub.post<RequestOtpResult>('/auth/request-otp', { email, phone_number: phoneNumber })
  }

  async function verifyOtp(email: string, code: string, phoneNumber?: string): Promise<SessionOutcome> {
    const session = await pub.post<AuthSession>('/auth/verify-otp', { email, code, phone_number: phoneNumber })
    return afterAuth(session)
  }

  async function loginWithGoogle(firebaseToken: string): Promise<SessionOutcome> {
    const session = await pub.post<AuthSession>('/auth/google', { firebase_token: firebaseToken })
    return afterAuth(session)
  }

  async function forgotPassword(email: string) {
    return pub.post<SimpleSuccessResult>('/auth/forgot-password', { email })
  }

  /** { email, new_password } + soit `code` (OTP), soit `recovery_code` (filet de secours). */
  async function resetPassword(payload: { email: string; new_password: string; code?: string; recovery_code?: string }) {
    return pub.post<SimpleSuccessResult>('/auth/reset-password', payload)
  }

  /** Créer, changer ou supprimer son mot de passe. Nécessite une session active. */
  async function setPassword(payload: { new_password?: string; current_password?: string; remove?: boolean }) {
    return api.post<SetPasswordResult>('/auth/password', payload)
  }

  async function logout() {
    try {
      await api.post<SimpleSuccessResult>('/auth/logout', { refresh_token: refreshToken.value })
    } catch {
      // Révocation en meilleur effort — on efface les jetons localement même si
      // le serveur ne répond pas ou est indisponible.
    } finally {
      clearTokens()
      user.value = null
    }
  }

  async function fetchMe(): Promise<AuthUser | null> {
    try {
      const me = await api.get<AuthUser>('/auth/me')
      user.value = me
      return me
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 404) {
        // Compte tout juste créé, pas encore finalisé côté backend. Normal, voir I1 point 5 :
        // à contourner avec une identité minimale en attendant que le backend renvoie 'pending'.
        return null
      }
      throw err
    }
  }

  async function fetchRoles() {
    return api.get<RolesResult>('/auth/roles')
  }

  async function switchRole(role: UserRole) {
    const res = await api.post<SwitchRoleResult>('/auth/switch-role', { role })
    setTokens({ accessToken: res.token, refreshToken: res.refresh_token })
    await fetchMe()
    return res
  }

  /** Pose les jetons puis résout le statut réel du compte via GET /auth/me. */
  async function afterAuth(session: AuthSession): Promise<SessionOutcome> {
    setTokens({ accessToken: session.token, refreshToken: session.refresh_token })
    const me = await fetchMe()
    const outcome = decideSessionOutcome(me, session.is_new_user ?? false)
    if (outcome.kind === 'banned') {
      clearTokens()
      user.value = null
    }
    return outcome
  }

  return {
    user,
    isAuthenticated,
    checkEmail,
    login,
    requestOtp,
    verifyOtp,
    loginWithGoogle,
    forgotPassword,
    resetPassword,
    setPassword,
    logout,
    fetchMe,
    fetchRoles,
    switchRole
  }
}
