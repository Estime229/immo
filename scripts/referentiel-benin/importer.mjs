#!/usr/bin/env node
/**
 * Import des référentiels du Bénin dans l'API :
 * - lieux : les 77 communes deviennent des villes, leurs 546 arrondissements des quartiers
 *   (communes-arrondissements.json) ;
 * - types de biens, types de logements et équipements (types-et-equipements.json).
 *
 * Ajoute seulement ce qui manque (comparaison sans accents ni casse, « AKASSATO » = « Akassato » ;
 * pour les types et équipements, même code ou même libellé), ne modifie et ne supprime rien :
 * on peut le relancer sans créer de doublons.
 *
 *   node scripts/referentiel-benin/importer.mjs --apercu   # ce qui serait créé, sans connexion
 *   node scripts/referentiel-benin/importer.mjs            # connexion admin, confirmation, import
 *
 * API visée : API_BASE, sinon l'API de nuxt.config.ts. Le mot de passe est demandé
 * sans écho et ne quitte jamais la mémoire du script.
 */
import { readFileSync } from 'node:fs'
import { createInterface } from 'node:readline/promises'

const API_BASE = (process.env.API_BASE || 'https://jorgo-immo-dev-api.duckdns.org/v1/api').replace(/\/$/, '')
const PREVIEW = process.argv.includes('--apercu')
const CONCURRENCY = 4

process.on('uncaughtException', (e) => {
  console.error(`\n✗ ${e.message}`)
  process.exit(1)
})

const data = JSON.parse(readFileSync(new URL('./communes-arrondissements.json', import.meta.url), 'utf8'))
const communes = data.departements.flatMap(d => d.communes)
const refData = JSON.parse(readFileSync(new URL('./types-et-equipements.json', import.meta.url), 'utf8'))
const REF_TYPES = { PROPERTY_TYPE: 'types de biens', UNIT_TYPE: 'types de logements', FEATURE: 'équipements' }

/** « Sèmè-Podji », « SEME PODJI » et « seme-podji » désignent le même lieu. */
const key = s => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]/g, '')

let token = null
let credentials = null

async function call(method, path, body, attempt = 1) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  })
  // Jeton expiré en cours de route : on se reconnecte une fois avec les identifiants gardés en mémoire.
  if (res.status === 401 && credentials && attempt === 1) {
    await login(credentials.email, credentials.password)
    return call(method, path, body, attempt + 1)
  }
  if ((res.status === 429 || res.status >= 500) && attempt <= 3) {
    await new Promise(r => setTimeout(r, 1000 * attempt))
    return call(method, path, body, attempt + 1)
  }
  const text = await res.text()
  const json = text ? JSON.parse(text) : null
  if (!res.ok) {
    const err = new Error(`${method} ${path} → ${res.status} ${json?.message ?? text}`)
    err.status = res.status
    throw err
  }
  return json
}

async function login(email, password) {
  token = null
  const session = await call('POST', '/auth/login', { email, password })
  token = session.token
  return session
}

async function askHidden(question) {
  const stdin = process.stdin
  if (!stdin.isTTY) throw new Error('Lancez le script dans un terminal : le mot de passe se saisit au clavier.')
  process.stdout.write(question)
  stdin.setRawMode(true)
  stdin.resume()
  stdin.setEncoding('utf8')
  let value = ''
  return new Promise((resolve, reject) => {
    // Un collage arrive en un seul bloc : on lit caractère par caractère.
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n' || ch === '\u0004') {
          stdin.setRawMode(false)
          stdin.pause()
          stdin.off('data', onData)
          process.stdout.write('\n')
          return resolve(value)
        }
        if (ch === '\u0003') {
          stdin.setRawMode(false)
          return reject(new Error('Annulé.'))
        }
        value = ch === '\u007f' ? value.slice(0, -1) : value + ch
      }
    }
    stdin.on('data', onData)
  })
}

async function runPool(items, worker) {
  let next = 0
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (next < items.length) await worker(items[next++])
  }))
}

/* ---------- État actuel de l'API (routes publiques) ---------- */
console.log(`API : ${API_BASE}`)
const countries = await call('GET', '/location/countries')
const benin = countries.find(c => c.iso_code === 'BJ')
if (!benin) throw new Error('Le pays Bénin (BJ) est absent du référentiel : créez-le d\'abord.')

const existingCities = await call('GET', `/location/cities?country_id=${benin.id}`)
const cityByKey = new Map(existingCities.map(c => [key(c.name), c]))
const neighborhoods = await call('GET', '/location/neighborhoods')
const neighborhoodKeys = new Set(neighborhoods.map(n => `${n.city_id}:${key(n.name)}`))

const missingCities = communes.filter(c => !cityByKey.has(key(c.nom)))
const missingNeighborhoods = communes.reduce((n, c) => {
  const city = cityByKey.get(key(c.nom))
  return n + c.arrondissements.filter(a => !city || !neighborhoodKeys.has(`${city.id}:${key(a)}`)).length
}, 0)

