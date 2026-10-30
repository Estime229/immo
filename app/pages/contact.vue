<script setup lang="ts">
import { ArrowRight, CircleCheck, Mail, MapPin, MessageCircle, Phone } from '@lucide/vue'
import { ApiRequestError } from '~/utils/authenticatedFetcher'
import { errorText } from '~/utils/apiErrors'
import { IMMO_CONTACT, telHref, validateContact, whatsappHref } from '~/utils/contact'

/**
 * Lot 56 : le formulaire affichait « Message envoyé » (avec une référence
 * inventée) sans rien envoyer. Il passe maintenant par `POST /contact`.
 * Coordonnées : une seule source (`IMMO_CONTACT`), en liens tel:, wa.me et mailto:.
 */
const SUBJECTS = [
  'Question sur une annonce',
  'Problème de paiement',
  'Caution ou état des lieux',
  'Vérification de mon compte',
  'Publier un bien sur Immo',
  'Conditions et données personnelles',
  'Signaler un abus',
  'Autre'
]

const pub = usePublicApi()
const currentUser = useAuthUser()
const route = useRoute()

const name = ref('')
const email = ref('')
const subject = ref(SUBJECTS[0]!)
const message = ref('')
const sent = ref(false)
const sending = ref(false)
const tried = ref(false)
const sendError = ref('')

/** Compte connecté : nom et e-mail déjà connus. `?sujet=` choisit le sujet (lien « Problème de paiement », par exemple), même page déjà ouverte. */
function applySubjectFromQuery() {
  const wanted = String(route.query.sujet ?? '')
  if (SUBJECTS.includes(wanted)) subject.value = wanted
}
onMounted(() => {
  const u = currentUser.value
  if (u) {
    name.value = [u.first_name, u.last_name].filter(Boolean).join(' ')
    email.value = u.email ?? ''
  }
  applySubjectFromQuery()
})
watch(() => route.query.sujet, applySubjectFromQuery)

const errors = computed(() => validateContact({ name: name.value, email: email.value, subject: subject.value, message: message.value }))
const shown = computed(() => (tried.value ? errors.value : {}))

async function sendContact() {
  tried.value = true
  sendError.value = ''
  if (Object.keys(errors.value).length) return
  sending.value = true
  try {
    await pub.post('/contact', { name: name.value.trim(), email: email.value.trim(), subject: subject.value, message: message.value.trim() })
    sent.value = true
  } catch (e) {
    // Constaté en live (Lot 56) : POST /contact répond 500 à tout envoi. Le texte saisi est gardé.
    sendError.value = e instanceof ApiRequestError && (e.status ?? 0) < 500
      ? errorText(e.mapped, "Le message n'a pas pu être envoyé.")
      : "Le message n'a pas pu être envoyé : le service de contact ne répond pas pour le moment. Votre texte est conservé, réessayez un peu plus tard ou écrivez-nous par email."
  } finally {
    sending.value = false
  }
}
function resetContact() {
  sent.value = false
  tried.value = false
  message.value = ''
  subject.value = SUBJECTS[0]!
}

const CHANNELS = [
  { key: 'whatsapp', icon: MessageCircle, label: 'WhatsApp', value: IMMO_CONTACT.whatsapp, href: whatsappHref(IMMO_CONTACT.whatsapp), mono: true, external: true },
  { key: 'phone', icon: Phone, label: 'Téléphone', value: IMMO_CONTACT.phone, href: telHref(IMMO_CONTACT.phone), mono: true, external: false },
  { key: 'email', icon: Mail, label: 'Email', value: IMMO_CONTACT.email, href: `mailto:${IMMO_CONTACT.email}`, mono: false, external: false }
]
</script>

