<script setup lang="ts">
import { ArrowRight, FilePenLine, Mail } from '@lucide/vue'
import { IMMO_CONTACT } from '~/utils/contact'

/**
 * Documents légaux. Avant : les trois onglets affichaient le même texte de confidentialité, sous
 * une « version 3.2 du 1er septembre 2026 » inventée. Chaque onglet a maintenant son contenu ;
 * les conditions d'utilisation et les mentions légales n'ont pas encore de texte validé : aucun
 * texte juridique ni identité de société n'est inventé, un encart le dit et renvoie au contact.
 * L'onglet vit dans l'URL (`?doc=conditions|confidentialite|mentions`).
 */
type DocKey = 'conditions' | 'confidentialite' | 'mentions'
const DOCS: { value: DocKey; label: string }[] = [
  { value: 'conditions', label: "Conditions d'utilisation" },
  { value: 'confidentialite', label: 'Confidentialité' },
  { value: 'mentions', label: 'Mentions légales' }
]
const TITLES: Record<DocKey, string> = {
  conditions: "Conditions d'utilisation",
  confidentialite: 'Politique de confidentialité',
  mentions: 'Mentions légales'
}

const SECTIONS = [
  { id: 'donnees', heading: '1. Données que nous collectons', paras: [
    "Nous collectons les informations que vous nous fournissez directement : identité, coordonnées, numéro Mobile Money, documents de vérification et messages échangés sur la plateforme.",
    "Nous enregistrons également les données d'usage nécessaires au fonctionnement du service : annonces consultées, réservations, paiements et journaux de connexion."
  ] },
  { id: 'usage', heading: '2. Usage des informations', paras: [
    "Vos données servent à mettre en relation locataires, propriétaires et artisans, à sécuriser les paiements et le séquestre des cautions, et à répondre à nos obligations légales, notamment au titre de la Loi 2022-30."
  ] },
  { id: 'sequestre', heading: '3. Séquestre et données financières', paras: [
    'Les montants séquestrés et les mouvements Mobile Money sont conservés de manière traçable et consultable par les deux parties concernées. Ces données ne sont jamais revendues à des tiers.'
  ] },
  { id: 'tiers', heading: '4. Partage avec des tiers', paras: [
    "Nous ne partageons vos données qu'avec les opérateurs de paiement, les autorités lorsque la loi l'exige, et les prestataires techniques strictement nécessaires au service, sous contrat de confidentialité."
  ] },
  { id: 'conservation', heading: '5. Conservation et suppression', paras: [
    'Vos données sont conservées le temps de la relation contractuelle, puis pendant la durée légale applicable aux baux et aux paiements. Vous pouvez demander la suppression de votre compte depuis votre profil.'
  ] },
  { id: 'droits', heading: '6. Vos droits', paras: [
    "Vous disposez d'un droit d'accès, de rectification et de suppression de vos données, ainsi que d'un droit d'opposition. Écrivez-nous pour exercer ces droits."
  ] }
]

const route = useRoute()
const router = useRouter()
function docFromQuery(): DocKey {
  const d = String(route.query.doc ?? '')
  return d === 'conditions' || d === 'mentions' || d === 'confidentialite' ? d : 'confidentialite'
}
const activeDoc = ref<string>(docFromQuery())
watch(() => route.query.doc, () => { activeDoc.value = docFromQuery() })
watch(activeDoc, d => {
  if (d !== docFromQuery()) router.replace({ query: { ...route.query, doc: d } })
})
const docKey = computed(() => activeDoc.value as DocKey)

const activeSection = ref(SECTIONS[0]!.id)
const contactLink = { path: '/contact', query: { sujet: 'Conditions et données personnelles' } }
</script>

