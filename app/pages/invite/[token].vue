<script setup lang="ts">
import { ArrowRight, Building, CircleAlert, CircleCheck, LogOut, MailX, RefreshCw } from '@lucide/vue'
import type { PublicInvitation, TeamRegistry } from '~/types/team'
import { ApiRequestError } from '~/utils/authenticatedFetcher'
import { errorText } from '~/utils/apiErrors'
import { expiryLabel, roleLabel as presetLabel } from '~/utils/team'

/**
 * Lien d'invitation d'équipe (`/invite/:token`) — c'est l'adresse que l'API met
 * dans l'e-mail d'invitation ; la page n'existait pas avant le Lot 53.
 * Le poste s'affiche avec son libellé (registre public `GET /team/permissions`), jamais
 * le code brut ; un compte connecté avec une autre adresse peut se déconnecter et revenir.
 */
const route = useRoute()
const token = String(route.params.token)
const teamApi = useTeamApi()
const authUser = useAuthUser()
const { accessToken } = useApiAuth()
const authApi = useAuthApi()

const invitation = ref<PublicInvitation | null>(null)
const registry = ref<TeamRegistry | null>(null)
const state = ref<'loading' | 'missing' | 'error' | 'ready' | 'accepted'>('loading')
const loading = ref(false)
const errorMessage = ref('')

async function load() {
  state.value = 'loading'
  try {
    invitation.value = await teamApi.fetchInvitation(token)
    state.value = 'ready'
  } catch (e) {
    state.value = e instanceof ApiRequestError && e.status === 404 ? 'missing' : 'error'
  }
}
onMounted(async () => {
  teamApi.fetchRegistry().then(r => { registry.value = r }).catch(() => undefined)
  await load()
  if (accessToken.value && !authUser.value) await authApi.fetchMe().catch(() => undefined)
})

/** Registre indisponible : le code est mis en forme (« gestionnaire » → « Gestionnaire ») plutôt qu'affiché brut. */
const posteLabel = computed(() => {
  const preset = invitation.value?.role_preset ?? ''
  if (!preset) return 'Non précisé'
  const label = presetLabel(registry.value, preset)
  return label === preset ? preset.charAt(0).toUpperCase() + preset.slice(1).replace(/_/g, ' ') : label
})
const expiry = computed(() => (invitation.value ? expiryLabel(invitation.value.expires_at) : null))
const expired = computed(() => !!invitation.value && (invitation.value.status !== 'pending' || !!expiry.value?.expired))
const loggedIn = computed(() => !!authUser.value)
const wrongAccount = computed(() => !!invitation.value && !!authUser.value?.email && authUser.value.email.toLowerCase() !== invitation.value.email.toLowerCase())
const loginLink = computed(() => ({ path: '/connexion', query: { redirect: `/invite/${token}` } }))

async function accept() {
  loading.value = true
  errorMessage.value = ''
  try {
    await teamApi.acceptInvitation(token)
    state.value = 'accepted'
  } catch (e) {
    errorMessage.value = e instanceof ApiRequestError ? errorText(e.mapped, "L'invitation n'a pas pu être acceptée.") : "L'invitation n'a pas pu être acceptée."
  } finally {
    loading.value = false
  }
}

/* Mauvais compte : déconnexion, puis connexion avec la bonne adresse et retour ici. */
const loggingOut = ref(false)
async function switchAccount() {
  loggingOut.value = true
  try {
    await authApi.logout()
    await navigateTo(loginLink.value)
  } finally {
    loggingOut.value = false
  }
}
</script>

