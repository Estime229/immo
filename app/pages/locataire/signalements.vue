<script setup lang="ts">
import type { SignalPriority, SignalStatus, SignalSummary } from '~/types/tenant'

definePageMeta({ layout: 'locataire' })

const signalsApi = useSignalsApi()
const preview = useProtectedFile()
const block = useFetchBlock(() => signalsApi.list())
onMounted(block.load)

const reportOpen = useReportModal()
/** `TenantReportModal` est monté globalement dans le layout, pas ici — recharger au ferme-après-envoi plutôt que d'attendre un événement qu'il ne peut pas émettre vers cette page. */
watch(reportOpen, (open, wasOpen) => { if (!open && wasOpen) block.load() })

/** 4 étapes d'affichage dérivées des 5 statuts réels — cancelled a son propre traitement visuel. */
const STEP_LABELS = ['Déclaré', 'En examen', 'Intervention', 'Résolu']
const STATUS_TO_STEP: Record<SignalStatus, number> = { open: 1, in_review: 2, resolved: 4, closed: 4, cancelled: 0 }

function stepsFor(status: SignalStatus) {
  const current = STATUS_TO_STEP[status]
  return STEP_LABELS.map((label, i) => ({ label, active: current >= i + 1 }))
}

const PRIO_TONE: Record<SignalPriority, 'danger' | 'warn' | 'ok' | 'neutral'> = { urgent: 'danger', high: 'warn', medium: 'neutral', low: 'ok' }
const PRIO_LABEL: Record<SignalPriority, string> = { urgent: 'Urgent', high: 'Élevée', medium: 'Normal', low: 'Faible' }

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}

const openingAttachment = ref<string | null>(null)
async function openAttachment(signal: SignalSummary, index: number) {
  const key = `${signal.id}-${index}`
  openingAttachment.value = key
  await preview.load(signalsApi.attachmentDownloadUrl(signal.id, index))
  if (preview.objectUrl.value) window.open(preview.objectUrl.value, '_blank')
  openingAttachment.value = null
}
</script>

<template>
  <div class="animate-[im-fade_.3s_ease_both]">
    <div class="mb-4 flex justify-end">
      <CoreButton @click="reportOpen = true">+ Signaler un problème</CoreButton>
    </div>

    <div v-if="block.state.value === 'loading'" class="flex flex-col gap-3.5">
      <DataSkeletonCard v-for="i in 2" :key="i" :height="150" :lines="1" />
    </div>

    <FeedbackAlertBanner v-else-if="block.state.value === 'error'" tone="danger">
      Impossible de charger vos signalements pour le moment.
      <button type="button" class="ml-2 font-bold underline" @click="block.load">Réessayer</button>
    </FeedbackAlertBanner>

    <p v-else-if="block.state.value === 'empty'" class="rounded-md border border-dashed border-[var(--border-default)] bg-white px-4 py-10 text-center text-[13.5px] text-[var(--text-muted)]">
      Aucun signalement pour l'instant.
    </p>

    <template v-else>
      <div v-for="r in block.items.value" :key="r.id" class="mb-3.5 rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
        <div class="flex items-start gap-3.5">
          <div class="grid h-[42px] w-[42px] flex-none place-items-center rounded-md bg-sand-200 text-[17px]">⚑</div>
          <div class="flex-1">
            <div class="flex flex-wrap items-center gap-2.5">
              <p class="m-0 text-base font-bold tracking-[-.015em]">{{ r.title }}</p>
              <CoreBadge :tone="PRIO_TONE[r.priority]">{{ PRIO_LABEL[r.priority] }}</CoreBadge>
              <CoreBadge v-if="r.status === 'cancelled'" tone="neutral">Annulé</CoreBadge>
            </div>
            <p class="mb-0 mt-1.5 text-[13.5px] text-[var(--text-muted)]">déclaré le {{ formatDate(r.created_at) }}</p>
          </div>
        </div>

        <div v-if="r.status !== 'cancelled'" class="mt-5 flex items-start">
          <div v-for="(s, i) in stepsFor(r.status)" :key="s.label" class="flex flex-1 items-start">
            <div class="flex flex-col items-start gap-1.5">
              <span class="h-[11px] w-[11px] rounded-pill" :class="s.active ? 'bg-green-600' : 'bg-[var(--border-default)]'" />
              <span class="whitespace-nowrap text-[11px] font-semibold" :class="s.active && STATUS_TO_STEP[r.status] === i + 1 ? 'text-green-700' : 'text-[var(--text-faint)]'">{{ s.label }}</span>
            </div>
            <div v-if="i < 3" class="mt-1.5 h-0.5 flex-1" :class="STATUS_TO_STEP[r.status] > i + 1 ? 'bg-green-600' : 'bg-[var(--border-subtle)]'" />
          </div>
        </div>

        <p class="mb-0 mt-4 text-sm leading-[1.6] text-[var(--text-secondary)]">{{ r.description }}</p>

        <div v-if="r.attachment_count > 0" class="mt-3.5 flex flex-wrap gap-2">
          <button
            v-for="i in r.attachment_count"
            :key="i"
            type="button"
            class="rounded-pill border border-[var(--border-default)] bg-white px-3.5 py-2 text-[12px] font-bold text-sand-900"
            :disabled="openingAttachment === `${r.id}-${i - 1}`"
            @click="openAttachment(r, i - 1)"
          >{{ openingAttachment === `${r.id}-${i - 1}` ? '…' : `📎 Pièce jointe ${i}` }}</button>
        </div>

        <p v-if="r.resolution_notes" class="mt-4 rounded-md border border-info-border bg-info-bg p-3.5 text-[13.5px] text-info-fg-deep">
          <strong>Résolution :</strong> {{ r.resolution_notes }}
        </p>
      </div>
    </template>
  </div>
</template>
