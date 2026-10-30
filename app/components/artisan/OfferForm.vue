<script setup lang="ts">
import { Lock } from '@lucide/vue'
import { paymentSplit } from '~/utils/artisanRequests'

/**
 * Champs d'une offre (prix, garantie, retenue), partagés par la modale « Faire une offre » et le
 * panneau de négociation. Avant : deux formulaires, deux règles (retenue plafonnée à 30 % dans
 * l'un, 0–100 % dans l'autre) et un prix prérempli inventé. La validation reste chez le parent,
 * qui appelle `validateOffer` et passe le message ici.
 */
withDefaults(defineProps<{ side?: 'artisan' | 'requester'; error?: string }>(), { side: 'artisan', error: '' })

const price = defineModel<string>('price', { required: true })
const warrantyDays = defineModel<string>('warrantyDays', { required: true })
const retention = defineModel<string>('retention', { required: true })

function onPriceInput(e: Event) {
  const digits = (e.target as HTMLInputElement).value.replace(/\D/g, '').replace(/^0+(?=\d)/, '')
  price.value = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
}

const priceNum = computed(() => Number(price.value.replace(/\s/g, '')) || 0)
const split = computed(() => paymentSplit(priceNum.value, Math.min(100, Math.max(0, Number(retention.value) || 0))))
</script>

<template>
  <div>
    <label class="block">
      <span class="mb-[7px] block text-[12.5px] font-bold">Prix de l'intervention</span>
      <span class="flex h-[52px] items-center gap-2 rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-[15px] focus-within:border-green-600">
        <input
          :value="price"
          inputmode="numeric"
          autocomplete="off"
          placeholder="Ex. 25 000"
          aria-label="Prix en FCFA"
          class="min-w-0 flex-1 border-0 bg-transparent font-mono text-[19px] font-bold text-[var(--text-primary)] outline-none placeholder:font-body placeholder:text-[14.5px] placeholder:font-normal placeholder:text-[var(--text-faint)]"
          @input="onPriceInput"
        >
        <span class="font-mono text-[13px] font-bold text-[var(--text-faint)]">FCFA</span>
      </span>
      <span class="mt-[7px] block text-[12.5px] text-[var(--text-faint)]">Main-d'œuvre et fournitures comprises.</span>
    </label>

    <div class="mt-4 grid grid-cols-2 gap-3">
      <FormsInput v-model="warrantyDays" type="number" label="Garantie (jours)" hint="De 0 à 90 jours" mono />
      <FormsInput v-model="retention" type="number" label="Retenue (%)" hint="Gardée par Immo pendant la garantie" mono />
    </div>

    <div v-if="priceNum > 0" class="mt-4 rounded-md border border-[var(--border-escrow)] bg-[var(--surface-escrow)] px-4 py-3">
      <div class="flex items-center justify-between gap-3 py-0.5 text-[13px] text-ok-fg">
        <span>{{ side === 'artisan' ? 'Perçu au paiement' : "Versé à l'artisan au paiement" }}</span>
        <span class="font-mono font-bold">{{ formatFcfa(split.immediate) }}</span>
      </div>
      <div class="flex items-center justify-between gap-3 py-0.5 text-[13px] text-clay-700">
        <span class="inline-flex items-center gap-1.5"><Lock class="h-3.5 w-3.5" :stroke-width="1.9" aria-hidden="true" />Retenu jusqu'à la fin de la garantie</span>
        <span class="font-mono font-bold">{{ formatFcfa(split.retained) }}</span>
      </div>
    </div>

    <p v-if="error" class="mb-0 mt-3 text-[13px] font-semibold text-danger-fg">{{ error }}</p>
  </div>
</template>
