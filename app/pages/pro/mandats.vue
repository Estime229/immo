<script setup lang="ts">
definePageMeta({ layout: 'pro' })

const { flash } = useFlashModal()

const tab = ref<'donnes' | 'recus'>('donnes')

const MANDATS_DONNES = [
  {
    name: 'Judicaël Adjovi', color: 'var(--color-green-700)', role: 'Agent', since: 'mars 2026', status: 'Actif', tone: 'ok' as const,
    biens: [{ name: 'Résidence Étoile', photo: PRO_PHOTOS[0] }, { name: 'Duplex Les Cocotiers', photo: PRO_PHOTOS[1] }],
    canAssign: true, canRespond: false
  },
  {
    name: 'Amina Sanni', color: 'var(--color-clay-500)', role: 'Agence', since: 'janv. 2026', status: 'Actif', tone: 'ok' as const,
    biens: [], canAssign: true, canRespond: false
  },
  {
    name: 'Rodrigue Hounkpe', color: 'var(--color-info-fg)', role: 'Agent', since: '—', status: 'Révoqué', tone: 'neutral' as const,
    biens: [], canAssign: false, canRespond: false
  }
]

const MANDATS_RECUS = [
  {
    name: 'Koffi Dossou', color: 'var(--color-green-700)', role: 'Bailleur', since: '—', status: 'En attente', tone: 'warn' as const,
    biens: [{ name: 'Villa Cadjéhoun', photo: PRO_PHOTOS[3] }], canAssign: false, canRespond: true
  }
]

const mandats = computed(() => (tab.value === 'donnes' ? MANDATS_DONNES : MANDATS_RECUS))

function accept(name: string) {
  flash('Mandat accepté', `Vous gérez désormais les biens confiés par ${name}.`)
}
function refuse(name: string) {
  flash('Mandat refusé', `${name} est informé de votre refus.`)
}
function assign(name: string) {
  flash('Assignation', `Choisissez un bien à confier à ${name} depuis Mes biens.`)
}
</script>

<template>
  <div class="animate-[im-fade_.3s_ease_both]">
    <div class="mb-5 flex w-fit gap-[5px] rounded-pill bg-sand-200 p-1">
      <button type="button" class="rounded-pill px-5 py-2.5 text-[13px] font-bold transition-all" :class="tab === 'donnes' ? 'bg-white text-green-900 shadow-card' : 'bg-transparent text-[var(--text-secondary)]'" @click="tab = 'donnes'">Mandats donnés</button>
      <button type="button" class="rounded-pill px-5 py-2.5 text-[13px] font-bold transition-all" :class="tab === 'recus' ? 'bg-white text-green-900 shadow-card' : 'bg-transparent text-[var(--text-secondary)]'" @click="tab = 'recus'">Mandats reçus</button>
    </div>

    <div v-for="m in mandats" :key="m.name" class="mb-3.5 rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
      <div class="flex items-center gap-3.5">
        <CoreAvatar :name="m.name" :size="46" :color="m.color" />
        <div class="flex-1">
          <p class="m-0 text-base font-bold">{{ m.name }}</p>
          <p class="mb-0 mt-0.5 text-[13px] text-[var(--text-muted)]">{{ m.role }} · depuis {{ m.since }}</p>
        </div>
        <CoreBadge :tone="m.tone">{{ m.status }}</CoreBadge>
      </div>
      <div class="mt-4 border-t border-sand-200 pt-4">
        <p class="mb-2.5 mt-0 text-xs font-black uppercase tracking-[.04em] text-[var(--text-faint)]">Biens couverts par ce mandat</p>
        <div v-if="m.biens.length" class="flex flex-wrap gap-2.5">
          <span v-for="b in m.biens" :key="b.name" class="inline-flex items-center gap-2.5 rounded-pill border border-[var(--border-subtle)] bg-[var(--surface-page)] px-3.5 py-2 text-[13px] font-semibold">
            <span class="h-6 w-6 rounded-xs bg-cover bg-center" :style="{ backgroundImage: b.photo }" />{{ b.name }}
          </span>
        </div>
        <p v-else class="m-0 text-[13px] text-[var(--text-faint)]">Aucun bien assigné — ce mandat n'a encore aucun effet.</p>

        <button v-if="m.canAssign" type="button" class="mt-3.5 rounded-sm border border-[var(--border-default)] bg-white px-4 py-2.5 text-[13px] font-bold" @click="assign(m.name)">+ Assigner ce mandataire à un bien</button>

        <div v-if="m.canRespond" class="mt-3.5 flex gap-2.5">
          <button type="button" class="rounded-sm bg-[image:var(--action-primary)] px-4.5 py-2.5 text-[13px] font-bold text-white" @click="accept(m.name)">Accepter le mandat</button>
          <button type="button" class="rounded-sm border border-[var(--border-default)] bg-white px-4.5 py-2.5 text-[13px] font-bold" @click="refuse(m.name)">Refuser</button>
        </div>
      </div>
    </div>
  </div>
</template>
