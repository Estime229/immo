/**
 * Relais serveur vers l'API Immo réelle.
 *
 * Le backend ne renvoie pas d'en-tête Access-Control-Allow-Origin pour
 * l'origine de ce front (confirmé le 2026-09-17 : un appel direct depuis le
 * navigateur est bloqué par le CORS du navigateur, alors que curl — hors
 * navigateur — réussit). Le navigateur appelle donc ce relais en même
 * origine, qui lui-même appelle l'API réelle serveur à serveur (pas de CORS
 * entre deux serveurs).
 *
 * S'appuie sur `proxyRequest` de h3 plutôt que sur un `$fetch` manuel : le
 * corps brut est relayé octet pour octet (indispensable pour le
 * multipart/form-data des téléversements KYC — un body JSON reconstruit à la
 * main casserait la frontière `boundary`), les en-têtes entrants sont
 * transmis tels quels (Authorization compris), et la réponse — statut, corps,
 * erreurs 4xx/5xx — est relayée sans transformation pour que mapApiError()
 * côté client la traite normalement.
 */
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const pathParam = getRouterParam(event, 'path') ?? ''
  const search = getRequestURL(event).search
  const target = `${config.apiBase}/${pathParam}${search}`

  return proxyRequest(event, target)
})
