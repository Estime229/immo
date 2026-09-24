<script setup lang="ts">
defineProps<{ error: { statusCode?: number; statusMessage?: string } }>()

const query = ref('')

function search() {
  clearError({ redirect: query.value ? `/recherche?q=${encodeURIComponent(query.value)}` : '/recherche' })
}

function goHome() {
  clearError({ redirect: '/' })
}

const QUICK_LINKS = [
  { to: '/recherche', label: 'Rechercher un logement' },
  { to: '/louer', label: 'Louer votre bien' },
  { to: '/faq', label: 'Questions fréquentes' }
]
</script>

<template>
  <div class="grid min-h-screen place-items-center bg-[var(--surface-page)] px-[26px] py-10">
    <div class="w-full max-w-[620px] animate-[im-fade_.3s_ease_both] text-center">
      <button type="button" class="mb-[30px] inline-flex items-center gap-2.5" @click="goHome">
        <div class="grid h-[30px] w-[30px] place-items-center rounded-sm bg-[image:linear-gradient(140deg,var(--color-green-500),var(--color-green-800))]">
          <div class="h-[11px] w-[11px] rounded-[3px_3px_1px_1px] border-[2.3px] border-b-4 border-white" />
        </div>
        <span class="font-display text-xl font-extrabold tracking-[-.025em] text-green-900">Immo</span>
      </button>

      <p class="m-0 font-mono text-[15px] font-bold text-[var(--text-faint)]">{{ error?.statusCode ?? 404 }}</p>
      <h1 class="mb-0 mt-3 font-display text-[34px] font-bold tracking-[-.03em]">Cette page n'existe pas ou plus</h1>
      <p class="mx-auto mb-0 mt-3 max-w-[440px] text-[15px] leading-[1.6] text-[var(--text-muted)]">
        L'annonce a peut-être été retirée par son propriétaire, ou le lien comporte une erreur.
      </p>

      <div class="mx-auto mt-[26px] flex max-w-[470px] gap-2.5">
        <input
          v-model="query"
          placeholder="Rechercher un logement"
          class="h-[50px] flex-1 rounded-md border border-[var(--border-default)] bg-white px-4 text-[15px] outline-none"
          @keydown.enter="search"
        >
        <button type="button" class="rounded-md bg-[image:var(--action-primary)] px-[26px] text-[15px] font-bold text-white shadow-action" @click="search">Chercher</button>
      </div>

      <div class="mt-[22px] flex flex-wrap justify-center gap-2.5">
        <NuxtLink
          v-for="l in QUICK_LINKS"
          :key="l.to"
          :to="l.to"
          class="rounded-pill border border-[var(--border-default)] bg-white px-[18px] py-[11px] text-[13.5px] font-semibold text-sand-900"
        >{{ l.label }}</NuxtLink>
      </div>
    </div>
  </div>
</template>
