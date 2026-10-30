<script setup lang="ts">
import { ArrowRight, CircleAlert, CircleCheck, Hourglass, LogIn, RefreshCw } from '@lucide/vue'
import { ApiRequestError } from '~/utils/authenticatedFetcher'
import { errorText } from '~/utils/apiErrors'

definePageMeta({ layout: 'blank' })

/**
 * Cible du callback des passerelles en mode `redirect` (FedaPay) —
 * `${appUrl}/payment/return?gateway=fedapay`. Cette route n'existait pas
 * avant ce lot ; un retour de paiement atterrissait sur un 404 (IL4 point 2).
 *
 * Le nom exact du paramètre transportant l'identifiant de transaction dans
 * l'URL de callback est décidé par la passerelle externe, pas par notre API —
 * non vérifiable sans un vrai retour FedaPay. Plusieurs noms plausibles sont
 * tentés ; si aucun ne correspond, message explicite plutôt qu'un échec silencieux.
 *
 * Le paiement en mode redirect est une recharge lancée depuis la fenêtre de paiement de
 * l'espace locataire, qui a ouvert FedaPay dans un nouvel onglet : la page ne sait pas
 * pour quoi la recharge était faite (loyer, réservation), elle propose donc de revenir à
 * l'onglet d'origine, où « J'ai terminé le paiement » attend, ou d'ouvrir l'espace.
 */
const route = useRoute()
const paymentApi = usePaymentApi()
const { accessToken } = useApiAuth()

type State = 'verifying' | 'success' | 'pending' | 'error' | 'session' | 'unknown'
const state = ref<State>('verifying')
const message = ref('')
const amount = ref<number | null>(null)
const alreadyCredited = ref(false)

const gateway = computed(() => String(route.query.gateway ?? ''))
const transactionId = computed(() => String(route.query.transaction_id ?? route.query.transactionId ?? route.query.id ?? route.query.token ?? ''))
const loginLink = computed(() => ({ path: '/connexion', query: { redirect: route.fullPath } }))
const supportLink = { path: '/contact', query: { sujet: 'Problème de paiement' } }

async function verify() {
  if (!gateway.value || !transactionId.value) {
    state.value = 'unknown'
    return
  }
  // Sans session, verify-return répondrait 401 : on le dit avant, avec un retour ici après la connexion.
  if (!accessToken.value) {
    state.value = 'session'
    return
  }
  state.value = 'verifying'
  message.value = ''
  try {
    const result = await paymentApi.verifyReturn(transactionId.value, gateway.value)
    if (result.verified) {
      amount.value = Number(result.amount) || null
      alreadyCredited.value = result.alreadyCredited
      state.value = 'success'
    } else {
      state.value = 'pending'
    }
  } catch (e) {
    if (e instanceof ApiRequestError && e.status === 401) {
      state.value = 'session'
      return
    }
    state.value = 'error'
    message.value = e instanceof ApiRequestError ? errorText(e.mapped, 'La vérification a échoué.') : 'La vérification a échoué.'
  }
}
onMounted(verify)

/* Onglet ouvert par la fenêtre de paiement : on peut le fermer pour revenir à l'onglet d'origine. */
const hasOpener = ref(false)
const closeFailed = ref(false)
onMounted(() => {
  try {
    hasOpener.value = !!window.opener && !window.opener.closed
  } catch {
    hasOpener.value = false
  }
})
function closeTab() {
  window.close()
  // Certains navigateurs refusent de fermer un onglet passé par un autre site : on le dit.
  setTimeout(() => { closeFailed.value = true }, 400)
}

const amountLabel = computed(() => (amount.value ? formatFcfa(amount.value) : ''))
</script>

