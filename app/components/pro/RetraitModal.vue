<script setup lang="ts">
/** Monté dans le layout pro ; le contenu est la modale commune aux trois espaces (Lot 55). */
const modal = useProModal()
</script>

<template>
  <WalletWithdrawModal :open="modal === 'retrait'" @close="modal = ''" />
</template>
