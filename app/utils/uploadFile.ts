/**
 * Limites réelles d'un envoi de fichier, mesurées en live (Lot 44) :
 * - le relais Vercel (`/api/proxy`) refuse tout corps > ~4,5 Mo
 *   (`413 FUNCTION_PAYLOAD_TOO_LARGE`, 4,4 Mo passe, 4,8 Mo échoue) ;
 * - l'API refuse > 5 Mo et tout format hors JPEG/PNG/WebP/PDF (HEIC refusé).
 * L'écran annonçait « 8 Mo max » : un fichier entre 4,5 et 8 Mo échouait donc
 * sans que l'utilisateur comprenne pourquoi.
 */
export const UPLOAD_MAX_BYTES = 4 * 1024 * 1024
export const UPLOAD_ACCEPTED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'] as const
export const UPLOAD_ACCEPT_ATTR = UPLOAD_ACCEPTED_TYPES.join(',')
export const UPLOAD_HINT = 'PDF, JPG, PNG ou WebP · 4 Mo max'

const COMPRESSIBLE = ['image/jpeg', 'image/png', 'image/webp']

export function checkUploadFile(file: { type: string; size: number }): string | null {
  if (!(UPLOAD_ACCEPTED_TYPES as readonly string[]).includes(file.type)) {
    return 'Format non accepté : envoyez un PDF ou une photo JPG, PNG ou WebP.'
  }
  if (file.size > UPLOAD_MAX_BYTES) {
    return file.type === 'application/pdf'
      ? 'Ce PDF dépasse 4 Mo. Réduisez-le (ou envoyez une photo du document) puis réessayez.'
      : 'Cette photo dépasse 4 Mo même après compression. Essayez une photo moins lourde.'
  }
  return null
}

/** Au-delà de ce poids, une photo est redimensionnée avant l'envoi (une photo de téléphone fait souvent 3 à 8 Mo). */
export function shouldCompress(file: { type: string; size: number }): boolean {
  return COMPRESSIBLE.includes(file.type) && file.size > 1.5 * 1024 * 1024
}

/** Navigateur uniquement : redimensionne (2000 px max) et réencode en JPEG. Renvoie le fichier d'origine si ça n'aide pas ou échoue. */
export async function compressImage(file: File, maxSide = 2000, quality = 0.85): Promise<File> {
  if (!shouldCompress(file)) return file
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', quality))
    if (!blob || blob.size >= file.size) return file
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' })
  } catch {
    return file
  }
}

/** Compresse si utile puis vérifie : `{ file }` prêt à envoyer, ou `{ error }` à afficher. */
export async function prepareUpload(file: File): Promise<{ file: File; error: null } | { file: null; error: string }> {
  const ready = await compressImage(file)
  const error = checkUploadFile(ready)
  return error ? { file: null, error } : { file: ready, error: null }
}
