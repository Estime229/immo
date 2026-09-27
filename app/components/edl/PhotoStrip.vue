<script setup lang="ts">
/**
 * Photos d'un élément d'état des lieux. Lecture seule : les photos serveur
 * (`count`, par index). Édition : photos serveur pas encore récupérées
 * (`existing`) + photos de la session (`urls`), ajout par l'appareil photo.
 */
const props = defineProps<{
  api: ReturnType<typeof useInventoryPhotos>
  inventoryId: string | null
  /** Position de l'élément côté serveur (pour les photos déjà enregistrées). */
  origin?: { ri: number; ii: number } | null
  /** Index des photos serveur à afficher. */
  existing?: number[]
  /** URLs de stockage des photos ajoutées ou récupérées dans la session. */
  urls?: string[]
  editable?: boolean
}>()
const emit = defineEmits<{ added: [url: string]; removeExisting: [pi: number]; removeUrl: [url: string] }>()

const srcs = ref<Record<string, string>>({})
const failed = ref<Record<string, boolean>>({})
const uploading = ref(0)
const error = ref('')
const input = ref<HTMLInputElement | null>(null)

async function loadExisting() {
  if (!props.inventoryId || !props.origin) return
  for (const pi of props.existing ?? []) {
    const k = `s${pi}`
    if (srcs.value[k] || failed.value[k]) continue
    try {
      srcs.value = { ...srcs.value, [k]: await props.api.serverPreview(props.inventoryId, props.origin.ri, props.origin.ii, pi) }
    } catch {
      failed.value = { ...failed.value, [k]: true }
    }
  }
}
onMounted(loadExisting)
watch(() => props.existing?.length, loadExisting)

async function onFiles(e: Event) {
  const files = [...((e.target as HTMLInputElement).files ?? [])]
  ;(e.target as HTMLInputElement).value = ''
  error.value = ''
  for (const f of files) {
    uploading.value++
    try {
      emit('added', await props.api.upload(f))
    } catch (err) {
      error.value = err instanceof Error ? err.message : "La photo n'a pas pu être envoyée."
    } finally {
      uploading.value--
    }
  }
}

function open(src: string | null | undefined) {
  if (src) window.open(src, '_blank')
}
</script>

<template>
  <div v-if="editable || (existing?.length ?? 0) || (urls?.length ?? 0)" class="mt-2">
    <div class="flex flex-wrap items-center gap-2">
      <div v-for="pi in existing ?? []" :key="`s${pi}`" class="relative h-16 w-16 overflow-hidden rounded-sm border border-[var(--border-default)] bg-sand-100">
        <button v-if="srcs[`s${pi}`]" type="button" class="block h-full w-full" :aria-label="`Photo ${pi + 1}`" @click="open(srcs[`s${pi}`])">
          <img :src="srcs[`s${pi}`]" alt="" class="h-full w-full object-cover">
        </button>
        <span v-else class="grid h-full w-full place-items-center text-[10.5px] text-[var(--text-faint)]">{{ failed[`s${pi}`] ? 'Indisponible' : '…' }}</span>
        <button v-if="editable" type="button" class="absolute right-0.5 top-0.5 grid h-5 w-5 place-items-center rounded-pill bg-black/60 text-[11px] text-white" aria-label="Retirer la photo" @click="emit('removeExisting', pi)">✕</button>
      </div>
      <div v-for="u in urls ?? []" :key="u" class="relative h-16 w-16 overflow-hidden rounded-sm border border-[var(--border-default)] bg-sand-100">
        <button type="button" class="block h-full w-full" aria-label="Photo" @click="open(api.localPreview(u))">
          <img v-if="api.localPreview(u)" :src="api.localPreview(u) ?? undefined" alt="" class="h-full w-full object-cover">
        </button>
        <button v-if="editable" type="button" class="absolute right-0.5 top-0.5 grid h-5 w-5 place-items-center rounded-pill bg-black/60 text-[11px] text-white" aria-label="Retirer la photo" @click="emit('removeUrl', u)">✕</button>
      </div>
      <span v-if="uploading" class="grid h-16 w-16 place-items-center rounded-sm border border-dashed border-[var(--border-default)] text-[11px] text-[var(--text-faint)]">Envoi…</span>
      <template v-if="editable">
        <input ref="input" type="file" accept="image/*" capture="environment" multiple class="hidden" @change="onFiles">
        <button type="button" class="h-16 rounded-sm border border-dashed border-[var(--border-default)] bg-white px-3 text-[12px] font-bold text-[var(--text-muted)] hover:border-green-600" @click="input?.click()">📷 Photo</button>
      </template>
    </div>
    <p v-if="error" class="mb-0 mt-1 text-[12px] font-semibold text-danger-fg">{{ error }}</p>
  </div>
</template>
