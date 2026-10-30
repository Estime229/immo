<script setup lang="ts">
/**
 * Documents & exports du compte connecté : le modèle des documents générés (formulaire en trois
 * sections, aperçu simplifié, enregistrement explicite) et l'export comptable du mois.
 * Avant : onglets maison, aucun repère des modifications non enregistrées, export PDF refusé.
 */
import { Download, ExternalLink, FileText } from '@lucide/vue'
import {
  isHexColor,
  pdfSettingsChanges,
  PDF_COLOR_FIELDS,
  validatePdfSettings,
  type AccountingFormat,
  type PdfColorKey,
  type PdfFontFamily,
  type PdfLayoutVariant,
  type PdfLogoPosition,
  type PdfPageSize,
  type PdfSettings
} from '~/composables/usePdf'

definePageMeta({ layout: 'admin', middleware: 'require-admin', requiredPermission: 'manage:settings' })

const route = useRoute()
const router = useRouter()
const currentUser = useAuthUser()
const { fetchSettings, updateSettings, fetchAccountingReport } = usePdf()
const pdfDoc = usePdfDocument()
const pdfFile = useProtectedFile()

const VIEWS = [
  { value: 'modele', label: 'Modèle de document' },
  { value: 'export', label: 'Export comptable' }
]
const view = computed(() => (route.query.vue === 'export' ? 'export' : 'modele'))
function setView(v: string) {
  router.replace({ query: { ...route.query, vue: v === 'export' ? 'export' : undefined } })
}

/* ---------- Modèle de document ---------- */
const saved = ref<PdfSettings | null>(null)
const form = ref<PdfSettings | null>(null)
const state = ref<'loading' | 'ready' | 'error'>('loading')
const saving = ref(false)
const saveError = ref('')
const saveFlash = ref('')

async function load() {
  state.value = 'loading'
  try {
    const s = await fetchSettings()
    saved.value = s
    form.value = { ...s }
    state.value = 'ready'
  } catch {
    state.value = 'error'
  }
}

const changes = computed(() => (saved.value && form.value ? pdfSettingsChanges(saved.value, form.value) : {}))
const changeCount = computed(() => Object.keys(changes.value).length)
const dirty = computed(() => changeCount.value > 0)
const errors = computed(() => (form.value ? validatePdfSettings(form.value) : {}))
const hasErrors = computed(() => Object.keys(errors.value).length > 0)
watch(dirty, d => { if (d) saveFlash.value = '' })

async function save() {
  if (!dirty.value || hasErrors.value) return
  saving.value = true
  saveError.value = ''
  try {
    const s = await updateSettings(changes.value)
    saved.value = s
    form.value = { ...s }
    saveFlash.value = 'Modèle enregistré : les prochains documents générés depuis ce compte l\'utiliseront.'
  } catch (e: any) {
    saveError.value = e?.message || 'L\'enregistrement a échoué.'
  } finally {
    saving.value = false
  }
}

function discard() {
  if (saved.value) form.value = { ...saved.value }
  saveError.value = ''
}

/** Pas de sauvegarde implicite : on prévient avant de quitter la page avec des modifications. */
onBeforeRouteLeave(() => {
  if (dirty.value && !window.confirm('Quitter sans enregistrer ? Les modifications du modèle seront perdues.')) return false
})
function onBeforeUnload(e: BeforeUnloadEvent) {
  if (!dirty.value) return
  e.preventDefault()
  e.returnValue = ''
}

