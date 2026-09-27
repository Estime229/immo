<script setup lang="ts">
/**
 * Zone de signature au doigt ou à la souris. Émet un PNG en base64 (ce que
 * l'API stocke et imprime sur le PDF de l'état des lieux), ou '' une fois effacée.
 * Propose la signature enregistrée sur le profil quand elle existe.
 */
const props = defineProps<{ modelValue?: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const signatureApi = useSignatureApi()
const canvas = ref<HTMLCanvasElement | null>(null)
const saved = ref<string | null>(null)
const remember = ref(true)
let drawing = false
let dirty = false
let last: { x: number; y: number } | null = null

onMounted(async () => {
  setup()
  try {
    saved.value = await signatureApi.fetchMine()
  } catch {
    saved.value = null
  }
})

function setup() {
  const c = canvas.value
  if (!c) return
  const ratio = window.devicePixelRatio || 1
  const rect = c.getBoundingClientRect()
  c.width = Math.round(rect.width * ratio)
  c.height = Math.round(rect.height * ratio)
  const ctx = c.getContext('2d')
  if (!ctx) return
  ctx.scale(ratio, ratio)
  ctx.lineWidth = 2.2
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = '#1f2a24'
}

function point(e: PointerEvent) {
  const rect = canvas.value!.getBoundingClientRect()
  return { x: e.clientX - rect.left, y: e.clientY - rect.top }
}

function start(e: PointerEvent) {
  if (!canvas.value) return
  // Première trace : on remesure (la fenêtre a pu s'animer ou changer de taille depuis le montage).
  if (!dirty) setup()
  canvas.value.setPointerCapture(e.pointerId)
  drawing = true
  last = point(e)
}

function move(e: PointerEvent) {
  if (!drawing || !last) return
  const ctx = canvas.value?.getContext('2d')
  if (!ctx) return
  const p = point(e)
  ctx.beginPath()
  ctx.moveTo(last.x, last.y)
  ctx.lineTo(p.x, p.y)
  ctx.stroke()
  last = p
  dirty = true
}

function end() {
  if (!drawing) return
  drawing = false
  last = null
  if (dirty && canvas.value) emit('update:modelValue', canvas.value.toDataURL('image/png'))
}

function clear() {
  const c = canvas.value
  c?.getContext('2d')?.clearRect(0, 0, c.width, c.height)
  dirty = false
  emit('update:modelValue', '')
}

function useSaved() {
  if (!saved.value) return
  clear()
  emit('update:modelValue', saved.value)
}

/** Appelé par le parent après une signature réussie. */
async function rememberIfAsked() {
  if (!remember.value || !props.modelValue || props.modelValue === saved.value) return
  try {
    await signatureApi.save(props.modelValue)
    saved.value = props.modelValue
  } catch {
    // Confort seulement : la signature du document est déjà enregistrée.
  }
}
defineExpose({ rememberIfAsked })

const usingSaved = computed(() => !!saved.value && props.modelValue === saved.value)
</script>

<template>
  <div>
    <div class="relative h-[130px] overflow-hidden rounded-md border-[1.5px] border-dashed bg-white" :class="modelValue ? 'border-green-600' : 'border-[var(--border-default)]'">
      <img v-if="usingSaved" :src="modelValue" alt="Votre signature enregistrée" class="absolute inset-0 m-auto max-h-[110px] max-w-[90%] object-contain">
      <canvas
        v-show="!usingSaved"
        ref="canvas"
        class="h-full w-full touch-none"
        aria-label="Zone de signature"
        @pointerdown="start"
        @pointermove="move"
        @pointerup="end"
        @pointerleave="end"
        @pointercancel="end"
      />
      <span v-if="!modelValue" class="pointer-events-none absolute inset-0 grid place-items-center text-[13px] text-[var(--text-faint)]">✎ Signez ici, au doigt ou à la souris</span>
    </div>
    <div class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12.5px]">
      <button v-if="modelValue" type="button" class="font-bold text-[var(--text-muted)] underline" @click="clear">Effacer</button>
      <button v-if="saved && !usingSaved" type="button" class="font-bold text-green-700 underline" @click="useSaved">Utiliser ma signature enregistrée</button>
      <label v-if="modelValue && !usingSaved" class="flex cursor-pointer items-center gap-1.5 text-[var(--text-muted)]">
        <input v-model="remember" type="checkbox" class="accent-green-600">
        Enregistrer pour mes prochaines signatures
      </label>
    </div>
  </div>
</template>
