<script setup lang="ts">
import type { PublicInvitation } from '~/types/team'
import { ApiRequestError } from '~/utils/authenticatedFetcher'
import { errorText } from '~/utils/apiErrors'
import { expiryLabel } from '~/utils/team'

/**
 * Lien d'invitation d'équipe (`/invite/:token`) — c'est l'adresse que l'API met
 * dans l'e-mail d'invitation ; la page n'existait pas avant le Lot 53.
 */
const route = useRoute()
const token = String(route.params.token)
const teamApi = useTeamApi()
const authUser = useAuthUser()
const { accessToken } = useApiAuth()
const authApi = useAuthApi()

const invitation = ref<PublicInvitation | null>(null)
const state = ref<'loading' | 'missing' | 'error' | 'ready' | 'accepted'>('loading')
const loading = ref(false)
const errorMessage = ref('')

onMounted(async () => {
  try {
    invitation.value = await teamApi.fetchInvitation(token)
    state.value = 'ready'
  } catch (e) {
    state.value = e instanceof ApiRequestError && e.status === 404 ? 'missing' : 'error'
  }
  if (accessToken.value && !authUser.value) await authApi.fetchMe().catch(() => undefined)
})

const expired = computed(() => !!invitation.value && (invitation.value.status !== 'pending' || expiryLabel(invitation.value.expires_at).expired))
const loggedIn = computed(() => !!authUser.value)
const wrongAccount = computed(() => !!invitation.value && !!authUser.value?.email && authUser.value.email.toLowerCase() !== invitation.value.email.toLowerCase())
const loginLink = computed(() => `/connexion?redirect=${encodeURIComponent(`/invite/${token}`)}`)

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
</script>

<template>
  <div class="mx-auto max-w-[520px] px-4 py-12">
    <div class="rounded-2xl border border-[var(--border-subtle)] bg-white p-7">
      <DataSkeletonCard v-if="state === 'loading'" :height="140" :lines="2" />

      <template v-else-if="state === 'missing'">
        <h1 class="m-0 font-display text-[22px] font-bold tracking-[-.02em]">Invitation introuvable</h1>
        <p class="mb-0 mt-2.5 text-[14px] leading-[1.6] text-[var(--text-muted)]">Ce lien n'est pas valide, ou l'invitation a déjà été acceptée. Demandez un nouveau lien à la personne qui vous a invité.</p>
      </template>

      <template v-else-if="state === 'error' || !invitation">
        <h1 class="m-0 font-display text-[22px] font-bold tracking-[-.02em]">Invitation indisponible</h1>
        <p class="mb-0 mt-2.5 text-[14px] text-[var(--text-muted)]">Impossible de la charger pour le moment. Réessayez dans un instant.</p>
      </template>

      <template v-else-if="state === 'accepted'">
        <div class="mx-auto grid h-14 w-14 place-items-center rounded-pill bg-green-600 text-2xl text-white">✓</div>
        <h1 class="mb-0 mt-4 text-center font-display text-[22px] font-bold tracking-[-.02em]">Bienvenue dans {{ invitation.team_name }}</h1>
        <p class="mb-0 mt-2.5 text-center text-[14px] leading-[1.6] text-[var(--text-muted)]">Vous pouvez maintenant agir sur les biens qui vous ont été confiés.</p>
        <NuxtLink to="/pro/equipe" class="mt-5 flex h-12 items-center justify-center rounded-md bg-[image:var(--action-primary)] text-[14px] font-bold text-white">Voir mon équipe</NuxtLink>
      </template>

      <template v-else>
        <p class="m-0 text-[12px] font-black uppercase tracking-[.05em] text-[var(--text-faint)]">Invitation d'équipe</p>
        <h1 class="mb-0 mt-2 font-display text-[22px] font-bold tracking-[-.02em]">{{ invitation.owner_name || 'Un propriétaire' }} vous invite à rejoindre {{ invitation.team_name }}</h1>
        <div class="mt-4 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-page)] p-4 text-[13.5px] leading-[1.6]">
          <p class="m-0"><strong>Poste :</strong> {{ invitation.role_preset }}</p>
          <p class="m-0"><strong>Biens confiés :</strong> {{ invitation.properties.map(p => p.name).join(', ') || 'aucun pour l\'instant' }}</p>
          <p class="m-0"><strong>Pour :</strong> {{ invitation.email }}</p>
          <p class="m-0 text-[var(--text-muted)]">Invitation {{ expiryLabel(invitation.expires_at).text }}.</p>
        </div>

        <p v-if="expired" class="mb-0 mt-4 rounded-md border border-warn-border bg-warn-bg p-3.5 text-[13px] text-warn-fg">Cette invitation n'est plus valable. Demandez-en une nouvelle.</p>
        <template v-else-if="!loggedIn">
          <p class="mb-0 mt-4 text-[13.5px] leading-[1.6] text-[var(--text-secondary)]">Connectez-vous, ou créez votre compte, avec l'adresse <strong>{{ invitation.email }}</strong> : vous reviendrez ici pour accepter.</p>
          <NuxtLink :to="loginLink" class="mt-4 flex h-12 items-center justify-center rounded-md bg-[image:var(--action-primary)] text-[14px] font-bold text-white">Se connecter pour accepter</NuxtLink>
        </template>
        <template v-else>
          <p v-if="wrongAccount" class="mb-0 mt-4 rounded-md border border-warn-border bg-warn-bg p-3.5 text-[13px] leading-[1.55] text-warn-fg">
            Vous êtes connecté avec {{ authUser?.email }}, mais l'invitation est destinée à {{ invitation.email }}. Déconnectez-vous et reconnectez-vous avec la bonne adresse.
          </p>
          <p v-if="errorMessage" class="mb-0 mt-4 rounded-md border border-danger-border bg-danger-bg px-3.5 py-2.5 text-[13px] font-semibold text-danger-fg">{{ errorMessage }}</p>
          <CoreButton size="lg" full-width class="mt-4" :disabled="loading || wrongAccount" @click="accept">{{ loading ? 'Un instant…' : "Accepter l'invitation" }}</CoreButton>
        </template>
      </template>
    </div>
  </div>
</template>
