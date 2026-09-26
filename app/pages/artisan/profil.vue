<script setup lang="ts">
import type { ArtisanProfile } from '~/types/artisan'
import type { RefEntry } from '~/types/reference'
import { ApiRequestError } from '~/utils/authenticatedFetcher'
import { errorText } from '~/utils/apiErrors'

definePageMeta({ layout: 'artisan' })

const profileApi = useArtisanProfileApi()
const refData = useReferenceData()
const currentUser = useAuthUser()

const tab = ref<'infos' | 'portfolio'>('infos')
const TABS = [
  { key: 'infos' as const, label: 'Informations' },
  { key: 'portfolio' as const, label: 'Portfolio' }
]

const trades = ref<RefEntry[]>([])
onMounted(async () => {
  try {
    trades.value = await refData.fetchRef('ARTISAN_TRADE')
  } catch {
    trades.value = []
  }
})

const profile = ref<ArtisanProfile | null>(null)
const loadState = ref<'loading' | 'success' | 'error'>('loading')
async function load() {
  loadState.value = 'loading'
  try {
    profile.value = await profileApi.fetchMine()
    loadState.value = 'success'
  } catch {
    loadState.value = 'error'
  }
}
onMounted(load)

const tradeId = ref('')
const bio = ref('')
const yearsExperience = ref<number | null>(null)
watch(profile, p => {
  tradeId.value = p?.trade_reference_id ?? ''
  bio.value = p?.bio ?? ''
  yearsExperience.value = p?.years_experience ?? null
})

const saving = ref(false)
const saveError = ref('')
const saved = ref(false)
async function save() {
  saving.value = true
  saveError.value = ''
  saved.value = false
  try {
    profile.value = await profileApi.update({
      trade_reference_id: tradeId.value || undefined,
      bio: bio.value.trim() || undefined,
      years_experience: yearsExperience.value ?? undefined
    })
    saved.value = true
    setTimeout(() => { saved.value = false }, 2500)
  } catch (e) {
    saveError.value = e instanceof ApiRequestError ? errorText(e.mapped, "L'enregistrement a échoué.") : "L'enregistrement a échoué."
  } finally {
    saving.value = false
  }
}

