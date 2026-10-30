<script setup lang="ts">
import { ArrowRight, ClipboardCheck, Flag, Landmark, ShieldCheck, Users, Wallet } from '@lucide/vue'

definePageMeta({ layout: 'pro' })

/**
 * Guide de l'espace pro : ne décrit que ce que l'application fait aujourd'hui,
 * limites comprises (relu dans le code et BACKEND-ISSUES.md le 30/10/2026).
 * Même format de cartes que le guide locataire.
 */
const GUIDE_CARDS = [
  {
    icon: Users,
    title: 'Mandats et équipe',
    text: "L'équipe donne l'accès : chaque membre n'agit que sur les biens que vous lui confiez, selon ses permissions (baux, logements, fiche du bien, demandes de logement). Un mandat d'agent, lui, l'affiche comme agent d'un bien sans lui ouvrir aucun accès : pour qu'il agisse, invitez-le aussi dans votre équipe. Une invitation passe par un lien, que vous pouvez renouveler ou annuler.",
    link: { to: '/pro/equipe', label: 'Gérer mon équipe' }
  },
  {
    icon: Landmark,
    title: 'Le séquestre de la caution',
    text: "Le locataire règle le paiement d'entrée (caution, avance et loyers prépayés éventuels) depuis son wallet : c'est ce paiement qui rend le bail actif. La caution n'arrive pas sur votre solde, Immo la conserve en séquestre pendant tout le bail. Sa restitution en fin de bail n'est pas encore gérée dans l'application. La loi 2022-30 la plafonne à 3 mois de loyer ; au-delà, les deux parties doivent l'accepter explicitement.",
    link: { to: '/pro/baux', label: 'Voir mes baux' }
  },
  {
    icon: ShieldCheck,
    title: 'La retenue de garantie des artisans',
    text: "Dans son offre, l'artisan fixe son prix, une garantie (jusqu'à 90 jours) et la part retenue. Vous payez depuis votre solde : une partie lui est versée tout de suite, Immo conserve le reste jusqu'à la fin de la garantie. Un problème pendant la garantie ? Signalez-le : chacun propose un partage de la retenue, que l'autre accepte. Sans signalement, elle revient à l'artisan à la fin de la garantie.",
    link: { to: '/pro/artisans', label: 'Mes interventions' }
  },
  {
    icon: Wallet,
    title: 'Le wallet, la tirelire et les retraits',
    text: "Votre solde disponible reçoit vos revenus locatifs et se retire vers Mobile Money (MTN ou Moov), à partir de 500 FCFA. Une seule demande à la fois : un administrateur Immo la valide avant le virement, et vous pouvez l'annuler tant qu'elle est en attente. La tirelire est la part réservée aux paiements de logement : elle ne vous sert que si ce compte loue aussi un logement.",
    link: { to: '/pro/wallet', label: 'Ouvrir mon wallet' }
  },
  {
    icon: ClipboardCheck,
    title: 'Baux et états des lieux',
    text: "Un bail se prépare (ou naît quand vous retenez un candidat), s'envoie pour signature, puis le locataire paie l'entrée ; sans paiement sous 72 heures, vous pouvez l'annuler. L'état des lieux d'entrée, signé des deux côtés, sert de référence : à la sortie, l'application reprend ses pièces et signale chaque élément dégradé. La fin du bail n'est pas automatique : vous la déclarez vous-même, motif à l'appui.",
    link: { to: '/pro/edl', label: 'États des lieux' }
  },
  {
    icon: Flag,
    title: 'Signalements de vos locataires',
    text: "Un problème signalé par un locataire arrive dans Signalements. Vous le prenez en charge, faites intervenir un artisan sans ressaisir le logement ni la description (les photos du signalement lui sont transmises), puis le marquez résolu avec une note pour le locataire.",
    link: { to: '/pro/signalements', label: 'Voir les signalements' }
  }
]
</script>

<template>
  <div class="animate-[im-fade_.3s_ease_backwards]">
    <p class="mb-4.5 mt-0 max-w-[720px] text-[13.5px] leading-[1.55] text-[var(--text-muted)]">
      Ce que fait l'application pour vous, et ce qu'elle ne fait pas encore. Chaque carte mène à la page concernée.
    </p>
    <div class="grid max-w-[960px] grid-cols-1 gap-4.5 sm:grid-cols-2">
      <section v-for="g in GUIDE_CARDS" :key="g.title" class="flex flex-col rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
        <span class="grid h-[42px] w-[42px] place-items-center rounded-md bg-green-50 text-green-700"><component :is="g.icon" class="h-[18px] w-[18px]" :stroke-width="1.9" /></span>
        <h2 class="mb-0 mt-3.5 text-[15px] font-bold">{{ g.title }}</h2>
        <p class="mb-0 mt-1.5 flex-1 text-[13.5px] leading-[1.6] text-[var(--text-muted)]">{{ g.text }}</p>
        <NuxtLink :to="g.link.to" class="mt-3.5 inline-flex items-center gap-1 self-start text-[12.5px] font-bold text-green-700">
          {{ g.link.label }} <ArrowRight class="h-3.5 w-3.5" :stroke-width="2" />
        </NuxtLink>
      </section>
    </div>
  </div>
</template>