const LOGO_POSITIONS = [
  { value: 'left', label: 'Gauche' },
  { value: 'center', label: 'Centre' },
  { value: 'right', label: 'Droite' }
]
const LAYOUTS = [
  { value: 'modern', label: 'Moderne' },
  { value: 'classic', label: 'Classique' },
  { value: 'minimal', label: 'Minimal' }
]
const LAYOUT_HINTS: Record<PdfLayoutVariant, string> = {
  modern: 'En-tête sur un bandeau de la couleur principale.',
  classic: 'En-tête sobre, souligné d\'un filet.',
  minimal: 'Encadrés et en-têtes de tableau sans fond, simplement soulignés.'
}
const PAGE_SIZES = [
  { value: 'A4', label: 'A4' },
  { value: 'Letter', label: 'Letter (US)' }
]
const FONTS: PdfFontFamily[] = ['Inter', 'Roboto', 'Playfair Display', 'Poppins', 'Lato', 'Montserrat', 'Source Serif Pro']
const MARGINS = [
  { key: 'margin_top', label: 'Haut' },
  { key: 'margin_bottom', label: 'Bas' },
  { key: 'margin_sides', label: 'Côtés' }
] as const
const IDENTITY_SWITCHES = [
  { key: 'show_company_header', label: 'En-tête société', hint: 'Nom et coordonnées en haut de chaque document' },
  { key: 'show_logo', label: 'Logo', hint: '' },
  { key: 'show_legal_notice', label: 'Mentions légales', hint: 'Phrase de bas de page sur la valeur du document' }
] as const
const ELEMENT_SWITCHES = [
  { key: 'show_signature_block', label: 'Bloc signature', hint: 'Emplacements de signature des parties' },
  { key: 'show_stamp_area', label: 'Zone de cachet', hint: 'Cadre réservé au tampon' },
  { key: 'show_qr_code', label: 'QR code', hint: 'Imprimé en bas du document' },
  { key: 'show_watermark', label: 'Filigrane', hint: 'Texte en travers de la page' }
] as const

function onLogoPosition(v: string) {
  if (form.value) form.value.logo_position = v as PdfLogoPosition
}
function onLayout(v: string) {
  if (form.value) form.value.layout_variant = v as PdfLayoutVariant
}
function onPageSize(v: string) {
  if (form.value) form.value.page_size = v as PdfPageSize
}
function onColorPick(key: PdfColorKey, e: Event) {
  if (form.value) form.value[key] = (e.target as HTMLInputElement).value
}

/* Aperçu : mêmes règles que le gabarit serveur (variantes, position du logo), à échelle réduite. */
const pageWidthMm = computed(() => (form.value?.page_size === 'Letter' ? 216 : 210))
const previewPadding = computed(() => {
  const f = form.value
  if (!f) return '8%'
  const pct = (mm: number) => `${Math.min(Math.max(mm, 0), 60) / pageWidthMm.value * 100}%`
  return `${pct(f.margin_top)} ${pct(f.margin_sides)} ${pct(f.margin_bottom)}`
})
const previewScale = computed(() => Math.min(Math.max(form.value?.font_size_base ?? 12, 8), 18) / 12)
function safeColor(value: string | undefined, fallback: string) {
  return value && isHexColor(value) ? value : fallback
}
const pc = computed(() => {
  const f = form.value
  return {
    primary: safeColor(f?.primary_color, '#16a34a'),
    secondary: safeColor(f?.secondary_color, '#f0fdf4'),
    accent: safeColor(f?.accent_color, '#15803d'),
    text: safeColor(f?.text_color, '#111827'),
    bg: safeColor(f?.background_color, '#ffffff'),
    thBg: safeColor(f?.table_header_bg, '#16a34a'),
    thText: safeColor(f?.table_header_text, '#ffffff'),
    alt: safeColor(f?.table_row_alt_bg, '#f9fafb')
  }
})

/* ---------- Export comptable ---------- */
function currentMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
const FORMATS: Array<{ value: AccountingFormat; label: string; hint: string }> = [
  { value: 'html', label: 'Aperçu', hint: 'Affiché sur cette page' },
  { value: 'csv', label: 'CSV', hint: 'Pour un tableur' },
  { value: 'syscohada', label: 'SYSCOHADA', hint: 'Écritures comptables, en CSV' },
  { value: 'pdf', label: 'PDF', hint: 'Fichier à archiver' }
]
const ACTION_LABEL: Record<AccountingFormat, string> = {
  html: 'Afficher l\'aperçu',
  csv: 'Télécharger le CSV',
  syscohada: 'Télécharger le CSV SYSCOHADA',
  pdf: 'Générer le PDF'
}

const maxMonth = currentMonth()
const month = ref(maxMonth)
const format = ref<AccountingFormat>('html')
const exportBusy = ref(false)
const exportError = ref('')
const exportHtml = ref('')
const exportNote = ref('')