const displayName = computed(() => {
  const u = currentUser.value
  if (!u) return 'Vous'
  return `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() || u.email
})

/* ---- Portfolio ---- */
const uploading = ref(false)
const portfolioError = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
async function onFileSelected(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  uploading.value = true
  portfolioError.value = ''
  try {
    const uploaded = await profileApi.uploadFile(file)
    await profileApi.addPortfolioMedia(uploaded.url)
    await load()
  } catch (err) {
    portfolioError.value = err instanceof ApiRequestError ? errorText(err.mapped, "L'ajout a échoué.") : "L'ajout a échoué."
  } finally {
    uploading.value = false
    if (fileInput.value) fileInput.value.value = ''
  }
}

const removingId = ref<string | null>(null)
async function removePhoto(mediaId: string) {
  removingId.value = mediaId
  portfolioError.value = ''
  try {
    await profileApi.removePortfolioMedia(mediaId)
    await load()
  } catch (err) {
    portfolioError.value = err instanceof ApiRequestError ? errorText(err.mapped, 'La suppression a échoué.') : 'La suppression a échoué.'
  } finally {
    removingId.value = null
  }
}
</script>

<template>
  <div class="animate-[im-fade_.3s_ease_both]">
    <div class="mb-5 flex flex-wrap gap-1.5">
      <button
        v-for="t in TABS"
        :key="t.key"
        type="button"
        class="rounded-pill border px-4 py-2.5 text-[13px] font-bold transition-all"
        :class="tab === t.key ? 'border-green-900 bg-green-900 text-white' : 'border-[var(--border-default)] bg-white text-[var(--text-secondary)]'"
        @click="tab = t.key"
      >{{ t.label }}</button>
    </div>

    <div v-if="loadState === 'loading'" class="max-w-[680px]"><DataSkeletonCard :height="220" :lines="3" /></div>
    <FeedbackAlertBanner v-else-if="loadState === 'error'" tone="danger">
      Impossible de charger votre profil pour le moment.
      <button type="button" class="ml-2 font-bold underline" @click="load">Réessayer</button>
    </FeedbackAlertBanner>

    <template v-else-if="tab === 'infos'">
      <LayoutAccountNameForm class="mb-4.5 max-w-[680px]" />
      <div class="max-w-[680px] rounded-2xl border border-[var(--border-subtle)] bg-white p-6">
        <div class="mb-4.5 flex items-center gap-4">
          <CoreAvatar :name="displayName" :size="64" color="var(--color-green-700)" />
          <div>
            <p class="m-0 font-display text-xl font-bold">{{ displayName }}</p>
            <p class="mb-0 mt-1 text-[13px] text-[var(--text-muted)]">
              {{ profile?.years_experience ? `${profile.years_experience} ans d'expérience` : 'Expérience non renseignée' }}
              <template v-if="profile?.reputation_score !== null && profile?.reputation_score !== undefined"> · ★ {{ profile.reputation_score.toFixed(1) }} ({{ profile.review_count }} avis)</template>
              <template v-else> · Aucun avis pour l'instant</template>
            </p>
          </div>
        </div>

        <p class="mb-2 mt-0 text-[12.5px] font-bold">Métier</p>
        <div class="mb-4.5 flex flex-wrap gap-2">
          <button
            v-for="t in trades"
            :key="t.id"
            type="button"
            class="rounded-pill border px-3.5 py-2.5 text-[13px] font-semibold transition-all"
            :class="tradeId === t.id ? 'border-green-600 bg-green-600 text-white' : 'border-[var(--border-default)] bg-white text-[var(--text-secondary)]'"
            @click="tradeId = t.id"
          >{{ t.labels.fr }}</button>
        </div>

        <p class="mb-2 mt-0 text-[12.5px] font-bold">Années d'expérience</p>
        <input v-model.number="yearsExperience" type="number" min="0" max="60" class="mb-4.5 h-11 w-32 rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3.5 text-sm outline-none">

        <p class="mb-2 mt-0 text-[12.5px] font-bold">Présentation</p>
        <textarea v-model="bio" maxlength="1000" placeholder="Plombier depuis 8 ans, spécialisé fuites et sanitaires." class="min-h-[90px] w-full resize-y rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] p-3.5 text-sm outline-none" />

        <p v-if="saveError" class="mb-0 mt-3 text-[13px] font-semibold text-danger-fg">{{ saveError }}</p>
        <CoreButton size="lg" class="mt-4.5" :disabled="saving" @click="save">{{ saving ? 'Enregistrement…' : saved ? 'Enregistré ✓' : 'Enregistrer' }}</CoreButton>
      </div>
    </template>

    <template v-else>
      <p v-if="portfolioError" class="mb-3.5 text-[13px] font-semibold text-danger-fg">{{ portfolioError }}</p>
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div v-for="p in profile?.portfolio ?? []" :key="p.id" class="group relative h-[130px] overflow-hidden rounded-lg bg-cover bg-center bg-sand-200" :style="{ backgroundImage: `url(${p.url})` }">
          <button
            v-if="p.id"
            type="button"
            class="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-pill bg-black/60 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100"
            :disabled="removingId === p.id"
            @click="removePhoto(p.id)"
          >{{ removingId === p.id ? '…' : '✕' }}</button>
        </div>
        <label class="flex h-[130px] cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-[1.5px] border-dashed border-[var(--border-default)] bg-white text-[var(--text-muted)]">
          <span class="text-xl">{{ uploading ? '…' : '＋' }}</span>
          <span class="text-[11.5px] font-bold">{{ uploading ? 'Envoi…' : 'Ajouter' }}</span>
          <input ref="fileInput" type="file" accept="image/*" class="hidden" :disabled="uploading" @change="onFileSelected">
        </label>
      </div>
    </template>
  </div>
</template>
