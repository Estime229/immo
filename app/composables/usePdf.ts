export type PdfLogoPosition = 'left' | 'center' | 'right'
export type PdfFontFamily = 'Inter' | 'Roboto' | 'Playfair Display' | 'Poppins' | 'Lato' | 'Montserrat' | 'Source Serif Pro'
export type PdfLayoutVariant = 'classic' | 'modern' | 'minimal'
export type PdfPageSize = 'A4' | 'Letter'

export interface PdfSettings {
  company_name: string
  company_address: string
  company_phone: string
  company_email: string
  logo_url: string | null
  logo_position: PdfLogoPosition
  footer_text: string
  primary_color: string
  secondary_color: string
  text_color: string
  accent_color: string
  background_color: string
  table_header_bg: string
  table_header_text: string
  table_row_alt_bg: string
  font_family: PdfFontFamily
  font_size_base: number
  layout_variant: PdfLayoutVariant
  page_size: PdfPageSize
  margin_top: number
  margin_bottom: number
  margin_sides: number
  show_logo: boolean
  show_qr_code: boolean
  show_signature_block: boolean
  show_stamp_area: boolean
  show_watermark: boolean
  watermark_text: string
  show_legal_notice: boolean
  show_company_header: boolean
}

/** Champs texte que l'API renvoie à null tant qu'ils n'ont jamais été remplis. */
const NULLABLE_TEXT = ['company_name', 'company_address', 'company_phone', 'company_email', 'footer_text', 'watermark_text'] as const
type NullableText = typeof NULLABLE_TEXT[number]

type RawPdfSettings = Omit<PdfSettings, NullableText> & { [K in NullableText]: string | null }

function normalize(raw: RawPdfSettings): PdfSettings {
  const out = { ...raw } as unknown as PdfSettings
  for (const key of NULLABLE_TEXT) out[key] = raw[key] ?? ''
  return out
}

export type AccountingFormat = 'html' | 'csv' | 'syscohada' | 'pdf'

export type PdfColorKey = 'primary_color' | 'accent_color' | 'secondary_color' | 'text_color' | 'background_color' | 'table_header_bg' | 'table_header_text' | 'table_row_alt_bg'

export const PDF_COLOR_FIELDS: Array<{ key: PdfColorKey; label: string; hint: string }> = [
  { key: 'primary_color', label: 'Principale', hint: 'En-tête, titres, filets' },
  { key: 'accent_color', label: 'Accent', hint: 'Montants mis en avant' },
  { key: 'secondary_color', label: 'Secondaire', hint: 'Fond des encadrés' },
  { key: 'text_color', label: 'Texte', hint: 'Corps du document' },
  { key: 'background_color', label: 'Fond de page', hint: 'Arrière-plan' },
  { key: 'table_header_bg', label: 'En-tête de tableau', hint: 'Fond de la première ligne' },
  { key: 'table_header_text', label: 'Texte d\'en-tête', hint: 'Sur l\'en-tête de tableau' },
  { key: 'table_row_alt_bg', label: 'Ligne alternée', hint: 'Une ligne sur deux' }
]

export function isHexColor(value: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(value.trim())
}

/** Erreurs de saisie, par champ ; objet vide = enregistrable. */
export function validatePdfSettings(s: PdfSettings): Partial<Record<keyof PdfSettings, string>> {
  const errors: Partial<Record<keyof PdfSettings, string>> = {}
  for (const { key } of PDF_COLOR_FIELDS) {
    if (!isHexColor(s[key])) errors[key] = 'Couleur au format #RRGGBB.'
  }
  if (!Number.isFinite(s.font_size_base) || s.font_size_base < 8 || s.font_size_base > 18) errors.font_size_base = 'Entre 8 et 18.'
  for (const key of ['margin_top', 'margin_bottom', 'margin_sides'] as const) {
    if (!Number.isFinite(s[key]) || s[key] < 0 || s[key] > 60) errors[key] = 'Entre 0 et 60 mm.'
  }
  if (s.company_email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.company_email.trim())) errors.company_email = 'Adresse e-mail invalide.'
  return errors
}

/** Champs modifiés par rapport à la dernière version enregistrée : seuls ceux-là partent au PATCH. */
export function pdfSettingsChanges(saved: PdfSettings, current: PdfSettings): Partial<PdfSettings> {
  const changes: Record<string, unknown> = {}
  for (const key of Object.keys(current) as Array<keyof PdfSettings>) {
    if (current[key] !== saved[key]) changes[key] = current[key]
  }
  return changes as Partial<PdfSettings>
}

export function usePdf() {
  const { apiFetch } = useApi()

  /** Réglages du compte connecté (pas de réglage global de la plateforme). */
  async function fetchSettings() {
    return normalize(await apiFetch<RawPdfSettings>('/pdf/settings'))
  }

  async function updateSettings(data: Partial<PdfSettings>) {
    return normalize(await apiFetch<RawPdfSettings>('/pdf/settings', { method: 'PATCH', body: data }))
  }

  /** Rapport du compte connecté. `pdf` part en tâche asynchrone : passer par usePdfDocument. */
  function fetchAccountingReport(month: string, format: AccountingFormat) {
    return apiFetch<string>('/pdf/accounting', { query: { month, format } })
  }

  return { fetchSettings, updateSettings, fetchAccountingReport }
}