const monthLabel = computed(() => (month.value ? new Date(`${month.value}-01T00:00:00`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }) : ''))
const pdfReady = computed(() => pdfFile.state.value === 'success' && !!pdfFile.objectUrl.value)

function resetExport() {
  exportError.value = ''
  exportHtml.value = ''
  exportNote.value = ''
  pdfFile.release()
  pdfFile.state.value = 'idle'
}
watch([month, format], resetExport)

function downloadText(text: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

async function runExport() {
  if (!month.value) return
  resetExport()
  exportBusy.value = true
  try {
    if (format.value === 'pdf') {
      // Tâche asynchrone côté serveur : sondage borné à 20 s, puis repli sur l'aperçu HTML.
      const url = `/pdf/accounting?month=${month.value}`
      const res = await pdfDoc.fetchDocument(url, url)
      if (res.mode === 'pdf') {
        await pdfFile.load(res.downloadUrl)
        if (!pdfFile.objectUrl.value) throw new Error(pdfFile.errorMessage.value ?? 'Le PDF n\'a pas pu être récupéré.')
        exportNote.value = `Le PDF de ${monthLabel.value} est prêt.`
      } else if (res.mode === 'html') {
        exportHtml.value = res.html
        exportNote.value = 'Le PDF n\'a pas pu être généré dans les 20 secondes : l\'aperçu est affiché à la place. Réessayez plus tard pour obtenir le fichier.'
      } else {
        throw new Error(res.message)
      }
    } else {
      const res = await fetchAccountingReport(month.value, format.value)
      if (format.value === 'html') {
        exportHtml.value = res
      } else {
        const filename = format.value === 'syscohada' ? `syscohada-${month.value}.csv` : `rapport-comptable-${month.value}.csv`
        downloadText(res, filename, 'text/csv;charset=utf-8')
        exportNote.value = `Fichier ${filename} téléchargé.`
      }
    }
  } catch (e: any) {
    exportError.value = e?.message || 'L\'export a échoué.'
  } finally {
    exportBusy.value = false
  }
}

function openHtmlInTab() {
  window.open(URL.createObjectURL(new Blob([exportHtml.value], { type: 'text/html' })), '_blank')
}

onMounted(() => {
  load()
  window.addEventListener('beforeunload', onBeforeUnload)
})
onBeforeUnmount(() => window.removeEventListener('beforeunload', onBeforeUnload))
</script>

<template>
  <div class="animate-[im-fade_.3s_ease_backwards]">
    <div class="mb-4.5 flex flex-wrap items-center gap-x-4 gap-y-2.5">
      <FormsSegmentedControl :model-value="view" :options="VIEWS" size="sm" @update:model-value="setView" />
      <p class="m-0 min-w-[220px] flex-1 text-[12.5px] leading-[1.5] text-[var(--text-muted)]">
        Ces réglages et cet export concernent le compte connecté<template v-if="currentUser?.email"> (<span class="font-mono">{{ currentUser.email }}</span>)</template> : ils s'appliquent aux documents générés depuis ce compte, pas à ceux des autres utilisateurs.
      </p>
    </div>

    <!-- ===== Modèle de document ===== -->
    <template v-if="view === 'modele'">
      <div v-if="state === 'loading'" class="grid grid-cols-1 gap-4.5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div class="flex flex-col gap-4.5">
          <DataSkeletonCard :height="260" :lines="0" />
          <DataSkeletonCard :height="220" :lines="0" />
        </div>
        <DataSkeletonCard :height="460" :lines="0" />
      </div>

      <FeedbackAlertBanner v-else-if="state === 'error' || !form" tone="danger">
        Impossible de charger le modèle de document.
        <button type="button" class="ml-2 font-bold underline" @click="load">Réessayer</button>
      </FeedbackAlertBanner>

      <div v-else class="grid grid-cols-1 gap-4.5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div class="flex min-w-0 flex-col gap-4.5">
          <!-- Identité -->
          <section class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
            <h2 class="m-0 text-[15px] font-bold">Identité</h2>
            <p class="mb-4 mt-1 text-[12.5px] text-[var(--text-muted)]">Ce qui apparaît en tête et en pied de chaque document.</p>
            <div class="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              <AdminInput v-model="form.company_name" label="Nom de l'entreprise" placeholder="Ex. Immo Bénin SARL" />
              <AdminInput v-model="form.company_phone" label="Téléphone" placeholder="Ex. +229 01 97 00 00 00" />
              <div class="sm:col-span-2">
                <AdminInput v-model="form.company_address" label="Adresse" placeholder="Ex. Cotonou, Bénin" />
              </div>
              <div class="sm:col-span-2">
                <AdminInput v-model="form.company_email" type="email" label="E-mail" placeholder="contact@exemple.bj" :error="errors.company_email" />
              </div>
              <div class="sm:col-span-2">
                <AdminInput v-model="form.footer_text" label="Texte du pied de page" placeholder="Ex. RCCM, IFU, conditions…" />
              </div>
            </div>

            <div class="mt-4">
              <p class="mb-[7px] mt-0 text-[12.5px] font-bold">Position du logo et du nom</p>
              <FormsSegmentedControl :model-value="form.logo_position" :options="LOGO_POSITIONS" size="sm" @update:model-value="onLogoPosition" />
            </div>

            <div class="mt-4 border-t border-sand-200">
              <div v-for="sw in IDENTITY_SWITCHES" :key="sw.key" class="flex items-center justify-between gap-3 border-b border-sand-200 py-3 last:border-b-0">
                <div class="min-w-0">
                  <p class="m-0 text-[13.5px] font-bold">{{ sw.label }}</p>
                  <p class="mb-0 mt-0.5 text-xs text-[var(--text-faint)]">
                    {{ sw.key === 'show_logo' ? (form.logo_url ? 'Logo enregistré sur ce compte' : 'Aucun logo enregistré sur ce compte : rien ne s\'affichera') : sw.hint }}
                  </p>
                </div>
                <AdminSwitch v-model="form[sw.key]" :aria-label="sw.label" />
              </div>
            </div>
          </section>

          <!-- Mise en page -->
          <section class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
            <h2 class="m-0 text-[15px] font-bold">Mise en page</h2>
            <p class="mb-4 mt-1 text-[12.5px] text-[var(--text-muted)]">Style, format, typographie et éléments imprimés.</p>

            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <p class="mb-[7px] mt-0 text-[12.5px] font-bold">Style</p>
                <FormsSegmentedControl :model-value="form.layout_variant" :options="LAYOUTS" size="sm" @update:model-value="onLayout" />
                <p class="mb-0 mt-1.5 text-xs text-[var(--text-faint)]">{{ LAYOUT_HINTS[form.layout_variant] }}</p>
              </div>
              <div>
                <p class="mb-[7px] mt-0 text-[12.5px] font-bold">Format de page</p>
                <FormsSegmentedControl :model-value="form.page_size" :options="PAGE_SIZES" size="sm" @update:model-value="onPageSize" />
              </div>
              <label class="block">
                <span class="mb-[7px] block text-[12.5px] font-bold">Police</span>
                <select v-model="form.font_family" class="h-[46px] w-full cursor-pointer rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3.5 text-[14px] outline-none focus:border-green-600">
                  <option v-for="f in FONTS" :key="f" :value="f">{{ f }}</option>
                </select>
              </label>
              <label class="block">
                <span class="mb-[7px] block text-[12.5px] font-bold">Taille du texte <span class="font-semibold text-[var(--text-faint)]">(8 à 18 px)</span></span>
                <input
                  v-model.number="form.font_size_base"
                  type="number"
                  min="8"
                  max="18"
                  class="h-[46px] w-full rounded-md border bg-[var(--surface-input)] px-3.5 font-mono text-[14px] outline-none focus:border-green-600"
                  :class="errors.font_size_base ? 'border-danger-border' : 'border-[var(--border-default)]'"
                >
                <span v-if="errors.font_size_base" class="mt-1.5 block text-[12.5px] text-danger-fg">{{ errors.font_size_base }}</span>
              </label>
            </div>

            <p class="mb-[7px] mt-4 text-[12.5px] font-bold">Marges <span class="font-semibold text-[var(--text-faint)]">(en mm, 0 à 60)</span></p>
            <div class="grid grid-cols-3 gap-2.5">
              <label v-for="m in MARGINS" :key="m.key" class="block">
                <span class="mb-1 block text-xs text-[var(--text-muted)]">{{ m.label }}</span>
                <input
                  v-model.number="form[m.key]"
                  type="number"
                  min="0"
                  max="60"
                  class="h-[42px] w-full rounded-md border bg-[var(--surface-input)] px-3 font-mono text-[13.5px] outline-none focus:border-green-600"
                  :class="errors[m.key] ? 'border-danger-border' : 'border-[var(--border-default)]'"
                >
                <span v-if="errors[m.key]" class="mt-1 block text-xs text-danger-fg">{{ errors[m.key] }}</span>
              </label>
            </div>

            <div class="mt-4 border-t border-sand-200">
              <div v-for="sw in ELEMENT_SWITCHES" :key="sw.key" class="border-b border-sand-200 py-3 last:border-b-0">
                <div class="flex items-center justify-between gap-3">
                  <div class="min-w-0">
                    <p class="m-0 text-[13.5px] font-bold">{{ sw.label }}</p>
                    <p class="mb-0 mt-0.5 text-xs text-[var(--text-faint)]">{{ sw.hint }}</p>
                  </div>
                  <AdminSwitch v-model="form[sw.key]" :aria-label="sw.label" />
                </div>
                <div v-if="sw.key === 'show_watermark' && form.show_watermark" class="mt-2.5">
                  <AdminInput v-model="form.watermark_text" placeholder="Ex. COPIE, CONFIDENTIEL…" />
                </div>
              </div>
            </div>
          </section>

          <!-- Couleurs -->
          <section class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
            <h2 class="m-0 text-[15px] font-bold">Couleurs</h2>
            <p class="mb-4 mt-1 text-[12.5px] text-[var(--text-muted)]">Au format hexadécimal, par exemple <span class="font-mono">#16A34A</span>.</p>
            <div class="grid grid-cols-1 gap-x-5 gap-y-3.5 sm:grid-cols-2">
              <div v-for="cf in PDF_COLOR_FIELDS" :key="cf.key" class="flex items-center gap-3">
                <input
                  :value="isHexColor(form[cf.key]) ? form[cf.key] : '#000000'"
                  type="color"
                  :aria-label="`Choisir la couleur ${cf.label}`"
                  class="h-10 w-10 flex-none cursor-pointer rounded-sm border border-[var(--border-default)] bg-white p-0.5"
                  @input="onColorPick(cf.key, $event)"
                >
                <div class="min-w-0 flex-1">
                  <p class="m-0 text-[13.5px] font-bold">{{ cf.label }}</p>
                  <p class="mb-0 mt-0.5 truncate text-xs" :class="errors[cf.key] ? 'font-semibold text-danger-fg' : 'text-[var(--text-faint)]'">{{ errors[cf.key] || cf.hint }}</p>
                </div>
                <input
                  v-model.trim="form[cf.key]"
                  :aria-label="`Code de la couleur ${cf.label}`"
                  maxlength="7"
                  class="h-10 w-[92px] flex-none rounded-sm border bg-[var(--surface-input)] px-2.5 font-mono text-[13px] uppercase outline-none focus:border-green-600"
                  :class="errors[cf.key] ? 'border-danger-border' : 'border-[var(--border-default)]'"
                >
              </div>
            </div>
          </section>
        </div>

        <!-- Enregistrement + aperçu -->
        <aside class="flex flex-col gap-4.5 lg:sticky lg:top-[94px] lg:self-start">
          <div class="rounded-2xl border bg-white p-5" :class="dirty ? 'border-warn-border' : 'border-[var(--border-subtle)]'">
            <div class="flex items-center gap-2.5">
              <span class="h-[9px] w-[9px] flex-none rounded-pill" :class="dirty ? 'bg-warn-fg' : 'bg-ok-fg'" />
              <p class="m-0 text-sm font-bold" :class="dirty ? 'text-warn-fg-deep' : ''">
                {{ dirty ? 'Modifications non enregistrées' : 'Modèle enregistré' }}
              </p>
            </div>
            <p class="mb-0 mt-1 text-xs text-[var(--text-muted)]">
              <template v-if="dirty"><span class="font-mono font-bold">{{ changeCount }}</span> réglage{{ changeCount > 1 ? 's' : '' }} modifié{{ changeCount > 1 ? 's' : '' }}. Rien n'est appliqué avant l'enregistrement.</template>
              <template v-else>Les documents générés utilisent ces réglages.</template>
            </p>
            <p v-if="dirty && hasErrors" class="mb-0 mt-2.5 text-[13px] font-semibold text-danger-fg">Corrigez les champs signalés en rouge avant d'enregistrer.</p>
            <div class="mt-3.5 flex flex-wrap gap-2">
              <AdminButton :disabled="!dirty || hasErrors" :loading="saving" @click="save">Enregistrer</AdminButton>
              <AdminButton v-if="dirty" variant="secondary" :disabled="saving" @click="discard">Annuler les modifications</AdminButton>
            </div>
            <p v-if="saveError" class="mb-0 mt-2.5 text-[13px] font-semibold text-danger-fg">{{ saveError }}</p>
            <p v-if="saveFlash" class="mb-0 mt-3 rounded-md border border-ok-border bg-ok-bg px-3.5 py-2.5 text-[13px] font-semibold text-green-900">{{ saveFlash }}</p>
          </div>

          <div class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5">
            <p class="m-0 text-[15px] font-bold">Aperçu</p>
            <p class="mb-3.5 mt-1 text-xs text-[var(--text-faint)]">Simplifié et à échelle réduite : le contenu réel dépend du document.</p>

            <div
              class="relative mx-auto w-full max-w-[300px] overflow-hidden rounded-xs border border-[var(--border-default)] shadow-card"
              :class="form.page_size === 'Letter' ? 'aspect-[216/279]' : 'aspect-[210/297]'"
              :style="{ backgroundColor: pc.bg, color: pc.text, fontFamily: `'${form.font_family}', sans-serif`, padding: previewPadding, fontSize: `${7 * previewScale}px` }"
            >
              <div v-if="form.show_watermark && form.watermark_text" class="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden">
                <span class="-rotate-[30deg] whitespace-nowrap text-[26px] font-bold opacity-10" :style="{ color: pc.text }">{{ form.watermark_text }}</span>
              </div>

              <div class="relative flex h-full flex-col">
                <!-- En-tête -->
                <div
                  v-if="form.show_company_header"
                  class="mb-[6%] flex gap-[6%]"
                  :class="[
                    form.logo_position === 'center' ? 'flex-col items-center text-center' : 'items-start justify-between',
                    form.layout_variant === 'modern' ? 'rounded-[4px] px-[5%] py-[4%]' : 'pb-[4%]'
                  ]"
                  :style="form.layout_variant === 'modern'
                    ? { backgroundColor: pc.primary, color: '#fff' }
                    : { borderBottom: `${form.layout_variant === 'classic' ? 1 : 1.5}px solid ${pc.primary}` }"
                >
                  <div class="flex min-w-0 items-center gap-1.5" :class="form.logo_position === 'right' ? 'order-2 flex-row-reverse text-right' : ''">
                    <img v-if="form.show_logo && form.logo_url" :src="form.logo_url" alt="" class="max-h-[18px] max-w-[48px] object-contain">
                    <div class="min-w-0">
                      <p class="m-0 truncate font-bold leading-tight" :style="{ fontSize: '1.25em', color: form.layout_variant === 'modern' ? '#fff' : pc.primary }">{{ form.company_name || 'Nom de l\'entreprise' }}</p>
                      <p class="m-0 truncate opacity-70" :style="{ fontSize: '.85em' }">{{ [form.company_address, form.company_phone].filter(Boolean).join(' · ') || 'Adresse · téléphone' }}</p>
                    </div>
                  </div>
                  <div :class="form.logo_position === 'center' ? '' : 'text-right'">
                    <p class="m-0 font-extrabold leading-none" :style="{ fontSize: '1.5em', color: form.layout_variant === 'modern' ? '#fff' : pc.primary }">QUITTANCE</p>
                    <p class="m-0 mt-0.5 opacity-70" :style="{ fontSize: '.85em' }">N° ———</p>
                  </div>
                </div>

                <!-- Parties -->
                <div class="mb-[6%] grid grid-cols-2 gap-[4%]">
                  <div
                    v-for="p in ['Bailleur', 'Locataire']"
                    :key="p"
                    class="rounded-[3px] px-[6%] py-[5%]"
                    :style="form.layout_variant === 'minimal'
                      ? { border: '1px solid #e5e7eb', borderLeft: `2px solid ${pc.primary}` }
                      : { backgroundColor: pc.secondary, borderLeft: `2px solid ${pc.primary}` }"
                  >
                    <p class="m-0 font-bold uppercase tracking-[.08em]" :style="{ color: pc.primary, fontSize: '.8em' }">{{ p }}</p>
                    <div class="mt-1 h-[3px] w-4/5 rounded-pill bg-current opacity-25" />
                    <div class="mt-[3px] h-[3px] w-3/5 rounded-pill bg-current opacity-15" />
                  </div>
                </div>

                <!-- Tableau -->
                <table class="w-full border-collapse" :style="{ fontSize: '.9em' }">
                  <thead>
                    <tr
                      :style="form.layout_variant === 'minimal'
                        ? { color: pc.primary, borderBottom: `1.5px solid ${pc.primary}` }
                        : { backgroundColor: pc.thBg, color: pc.thText }"
                    >
                      <th class="px-[3%] py-[2%] text-left font-semibold">Désignation</th>
                      <th class="px-[3%] py-[2%] text-right font-semibold">Montant</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="r in 4" :key="r" :style="r % 2 === 0 ? { backgroundColor: pc.alt } : {}">
                      <td class="px-[3%] py-[2.2%]"><div class="h-[3px] w-3/5 rounded-pill bg-current opacity-25" /></td>
                      <td class="px-[3%] py-[2.2%]"><div class="ml-auto h-[3px] w-2/5 rounded-pill bg-current opacity-25" /></td>
                    </tr>
                  </tbody>
                </table>

                <div class="mt-[5%] flex justify-end">
                  <div
                    class="rounded-[3px] px-[5%] py-[3%] text-right"
                    :style="form.layout_variant === 'minimal' ? { border: `1.5px solid ${pc.primary}`, color: pc.primary } : { backgroundColor: pc.secondary }"
                  >
                    <p class="m-0 opacity-70" :style="{ fontSize: '.8em' }">Total</p>
                    <p class="m-0 font-extrabold" :style="{ fontSize: '1.3em', color: form.layout_variant === 'minimal' ? pc.primary : pc.accent }">——— F</p>
                  </div>
                </div>

                <!-- Signatures, cachet, QR -->
                <div v-if="form.show_signature_block || form.show_stamp_area || form.show_qr_code" class="mt-auto flex items-end gap-[4%] pt-[5%]">
                  <template v-if="form.show_signature_block">
                    <div v-for="s in ['Bailleur', 'Locataire']" :key="s" class="flex-1">
                      <p class="m-0 opacity-70" :style="{ fontSize: '.8em' }">Signature {{ s.toLowerCase() }}</p>
                      <div class="mt-1 h-[22px] border-b" :style="{ borderColor: pc.text, opacity: 0.4 }" />
                    </div>
                  </template>
                  <div v-if="form.show_stamp_area" class="grid h-[30px] w-[30px] flex-none place-items-center rounded-pill border border-dashed opacity-60" :style="{ fontSize: '.7em', borderColor: pc.text }">Cachet</div>
                  <div v-if="form.show_qr_code" class="h-[24px] w-[24px] flex-none rounded-[2px] border-[3px] border-double" :style="{ borderColor: pc.text }" />
                </div>

                <!-- Pied de page -->
                <div v-if="form.footer_text || form.show_legal_notice" class="pt-[4%] text-center opacity-70" :class="form.show_signature_block || form.show_stamp_area || form.show_qr_code ? 'mt-[4%]' : 'mt-auto'" :style="{ borderTop: '1px solid #e5e7eb', fontSize: '.75em' }">
                  <p v-if="form.footer_text" class="m-0 truncate">{{ form.footer_text }}</p>
                  <p v-if="form.show_legal_notice" class="m-0">Mentions légales</p>
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </template>

    <!-- ===== Export comptable ===== -->
    <section v-else class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
      <h2 class="m-0 text-[15px] font-bold">Export comptable</h2>
      <p class="mb-4 mt-1 text-[12.5px] leading-[1.55] text-[var(--text-muted)]">
        Factures payées et impayées du mois, avec le total perçu, le total impayé et le taux d'encaissement.
      </p>

      <div class="flex flex-col gap-4">
        <label class="block w-fit">
          <span class="mb-[7px] block text-[12.5px] font-bold">Mois</span>
          <input
            v-model="month"
            type="month"
            :max="maxMonth"
            class="h-[42px] rounded-pill border border-[var(--border-default)] bg-white px-4 font-mono text-[13.5px] outline-none focus:border-green-600"
          >
        </label>

        <fieldset class="m-0 border-0 p-0">
          <legend class="mb-[7px] p-0 text-[12.5px] font-bold">Format</legend>
          <div class="grid grid-cols-2 gap-2.5 md:grid-cols-4">
            <button
              v-for="f in FORMATS"
              :key="f.value"
              type="button"
              :aria-pressed="format === f.value"
              class="rounded-md border-[1.5px] px-3.5 py-3 text-left transition-colors"
              :class="format === f.value ? 'border-green-600 bg-green-50' : 'border-[var(--border-default)] bg-white hover:bg-sand-50'"
              @click="format = f.value"
            >
              <span class="block text-[13.5px] font-bold" :class="format === f.value ? 'text-green-800' : ''">{{ f.label }}</span>
              <span class="mt-0.5 block text-xs text-[var(--text-muted)]">{{ f.hint }}</span>
            </button>
          </div>
        </fieldset>

        <div class="flex flex-wrap items-center gap-3">
          <AdminButton :disabled="!month" :loading="exportBusy" @click="runExport">
            <FileText v-if="!exportBusy" class="h-4 w-4" :stroke-width="1.9" /> {{ ACTION_LABEL[format] }}
          </AdminButton>
          <p v-if="exportBusy && format === 'pdf'" class="m-0 text-[12.5px] text-[var(--text-muted)]">Génération du PDF en cours, jusqu'à 20 secondes…</p>
        </div>

        <p v-if="exportError" class="m-0 text-[13px] font-semibold text-danger-fg">{{ exportError }}</p>
        <p v-if="exportNote" class="m-0 rounded-md border px-3.5 py-2.5 text-[13px] font-semibold" :class="exportHtml && format === 'pdf' ? 'border-warn-border bg-warn-bg text-warn-fg-deep' : 'border-ok-border bg-ok-bg text-green-900'">
          {{ exportNote }}
        </p>

        <div v-if="pdfReady" class="flex flex-wrap gap-2">
          <a :href="pdfFile.objectUrl.value ?? undefined" :download="`rapport-comptable-${month}.pdf`" class="inline-flex h-9 items-center gap-1.5 rounded-pill border border-green-600 bg-white px-4 text-[13px] font-bold text-green-700 hover:bg-green-50">
            <Download class="h-4 w-4" :stroke-width="1.9" /> Télécharger le PDF
          </a>
          <a :href="pdfFile.objectUrl.value ?? undefined" target="_blank" rel="noopener" class="inline-flex h-9 items-center gap-1.5 rounded-pill border border-[var(--border-default)] bg-white px-4 text-[13px] font-bold text-sand-900 hover:bg-sand-50">
            <ExternalLink class="h-4 w-4" :stroke-width="1.9" /> Ouvrir
          </a>
        </div>

        <div v-if="exportHtml">
          <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p class="m-0 text-[13px] font-bold">Rapport de {{ monthLabel }}</p>
            <button type="button" class="inline-flex items-center gap-1.5 text-[12.5px] font-bold text-green-700" @click="openHtmlInTab">
              <ExternalLink class="h-3.5 w-3.5" :stroke-width="1.9" /> Ouvrir dans un onglet pour l'imprimer
            </button>
          </div>
          <!-- HTML du serveur isolé dans un cadre sans script : il ne peut ni lire la page ni agir dessus. -->
          <iframe :srcdoc="exportHtml" sandbox="" title="Aperçu du rapport comptable" class="h-[70vh] w-full rounded-lg border border-[var(--border-subtle)] bg-white" />
        </div>
      </div>
    </section>
  </div>
</template>
