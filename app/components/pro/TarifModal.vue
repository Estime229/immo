<script setup lang="ts">
const modal = useProModal()
const open = computed(() => modal.value === 'tarif')
const step = ref<'form' | 'done'>('form')
const freq = ref<'nuit' | 'semaine' | 'mois'>('nuit')
const prix = ref('')

watch(open, v => {
  if (v) {
    step.value = 'form'
    freq.value = 'nuit'
    prix.value = ''
  }
})

const FREQS = [
  { key: 'nuit' as const, label: 'À la nuit' },
  { key: 'semaine' as const, label: 'À la semaine' },
  { key: 'mois' as const, label: 'Au mois' }
]

function onPrixInput(e: Event) {
  const digits = (e.target as HTMLInputElement).value.replace(/\D/g, '')
  prix.value = digits ? Number(digits).toLocaleString('fr-FR').replace(/ |,/g, ' ') : ''
}
const blocked = computed(() => !prix.value.trim())

function close() {
  modal.value = ''
}
function submit() {
  if (!blocked.value) step.value = 'done'
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="fixed inset-0 z-[90] grid animate-[im-veil_.22s_ease_both] place-items-center bg-black/50 p-6 backdrop-blur-[3px]" @click="close">
      <div class="w-[440px] max-w-[calc(100vw-3rem)] rounded-2xl bg-[var(--surface-page)] p-6.5 animate-[im-rise_.28s_var(--ease-standard)_both]" @click.stop>
        <template v-if="step === 'form'">
          <h3 class="m-0 font-display text-xl font-bold tracking-[-.02em]">Ajouter un tarif — Studio B1</h3>
          <p class="mb-4 mt-2.5 text-[13.5px] text-[var(--text-muted)]">Définissez une grille selon la durée de location.</p>

          <p class="mb-2 mt-0 text-[12.5px] font-bold">Fréquence</p>
          <div class="mb-4 flex gap-2">
            <button
              v-for="f in FREQS"
              :key="f.key"
              type="button"
              class="flex-1 rounded-md border-[1.5px] py-2.5 text-[12.5px] font-bold transition-all"
              :class="freq === f.key ? 'border-green-600 bg-green-600 text-white' : 'border-[var(--border-default)] bg-white text-[var(--text-secondary)]'"
              @click="freq = f.key"
            >{{ f.label }}</button>
          </div>

          <p class="mb-2 mt-0 text-[12.5px] font-bold">Prix</p>
          <div class="flex items-baseline gap-2 rounded-md border border-[var(--border-default)] bg-white px-[17px] py-3.5">
            <input :value="prix" inputmode="numeric" placeholder="0" class="min-w-0 flex-1 border-0 bg-transparent font-mono text-2xl font-bold outline-none" @input="onPrixInput">
            <span class="font-mono text-[15px] font-bold text-[var(--text-faint)]">FCFA</span>
          </div>

          <button
            type="button"
            class="mt-5 w-full rounded-md py-3.5 text-[15px] font-bold text-white transition-colors"
            :class="blocked ? 'cursor-not-allowed bg-sand-400' : 'cursor-pointer bg-[image:var(--action-primary)] shadow-action'"
            @click="submit"
          >Ajouter le tarif</button>
        </template>
        <template v-else>
          <div class="px-0.5 py-1 text-center">
            <div class="mx-auto grid h-15 w-15 animate-[im-pop_.5s_ease] place-items-center rounded-pill bg-green-600 text-[28px] text-white">✓</div>
            <p class="mb-0 mt-4.5 text-lg font-bold">Tarif ajouté</p>
            <p class="mx-auto mb-0 mt-2.5 max-w-[300px] text-sm leading-[1.6] text-[var(--text-muted)]">La nouvelle grille apparaît dans les tarifs du Studio B1.</p>
            <CoreButton size="lg" full-width class="mt-5" @click="close">Terminé</CoreButton>
          </div>
        </template>
      </div>
    </div>
  </Teleport>
</template>