// Désactivées comprises : un code désactivé par un admin ne doit pas être recréé.
const missingRefs = []
for (const type of Object.keys(REF_TYPES)) {
  const existing = await call('GET', `/ref?type=${type}&include_inactive=true`)
  const codes = new Set(existing.map(r => r.code))
  const labels = new Set(existing.map(r => key(r.labels?.fr ?? '')))
  for (const r of refData[type]) {
    if (!codes.has(r.code) && !labels.has(key(r.fr))) missingRefs.push({ type, ...r })
  }
}
const refSummary = Object.entries(REF_TYPES).map(([type, label]) => `${missingRefs.filter(r => r.type === type).length} ${label}`).join(', ')

console.log(`Déjà en base : ${existingCities.length} villes, ${neighborhoods.length} quartiers.`)
console.log(`À créer : ${missingCities.length} villes, ${missingNeighborhoods} quartiers (arrondissements), ${refSummary}.`)
if (PREVIEW) {
  if (missingCities.length) console.log(`\nVilles à créer : ${missingCities.map(c => c.nom).join(', ')}`)
  for (const [type, label] of Object.entries(REF_TYPES)) {
    const list = missingRefs.filter(r => r.type === type)
    if (list.length) console.log(`\n${label[0].toUpperCase()}${label.slice(1)} à créer : ${list.map(r => r.fr).join(', ')}`)
  }
  process.exit(0)
}
if (!missingCities.length && !missingNeighborhoods && !missingRefs.length) {
  console.log('Rien à faire : le référentiel est déjà complet.')
  process.exit(0)
}

/* ---------- Connexion admin ---------- */
const rl = createInterface({ input: process.stdin, output: process.stdout })
const email = (await rl.question('E-mail admin [admin@immo.bj] : ')).trim() || 'admin@immo.bj'
rl.close()
const password = await askHidden('Mot de passe : ')
const session = await login(email, password)
credentials = { email, password }
const roles = session.user?.roles ?? [session.user?.role]
if (!roles.includes('admin')) throw new Error(`Ce compte n'est pas administrateur (rôles : ${roles.join(', ')}).`)

const rl2 = createInterface({ input: process.stdin, output: process.stdout })
const answer = (await rl2.question(`Créer ${missingCities.length} villes, ${missingNeighborhoods} quartiers, ${refSummary} ? (oui/non) `)).trim().toLowerCase()
rl2.close()
if (answer !== 'oui' && answer !== 'o') {
  console.log('Import annulé, rien n\'a été créé.')
  process.exit(0)
}

/* ---------- Import ---------- */
const failures = []
let createdCities = 0
let createdNeighborhoods = 0

for (const c of missingCities) {
  try {
    const city = await call('POST', '/location/cities', { name: c.nom, country_id: benin.id })
    cityByKey.set(key(c.nom), city)
    createdCities++
  } catch (e) {
    failures.push(`Ville ${c.nom} : ${e.message}`)
  }
}
console.log(`✓ ${createdCities} villes créées.`)

const jobs = communes.flatMap((c) => {
  const city = cityByKey.get(key(c.nom))
  if (!city) return []
  return c.arrondissements
    .filter(a => !neighborhoodKeys.has(`${city.id}:${key(a)}`))
    .map(a => ({ city, name: a }))
})
await runPool(jobs, async ({ city, name }) => {
  try {
    await call('POST', '/location/neighborhoods', { name, city_id: city.id })
    createdNeighborhoods++
    if (createdNeighborhoods % 50 === 0) console.log(`  … ${createdNeighborhoods}/${jobs.length} quartiers`)
  } catch (e) {
    // 409 : déjà créé entre-temps (relance, autre admin) — pas une erreur.
    if (e.status !== 409) failures.push(`Quartier ${name} (${city.name}) : ${e.message}`)
  }
})
console.log(`✓ ${createdNeighborhoods} quartiers créés.`)

let createdRefs = 0
for (const r of missingRefs) {
  try {
    await call('POST', '/ref/admin', {
      type: r.type,
      code: r.code,
      labels: { fr: r.fr, en: r.en },
      metadata: { ...(r.icon ? { icon: r.icon } : {}), ...(r.category ? { category_code: r.category } : {}) },
      sort_order: r.sort_order
    })
    createdRefs++
  } catch (e) {
    // 400 « existe déjà » : créé entre-temps (relance, autre admin) — pas une erreur.
    if (!(e.status === 400 && /existe déjà/.test(e.message))) failures.push(`${REF_TYPES[r.type]} ${r.fr} : ${e.message}`)
  }
}
console.log(`✓ ${createdRefs} types et équipements créés.`)

if (failures.length) {
  console.log(`\n${failures.length} échec(s) — relancez le script pour réessayer seulement ceux-là :`)
  for (const f of failures) console.log(`  - ${f}`)
  process.exit(1)
}
console.log('Référentiels du Bénin à jour.')
