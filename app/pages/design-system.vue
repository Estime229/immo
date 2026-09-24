<script setup lang="ts">
const stepperCurrent = ref(2)
const segment = ref('longue')
const toggleOn = ref(true)
const search = ref('')
</script>

<template>
  <div class="mx-auto max-w-[1240px] px-[26px] py-12">
    <header class="mb-14">
      <p class="m-0 text-label font-bold tracking-label uppercase text-[var(--text-faint)]">Immo — Design System</p>
      <h1 class="mb-0 mt-2 font-display text-title-1 font-extrabold tracking-title-1 text-[var(--text-primary)]">
        Refonte moderne des interfaces immobilières
      </h1>
      <p class="mt-3 max-w-[620px] text-body text-[var(--text-muted)]">
        Plateforme béninoise de gestion locative : Cotonou, FCFA, Mobile Money. La caution est séquestrée par
        la plateforme — chaque montant immobilisé est justifié à l'écran.
      </p>
    </header>

    <!-- Core -->
    <section class="mb-16">
      <h2 class="mb-5 font-display text-title-3 font-bold tracking-title-3">Core — boutons, pastilles, chiffres</h2>
      <div class="flex flex-col gap-4 rounded-2xl border border-[var(--border-subtle)] bg-white p-7">
        <div class="flex flex-wrap items-center gap-2.5">
          <CoreButton size="lg">Réserver</CoreButton>
          <CoreButton>Continuer</CoreButton>
          <CoreButton tone="secondary">Voir mon bail</CoreButton>
          <CoreButton tone="danger" size="sm" pill>Payer maintenant</CoreButton>
          <CoreButton tone="ghost" size="sm" pill>Tout effacer</CoreButton>
        </div>
        <div class="flex flex-wrap items-center gap-2.5">
          <CoreButton tone="accent">Signer l'état des lieux</CoreButton>
          <CoreButton tone="secondary" size="sm" pill>Filtres</CoreButton>
          <CoreButton tone="secondary" size="sm" pill>Exporter</CoreButton>
          <CoreButton size="sm" pill disabled>Retirer</CoreButton>
        </div>
        <div class="flex flex-wrap items-center gap-2.5 pt-1">
          <CoreBadge tone="ok" bordered>✓ Propriétaire vérifié</CoreBadge>
          <CoreBadge tone="danger">En retard</CoreBadge>
          <CoreBadge tone="warn">À modérer</CoreBadge>
          <CoreBadge tone="info">Séquestre</CoreBadge>
          <CoreBadge>Brouillon</CoreBadge>
        </div>
        <div class="flex flex-wrap items-center gap-7 pt-2">
          <div class="flex items-center gap-2.5">
            <CoreAvatar name="Koffi Dossou" />
            <CoreAvatar name="Aïcha Soglo" />
            <CoreAvatar name="Rachidi Gbaguidi" />
            <CoreAvatar name="Sèdjro Aholou" :size="52" />
          </div>
          <div class="flex gap-8">
            <CoreStatValue label="Solde disponible" value="1 240 000 F" />
            <CoreStatValue label="Immobilisé" value="780 000 F" tone="locked" />
          </div>
        </div>
      </div>
    </section>

    <!-- Data -->
    <section class="mb-16">
      <h2 class="mb-5 font-display text-title-3 font-bold tracking-title-3">Données — annonces et montants</h2>
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <DataPropertyCard
          photo="radial-gradient(120% 80% at 20% 0%, rgba(255,255,255,.42), transparent 58%), linear-gradient(148deg, #cfe3d4, #7fb489 52%, #164c33)"
          title="Unité A1 — Étoile"
          subtitle="Fidjrossè · 68 m²"
          price="75 000 F"
          per=" / mois"
          rating="4.6"
          badge="Longue durée"
          verified
        />
        <DataSkeletonCard />
        <div class="rounded-xl border border-[var(--border-subtle)] bg-white p-[18px]">
          <p class="mb-[10px] mt-0 text-label font-bold tracking-label uppercase text-[var(--text-faint)]">Ce que vous payez</p>
          <DataMoneyLine label="5 nuits × 15 000 FCFA" value="75 000 FCFA" />
          <DataMoneyLine label="Frais de service (8 %)" value="6 000 FCFA" />
          <DataMoneyLine label="Code BIENVENUE (-10 %)" value="-7 500 FCFA" tone="credit" />
          <DataMoneyLine label="Total à payer" value="73 500 FCFA" total />
        </div>
      </div>
    </section>

    <!-- Feedback -->
    <section class="mb-16">
      <h2 class="mb-5 font-display text-title-3 font-bold tracking-title-3">Feedback — alertes, séquestre, avancement</h2>
      <div class="flex flex-col gap-4">
        <FeedbackAlertBanner tone="danger" action-label="Payer maintenant">
          Votre loyer de septembre, 75 000 FCFA, était dû le 5 septembre.
        </FeedbackAlertBanner>
        <FeedbackEscrowNotice amount="Dont 13 662 FCFA retenus en garantie">
          Séquestrée veut dire que ces fonds sont détenus par Immo : ni vous ni le locataire ne pouvez y toucher
          pendant le bail. Libérée à l'état des lieux de sortie.
        </FeedbackEscrowNotice>
        <FeedbackStepper :steps="['Dossier', 'État des lieux', 'Signature', 'Paiement']" :current="stepperCurrent" />
        <FeedbackEmptyState
          variant="error"
          title="Ce n'est pas un compte vide"
          description="Vos biens, vos baux et votre solde existent toujours. Il s'agit d'un incident de connexion au service."
          action-label="Réessayer"
        />
      </div>
    </section>

    <!-- Forms -->
    <section>
      <h2 class="mb-5 font-display text-title-3 font-bold tracking-title-3">Formulaires — recherche et réglages</h2>
      <div class="flex flex-col gap-5 rounded-2xl border border-[var(--border-subtle)] bg-white p-7">
        <div class="flex flex-wrap items-center gap-2.5">
          <FormsChip active removable>Fidjrossè</FormsChip>
          <FormsChip removable>2 chambres</FormsChip>
          <FormsChip>≤ 100 000 FCFA</FormsChip>
        </div>
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormsInput v-model="search" label="Rechercher un quartier" placeholder="Fidjrossè, Cotonou" />
          <FormsSelect
            label="Type de bien"
            placeholder="Tous les types"
            :options="[{ value: 'appartement', label: 'Appartement' }, { value: 'studio', label: 'Studio' }, { value: 'villa', label: 'Villa' }]"
          />
        </div>
        <FormsSegmentedControl
          v-model="segment"
          :options="[{ value: 'longue', label: 'Longue durée' }, { value: 'courte', label: 'Courte durée' }]"
        />
        <FormsToggle v-model="toggleOn" label="Disponible pour de nouvelles missions" hint="Visible immédiatement par les locataires" />
      </div>
    </section>
  </div>
</template>