<template>
  <div class="flex min-h-screen flex-col items-center justify-center bg-[var(--surface-page)] p-6">
    <NuxtLink to="/" class="mb-6 flex items-center gap-2.5" aria-label="Accueil Immo">
      <img src="/images/logo.png" alt="" class="h-8 w-8 rounded-[9px]" width="32" height="32">
      <span class="font-display text-xl font-extrabold tracking-[-.025em] text-green-900">Immo</span>
    </NuxtLink>

    <div class="w-full max-w-[460px] animate-[im-fade_.3s_ease_backwards] rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5 text-center sm:p-8">
      <!-- Vérification en cours -->
      <template v-if="state === 'verifying'">
        <div class="mx-auto h-[46px] w-[46px] animate-[im-spin_.9s_linear_infinite] rounded-pill border-[3px] border-green-100" style="border-top-color: var(--color-green-600)" />
        <p class="mb-0 mt-4 text-[15px] font-bold">Vérification de votre paiement…</p>
        <p class="mb-0 mt-1.5 text-[13.5px] text-[var(--text-muted)]">Ne fermez pas cette page.</p>
      </template>

      <!-- Paiement confirmé -->
      <template v-else-if="state === 'success'">
        <span class="mx-auto grid h-[46px] w-[46px] animate-[im-pop_.5s_ease_both] place-items-center rounded-pill bg-ok-bg text-ok-fg"><CircleCheck class="h-6 w-6" :stroke-width="1.9" /></span>
        <h1 class="mb-0 mt-4 font-display text-[22px] font-bold tracking-[-.02em]">Recharge confirmée</h1>
        <p class="mx-auto mb-0 mt-2 max-w-[340px] text-[13.5px] leading-[1.6] text-[var(--text-muted)]">
          <template v-if="alreadyCredited">Ce paiement avait déjà été confirmé : rien n'a été crédité une seconde fois.</template>
          <template v-else-if="amountLabel"><span class="font-mono font-bold text-green-900">{{ amountLabel }}</span> crédités sur votre tirelire, pour payer un loyer ou une réservation.</template>
          <template v-else>Le montant est crédité sur votre tirelire, pour payer un loyer ou une réservation.</template>
        </p>

        <div class="mt-5 rounded-md border border-info-border bg-info-bg px-3.5 py-3 text-left text-[13px] leading-[1.55] text-info-fg-deep">
          Vous aviez lancé ce paiement depuis un autre onglet Immo ? Revenez-y et touchez « J'ai terminé le paiement » : votre loyer ou votre réservation vous y attend.
        </div>

        <div class="mt-5 flex flex-col gap-2.5">
          <template v-if="hasOpener && !closeFailed">
            <CoreButton full-width @click="closeTab">Revenir à l'onglet du paiement</CoreButton>
            <NuxtLink to="/locataire/wallet" class="rounded-pill border border-[var(--border-default)] bg-white px-4 py-[9px] text-[13px] font-bold text-sand-900">Voir ma tirelire ici</NuxtLink>
          </template>
          <template v-else>
            <p v-if="closeFailed" class="m-0 text-[12.5px] text-[var(--text-muted)]">Le navigateur n'a pas fermé cet onglet : fermez-le vous-même, ou continuez ici.</p>
            <NuxtLink to="/locataire/wallet" class="flex items-center justify-center gap-1.5 rounded-md bg-[image:var(--action-primary)] px-5 py-3 text-[14px] font-bold text-white shadow-action">
              Voir ma tirelire<ArrowRight class="h-4 w-4" :stroke-width="1.9" />
            </NuxtLink>
          </template>
          <div class="flex flex-wrap justify-center gap-x-4 gap-y-1.5 pt-1">
            <NuxtLink to="/locataire/bail" class="text-[13px] font-bold text-green-700">Payer mon loyer</NuxtLink>
            <NuxtLink to="/locataire/reservations" class="text-[13px] font-bold text-green-700">Mes réservations</NuxtLink>
          </div>
        </div>
      </template>

      <!-- La passerelle ne confirme pas (encore) -->
      <template v-else-if="state === 'pending'">
        <span class="mx-auto grid h-[46px] w-[46px] place-items-center rounded-pill bg-warn-bg text-warn-fg"><Hourglass class="h-5 w-5" :stroke-width="1.9" /></span>
        <h1 class="mb-0 mt-4 font-display text-[22px] font-bold tracking-[-.02em]">Paiement pas encore confirmé</h1>
        <p class="mx-auto mb-0 mt-2 max-w-[360px] text-[13.5px] leading-[1.6] text-[var(--text-muted)]">
          FedaPay ne confirme pas encore ce paiement. S'il vient de se terminer, réessayez dans quelques secondes. S'il a été débité et reste non confirmé, ne payez pas une seconde fois : écrivez-nous.
        </p>
        <div class="mt-5 flex flex-col gap-2.5">
          <CoreButton full-width @click="verify"><span class="inline-flex items-center gap-1.5"><RefreshCw class="h-4 w-4" :stroke-width="1.9" />Réessayer la vérification</span></CoreButton>
          <NuxtLink :to="supportLink" class="rounded-pill border border-[var(--border-default)] bg-white px-4 py-[9px] text-[13px] font-bold text-sand-900">Signaler un problème de paiement</NuxtLink>
        </div>
      </template>

      <!-- Session absente ou expirée -->
      <template v-else-if="state === 'session'">
        <span class="mx-auto grid h-[46px] w-[46px] place-items-center rounded-pill bg-green-50 text-green-700"><LogIn class="h-5 w-5" :stroke-width="1.9" /></span>
        <h1 class="mb-0 mt-4 font-display text-[22px] font-bold tracking-[-.02em]">Connectez-vous pour vérifier ce paiement</h1>
        <p class="mx-auto mb-0 mt-2 max-w-[340px] text-[13.5px] leading-[1.6] text-[var(--text-muted)]">
          Votre session a expiré dans cet onglet. Après la connexion, vous reviendrez ici et la vérification reprendra.
        </p>
        <NuxtLink :to="loginLink" class="mt-5 flex items-center justify-center gap-1.5 rounded-md bg-[image:var(--action-primary)] px-5 py-3 text-[14px] font-bold text-white shadow-action">
          Se connecter<ArrowRight class="h-4 w-4" :stroke-width="1.9" />
        </NuxtLink>
      </template>

      <!-- Erreur de vérification, ou retour sans identifiant de paiement -->
      <template v-else>
        <span class="mx-auto grid h-[46px] w-[46px] place-items-center rounded-pill bg-danger-bg text-danger-fg"><CircleAlert class="h-5 w-5" :stroke-width="1.9" /></span>
        <h1 class="mb-0 mt-4 font-display text-[22px] font-bold tracking-[-.02em]">Vérification impossible</h1>
        <p class="mx-auto mb-0 mt-2 max-w-[360px] text-[13.5px] leading-[1.6] text-[var(--text-muted)]">
          <template v-if="state === 'unknown'">Cette page ne permet pas d'identifier le paiement. Consultez votre tirelire pour voir s'il a été pris en compte.</template>
          <template v-else>{{ message }} S'il a été débité, ne payez pas une seconde fois : réessayez la vérification ou écrivez-nous.</template>
        </p>
        <div class="mt-5 flex flex-col gap-2.5">
          <CoreButton v-if="state === 'error'" full-width @click="verify"><span class="inline-flex items-center gap-1.5"><RefreshCw class="h-4 w-4" :stroke-width="1.9" />Réessayer la vérification</span></CoreButton>
          <NuxtLink v-else to="/locataire/wallet" class="flex items-center justify-center gap-1.5 rounded-md bg-[image:var(--action-primary)] px-5 py-3 text-[14px] font-bold text-white shadow-action">
            Voir ma tirelire<ArrowRight class="h-4 w-4" :stroke-width="1.9" />
          </NuxtLink>
          <NuxtLink :to="supportLink" class="rounded-pill border border-[var(--border-default)] bg-white px-4 py-[9px] text-[13px] font-bold text-sand-900">Signaler un problème de paiement</NuxtLink>
        </div>
      </template>
    </div>
  </div>
</template>
