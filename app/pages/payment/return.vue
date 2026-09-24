<script setup lang="ts">
import { ApiRequestError } from '~/utils/authenticatedFetcher'

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
 */
const route = useRoute()
const paymentApi = usePaymentApi()

const state = ref<'verifying' | 'success' | 'error'>('verifying')
const message = ref('')

onMounted(async () => {
  const gateway = String(route.query.gateway ?? '')
  const transactionId = String(
    route.query.transaction_id ?? route.query.transactionId ?? route.query.id ?? route.query.token ?? ''
  )

  if (!gateway || !transactionId) {
    state.value = 'error'
    message.value = "Impossible d'identifier ce paiement depuis cette page. Consultez votre wallet pour vérifier s'il a bien été pris en compte."
    return
  }

  try {
    const result = await paymentApi.verifyReturn(transactionId, gateway)
    if (result.verified) {
      state.value = 'success'
      message.value = result.alreadyCredited ? 'Ce paiement avait déjà été confirmé.' : 'Votre paiement est confirmé.'
    } else {
      state.value = 'error'
      message.value = "Ce paiement n'a pas pu être confirmé. S'il a été débité, contactez le support avant de réessayer."
    }
  } catch (e) {
    state.value = 'error'
    message.value = e instanceof ApiRequestError ? (e.mapped.bannerMessage ?? 'Une erreur est survenue.') : 'Une erreur est survenue.'
  }
})
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-[var(--surface-page)] p-6">
    <div class="w-full max-w-[440px] rounded-2xl border border-[var(--border-subtle)] bg-white p-8 text-center">
      <template v-if="state === 'verifying'">
        <div class="mx-auto h-14 w-14 animate-[im-spin_.9s_linear_infinite] rounded-pill border-[3px] border-green-100" style="border-top-color: var(--color-green-600)" />
        <p class="mb-0 mt-5 text-base font-bold">Vérification de votre paiement…</p>
      </template>
      <template v-else-if="state === 'success'">
        <div class="mx-auto grid h-16 w-16 place-items-center rounded-pill bg-green-600 text-[30px] text-white">✓</div>
        <p class="mb-0 mt-5 text-lg font-bold">Paiement confirmé</p>
        <p class="mx-auto mb-0 mt-2.5 max-w-[320px] text-sm leading-[1.6] text-[var(--text-muted)]">{{ message }}</p>
        <NuxtLink to="/locataire/wallet" class="mt-5 inline-block rounded-md bg-[image:var(--action-primary)] px-6 py-3 text-sm font-bold text-white shadow-action">Voir mon wallet</NuxtLink>
      </template>
      <template v-else>
        <div class="mx-auto grid h-16 w-16 place-items-center rounded-pill bg-danger-bg text-2xl text-danger-fg">✕</div>
        <p class="mb-0 mt-5 text-lg font-bold">Vérification impossible</p>
        <p class="mx-auto mb-0 mt-2.5 max-w-[320px] text-sm leading-[1.6] text-[var(--text-muted)]">{{ message }}</p>
        <NuxtLink to="/locataire/wallet" class="mt-5 inline-block rounded-md border border-[var(--border-default)] bg-white px-6 py-3 text-sm font-bold">Voir mon wallet</NuxtLink>
      </template>
    </div>
  </div>
</template>
