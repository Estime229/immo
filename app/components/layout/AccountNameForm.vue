<script setup lang="ts">
import { ApiRequestError } from '~/utils/authenticatedFetcher'
import { errorText } from '~/utils/apiErrors'
import { validateSignup } from '~/utils/onboarding'

/** Prénom / nom affichés dans les espaces — voir useUserApi.updateIdentity(). */
const auth = useAuthApi()
const userApi = useUserApi()

const firstName = ref('')
const lastName = ref('')
watch(() => auth.user.value, u => {
  firstName.value = u?.first_name ?? ''
  lastName.value = u?.last_name ?? ''
}, { immediate: true })

const saving = ref(false)
const error = ref('')
const saved = ref(false)
const dirty = computed(() => firstName.value.trim() !== (auth.user.value?.first_name ?? '') || lastName.value.trim() !== (auth.user.value?.last_name ?? ''))

async function save() {
  saved.value = false
  error.value = validateSignup({ firstName: firstName.value, lastName: lastName.value }) ?? ''
  if (error.value) return
  saving.value = true
  try {
    await userApi.updateIdentity({ first_name: firstName.value.trim(), last_name: lastName.value.trim() })
    await auth.fetchMe()
    saved.value = true
  } catch (e) {
    error.value = e instanceof ApiRequestError ? errorText(e.mapped, "L'enregistrement a échoué.") : "L'enregistrement a échoué."
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="rounded-2xl border border-[var(--border-subtle)] bg-white p-6">
    <p class="m-0 text-[15px] font-bold">Nom affiché</p>
    <p class="mb-4 mt-1.5 text-[13px] text-[var(--text-muted)]">C'est le nom que voient les autres utilisateurs et celui affiché dans votre espace.</p>
    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <FormsInput v-model="firstName" label="Prénom" placeholder="Sèdjro" />
      <FormsInput v-model="lastName" label="Nom" placeholder="Aholou" />
    </div>
    <p v-if="error" class="mb-0 mt-3 text-[13px] font-semibold text-danger-fg">{{ error }}</p>
    <p v-else-if="saved && !dirty" class="mb-0 mt-3 text-[13px] font-semibold text-ok-fg">Nom enregistré ✓</p>
    <CoreButton class="mt-4" :disabled="saving || !dirty" @click="save">{{ saving ? 'Enregistrement…' : 'Enregistrer le nom' }}</CoreButton>
  </div>
</template>
