<script setup lang="ts">
const SUBJECTS = [
  'Question sur une annonce',
  'Problème de paiement',
  'Caution ou état des lieux',
  'Vérification de mon compte',
  'Signaler un abus',
  'Autre'
]

const name = ref('')
const email = ref('')
const subject = ref(SUBJECTS[0])
const message = ref('')
const sent = ref(false)

function sendContact() {
  sent.value = true
}
function resetContact() {
  sent.value = false
  name.value = ''
  email.value = ''
  message.value = ''
  subject.value = SUBJECTS[0]!
}
</script>

<template>
  <div class="mx-auto max-w-[1000px] px-[26px] pb-[70px] pt-[26px]">
    <h1 class="m-0 font-display text-[30px] font-bold tracking-[-.03em]">Nous contacter</h1>
    <p class="mb-6 mt-2.5 text-[15px] text-[var(--text-muted)]">Pour une urgence sur un bail en cours, WhatsApp reste le plus rapide.</p>

    <div class="grid grid-cols-1 items-start gap-6 lg:grid-cols-[1fr_340px]">
      <div class="rounded-2xl border border-[var(--border-subtle)] bg-white p-7">
        <template v-if="!sent">
          <div class="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            <FormsInput v-model="name" label="Nom complet" placeholder="Sèdjro Aholou" />
            <FormsInput v-model="email" type="email" label="Email" placeholder="vous@exemple.bj" />
          </div>
          <FormsSelect v-model="subject" label="Sujet" :options="SUBJECTS" class="mt-3.5" />
          <label class="mt-3.5 block">
            <span class="mb-[7px] block text-[12.5px] font-bold">Message</span>
            <textarea
              v-model="message"
              rows="6"
              placeholder="Décrivez votre situation. Si elle concerne un bail, indiquez la référence."
              class="w-full resize-y rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] p-[15px] text-[14.5px] outline-none"
            />
          </label>
          <CoreButton size="lg" class="mt-4.5" @click="sendContact">Envoyer le message</CoreButton>
        </template>

        <div v-else class="px-5 py-10 text-center">
          <div class="mx-auto grid h-[62px] w-[62px] animate-[im-pop_.5s_ease_both] place-items-center rounded-pill bg-ok-bg text-[27px] text-ok-fg">✓</div>
          <p class="mb-0 mt-5 font-display text-[23px] font-bold tracking-[-.025em]">Message envoyé</p>
          <p class="mx-auto mb-0 mt-2.5 max-w-[400px] text-[14.5px] leading-[1.6] text-[var(--text-muted)]">
            Nous répondons sous 24 h ouvrées. Une copie vient de partir sur votre adresse email.
          </p>
          <p class="mb-0 mt-4 font-mono text-[13px] text-[var(--text-faint)]">Référence · MSG-7734</p>
          <button type="button" class="mt-6 rounded-md border border-[var(--border-default)] bg-white px-6 py-3 text-sm font-bold" @click="resetContact">Envoyer un autre message</button>
        </div>
      </div>

      <div class="flex flex-col gap-3.5">
        <div class="rounded-xl bg-whatsapp p-[22px]">
          <p class="m-0 text-xs font-black uppercase tracking-[.05em] text-white/80">Le plus rapide</p>
          <p class="mb-0 mt-2.5 text-lg font-bold text-white">WhatsApp</p>
          <p class="mb-0 mt-1.5 font-mono text-[15px] font-bold text-white">+229 97 00 12 12</p>
          <p class="mb-0 mt-2 text-[12.5px] text-white/85">Tous les jours, 8 h – 20 h</p>
        </div>
        <div class="rounded-xl border border-[var(--border-subtle)] bg-white p-[22px]">
          <p class="m-0 text-xs font-black uppercase tracking-[.05em] text-[var(--text-faint)]">Téléphone</p>
          <p class="mb-0 mt-2.5 font-mono text-base font-bold">+229 21 30 45 90</p>
          <p class="mb-0 mt-2 text-[12.5px] text-[var(--text-muted)]">Lundi au vendredi, 9 h – 17 h</p>
        </div>
        <div class="rounded-xl border border-[var(--border-subtle)] bg-white p-[22px]">
          <p class="m-0 text-xs font-black uppercase tracking-[.05em] text-[var(--text-faint)]">Email et adresse</p>
          <p class="mb-0 mt-2.5 text-sm font-semibold">bonjour@immo.bj</p>
          <p class="mb-0 mt-2.5 text-[13.5px] leading-[1.5] text-[var(--text-muted)]">Lot 1247, Fidjrossè Kpota<br>Cotonou, Bénin</p>
        </div>
      </div>
    </div>
  </div>
</template>
