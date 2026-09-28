<script setup lang="ts">
/** Monté dans le layout artisan ; le contenu est la modale commune aux trois espaces (Lot 55). */
const modal = useArtisanModal()
</script>

<template>
  <WalletWithdrawModal :open="modal === 'retrait'" @close="modal = ''" />
</template>
