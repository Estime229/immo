<script setup lang="ts">
import { Camera, ImagePlus, Loader, Star, Trash2 } from '@lucide/vue'
import { ApiRequestError } from '~/utils/authenticatedFetcher'
import { errorText } from '~/utils/apiErrors'
import { prepareAvatarUpload } from '~/utils/uploadFile'
import { useArtisanProfile } from '~/composables/useArtisanProfile'

definePageMeta({ layout: 'artisan' })

const profileApi = useArtisanProfileApi()
const currentUser = useAuthUser()
const authApi = useAuthApi()
const userApi = useUserApi()
const artisan = useArtisanProfile()
const profile = artisan.profile
const route = useRoute()
const router = useRouter()

onMounted(() => {
  artisan.ensureLoaded()
  artisan.ensureTrades()
})

/* ---- Onglets (?tab=portfolio) ---- */
const TAB_OPTIONS = [
  { value: 'infos', label: 'Informations' },
  { value: 'portfolio', label: 'Portfolio' }
]
const tab = computed(() => (route.query.tab === 'portfolio' ? 'portfolio' : 'infos'))
function pickTab(value: string) {
  router.replace({ query: { ...route.query, tab: value === 'portfolio' ? 'portfolio' : undefined } })
}

/* ---- Formulaire : rempli une fois depuis le profil, pas écrasé par un rechargement du portfolio ---- */
const tradeId = ref('')
const bio = ref('')
const yearsExperience = ref('')
const formReady = ref(false)
watch(() => artisan.loaded.value, isLoaded => {
  if (!isLoaded || formReady.value) return
  const p = profile.value
  tradeId.value = p?.trade_reference_id ?? ''
  bio.value = p?.bio ?? ''
  yearsExperience.value = p?.years_experience != null ? String(p.years_experience) : ''
  formReady.value = true
}, { immediate: true })

const yearsError = computed(() => {
  const v = yearsExperience.value.trim()
  if (!v) return ''
  const n = Number(v)
  return Number.isInteger(n) && n >= 0 && n <= 60 ? '' : "Indiquez un nombre d'années entre 0 et 60."
})
const canSave = computed(() => !!tradeId.value && !yearsError.value)

