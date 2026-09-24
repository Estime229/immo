<script setup lang="ts">
const DOCS = [
  { key: 'conditions', label: "Conditions d'utilisation" },
  { key: 'confidentialite', label: 'Politique de confidentialité' },
  { key: 'mentions', label: 'Mentions légales' }
] as const

const TITLES: Record<string, string> = {
  conditions: "Conditions d'utilisation",
  confidentialite: 'Politique de confidentialité',
  mentions: 'Mentions légales'
}

const SECTIONS = [
  { heading: '1. Données que nous collectons', paras: [
    "Nous collectons les informations que vous nous fournissez directement : identité, coordonnées, numéro Mobile Money, documents de vérification et messages échangés sur la plateforme.",
    "Nous enregistrons également les données d'usage nécessaires au fonctionnement du service : annonces consultées, réservations, paiements et journaux de connexion."
  ] },
  { heading: '2. Usage des informations', paras: [
    "Vos données servent à mettre en relation locataires, propriétaires et artisans, à sécuriser les paiements et le séquestre des cautions, et à répondre à nos obligations légales, notamment au titre de la Loi 2022-30."
  ] },
  { heading: '3. Séquestre et données financières', paras: [
    'Les montants séquestrés et les mouvements Mobile Money sont conservés de manière traçable et consultable par les deux parties concernées. Ces données ne sont jamais revendues à des tiers.'
  ] },
  { heading: '4. Partage avec des tiers', paras: [
    "Nous ne partageons vos données qu'avec les opérateurs de paiement, les autorités lorsque la loi l'exige, et les prestataires techniques strictement nécessaires au service, sous contrat de confidentialité."
  ] },
  { heading: '5. Conservation et suppression', paras: [
    'Vos données sont conservées le temps de la relation contractuelle, puis pendant la durée légale applicable aux baux et aux paiements. Vous pouvez demander la suppression de votre compte depuis vos paramètres.'
  ] },
  { heading: '6. Vos droits', paras: [
    "Vous disposez d'un droit d'accès, de rectification et de suppression de vos données, ainsi que d'un droit d'opposition. Écrivez-nous à bonjour@immo.bj pour exercer ces droits."
  ] }
]

const route = useRoute()
const activeDoc = ref(typeof route.query.doc === 'string' && route.query.doc in TITLES ? route.query.doc : 'confidentialite')
const activeSection = ref(SECTIONS[0]!.heading)

function pickDoc(key: string) {
  activeDoc.value = key
}
</script>

<template>
  <div class="mx-auto max-w-[1100px] px-[26px] pb-20 pt-[26px]">
    <div class="mb-[26px] flex flex-wrap gap-2">
      <button
        v-for="d in DOCS"
        :key="d.key"
        type="button"
        class="rounded-pill border px-[18px] py-2.5 text-[13.5px] font-bold transition-all"
        :class="activeDoc === d.key ? 'border-green-600 bg-green-600 text-white' : 'border-[var(--border-default)] bg-white text-[var(--text-secondary)]'"
        @click="pickDoc(d.key)"
      >{{ d.label }}</button>
    </div>

    <div class="grid grid-cols-1 items-start gap-11 lg:grid-cols-[240px_1fr]">
      <nav class="hidden lg:sticky lg:top-[94px] lg:block">
        <p class="mb-3 mt-0 text-[11.5px] font-black uppercase tracking-[.06em] text-[var(--text-faint)]">Sommaire</p>
        <a
          v-for="s in SECTIONS"
          :key="s.heading"
          :href="`#${s.heading}`"
          class="block border-l-2 py-2 pl-3 text-[13.5px] transition-colors"
          :class="activeSection === s.heading ? 'border-green-600 font-bold text-[var(--text-primary)]' : 'border-transparent text-[var(--text-muted)]'"
          @click="activeSection = s.heading"
        >{{ s.heading }}</a>
      </nav>

      <article class="max-w-[680px]">
        <h1 class="m-0 font-display text-[34px] font-bold tracking-[-.03em]">{{ TITLES[activeDoc] }}</h1>
        <p class="mb-0 mt-3 text-[13.5px] text-[var(--text-faint)]">Dernière mise à jour : 1er septembre 2026 · version 3.2</p>
        <div class="my-[26px] h-px bg-sand-300" />
        <div v-for="s in SECTIONS" :id="s.heading" :key="s.heading" class="mb-7">
          <h2 class="mb-3 mt-0 font-display text-xl font-bold tracking-[-.02em]">{{ s.heading }}</h2>
          <p v-for="p in s.paras" :key="p" class="mb-3.5 text-[15.5px] leading-[1.75] text-[var(--text-secondary)]">{{ p }}</p>
        </div>
      </article>
    </div>
  </div>
</template>
