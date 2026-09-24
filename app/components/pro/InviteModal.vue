<script setup lang="ts">
const modal = useProModal()
const open = computed(() => modal.value === 'invite')
const step = ref<'form' | 'done'>('form')
const email = ref('')
const poste = ref<'gestionnaire' | 'commercial' | 'comptable' | 'observateur'>('gestionnaire')
const biensSel = ref(['Résidence Étoile'])

watch(open, v => {
  if (v) {
    step.value = 'form'
    email.value = ''
    poste.value = 'gestionnaire'
    biensSel.value = ['Résidence Étoile']
  }
})

const ROLES = [
  { key: 'gestionnaire' as const, label: 'Gestionnaire' },
  { key: 'commercial' as const, label: 'Commercial' },
  { key: 'comptable' as const, label: 'Comptable' },
  { key: 'observateur' as const, label: 'Observateur' }
]

const PERMS: Record<string, string[]> = {
  gestionnaire: ['Voir les biens', 'Créer des baux', 'Relancer les impayés', 'Répondre aux messages'],
  commercial: ['Voir les biens', 'Traiter les demandes', 'Planifier des visites'],
  comptable: ['Voir les loyers', 'Relancer les impayés', 'Exporter la comptabilité'],
  observateur: ['Voir les biens', 'Voir les baux']
}
const posteLabel = computed(() => ROLES.find(r => r.key === poste.value)!.label)

const BIENS = ['Résidence Étoile', 'Duplex Les Cocotiers', 'Villa Cadjéhoun']
function toggleBien(name: string) {
  biensSel.value = biensSel.value.includes(name) ? biensSel.value.filter(x => x !== name) : [...biensSel.value, name]
}

const blocked = computed(() => !(email.value.trim() && biensSel.value.length))

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
      <div class="flex max-h-[90vh] w-[500px] max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-2xl bg-[var(--surface-page)] shadow-panel animate-[im-rise_.28s_var(--ease-standard)_both]" @click.stop>
        <div class="flex items-center justify-between border-b border-[var(--border-subtle)] px-6 py-4.5">
          <h3 class="m-0 font-display text-[19px] font-bold tracking-[-.02em]">Inviter un membre</h3>
          <button type="button" class="grid h-[34px] w-[34px] place-items-center rounded-pill bg-sand-200 text-[15px] text-sand-800" @click="close">✕</button>
        </div>

        <div class="overflow-y-auto p-6">
          <template v-if="step === 'form'">
            <p class="mb-2 mt-0 text-[13px] font-bold">Adresse email</p>
            <input v-model="email" placeholder="membre@email.bj" class="h-12 w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3.5 text-sm outline-none">

            <p class="mb-2 mt-4.5 text-[13px] font-bold">Poste</p>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="r in ROLES"
                :key="r.key"
                type="button"
                class="rounded-pill border-[1.5px] px-3.5 py-2.5 text-[13px] font-bold transition-all"
                :class="poste === r.key ? 'border-green-600 bg-green-600 text-white' : 'border-[var(--border-default)] bg-white text-[var(--text-secondary)]'"
                @click="poste = r.key"
              >{{ r.label }}</button>
            </div>

            <div class="mt-4 rounded-md border border-[var(--border-subtle)] bg-white p-4">
              <p class="mb-2.5 mt-0 text-xs font-black uppercase tracking-[.04em] text-[var(--text-faint)]">Droits de ce poste</p>
              <div class="flex flex-wrap gap-1.5">
                <span v-for="p in PERMS[poste]" :key="p" class="rounded-pill border border-green-100 bg-green-50 px-2.5 py-1.5 text-xs font-semibold text-green-800">✓ {{ p }}</span>
              </div>
            </div>

            <p class="mb-2 mt-4.5 text-[13px] font-bold">Biens accessibles</p>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="b in BIENS"
                :key="b"
                type="button"
                class="rounded-pill border px-3.5 py-2 text-[13px] font-semibold transition-all"
                :class="biensSel.includes(b) ? 'border-green-600 bg-green-50 text-green-700' : 'border-[var(--border-default)] bg-white text-[var(--text-secondary)]'"
                @click="toggleBien(b)"
              >{{ biensSel.includes(b) ? '✓ ' : '' }}{{ b }}</button>
            </div>

            <button
              type="button"
              class="mt-5.5 w-full rounded-md py-3.5 text-[15px] font-bold text-white transition-colors"
              :class="blocked ? 'cursor-not-allowed bg-sand-400' : 'cursor-pointer bg-[image:var(--action-primary)] shadow-action'"
              @click="submit"
            >Envoyer l'invitation</button>
          </template>

          <template v-else>
            <div class="px-0.5 py-1 text-center">
              <div class="mx-auto grid h-15 w-15 animate-[im-pop_.5s_ease] place-items-center rounded-pill bg-green-600 text-[28px] text-white">✓</div>
              <p class="mb-0 mt-4.5 text-lg font-bold">Invitation envoyée</p>
              <p class="mx-auto mb-0 mt-2.5 max-w-[340px] text-sm leading-[1.6] text-[var(--text-muted)]">{{ email }} recevra un email pour rejoindre l'équipe comme {{ posteLabel }}. L'invitation expire dans 7 jours.</p>
              <CoreButton size="lg" full-width class="mt-5.5" @click="close">Terminé</CoreButton>
            </div>
          </template>
        </div>
      </div>
    </div>
  </Teleport>
</template>
