<script setup lang="ts">
import { ArrowRight, HandCoins, Handshake, Scale, ShieldCheck, Wallet } from '@lucide/vue'

definePageMeta({ layout: 'artisan' })

/** Guide court de l'artisan : uniquement ce que l'application fait aujourd'hui. */
const GUIDE = [
  {
    icon: HandCoins,
    title: 'Offre et prix',
    text: "Candidatez sur un poste ouvert de votre métier, puis proposez votre prix, une garantie (0 à 90 jours) et la part retenue. Le demandeur accepte, refuse ou contre-propose ; une nouvelle offre remplace la précédente.",
    to: '/artisan/missions?tab=ouvertes',
    link: 'Postes ouverts'
  },
  {
    icon: ShieldCheck,
    title: 'Retenue de garantie',
    text: "Une fois l'offre acceptée, le demandeur paie via Immo : ne vous déplacez pas avant. La part immédiate arrive sur votre wallet ; la part retenue vous est versée à la fin de la garantie, qui démarre quand vous marquez l'intervention terminée.",
    to: '/artisan/planning',
    link: 'À faire'
  },
  {
    icon: Scale,
    title: 'Litige et partage',
    text: "Pendant la garantie, le demandeur peut signaler un problème : la part retenue est gelée. Chacun propose un partage ; dès que l'autre partie accepte, la demande est clôturée. Sans accord, l'équipe Immo peut trancher.",
    to: '/contact?sujet=Probl%C3%A8me%20de%20paiement',
    link: 'Contacter Immo'
  },
  {
    icon: Wallet,
    title: 'Retraits',
    text: 'Votre solde disponible se retire vers Mobile Money depuis Facturation : 500 FCFA minimum, une seule demande en attente à la fois, validée par Immo avant le virement. Chaque mission payée a sa facture.',
    to: '/artisan/facturation',
    link: 'Facturation'
  },
  {
    icon: Handshake,
    title: 'Agences partenaires',
    text: "Une agence ou un propriétaire peut vous inviter comme artisan partenaire et vous réserver certaines de ses demandes. Vous acceptez ou refusez l'invitation, et pouvez mettre fin au partenariat à tout moment.",
    to: '/artisan/partenaires',
    link: 'Agences partenaires'
  }
]
</script>

<template>
  <div class="grid max-w-[900px] animate-[im-fade_.3s_ease_backwards] grid-cols-1 gap-4.5 sm:grid-cols-2">
    <section v-for="g in GUIDE" :key="g.title" class="flex flex-col rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
      <div class="grid h-[42px] w-[42px] place-items-center rounded-md bg-green-50 text-green-700">
        <component :is="g.icon" class="h-[18px] w-[18px]" :stroke-width="1.9" aria-hidden="true" />
      </div>
      <h2 class="mb-0 mt-3.5 text-[15px] font-bold">{{ g.title }}</h2>
      <p class="mb-0 mt-1.5 flex-1 text-[13.5px] leading-[1.6] text-[var(--text-muted)]">{{ g.text }}</p>
      <NuxtLink :to="g.to" class="mt-3.5 inline-flex items-center gap-1 self-start text-[12.5px] font-bold text-green-700">
        {{ g.link }} <ArrowRight class="h-3.5 w-3.5" :stroke-width="1.9" aria-hidden="true" />
      </NuxtLink>
    </section>
  </div>
</template>