<template>
  <div class="mx-auto max-w-[1000px] animate-[im-fade_.3s_ease_backwards] px-[26px] pb-[70px] pt-[26px]">
    <h1 class="m-0 font-display text-[30px] font-bold tracking-[-.03em]">Nous contacter</h1>
    <p class="mb-5.5 mt-2 text-[13.5px] text-[var(--text-muted)]">Une question sur une annonce, un paiement ou votre compte ? Écrivez-nous : la réponse arrive à l'adresse email que vous indiquez.</p>

    <div class="grid grid-cols-1 items-start gap-4.5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
        <template v-if="!sent">
          <div class="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            <div>
              <FormsInput v-model="name" label="Nom complet" placeholder="Sèdjro Aholou" :invalid="!!shown.name" />
              <p v-if="shown.name" class="mb-0 mt-1.5 text-[12.5px] font-semibold text-danger-fg">{{ shown.name }}</p>
            </div>
            <div>
              <FormsInput v-model="email" type="email" label="Email" placeholder="vous@exemple.bj" :invalid="!!shown.email" />
              <p v-if="shown.email" class="mb-0 mt-1.5 text-[12.5px] font-semibold text-danger-fg">{{ shown.email }}</p>
            </div>
          </div>
          <FormsSelect v-model="subject" label="Sujet" :options="SUBJECTS" class="mt-3.5" />
          <label class="mt-3.5 block">
            <span class="mb-[7px] block text-[12.5px] font-bold">Message</span>
            <textarea
              v-model="message"
              rows="6"
              maxlength="3000"
              aria-label="Message"
              placeholder="Décrivez votre situation. Si elle concerne un bail, indiquez sa référence."
              class="w-full resize-y rounded-md border bg-[var(--surface-input)] p-[15px] text-[14.5px] outline-none"
              :class="shown.message ? 'border-danger-border' : 'border-[var(--border-default)]'"
            />
          </label>
          <p v-if="shown.message" class="mb-0 mt-1.5 text-[12.5px] font-semibold text-danger-fg">{{ shown.message }}</p>
          <p v-else class="mb-0 mt-1.5 text-xs text-[var(--text-faint)]"><span class="font-mono">{{ message.trim().length }}</span> / 3 000 caractères</p>
          <p v-if="sendError" class="mb-0 mt-3.5 rounded-md border border-danger-border bg-danger-bg px-3.5 py-2.5 text-[13px] font-semibold text-danger-fg">{{ sendError }}</p>
          <CoreButton size="lg" class="mt-4.5" :disabled="sending" @click="sendContact">{{ sending ? 'Envoi…' : 'Envoyer le message' }}</CoreButton>
        </template>

        <div v-else class="px-2 py-8 text-center">
          <span class="mx-auto grid h-[62px] w-[62px] animate-[im-pop_.5s_ease_both] place-items-center rounded-pill bg-ok-bg text-ok-fg"><CircleCheck class="h-7 w-7" :stroke-width="1.9" /></span>
          <p class="mb-0 mt-5 font-display text-[23px] font-bold tracking-[-.025em]">Message envoyé</p>
          <p class="mx-auto mb-0 mt-2.5 max-w-[400px] text-[13.5px] leading-[1.6] text-[var(--text-muted)]">
            La réponse de l'équipe Immo arrivera à <strong class="text-[var(--text-primary)]">{{ email }}</strong>. Pensez à vérifier vos indésirables.
          </p>
          <div class="mt-6 flex flex-wrap justify-center gap-2.5">
            <CoreButton tone="secondary" size="sm" @click="resetContact">Envoyer un autre message</CoreButton>
            <NuxtLink to="/faq" class="inline-flex items-center gap-1.5 rounded-pill px-4 py-[9px] text-[13px] font-bold text-green-700">Questions fréquentes<ArrowRight class="h-4 w-4" :stroke-width="1.9" /></NuxtLink>
          </div>
        </div>
      </div>

      <aside class="rounded-2xl border border-[var(--border-subtle)] bg-white px-5.5 py-2 lg:sticky lg:top-[94px]">
        <a
          v-for="c in CHANNELS"
          :key="c.key"
          :href="c.href"
          :target="c.external ? '_blank' : undefined"
          :rel="c.external ? 'noopener' : undefined"
          class="group flex items-center gap-3 border-b border-sand-200 py-3.5 last:border-b-0"
        >
          <span class="grid h-10 w-10 flex-none place-items-center rounded-pill" :class="c.key === 'whatsapp' ? 'bg-whatsapp text-white' : 'bg-green-50 text-green-700'">
            <component :is="c.icon" class="h-[18px] w-[18px]" :stroke-width="1.9" />
          </span>
          <span class="min-w-0 flex-1">
            <span class="block text-xs text-[var(--text-faint)]">{{ c.label }}</span>
            <span class="block truncate text-sm font-bold group-hover:text-green-700" :class="c.mono ? 'font-mono' : ''">{{ c.value }}</span>
          </span>
          <ArrowRight class="h-4 w-4 flex-none text-[var(--text-faint)] transition-transform group-hover:translate-x-0.5" :stroke-width="1.9" />
        </a>
        <div class="flex items-start gap-3 border-t border-sand-200 py-3.5">
          <span class="grid h-10 w-10 flex-none place-items-center rounded-pill bg-sand-100 text-[var(--text-secondary)]"><MapPin class="h-[18px] w-[18px]" :stroke-width="1.9" /></span>
          <span>
            <span class="block text-xs text-[var(--text-faint)]">Adresse</span>
            <span class="block text-[13.5px] leading-[1.5] text-[var(--text-secondary)]">
              <template v-for="(line, i) in IMMO_CONTACT.addressLines" :key="line">{{ line }}<br v-if="i < IMMO_CONTACT.addressLines.length - 1"></template>
            </span>
          </span>
        </div>
      </aside>
    </div>
  </div>
</template>
