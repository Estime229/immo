import { describe, expect, it } from 'vitest'
import { parseInline, parseRichText } from '../app/utils/richText'

const plain = (text: string) => ({ text, bold: false, italic: false })
const bold = (text: string) => ({ text, bold: true, italic: false })
const italic = (text: string) => ({ text, bold: false, italic: true })

describe('parseInline — gras et italique', () => {
  it('suit WhatsApp : *gras* et _italique_', () => {
    expect(parseInline('Logement *calme* et _lumineux_.')).toEqual([plain('Logement '), bold('calme'), plain(' et '), italic('lumineux'), plain('.')])
  })

  it('comprend aussi le Markdown **gras** et ***gras italique***', () => {
    expect(parseInline('Logement **calme**')).toEqual([plain('Logement '), bold('calme')])
    expect(parseInline('***Neuf***')).toEqual([{ text: 'Neuf', bold: true, italic: true }])
  })

  it('met en italique un _passage_ à l’intérieur du gras', () => {
    expect(parseInline('*très _bien_ situé*')).toEqual([bold('très '), { text: 'bien', bold: true, italic: true }, bold(' situé')])
    expect(parseInline('**très _bien_ situé**')).toEqual([bold('très '), { text: 'bien', bold: true, italic: true }, bold(' situé')])
  })

  it('ne coupe pas un identifiant contenant des « _ »', () => {
    expect(parseInline('Réseau mon_wifi_5G')).toEqual([plain('Réseau mon_wifi_5G')])
  })

  it('garde un astérisque qui a un sens (espacé ou derrière un chiffre)', () => {
    expect(parseInline('Prix * 2')).toEqual([plain('Prix * 2')])
    expect(parseInline('Hôtel 3*')).toEqual([plain('Hôtel 3*')])
    expect(parseInline('2*3 m')).toEqual([plain('2*3 m')])
  })

  it('retire les astérisques orphelins d’une mise en forme mal refermée', () => {
    expect(parseInline('**Important : eau courante')).toEqual([plain('Important : eau courante')])
    // Annonce réelle collée depuis WhatsApp : « ** » ouvert, « * » fermé.
    expect(parseInline('**RÉCENTE CONSTRUCTION*')).toEqual([bold('RÉCENTE CONSTRUCTION')])
  })

  it("n'interprète aucun HTML : les balises restent du texte", () => {
    expect(parseInline('<script>alert(1)</script> **ok**')).toEqual([plain('<script>alert(1)</script> '), bold('ok')])
  })
})

describe('parseRichText — blocs', () => {
  it('sépare les paragraphes sur les lignes vides et garde les retours simples', () => {
    expect(parseRichText('Ligne 1\nLigne 2\n\nParagraphe 2')).toEqual([
      { type: 'paragraph', lines: [[plain('Ligne 1')], [plain('Ligne 2')]] },
      { type: 'paragraph', lines: [[plain('Paragraphe 2')]] }
    ])
  })

  it('regroupe les puces « - », « * » et « • » en une liste', () => {
    expect(parseRichText('Atouts :\n- Cuisine **équipée**\n* Forage\n• Parking')).toEqual([
      { type: 'paragraph', lines: [[plain('Atouts :')]] },
      { type: 'list', items: [[plain('Cuisine '), bold('équipée')], [plain('Forage')], [plain('Parking')]] }
    ])
  })

  it('distingue une puce « * » du gras en début de ligne', () => {
    expect(parseRichText('*Calme* et propre')).toEqual([{ type: 'paragraph', lines: [[bold('Calme'), plain(' et propre')]] }])
    expect(parseRichText('* *Seul au 2e étage*')).toEqual([{ type: 'list', items: [[bold('Seul au 2e étage')]] }])
  })

  it('transforme les intertitres « # » et ignore les séparateurs', () => {
    expect(parseRichText('## Le quartier\nProche du marché\n---\nFin')).toEqual([
      { type: 'heading', line: [plain('Le quartier')] },
      { type: 'paragraph', lines: [[plain('Proche du marché')]] },
      { type: 'paragraph', lines: [[plain('Fin')]] }
    ])
  })

  it('accepte les fins de ligne Windows, les espaces superflus et un texte vide', () => {
    expect(parseRichText('  Un\r\n\r\n\r\n  Deux  ')).toEqual([
      { type: 'paragraph', lines: [[plain('Un')]] },
      { type: 'paragraph', lines: [[plain('Deux')]] }
    ])
    expect(parseRichText('')).toEqual([])
    expect(parseRichText(null)).toEqual([])
  })
})
