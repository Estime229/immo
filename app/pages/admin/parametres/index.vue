<script setup lang="ts">
/**
 * Paramètres système, rangés par thème. Chaque réglage a un libellé lisible et un champ adapté
 * à son type ; rien ne part sans « Enregistrer » : une valeur modifiée reste marquée « non
 * enregistrée » jusque-là. Activer le mode maintenance demande une confirmation en ligne.
 */
import { groupSettings, settingMeta, validateSettingValue, type ConfigItem } from '~/composables/useSettings'

definePageMeta({ layout: 'admin', middleware: 'require-admin', requiredPermission: 'manage:settings' })

const { fetchConfigs, updateConfig } = useSettings()

const configs = ref<ConfigItem[]>([])
const state = ref<'loading' | 'ready' | 'error'>('loading')
/** Valeur affichée dans chaque champ ; différente de `config.value` tant qu'elle n'est pas enregistrée. */
const draft = reactive<Record<string, string>>({})

async function load() {
  state.value = 'loading'
  try {
    configs.value = await fetchConfigs()
    for (const c of configs.value) draft[c.key] = c.value
    state.value = 'ready'
  } catch {
    state.value = 'error'
  }
}
onMounted(load)

const groups = computed(() => groupSettings(configs.value))
const maintenanceOn = computed(() => configs.value.some(c => c.key === 'maintenance_mode' && c.value === 'true'))

function isDirty(c: ConfigItem) {
  return draft[c.key] !== undefined && draft[c.key] !== c.value
}
const dirtyCount = computed(() => configs.value.filter(isDirty).length)

const errors = reactive<Record<string, string>>({})
const savedAt = reactive<Record<string, string>>({})
const savingKey = ref<string | null>(null)
const confirmingKey = ref<string | null>(null)

function edit(c: ConfigItem, value: string) {
  draft[c.key] = value
  errors[c.key] = ''
  delete savedAt[c.key]
  if (confirmingKey.value === c.key) confirmingKey.value = null
}

function cancel(c: ConfigItem) {
  draft[c.key] = c.value
  errors[c.key] = ''
  if (confirmingKey.value === c.key) confirmingKey.value = null
}

function requestSave(c: ConfigItem) {
  const error = validateSettingValue(c, draft[c.key] ?? '')
  if (error) {
    errors[c.key] = error
    return
  }
  const confirm = settingMeta(c).confirm
  if (confirm && draft[c.key] === confirm.value) {
    confirmingKey.value = c.key
    return
  }
  save(c)
}

async function save(c: ConfigItem) {
  const raw = draft[c.key] ?? ''
  const value = c.type === 'number' ? String(Number(raw.trim().replace(',', '.'))) : raw
  savingKey.value = c.key
  errors[c.key] = ''
  try {
    const updated = await updateConfig(c.key, value)
    const next: ConfigItem = { ...c, ...(updated && typeof updated.value === 'string' ? updated : { value }) }
    configs.value = configs.value.map(x => (x.key === c.key ? next : x))
    draft[c.key] = next.value
    savedAt[c.key] = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    confirmingKey.value = null
  } catch (e) {
    errors[c.key] = e instanceof Error && e.message ? e.message : "L'enregistrement a échoué."
  } finally {
    savingKey.value = null
  }
}

function display(c: ConfigItem, value: string) {
  if (c.type === 'boolean') return value === 'true' ? 'activé' : 'désactivé'
  const unit = settingMeta(c).unit
  if (c.type === 'number' && value !== '' && Number.isFinite(Number(value))) return `${Number(value).toLocaleString('fr-FR')}${unit ? ` ${unit}` : ''}`
  return value || 'vide'
}

function formatDay(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}
</script>

