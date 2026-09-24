<script setup lang="ts">
definePageMeta({ layout: 'pro' })

const modal = useProModal()

const TEAM = [
  { name: 'Amina Sanni', color: 'var(--color-clay-500)', poste: 'Gérante', scope: 'Tous les biens', status: 'Actif', tone: 'ok' as const },
  { name: 'Judicaël Adjovi', color: 'var(--color-green-700)', poste: 'Gestionnaire', scope: '2 biens', status: 'Actif', tone: 'ok' as const },
  { name: 'p.tomety@mail.bj', color: 'var(--color-info-fg)', poste: 'Comptable', scope: 'invitation', status: 'En attente · exp. 18 sept.', tone: 'warn' as const },
  { name: 'Rodrigue Hounkpe', color: 'var(--color-sand-500)', poste: 'Commercial', scope: 'révoqué', status: 'Révoqué', tone: 'neutral' as const }
]

const PERM_GROUPS = [
  { cat: 'Biens', perms: ['Voir les biens', 'Modifier les biens'] },
  { cat: 'Baux', perms: ['Créer des baux', 'Envoyer pour signature'] },
  { cat: 'Paiements et finances', perms: ['Voir les loyers', 'Relancer les impayés'] },
  { cat: 'Demandes de location', perms: ['Traiter les demandes', 'Planifier des visites'] },
  { cat: 'Messagerie', perms: ['Répondre aux messages'] }
]
</script>

<template>
  <div class="animate-[im-fade_.3s_ease_both]">
    <div class="mb-4 flex justify-end">
      <CoreButton @click="modal = 'invite'">+ Inviter un membre</CoreButton>
    </div>

    <div class="grid grid-cols-1 items-start gap-4.5 lg:grid-cols-[1.4fr_1fr]">
      <div class="overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-white p-2">
        <div v-for="m in TEAM" :key="m.name" class="flex items-center gap-3.5 border-b border-sand-200 p-3.5 last:border-b-0">
          <CoreAvatar :name="m.name" :size="42" :color="m.color" />
          <div class="min-w-0 flex-1">
            <p class="m-0 text-[14.5px] font-bold">{{ m.name }}</p>
            <p class="mb-0 mt-0.5 text-[12.5px] text-[var(--text-muted)]">{{ m.poste }} · {{ m.scope }}</p>
          </div>
          <CoreBadge :tone="m.tone">{{ m.status }}</CoreBadge>
        </div>
      </div>

      <div class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
        <p class="m-0 text-[15px] font-bold">Poste : Gestionnaire</p>
        <p class="mb-4 mt-1 text-[12.5px] text-[var(--text-muted)]">Droits accordés, groupés par catégorie</p>
        <div v-for="g in PERM_GROUPS" :key="g.cat" class="mb-3.5 last:mb-0">
          <p class="mb-2 mt-0 text-[11.5px] font-black uppercase tracking-[.04em] text-[var(--text-faint)]">{{ g.cat }}</p>
          <div class="flex flex-wrap gap-1.5">
            <span v-for="p in g.perms" :key="p" class="rounded-pill border border-green-100 bg-green-50 px-2.5 py-1.5 text-xs font-semibold text-green-800">✓ {{ p }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
