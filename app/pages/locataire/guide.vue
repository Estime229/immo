<script setup lang="ts">
import { ArrowRight, ClipboardCheck, Lock, LogOut, PiggyBank } from '@lucide/vue'

definePageMeta({ layout: 'locataire' })

/** Fiches pratiques — chaque phrase décrit ce que l'application fait réellement aujourd'hui. */
const GUIDE_CARDS = [
  {
    icon: Lock,
    title: 'La caution séquestrée',
    text: "Payée à l'entrée, elle est détenue par Immo pendant tout le bail : ni vous ni le propriétaire n'y avez accès. Sa restitution en fin de bail, après l'état des lieux de sortie, n'est pas encore gérée dans l'application.",
    link: { label: 'Mes cautions', to: '/locataire/wallet' }
  },
  {
    icon: PiggyBank,
    title: 'La tirelire',
    text: "C'est la part de votre wallet réservée au logement. Elle seule sert à payer un loyer, une entrée dans les lieux ou une réservation : un solde disponible ne suffit pas. Une recharge Mobile Money la crédite directement.",
    link: { label: 'Mon wallet', to: '/locataire/wallet' }
  },
  {
    icon: ClipboardCheck,
    title: "L'état des lieux",
    text: "Préparé par le propriétaire, signé des deux côtés à l'entrée : il sert de référence à la sortie, où chaque élément est comparé à son état d'entrée. Ne signez pas un état des lieux qui ne correspond pas à ce que vous constatez.",
    link: { label: 'Mes états des lieux', to: '/locataire/edl' }
  },
  {
    icon: LogOut,
    title: 'Le préavis',
    text: "Donner son préavis est une déclaration d'intention : le bail ne s'arrête pas aussitôt et les loyers restent dus jusqu'à la fin du préavis prévu au bail (3 mois par défaut). Vous pouvez l'annuler tant que le bail est en cours.",
    link: { label: 'Mon bail', to: '/locataire/bail' }
  }
]
</script>

<template>
  <div class="grid max-w-[880px] animate-[im-fade_.3s_ease_backwards] grid-cols-1 gap-4.5 sm:grid-cols-2">
    <section v-for="g in GUIDE_CARDS" :key="g.title" class="flex flex-col rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
      <div class="grid h-[46px] w-[46px] place-items-center rounded-pill bg-green-50 text-green-700"><component :is="g.icon" class="h-5 w-5" :stroke-width="1.9" /></div>
      <h2 class="mb-0 mt-3.5 text-[15px] font-bold">{{ g.title }}</h2>
      <p class="mb-0 mt-1.5 flex-1 text-[13.5px] leading-[1.6] text-[var(--text-muted)]">{{ g.text }}</p>
      <NuxtLink :to="g.link.to" class="mt-3.5 inline-flex items-center gap-1 self-start text-[12.5px] font-bold text-green-700">{{ g.link.label }} <ArrowRight class="h-3.5 w-3.5" :stroke-width="1.9" /></NuxtLink>
    </section>
  </div>
</template>
