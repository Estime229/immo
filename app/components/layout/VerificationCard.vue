<script setup lang="ts">
import { verificationLink, type VerificationSpace } from '~/utils/kycStatus'

/**
 * Rappel de vérification dans la barre latérale de chaque espace, visible sur
 * toutes les pages (pas seulement le tableau de bord). Rien si le compte est vérifié.
 */
const props = defineProps<{ space: VerificationSpace }>()
const { stage, refreshSubmitted } = useVerification()
const route = useRoute()
onMounted(refreshSubmitted)
/** Le tableau de bord de chaque espace affiche déjà le bandeau complet (`<LayoutKycNotice>`) : pas de doublon. */
const onDashboard = computed(() => ['/locataire', '/pro', '/artisan'].includes(route.path))

const card = computed(() => {
  switch (stage.value) {
    case 'verified': return null
    case 'review': return { title: 'Vérification en cours', text: 'Documents en cours d\'examen, généralement sous 24 h.', cta: 'Suivre', box: 'border-info-border bg-info-bg', ink: 'text-info-fg-deep' }
    case 'rejected': return { title: 'Vérification refusée', text: 'Des documents ont été refusés : redéposez-les.', cta: 'Reprendre', box: 'border-danger-border bg-danger-bg', ink: 'text-danger-fg' }
    default: return {
      title: 'Compte non vérifié',
      text: props.space === 'artisan'
        ? 'Faites vérifier votre identité pour afficher le badge « Vérifié ».'
        : 'Les actions marquées d\'un cadenas s\'ouvrent une fois votre identité vérifiée.',
      cta: 'Vérifier mon compte',
      box: 'border-warn-border bg-warn-bg',
      ink: 'text-warn-fg'
    }
  }
})
</script>

<template>
  <NuxtLink v-if="card && !onDashboard" :to="verificationLink(route.fullPath)" class="mb-1 block rounded-lg border px-3 py-2.5 transition-[filter] hover:brightness-[.98]" :class="card.box">
    <p class="m-0 flex items-center gap-1.5 text-[12.5px] font-bold" :class="card.ink">
      <CoreLockIcon v-if="stage === 'todo'" :size="12" />{{ card.title }}
    </p>
    <p class="mb-0 mt-1 text-[11.5px] leading-[1.45] text-[var(--text-secondary)]">{{ card.text }}</p>
    <p class="mb-0 mt-1.5 text-[12px] font-bold" :class="card.ink">{{ card.cta }} →</p>
  </NuxtLink>
</template>
