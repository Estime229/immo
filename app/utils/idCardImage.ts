import { stackLayout } from './kycWizard'
import { UPLOAD_MAX_BYTES } from './uploadFile'

/**
 * Navigateur uniquement. `POST /user/id-card` n'accepte qu'un fichier : le
 * recto et le verso photographiés séparément sont assemblés en une seule image
 * JPEG (recto en haut), lisible par l'équipe qui vérifie. La qualité baisse
 * par paliers si l'image dépasse la limite d'envoi (4 Mo).
 */
export async function mergeIdSides(recto: File, verso: File): Promise<File> {
  const [a, b] = await Promise.all([createImageBitmap(recto), createImageBitmap(verso)])
  try {
    const layout = stackLayout({ w: a.width, h: a.height }, { w: b.width, h: b.height })
    const canvas = document.createElement('canvas')
    canvas.width = layout.width
    canvas.height = layout.height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(a, layout.a.x, layout.a.y, layout.a.w, layout.a.h)
    ctx.drawImage(b, layout.b.x, layout.b.y, layout.b.w, layout.b.h)
    for (const quality of [0.86, 0.75, 0.62, 0.5]) {
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', quality))
      if (blob && blob.size <= UPLOAD_MAX_BYTES) return new File([blob], 'piece-identite-recto-verso.jpg', { type: 'image/jpeg' })
    }
    throw new Error('trop lourd')
  } finally {
    a.close()
    b.close()
  }
}
