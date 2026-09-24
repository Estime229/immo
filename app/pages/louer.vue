<script setup lang="ts">
const STATS = [
  { value: '94 %', label: "des loyers encaissés dans les 5 jours de l'échéance" },
  { value: '12 min', label: 'pour publier une première annonce' },
  { value: '0 F', label: "tant que le bien n'est pas loué" }
]

const STEPS = [
  { num: '1', title: 'Vous publiez', text: "Photos, loyer, conditions. Un agent Immo visite le bien avant mise en ligne et l'adresse exacte reste masquée jusqu'à l'acceptation d'une visite." },
  { num: '2', title: 'Vous choisissez', text: "Les candidats arrivent avec un dossier déjà vérifié : pièce d'identité, justificatif de revenus, historique de paiement sur la plateforme." },
  { num: '3', title: 'Vous êtes payé', text: 'Le loyer est prélevé automatiquement le 5. En cas de retard, la relance part sans que vous ayez à écrire.' }
]

const ESCROW_FLOW = [
  { when: 'À la signature', amount: '150 000 F', text: 'Le locataire verse la caution. Elle entre en séquestre chez Immo.', tone: 'locked' as const },
  { when: 'Pendant le bail', amount: '150 000 F', text: "Ni vous ni le locataire n'y avez accès. Le montant est visible des deux côtés.", tone: 'locked' as const },
  { when: 'État des lieux de sortie', amount: '-18 000 F', text: 'Retenue justifiée par les écarts constatés, photos à l\'appui. Contestable 7 jours.', tone: 'danger' as const },
  { when: 'Sous 7 jours', amount: '132 000 F', text: 'Le solde repart au locataire, la retenue vous est versée.', tone: 'ok' as const }
]

const PRICING = [
  { name: 'Publication', price: 'Gratuit', unit: "sans limite d'annonces", highlighted: false, tag: '',
    features: ['Annonces illimitées', 'Visite de vérification incluse', 'Messagerie avec les candidats', 'Vitrine publique et QR code'] },
  { name: 'Gestion du loyer', price: '5 %', unit: "du loyer encaissé, prélevé à l'encaissement", highlighted: true, tag: 'Le plus choisi',
    features: ['Encaissement Mobile Money', 'Relances automatiques', 'Caution séquestrée', 'État des lieux signé et archivé'] },
  { name: 'Mandat agence', price: '8 %', unit: 'du loyer encaissé, équipe illimitée', highlighted: false, tag: '',
    features: ['Tout de la gestion du loyer', 'Comptes agents et mandats', 'Tableau de bord multi-bailleurs', 'Artisans partenaires'] }
]

const TESTIMONIALS = [
  { quote: 'Avant, je passais mes samedis à courir après trois locataires. Depuis un an je regarde le tableau de bord le 6 du mois et c\'est réglé.', author: 'Koffi Dossou', role: 'Propriétaire · 3 biens à Fidjrossè', initials: 'KD', color: 'var(--color-green-600)' },
  { quote: "Le séquestre a changé les discussions de sortie. On ouvre l'état des lieux d'entrée, on compare, personne ne discute.", author: 'Amina Soglo', role: 'Agence Immo Cotonou · 12 biens', initials: 'AS', color: 'var(--color-clay-500)' }
]

const AMOUNT_TONE: Record<'locked' | 'danger' | 'ok', string> = {
  locked: 'text-[var(--text-money-locked)]',
  danger: 'text-danger-fg',
  ok: 'text-ok-fg'
}
</script>