<template>
  <div class="mx-auto max-w-[520px] animate-[im-fade_.3s_ease_backwards] px-4 py-12">
    <div class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5 sm:p-7">
      <DataSkeletonCard v-if="state === 'loading'" :height="140" :lines="2" />

      <div v-else-if="state === 'missing'" class="py-4 text-center">
        <span class="mx-auto grid h-[46px] w-[46px] place-items-center rounded-pill bg-green-50 text-green-700"><MailX class="h-5 w-5" :stroke-width="1.9" /></span>
        <h1 class="mb-0 mt-4 font-display text-[22px] font-bold tracking-[-.02em]">Invitation introuvable</h1>
        <p class="mx-auto mb-0 mt-2 max-w-[380px] text-[13.5px] leading-[1.6] text-[var(--text-muted)]">Ce lien n'est pas valide, ou l'invitation a déjà été acceptée. Demandez un nouveau lien à la personne qui vous a invité.</p>
        <NuxtLink to="/" class="mt-5 inline-flex items-center gap-1.5 text-[13px] font-bold text-green-700">Aller à l'accueil<ArrowRight class="h-4 w-4" :stroke-width="1.9" /></NuxtLink>
      </div>

      <div v-else-if="state === 'error' || !invitation" class="py-4 text-center">
        <span class="mx-auto grid h-[46px] w-[46px] place-items-center rounded-pill bg-danger-bg text-danger-fg"><CircleAlert class="h-5 w-5" :stroke-width="1.9" /></span>
        <h1 class="mb-0 mt-4 font-display text-[22px] font-bold tracking-[-.02em]">Invitation indisponible</h1>
        <p class="mx-auto mb-0 mt-2 max-w-[380px] text-[13.5px] leading-[1.6] text-[var(--text-muted)]">Impossible de la charger pour le moment. Le lien reste valable : réessayez dans un instant.</p>
        <CoreButton class="mt-5" @click="load"><span class="inline-flex items-center gap-1.5"><RefreshCw class="h-4 w-4" :stroke-width="1.9" />Réessayer</span></CoreButton>
      </div>

      <div v-else-if="state === 'accepted'" class="py-2 text-center">
        <span class="mx-auto grid h-[46px] w-[46px] animate-[im-pop_.5s_ease_both] place-items-center rounded-pill bg-ok-bg text-ok-fg"><CircleCheck class="h-6 w-6" :stroke-width="1.9" /></span>
        <h1 class="mb-0 mt-4 font-display text-[22px] font-bold tracking-[-.02em]">Bienvenue dans {{ invitation.team_name }}</h1>
        <p class="mx-auto mb-0 mt-2 max-w-[380px] text-[13.5px] leading-[1.6] text-[var(--text-muted)]">Invitation acceptée. Vous pouvez maintenant agir sur les biens qui vous ont été confiés, selon votre poste ({{ posteLabel }}).</p>
        <NuxtLink to="/pro/equipe" class="mt-5 flex h-12 items-center justify-center gap-1.5 rounded-md bg-[image:var(--action-primary)] text-[14px] font-bold text-white shadow-action">Voir mon équipe<ArrowRight class="h-4 w-4" :stroke-width="1.9" /></NuxtLink>
      </div>

      <template v-else>
        <div class="flex items-start gap-3.5">
          <span class="grid h-[46px] w-[46px] flex-none place-items-center rounded-pill bg-green-50 text-green-700"><Building class="h-5 w-5" :stroke-width="1.9" /></span>
          <div class="min-w-0 flex-1">
            <p class="m-0 text-label font-bold uppercase tracking-label text-[var(--text-faint)]">Invitation d'équipe</p>
            <h1 class="mb-0 mt-1 font-display text-[21px] font-bold leading-[1.25] tracking-[-.02em]">{{ invitation.owner_name || 'Un propriétaire' }} vous invite à rejoindre {{ invitation.team_name }}</h1>
          </div>
        </div>

        <div class="mt-4.5 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-page)] px-4">
          <div class="flex items-baseline justify-between gap-3 border-b border-sand-200 py-3">
            <span class="text-xs text-[var(--text-faint)]">Poste</span>
            <span class="text-right text-sm font-bold">{{ posteLabel }}</span>
          </div>
          <div class="flex items-baseline justify-between gap-3 border-b border-sand-200 py-3">
            <span class="flex-none text-xs text-[var(--text-faint)]">Biens confiés</span>
            <span class="text-right text-[13.5px] text-[var(--text-secondary)]">{{ invitation.properties.map(p => p.name).join(', ') || "Aucun pour l'instant" }}</span>
          </div>
          <div class="flex items-baseline justify-between gap-3 border-b border-sand-200 py-3">
            <span class="text-xs text-[var(--text-faint)]">Pour</span>
            <span class="min-w-0 truncate text-[13.5px] font-semibold">{{ invitation.email }}</span>
          </div>
          <div class="flex items-center justify-between gap-3 py-3">
            <span class="text-xs text-[var(--text-faint)]">Validité</span>
            <CoreBadge :tone="expired ? 'warn' : 'info'" bordered>{{ expired ? 'Expirée' : expiry?.text }}</CoreBadge>
          </div>
        </div>

        <p v-if="expired" class="mb-0 mt-4 rounded-md border border-warn-border bg-warn-bg px-3.5 py-3 text-[13px] leading-[1.55] text-warn-fg">Cette invitation n'est plus valable. Demandez-en une nouvelle à {{ invitation.owner_name || 'la personne qui vous a invité' }}.</p>

        <template v-else-if="!loggedIn">
          <p class="mb-0 mt-4 text-[13.5px] leading-[1.6] text-[var(--text-muted)]">Connectez-vous, ou créez votre compte, avec l'adresse <strong class="text-[var(--text-primary)]">{{ invitation.email }}</strong> : vous reviendrez ici pour accepter.</p>
          <NuxtLink :to="loginLink" class="mt-4 flex h-12 items-center justify-center gap-1.5 rounded-md bg-[image:var(--action-primary)] text-[14px] font-bold text-white shadow-action">Se connecter pour accepter<ArrowRight class="h-4 w-4" :stroke-width="1.9" /></NuxtLink>
        </template>

        <template v-else-if="wrongAccount">
          <p class="mb-0 mt-4 rounded-md border border-warn-border bg-warn-bg px-3.5 py-3 text-[13px] leading-[1.55] text-warn-fg">
            Vous êtes connecté avec <strong>{{ authUser?.email }}</strong>, mais l'invitation est destinée à <strong>{{ invitation.email }}</strong>.
          </p>
          <CoreButton size="lg" full-width class="mt-4" :disabled="loggingOut" @click="switchAccount">
            <span class="inline-flex items-center gap-1.5"><LogOut class="h-4 w-4" :stroke-width="1.9" />{{ loggingOut ? 'Déconnexion…' : 'Me déconnecter et revenir' }}</span>
          </CoreButton>
          <p class="mb-0 mt-2.5 text-center text-xs text-[var(--text-faint)]">Vous reviendrez sur cette invitation après la connexion avec {{ invitation.email }}.</p>
        </template>

        <template v-else>
          <p v-if="errorMessage" class="mb-0 mt-4 text-[13px] font-semibold text-danger-fg">{{ errorMessage }}</p>
          <CoreButton size="lg" full-width class="mt-4" :disabled="loading" @click="accept">{{ loading ? 'Un instant…' : "Accepter l'invitation" }}</CoreButton>
        </template>
      </template>
    </div>
  </div>
</template>
