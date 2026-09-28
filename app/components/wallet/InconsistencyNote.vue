<script setup lang="ts">
/**
 * Tirelire au-dessus du total, ou total négatif (#82) : on dit ce qui est
 * réellement utilisable plutôt que d'afficher deux chiffres contradictoires
 * sans explication (Lot 55).
 */
defineProps<{ compact?: boolean }>()
const wallet = useTenantWallet()
</script>

<template>
  <div v-if="wallet.state.value === 'success' && wallet.inconsistent.value" class="rounded-md border border-warn-border bg-warn-bg px-3.5 py-3 text-[12.5px] leading-[1.55] text-warn-fg" :class="compact ? 'mt-2.5' : 'mt-4.5'">
    <template v-if="wallet.balanceTotal.value < 0">
      <strong>Votre solde est négatif ({{ formatFcfa(wallet.balanceTotal.value) }}).</strong>
      Un paiement a été accepté au-delà de votre solde réel : aucun paiement ni retrait n'est possible avant une recharge.<template v-if="!compact"> Si vous ne vous l'expliquez pas, contactez le support Immo.</template>
    </template>
    <template v-else>
      <strong>Votre tirelire affiche {{ formatFcfa(wallet.balanceSavings.value) }}, mais votre solde total n'est que de {{ formatFcfa(wallet.balanceTotal.value) }}.</strong>
      Seuls {{ formatFcfa(wallet.spendable.value) }} sont réellement utilisables pour un paiement.
    </template>
  </div>
</template>
