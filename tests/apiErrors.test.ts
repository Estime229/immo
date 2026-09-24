import { describe, expect, it } from 'vitest'
import { mapApiError } from '../app/utils/apiErrors'

describe('mapApiError', () => {
  it('place chaque violation de validation sur son champ, en français, sans exposer defaultMessage', () => {
    const payload = {
      statusCode: 400 as const,
      error: 'VALIDATION_ERROR' as const,
      message: 'Données invalides',
      violations: [
        { field: 'deposit_amount', rule: 'isNumber', defaultMessage: 'deposit_amount must be a number' }
      ]
    }

    const mapped = mapApiError(payload, 400)

    expect(mapped.kind).toBe('validation')
    expect(mapped.fieldErrors.deposit_amount).toBe('Le montant de la caution doit être un nombre.')
    expect(mapped.fieldErrors.deposit_amount).not.toContain('must be a number')
    expect(mapped.bannerMessage).toBeNull()
  })

  it('retombe sur un message générique par règle si le couple champ+règle est inconnu', () => {
    const payload = {
      statusCode: 400 as const,
      error: 'VALIDATION_ERROR' as const,
      message: 'Données invalides',
      violations: [{ field: 'nickname', rule: 'isString', defaultMessage: 'nickname must be a string' }]
    }
    const mapped = mapApiError(payload, 400)
    expect(mapped.fieldErrors.nickname).toBe('Cette valeur doit être du texte.')
  })

  it('affiche une bannière seulement pour les violations sans champ rattachable', () => {
    const payload = {
      statusCode: 400 as const,
      error: 'VALIDATION_ERROR' as const,
      message: 'Données invalides',
      violations: [
        { field: 'email', rule: 'isEmail' },
        { field: '', rule: 'isNotEmpty', defaultMessage: 'body must not be empty' }
      ]
    }
    const mapped = mapApiError(payload, 400)
    expect(mapped.fieldErrors.email).toBe('Adresse email invalide.')
    expect(mapped.bannerMessage).toContain('Ce champ est requis.')
  })

  it('intercepte le dépassement du plafond de caution et prépare le rejeu avec depositAcknowledged', () => {
    const payload = {
      statusCode: 409,
      message: 'Le montant dépasse le plafond légal. Pour continuer, renvoyez la requête avec depositAcknowledged: true'
    }
    const mapped = mapApiError(payload, 409)
    expect(mapped.kind).toBe('deposit_ack_required')
    expect(mapped.requiresDepositAcknowledgement).toBe(true)
    // Le message technique ne doit jamais atteindre l'utilisateur tel quel.
    expect(mapped.bannerMessage).not.toContain('depositAcknowledged')
    expect(mapped.bannerMessage).toContain('Loi 2022-30')
  })

  it('reconnaît un message de solde insuffisant mentionnant la tirelire et le laisse passer tel quel', () => {
    const payload = { statusCode: 409, message: 'Solde de votre tirelire insuffisant pour ce paiement.' }
    const mapped = mapApiError(payload, 409)
    expect(mapped.kind).toBe('insufficient_balance')
    expect(mapped.bannerMessage).toBe(payload.message)
  })

  it('401 est neutre : c\'est l\'appelant (fetcher authentifié) qui décide de rafraîchir', () => {
    const mapped = mapApiError({ statusCode: 401, message: 'Unauthorized' }, 401)
    expect(mapped.kind).toBe('auth')
  })

  it('403 précise le contexte d\'équipe quand il est actif', () => {
    const generic = mapApiError({ statusCode: 403, message: 'Forbidden' }, 403)
    expect(generic.bannerMessage).toBe("Vous n'avez pas les droits pour cette action.")

    const team = mapApiError({ statusCode: 403, message: 'Forbidden' }, 403, { isTeamContext: true })
    expect(team.bannerMessage).toContain("dans ce contexte d'équipe")
  })

  it('404, 409, 429 et 5xx sont mappés avec un message affichable', () => {
    expect(mapApiError({ statusCode: 404, message: 'Bail introuvable' }, 404).kind).toBe('not_found')
    expect(mapApiError({ statusCode: 409, message: 'Bail déjà signé' }, 409).kind).toBe('conflict')

    const rateLimited = mapApiError({ statusCode: 429, message: 'Réessayez dans 30 secondes' }, 429)
    expect(rateLimited.kind).toBe('rate_limited')
    expect(rateLimited.retryAfterSeconds).toBe(30)

    const server = mapApiError({ statusCode: 500, message: 'boom' }, 500)
    expect(server.kind).toBe('server')
    expect(server.bannerMessage).not.toContain('boom') // pas de fuite d'un message technique brut
  })

  it('une panne réseau sans statut produit un état error exploitable, jamais empty', () => {
    const mapped = mapApiError(null, null)
    expect(mapped.kind).toBe('network')
    expect(mapped.bannerMessage).toBeTruthy()
  })
})
