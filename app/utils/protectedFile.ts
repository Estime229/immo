/**
 * Récupère un fichier protégé (photo d'état des lieux, pièce jointe de
 * signalement ou de message, document KYC…) en blob, avec l'en-tête
 * d'authentification. Voir 10-SOCLE-INTEGRATION.md §5.
 *
 * Depuis le 11 août 2026, l'API ne renvoie plus d'URL de stockage directe
 * dans les payloads JSON (states des lieux, signalements, messagerie) — il
 * faut systématiquement passer par une route de téléchargement indexée et
 * authentifiée. C'est le seul point d'entrée à utiliser pour ça.
 */

export interface ProtectedFileResult {
  blob: Blob
  contentType: string | null
}

export class ProtectedFileError extends Error {
  status: number | null
  constructor(message: string, status: number | null) {
    super(message)
    this.status = status
  }
}

export async function fetchProtectedBlob(
  url: string,
  accessToken: string | null,
  fetchImpl: typeof fetch = fetch
): Promise<ProtectedFileResult> {
  let res: Response
  try {
    res = await fetchImpl(url, {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {}
    })
  } catch {
    throw new ProtectedFileError('Impossible de joindre le serveur pour récupérer ce fichier.', null)
  }

  if (!res.ok) {
    throw new ProtectedFileError(
      res.status === 404 ? 'Ce fichier est introuvable.' : 'Le fichier n\'a pas pu être récupéré.',
      res.status
    )
  }

  return {
    blob: await res.blob(),
    contentType: res.headers.get('content-type')
  }
}

/**
 * Le fichier existe-t-il ? `true` (200), `false` (404), `null` si on ne peut pas
 * savoir (réseau, 401…). Le corps n'est pas téléchargé : utile pour savoir si une
 * pièce d'identité est déposée sans rapatrier l'image à chaque page.
 */
export async function protectedFileExists(
  url: string,
  accessToken: string | null,
  fetchImpl: typeof fetch = fetch
): Promise<boolean | null> {
  try {
    const res = await fetchImpl(url, { headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {} })
    void res.body?.cancel().catch(() => {})
    if (res.ok) return true
    return res.status === 404 ? false : null
  } catch {
    return null
  }
}