<template>
  <div class="mx-auto max-w-[1100px] animate-[im-fade_.3s_ease_backwards] px-[26px] pb-20 pt-[26px]">
    <div class="-mx-[26px] mb-5.5 overflow-x-auto px-[26px] [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
      <FormsSegmentedControl v-model="activeDoc" :options="DOCS" size="sm" />
    </div>

    <!-- Confidentialité : texte existant, sommaire à gauche sur grand écran -->
    <div v-if="docKey === 'confidentialite'" class="grid grid-cols-1 items-start gap-11 lg:grid-cols-[240px_1fr]">
      <nav class="hidden lg:sticky lg:top-[94px] lg:block" aria-label="Sommaire">
        <p class="mb-3 mt-0 text-label font-bold uppercase tracking-label text-[var(--text-faint)]">Sommaire</p>
        <a
          v-for="s in SECTIONS"
          :key="s.id"
          :href="`#${s.id}`"
          class="block border-l-2 py-2 pl-3 text-[13.5px] transition-colors"
          :class="activeSection === s.id ? 'border-green-600 font-bold text-[var(--text-primary)]' : 'border-transparent text-[var(--text-muted)]'"
          @click="activeSection = s.id"
        >{{ s.heading }}</a>
      </nav>

      <article class="max-w-[680px]">
        <h1 class="m-0 font-display text-[30px] font-bold tracking-[-.03em] sm:text-[34px]">{{ TITLES.confidentialite }}</h1>
        <div class="my-5.5 h-px bg-sand-300" />
        <section v-for="s in SECTIONS" :id="s.id" :key="s.id" class="mb-7 scroll-mt-[94px]">
          <h2 class="mb-3 mt-0 font-display text-xl font-bold tracking-[-.02em]">{{ s.heading }}</h2>
          <p v-for="p in s.paras" :key="p" class="mb-3.5 mt-0 text-[15px] leading-[1.75] text-[var(--text-secondary)]">{{ p }}</p>
        </section>
        <a :href="`mailto:${IMMO_CONTACT.email}`" class="inline-flex items-center gap-2 rounded-pill border border-[var(--border-default)] bg-white px-4 py-[9px] text-[13px] font-bold text-sand-900 hover:border-green-600">
          <Mail class="h-4 w-4" :stroke-width="1.9" />{{ IMMO_CONTACT.email }}
        </a>
      </article>
    </div>

    <!-- Conditions d'utilisation et mentions légales : pas encore de texte validé -->
    <article v-else class="max-w-[680px]">
      <h1 class="m-0 font-display text-[30px] font-bold tracking-[-.03em] sm:text-[34px]">{{ TITLES[docKey] }}</h1>
      <div class="mt-5.5 rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
        <div class="flex items-start gap-4">
          <span class="grid h-[46px] w-[46px] flex-none place-items-center rounded-pill bg-green-50 text-green-700"><FilePenLine class="h-5 w-5" :stroke-width="1.9" /></span>
          <div class="min-w-0 flex-1">
            <h2 class="m-0 text-[15px] font-bold">Document en cours de rédaction</h2>
            <p class="mb-0 mt-1.5 text-[13.5px] leading-[1.6] text-[var(--text-muted)]">
              {{ docKey === 'conditions'
                ? "Les conditions d'utilisation d'Immo seront publiées sur cette page. Pour toute question sur l'usage du service d'ici là, écrivez-nous."
                : "Les mentions légales d'Immo (éditeur, hébergeur) seront publiées sur cette page. Pour toute question d'ici là, écrivez-nous." }}
            </p>
            <div class="mt-4 flex flex-wrap gap-2.5">
              <NuxtLink :to="contactLink" class="inline-flex items-center gap-1.5 rounded-pill border border-[var(--border-default)] bg-white px-4 py-[9px] text-[13px] font-bold text-sand-900 hover:border-green-600">
                Nous contacter<ArrowRight class="h-4 w-4" :stroke-width="1.9" />
              </NuxtLink>
              <NuxtLink :to="{ query: { doc: 'confidentialite' } }" class="inline-flex items-center rounded-pill px-4 py-[9px] text-[13px] font-bold text-green-700">
                Lire la politique de confidentialité
              </NuxtLink>
            </div>
          </div>
        </div>
      </div>
    </article>
  </div>
</template>
