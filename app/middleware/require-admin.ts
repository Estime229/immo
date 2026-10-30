import type { Permission } from '~/composables/useAdminLevels'

/**
 * Garde des pages /admin/* (hors /admin/login). Les permissions ne sont qu'un confort d'interface :
 * la vraie protection reste côté API (403 si le niveau ne suffit pas).
 */
export default defineNuxtRouteMiddleware(async (to) => {
  const { auth, hasPermission, ensureSession } = useAdminAuth()
  await ensureSession()
  if (!auth.value.loggedIn) return navigateTo(`/admin/login?redirect=${encodeURIComponent(to.fullPath)}`)

  const required = to.meta.requiredPermission as Permission | Permission[] | undefined
  const permissions = Array.isArray(required) ? required : required ? [required] : []
  if (permissions.length && !permissions.some(p => hasPermission(p))) return navigateTo('/admin')
})