<template>
  <div class="animate-[im-fade_.3s_ease_backwards]">
    <div v-if="state === 'loading'" class="grid grid-cols-1 gap-4.5 xl:grid-cols-2">
      <DataSkeletonCard v-for="i in 4" :key="i" :height="220" :lines="1" />
    </div>

    <FeedbackAlertBanner v-else-if="state === 'error'" tone="danger">
      Impossible de charger les paramètres pour le moment.
      <button type="button" class="ml-2 font-bold underline" @click="load">Réessayer</button>
    </FeedbackAlertBanner>

    <p v-else-if="!configs.length" class="rounded-md border border-dashed border-[var(--border-default)] bg-white px-4 py-10 text-center text-[13.5px] text-[var(--text-muted)]">
      L'API ne renvoie aucun paramètre système pour l'instant.
    </p>

    <template v-else>
      <FeedbackAlertBanner v-if="maintenanceOn" tone="danger" class="mb-4.5">
        Le mode maintenance est activé : les utilisateurs ne peuvent pas accéder à Immo.
      </FeedbackAlertBanner>

      <p v-if="dirtyCount" class="sticky top-[82px] z-10 mb-4.5 mt-0 rounded-md border border-warn-border bg-warn-bg px-3.5 py-2.5 text-[13px] font-semibold text-warn-fg-deep">
        {{ dirtyCount }} réglage{{ dirtyCount > 1 ? 's' : '' }} modifié{{ dirtyCount > 1 ? 's' : '' }}, pas encore enregistré{{ dirtyCount > 1 ? 's' : '' }}.
      </p>

      <div class="grid grid-cols-1 items-start gap-4.5 xl:grid-cols-2">
        <section v-for="g in groups" :key="g.key" class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
          <h2 class="m-0 text-[15px] font-bold">{{ g.title }}</h2>
          <p class="mb-2 mt-1 text-[12.5px] leading-[1.5] text-[var(--text-muted)]">{{ g.hint }}</p>

          <div v-for="c in g.items" :key="c.key" class="border-b border-sand-200 py-4 last:border-b-0 last:pb-0">
            <div class="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
              <div class="min-w-0 flex-1 basis-[220px]">
                <p class="m-0 flex flex-wrap items-center gap-2 text-sm font-bold">
                  {{ settingMeta(c).label }}
                  <AdminBadge v-if="isDirty(c)" tone="warning">Non enregistré</AdminBadge>
                </p>
                <p v-if="settingMeta(c).help" class="mb-0 mt-0.5 text-[13px] leading-[1.45] text-[var(--text-muted)]">{{ settingMeta(c).help }}</p>
                <p class="mb-0 mt-1 text-xs text-[var(--text-faint)] [overflow-wrap:anywhere]">
                  <span class="font-mono">{{ c.key }}</span> · modifié le <span class="font-mono">{{ formatDay(c.updated_at) }}</span><template v-if="c.is_public"> · lisible sans connexion</template>
                </p>
              </div>

              <div class="flex flex-none items-center">
                <AdminSwitch
                  v-if="c.type === 'boolean'"
                  :model-value="draft[c.key] === 'true'"
                  :label="draft[c.key] === 'true' ? 'Activé' : 'Désactivé'"
                  :aria-label="settingMeta(c).label"
                  @update:model-value="v => edit(c, String(v))"
                />
                <label
                  v-else-if="c.type === 'number'"
                  class="flex h-11 items-center gap-2 rounded-sm border bg-white px-3 focus-within:border-green-600"
                  :class="errors[c.key] ? 'border-danger-border' : 'border-[var(--border-default)]'"
                >
                  <input
                    :value="draft[c.key]"
                    inputmode="decimal"
                    :aria-label="settingMeta(c).label"
                    class="w-20 bg-transparent text-right font-mono text-[14px] outline-none"
                    @input="edit(c, ($event.target as HTMLInputElement).value)"
                    @keydown.enter="requestSave(c)"
                  >
                  <span v-if="settingMeta(c).unit" class="whitespace-nowrap text-[12.5px] font-semibold text-[var(--text-muted)]">{{ settingMeta(c).unit }}</span>
                </label>
                <input
                  v-else
                  :value="draft[c.key]"
                  :aria-label="settingMeta(c).label"
                  class="h-11 w-60 max-w-full rounded-sm border bg-white px-3 text-[13.5px] outline-none focus:border-green-600"
                  :class="errors[c.key] ? 'border-danger-border' : 'border-[var(--border-default)]'"
                  @input="edit(c, ($event.target as HTMLInputElement).value)"
                  @keydown.enter="requestSave(c)"
                >
              </div>
            </div>

            <AdminInlineConfirm
              v-if="confirmingKey === c.key && settingMeta(c).confirm"
              class="mt-3"
              tone="danger"
              :message="settingMeta(c).confirm?.message ?? ''"
              :confirm-label="settingMeta(c).confirm?.label ?? 'Confirmer'"
              cancel-label="Annuler"
              :loading="savingKey === c.key"
              @confirm="save(c)"
              @cancel="confirmingKey = null"
            />
            <div v-else-if="isDirty(c)" class="mt-3 flex flex-wrap items-center gap-2">
              <AdminButton size="sm" :loading="savingKey === c.key" @click="requestSave(c)">Enregistrer</AdminButton>
              <AdminButton size="sm" variant="secondary" :disabled="savingKey === c.key" @click="cancel(c)">Annuler</AdminButton>
              <span class="text-xs text-[var(--text-faint)]">Valeur actuelle : <span class="font-mono">{{ display(c, c.value) }}</span></span>
            </div>
            <p v-else-if="savedAt[c.key]" class="mb-0 mt-2 text-[12.5px] font-semibold text-ok-fg">
              Enregistré à <span class="font-mono">{{ savedAt[c.key] }}</span> : {{ display(c, c.value) }}.
            </p>
            <p v-if="errors[c.key]" class="mb-0 mt-2 text-[13px] font-semibold text-danger-fg">{{ errors[c.key] }}</p>
          </div>
        </section>
      </div>
    </template>
  </div>
</template>