const saving = ref(false)
const saveError = ref('')
const saved = ref('')
async function save() {
  if (!canSave.value) return
  const hadTrade = !!profile.value?.trade_reference_id
  saving.value = true
  saveError.value = ''
  saved.value = ''
  try {
    const updated = await profileApi.update({
      trade_reference_id: tradeId.value,
      bio: bio.value.trim() || undefined,
      years_experience: yearsExperience.value.trim() ? Number(yearsExperience.value) : undefined
    })
    artisan.setProfile(updated)
    saved.value = hadTrade ? 'Profil enregistré.' : 'Profil enregistré : vous pouvez maintenant voir les postes ouverts de votre métier.'
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

/* ---- Photo de profil ---- */
const avatarUploading = ref(false)
const avatarError = ref('')
const avatarInput = ref<HTMLInputElement | null>(null)
async function onAvatarSelected(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  avatarUploading.value = true
  avatarError.value = ''
  try {
    const ready = await prepareAvatarUpload(file)
    if (!ready.file) { avatarError.value = ready.error; return }
    await userApi.uploadAvatar(ready.file)
    await authApi.fetchMe()
  } catch (err) {
    avatarError.value = err instanceof ApiRequestError ? errorText(err.mapped, "L'envoi de la photo a échoué.") : "L'envoi de la photo a échoué."
  } finally {
    avatarUploading.value = false
    if (avatarInput.value) avatarInput.value.value = ''
  }
}

/* ---- Portfolio ---- */
const uploading = ref(false)
const portfolioError = ref('')
const portfolioNotice = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
async function onFileSelected(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  uploading.value = true
  portfolioError.value = ''
  portfolioNotice.value = ''
  try {
    const uploaded = await profileApi.uploadFile(file)
    await profileApi.addPortfolioMedia(uploaded.url)
    await artisan.refresh()
    portfolioNotice.value = 'Photo ajoutée à votre portfolio.'
  } catch (err) {
    portfolioError.value = err instanceof ApiRequestError ? errorText(err.mapped, "L'ajout a échoué.") : "L'ajout a échoué."
  } finally {
    uploading.value = false
    if (fileInput.value) fileInput.value.value = ''
  }
}

const confirmingRemove = ref<string | null>(null)
const removingId = ref<string | null>(null)
async function removePhoto(mediaId: string) {
  removingId.value = mediaId
  portfolioError.value = ''
  portfolioNotice.value = ''
  try {
    await profileApi.removePortfolioMedia(mediaId)
    confirmingRemove.value = null
    await artisan.refresh()
    portfolioNotice.value = 'Photo retirée de votre portfolio.'
  } catch (err) {
    portfolioError.value = err instanceof ApiRequestError ? errorText(err.mapped, 'La suppression a échoué.') : 'La suppression a échoué.'
  } finally {
    removingId.value = null
  }
}
</script>

<template>
  <div class="animate-[im-fade_.3s_ease_backwards]">
    <div class="mb-4.5">
      <FormsSegmentedControl :options="TAB_OPTIONS" :model-value="tab" size="sm" @update:model-value="pickTab" />
    </div>

    <div v-if="artisan.state.value === 'idle' || artisan.state.value === 'loading'" class="flex max-w-[680px] flex-col gap-4.5">
      <DataSkeletonCard :height="120" :lines="0" />
      <DataSkeletonCard :height="260" :lines="0" />
    </div>
    <FeedbackAlertBanner v-else-if="artisan.state.value === 'error'" tone="danger">
      Impossible de charger votre profil pour le moment.
      <button type="button" class="ml-2 font-bold underline" @click="artisan.load">Réessayer</button>
    </FeedbackAlertBanner>

    <div v-else-if="tab === 'infos'" class="flex max-w-[680px] flex-col gap-4.5">
      <LayoutAccountNameForm />

      <section class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
        <div class="flex items-center gap-4 border-b border-sand-200 pb-4.5">
          <div class="relative flex-none">
            <CoreAvatar :name="displayName" :avatar-url="currentUser?.avatar_url" :size="64" />
            <label
              class="absolute -bottom-1 -right-1 grid h-8 w-8 cursor-pointer place-items-center rounded-pill border-2 border-white bg-green-600 text-white shadow-card"
              :class="{ 'pointer-events-none opacity-60': avatarUploading }"
              :aria-label="avatarUploading ? 'Envoi de la photo' : 'Changer la photo de profil'"
            >
              <Loader v-if="avatarUploading" class="h-3.5 w-3.5 animate-spin" :stroke-width="1.9" aria-hidden="true" />
              <Camera v-else class="h-3.5 w-3.5" :stroke-width="1.9" aria-hidden="true" />
              <input ref="avatarInput" type="file" accept="image/*" class="hidden" :disabled="avatarUploading" @change="onAvatarSelected">
            </label>
          </div>
          <div class="min-w-0">
            <p class="m-0 truncate font-display text-xl font-bold">{{ displayName }}</p>
            <p class="mb-0 mt-1 flex flex-wrap items-center gap-x-1.5 text-[13px] text-[var(--text-muted)]">
              <span>{{ profile?.years_experience ? `${profile.years_experience} an${profile.years_experience > 1 ? 's' : ''} d'expérience` : 'Expérience non renseignée' }}</span>
              <span aria-hidden="true">·</span>
              <span v-if="profile?.reputation_score != null" class="inline-flex items-center gap-1">
                <Star class="h-3.5 w-3.5 fill-current text-clay-500" :stroke-width="1.9" aria-hidden="true" />
                <span class="font-mono">{{ profile.reputation_score.toFixed(1).replace('.', ',') }}</span> ({{ profile.review_count }} avis)
              </span>
              <span v-else>Aucun avis pour l'instant</span>
            </p>
            <p v-if="avatarError" class="mb-0 mt-1 text-[12.5px] font-semibold text-danger-fg">{{ avatarError }}</p>
          </div>
        </div>

        <!-- Métier : obligatoire, c'est lui qui décide des postes ouverts proposés -->
        <fieldset class="m-0 mt-4.5 border-0 p-0">
          <legend class="mb-[7px] p-0 text-[12.5px] font-bold">Métier <span class="font-semibold text-danger-fg">*</span></legend>
          <div v-if="artisan.tradesState.value === 'idle' || artisan.tradesState.value === 'loading'" class="flex flex-wrap gap-2">
            <span v-for="i in 4" :key="i" class="h-[38px] w-[96px] animate-pulse rounded-pill bg-sand-200" />
          </div>
          <p v-else-if="artisan.tradesState.value === 'error'" class="m-0 text-[13px] font-semibold text-danger-fg">
            La liste des métiers n'a pas pu être chargée.
            <button type="button" class="ml-1 font-bold underline" @click="artisan.loadTrades">Réessayer</button>
          </p>
          <div v-else class="flex flex-wrap gap-2">
            <button
              v-for="t in artisan.trades.value"
              :key="t.id"
              type="button"
              class="rounded-pill border px-3.5 py-2 text-[13px] font-bold transition-colors"
              :class="tradeId === t.id ? 'border-green-600 bg-green-50 text-green-800' : 'border-[var(--border-default)] bg-white text-[var(--text-secondary)] hover:bg-sand-50'"
              :aria-pressed="tradeId === t.id"
              @click="tradeId = t.id; saved = ''"
            >{{ t.labels.fr }}</button>
          </div>
          <p class="mb-0 mt-[7px] text-[12.5px]" :class="tradeId ? 'text-[var(--text-faint)]' : 'font-semibold text-warn-fg'">
            {{ tradeId ? 'Les postes ouverts proposés correspondent à ce métier.' : 'Choisissez votre métier pour recevoir des demandes.' }}
          </p>
        </fieldset>

        <div class="mt-4.5 max-w-[220px]">
          <FormsInput v-model="yearsExperience" type="number" label="Années d'expérience" :invalid="!!yearsError" :hint="yearsError || 'Facultatif'" mono />
        </div>

        <label class="mt-4.5 block">
          <span class="mb-[7px] block text-[12.5px] font-bold">Présentation</span>
          <textarea v-model="bio" maxlength="1000" placeholder="Plombier depuis 8 ans, spécialisé fuites et sanitaires." class="min-h-[96px] w-full resize-y rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] p-3.5 text-[14.5px] outline-none" />
          <span class="mt-[7px] block text-[12.5px] text-[var(--text-faint)]">Facultatif · <span class="font-mono">{{ bio.length }}</span> / 1 000 caractères</span>
        </label>

        <p v-if="saveError" class="mb-0 mt-3.5 text-[13px] font-semibold text-danger-fg">{{ saveError }}</p>
        <p v-if="saved" class="mb-0 mt-3.5 rounded-md border border-ok-border bg-ok-bg px-3.5 py-2.5 text-[13px] font-semibold text-green-900">
          {{ saved }}
          <NuxtLink to="/artisan/missions?tab=ouvertes" class="ml-1 font-bold underline">Voir les postes ouverts</NuxtLink>
        </p>
        <CoreButton class="mt-4.5" :disabled="saving || !canSave" @click="save">{{ saving ? 'Enregistrement…' : 'Enregistrer' }}</CoreButton>
      </section>
    </div>

    <section v-else class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
      <h2 class="m-0 text-[15px] font-bold">Portfolio</h2>
      <p class="mb-4 mt-1 text-[13px] text-[var(--text-muted)]">Photos de vos réalisations, rattachées à votre profil d'artisan.</p>
      <p v-if="portfolioNotice" class="mb-3.5 mt-0 rounded-md border border-ok-border bg-ok-bg px-3.5 py-2.5 text-[13px] font-semibold text-green-900">{{ portfolioNotice }}</p>
      <p v-if="portfolioError" class="mb-3.5 mt-0 text-[13px] font-semibold text-danger-fg">{{ portfolioError }}</p>

      <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <template v-for="p in profile?.portfolio ?? []" :key="p.id ?? p.url">
          <div class="relative h-[130px] overflow-hidden rounded-lg bg-sand-200 bg-cover bg-center" :class="confirmingRemove === p.id ? 'ring-2 ring-danger-fg' : ''" :style="{ backgroundImage: `url(${p.url})` }">
            <button
              v-if="p.id"
              type="button"
              class="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-pill bg-black/60 text-white hover:bg-black/75"
              aria-label="Retirer cette photo"
              :disabled="removingId === p.id"
              @click="confirmingRemove = p.id ?? null; portfolioError = ''"
            >
              <Trash2 class="h-4 w-4" :stroke-width="1.9" aria-hidden="true" />
            </button>
          </div>
          <CoreInlineConfirm
            v-if="p.id && confirmingRemove === p.id"
            class="col-span-2 sm:col-span-4"
            tone="danger"
            message="Retirer cette photo de votre portfolio ? Elle sera supprimée de votre profil."
            confirm-label="Retirer"
            :loading="removingId === p.id"
            @confirm="p.id && removePhoto(p.id)"
            @cancel="confirmingRemove = null"
          />
        </template>
        <label class="flex h-[130px] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-[1.5px] border-dashed border-[var(--border-default)] bg-white text-[var(--text-muted)] hover:bg-sand-50" :class="{ 'pointer-events-none opacity-60': uploading }">
          <Loader v-if="uploading" class="h-5 w-5 animate-spin" :stroke-width="1.9" aria-hidden="true" />
          <ImagePlus v-else class="h-5 w-5 text-green-700" :stroke-width="1.9" aria-hidden="true" />
          <span class="text-[12.5px] font-bold">{{ uploading ? 'Envoi…' : 'Ajouter une photo' }}</span>
          <input ref="fileInput" type="file" accept="image/*" class="hidden" :disabled="uploading" @change="onFileSelected">
        </label>
      </div>
    </section>
  </div>
</template>
