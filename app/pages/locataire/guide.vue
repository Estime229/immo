<script setup lang="ts">
definePageMeta({ layout: 'locataire' })

const GUIDE_CARDS = [
  { icon: '⛨', title: 'La caution séquestrée', text: "Immo détient votre caution pendant tout le bail. Ni vous ni le propriétaire n'y avez accès. Elle revient sous 7 jours après l'état des lieux de sortie." },
  { icon: '⎈', title: 'La tirelire', text: "C'est la part de votre wallet réservée au logement. Elle seule sert à payer un loyer ou une réservation — un solde disponible ne suffit pas." },
  { icon: '☑', title: 'L’état des lieux', text: "Signé des deux côtés à l'entrée, il est l'unique référence à la sortie. Toute retenue doit s'appuyer sur un écart constaté, photos à l'appui." },
  { icon: '✎', title: 'Le préavis', text: "Donner son préavis est une déclaration d'intention : le bail ne s'arrête pas aussitôt et les loyers restent dus jusqu'au terme des 3 mois." }
]
</script>

<template>
  <div class="grid max-w-[840px] animate-[im-fade_.3s_ease_both] grid-cols-1 gap-4 sm:grid-cols-2">
    <div v-for="g in GUIDE_CARDS" :key="g.title" class="rounded-xl border border-[var(--border-subtle)] bg-white p-5.5">
      <div class="grid h-[38px] w-[38px] place-items-center rounded-md bg-green-50 text-[17px] text-green-600">{{ g.icon }}</div>
      <p class="mb-0 mt-3.5 text-base font-bold tracking-[-.015em]">{{ g.title }}</p>
      <p class="mb-0 mt-1.5 text-sm leading-[1.6] text-[var(--text-muted)]">{{ g.text }}</p>
    </div>
  </div>
</template>
