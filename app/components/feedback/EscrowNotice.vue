<script setup lang="ts">
/** Encadré séquestre — le motif signature d'Immo. */
interface EscrowNoticeProps {
  /** Phrase-montant en mono, ex. "Dont 13 662 FCFA retenus en garantie" */
  amount: string
}

defineProps<EscrowNoticeProps>()
</script>

<template>
  <div class="rounded-md border border-[var(--border-escrow)] bg-[var(--surface-escrow)] p-[13px] font-body">
    <p class="m-0 font-mono text-[13.5px] font-bold text-[var(--text-money-locked)]">{{ amount }}</p>
    <p class="mb-0 mt-[5px] text-[12.5px] leading-[1.5] text-clay-900"><slot /></p>
  </div>
</template>