<template>
  <div class="animate-[im-fade_.3s_ease_both]">
    <section class="mx-auto max-w-[1240px] px-[26px] pt-6">
      <div class="rounded-3xl bg-[image:var(--gradient-balance)] p-8 sm:p-[52px]">
        <h1 class="m-0 max-w-[660px] font-display text-[34px] font-extrabold leading-[1.06] tracking-[-.035em] text-white sm:text-[44px]">
          Vos loyers arrivent. Sans relance, sans discussion.
        </h1>
        <p class="mb-0 mt-3.5 max-w-[540px] text-[16.5px] leading-[1.55] text-white/[.84]">
          Immo publie votre bien, encaisse le loyer par Mobile Money et conserve la caution jusqu'à l'état des lieux de sortie.
        </p>
        <div class="mt-[30px] flex flex-wrap gap-8">
          <div v-for="s in STATS" :key="s.label">
            <p class="m-0 font-mono text-[30px] font-bold tracking-[-.02em] text-white">{{ s.value }}</p>
            <p class="mb-0 mt-1.5 max-w-[180px] text-[13px] text-white/70">{{ s.label }}</p>
          </div>
        </div>
        <NuxtLink to="/connexion" class="mt-[30px] inline-block rounded-md bg-clay-500 px-[30px] py-4 text-[15.5px] font-bold text-white shadow-accent">Créer mon compte propriétaire</NuxtLink>
      </div>
    </section>

    <section class="mx-auto max-w-[1240px] px-[26px] pt-11">
      <h2 class="mb-5 mt-0 font-display text-title-2 font-bold tracking-title-2">Comment ça marche</h2>
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div v-for="s in STEPS" :key="s.num" class="rounded-xl border border-[var(--border-subtle)] bg-white p-6">
          <div class="grid h-8 w-8 place-items-center rounded-pill bg-green-900 text-[13px] font-black text-white">{{ s.num }}</div>
          <p class="mb-0 mt-3.5 text-[16.5px] font-bold tracking-[-.015em]">{{ s.title }}</p>
          <p class="mb-0 mt-1.5 text-[14.5px] leading-[1.55] text-[var(--text-muted)]">{{ s.text }}</p>
        </div>
      </div>
    </section>

    <section class="mx-auto max-w-[1240px] px-[26px] pt-11">
      <div class="rounded-2xl border border-[var(--border-escrow)] bg-[var(--surface-escrow)] p-6 sm:p-8">
        <h2 class="m-0 font-display text-2xl font-bold tracking-[-.025em] text-clay-700">Où va l'argent, exactement</h2>
        <p class="mb-6 mt-2 max-w-[640px] text-[14.5px] text-clay-900">Le séquestre est le cœur du service. Voici le trajet d'une caution de 150 000 FCFA sur un bail d'un an.</p>
        <div class="flex flex-col gap-3 sm:flex-row sm:items-stretch">
          <div v-for="(e, i) in ESCROW_FLOW" :key="e.when" class="flex flex-1 items-center gap-3">
            <div class="flex-1 rounded-md border border-[var(--border-escrow)] bg-white p-[18px]">
              <p class="m-0 text-[11px] font-black uppercase tracking-[.06em] text-[var(--text-faint)]">{{ e.when }}</p>
              <p class="mb-0 mt-2 font-mono text-base font-bold" :class="AMOUNT_TONE[e.tone]">{{ e.amount }}</p>
              <p class="mb-0 mt-1.5 text-[12.5px] leading-[1.45] text-[var(--text-muted)]">{{ e.text }}</p>
            </div>
            <span v-if="i < ESCROW_FLOW.length - 1" class="hidden shrink-0 text-base text-clay-300 sm:block">→</span>
          </div>
        </div>
      </div>
    </section>

    <section class="mx-auto max-w-[1240px] px-[26px] pt-11">
      <h2 class="mb-5 mt-0 font-display text-title-2 font-bold tracking-title-2">Tarifs</h2>
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div
          v-for="p in PRICING"
          :key="p.name"
          class="relative rounded-xl border bg-white p-[26px]"
          :class="p.highlighted ? 'border-2 border-green-600' : 'border-[var(--border-subtle)]'"
        >
          <span v-if="p.tag" class="absolute -top-[11px] left-[26px] rounded-pill bg-green-600 px-3 py-[5px] text-[11px] font-black text-white">{{ p.tag }}</span>
          <p class="m-0 text-[16.5px] font-bold">{{ p.name }}</p>
          <p class="mb-0 mt-3 font-mono text-[30px] font-bold tracking-[-.02em] text-green-900">{{ p.price }}</p>
          <p class="mb-[18px] mt-1.5 text-[13px] text-[var(--text-muted)]">{{ p.unit }}</p>
          <div v-for="f in p.features" :key="f" class="flex gap-2.5 py-[7px] text-[13.5px] text-[var(--text-secondary)]">
            <span class="font-bold text-green-600">✓</span><span>{{ f }}</span>
          </div>
        </div>
      </div>
    </section>

    <section class="mx-auto max-w-[1240px] px-[26px] pt-11">
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div v-for="t in TESTIMONIALS" :key="t.author" class="rounded-xl border border-[var(--border-subtle)] bg-white p-[26px]">
          <p class="m-0 text-[15.5px] leading-[1.65] text-[var(--text-secondary)]">« {{ t.quote }} »</p>
          <div class="mt-4.5 flex items-center gap-2.5">
            <div class="grid h-[38px] w-[38px] place-items-center rounded-pill text-[12.5px] font-bold text-white" :style="{ background: t.color }">{{ t.initials }}</div>
            <div>
              <p class="m-0 text-sm font-bold">{{ t.author }}</p>
              <p class="mb-0 mt-px text-[12.5px] text-[var(--text-faint)]">{{ t.role }}</p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="mx-auto max-w-[1240px] px-[26px] pb-4 pt-11">
      <div class="flex flex-col items-start gap-6 rounded-2xl bg-green-900 p-9 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 class="m-0 font-display text-2xl font-bold tracking-[-.025em] text-white">Publier votre premier bien prend 12 minutes</h3>
          <p class="mb-0 mt-2 text-[15px] text-white/[.78]">Aucun frais tant que le bien n'est pas loué.</p>
        </div>
        <NuxtLink to="/connexion" class="whitespace-nowrap rounded-md bg-white px-7 py-[15px] text-[15px] font-bold text-green-900">Commencer</NuxtLink>
      </div>
    </section>
  </div>
</template>
