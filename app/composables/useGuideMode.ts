/**
 * Mode guide : un interrupteur (menu de l'avatar) qui affiche de courtes explications sur chaque
 * page des espaces. Un seul réglage pour les trois espaces ; cookie plutôt que localStorage pour
 * que le serveur le lise au rendu et évite le flash avant hydratation.
 */
export function useGuideMode() {
  const cookie = useCookie<string | null>('bayo_guide_mode', {
    default: () => null,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365
  })
  const enabled = computed(() => cookie.value === '1')
  function toggle() { cookie.value = enabled.value ? null : '1' }
  return { enabled, toggle }
}
