<script setup lang="ts">
/**
 * Panneau de décision de la fiche : état de l'annonce dans la recherche, suspension /
 * réactivation (motif obligatoire à la suspension), suppression. Chaque action se
 * confirme en ligne ; un seul panneau de confirmation ouvert à la fois sur la fiche.
 */
import { Ban, RotateCcw } from '@lucide/vue'
import {
  PROPERTY_SUSPEND_REASONS,
  isPropertyInSearch,
  propertyDeleteBlocker,
  suspendedUnitsCount,
  type PropertyDetail
} from '~/composables/useProperty'

const props = defineProps<{
  property: PropertyDetail
  canModerate: boolean
  /** Nom du propriétaire, quand son compte est chargé — pour dire qui est prévenu. */
  ownerName: string
  confirming: string | null
}>()

const emit = defineEmits<{
  'update:confirming': [string | null]
  changed: [patch: Partial<PropertyDetail>]
  deleted: []
}>()

const { moderateProperty, deleteProperty } = useProperty()

const isVirtual = computed(() => props.property._virtual === true)
const inSearch = computed(() => isPropertyInSearch(props.property))
const suspendedUnits = computed(() => suspendedUnitsCount(props.property.units ?? []))
const unitsCount = computed(() => props.property.units?.length ?? 0)
const ownerLabel = computed(() => props.ownerName || 'Le propriétaire')

function formatDate(iso: string | null | undefined) {
  return iso ? new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : ''
}

const reason = ref('')
const busy = ref(false)
const statusError = ref('')
const deleteError = ref('')
const notice = ref('')

function ask(key: 'suspend' | 'reactivate' | 'delete') {
  reason.value = ''
  statusError.value = ''
  deleteError.value = ''
  notice.value = ''
  if (key === 'delete') {
    // Refus annoncé avant la confirmation plutôt qu'après l'appel.
    const blocker = propertyDeleteBlocker(props.property.units ?? [])
    if (blocker) {
      deleteError.value = blocker
      emit('update:confirming', null)
      return
    }
  }
  emit('update:confirming', key)
}

async function setSuspended(suspended: boolean) {
  const r = reason.value.trim()
  if (suspended && !r) return
  busy.value = true
  statusError.value = ''
  try {
    const res = await moderateProperty(props.property.id, suspended, suspended ? r : undefined)
    const isSuspended = res?.is_suspended ?? suspended
    emit('changed', {
      is_suspended: isSuspended,
      suspended_reason: isSuspended ? r : null,
      suspended_at: isSuspended ? new Date().toISOString() : null
    })
    notice.value = isSuspended
      ? `Annonce suspendue : elle n'apparaît plus dans la recherche. ${ownerLabel.value} reçoit une notification.`
      : "Annonce réactivée : elle revient dans la recherche dès qu'un logement est libre."
    emit('update:confirming', null)
  } catch (e: any) {
    statusError.value = e?.message || (suspended ? 'La suspension a échoué. Réessayez.' : 'La réactivation a échoué. Réessayez.')
  } finally {
    busy.value = false
  }
}

async function remove() {
  busy.value = true
  deleteError.value = ''
  try {
    await deleteProperty(props.property.id)
    emit('deleted')
  } catch (e: any) {
    deleteError.value = e?.message || 'La suppression a échoué. Réessayez.'
    emit('update:confirming', null)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
    <h2 class="m-0 text-[15px] font-bold">Modération</h2>

    <!-- État de l'annonce -->
    <div v-if="property.is_suspended" class="mt-3.5 rounded-md border border-danger-border bg-danger-bg px-3.5 py-3">
      <p class="m-0 text-[13.5px] font-bold text-danger-fg-deep">Annonce suspendue</p>
      <p class="mb-0 mt-1 text-[12.5px] leading-[1.45] text-danger-fg-deep">
        Retirée de la recherche<template v-if="property.suspended_at"> depuis le {{ formatDate(property.suspended_at) }}</template>. Rien n'a été supprimé.
      </p>
      <p v-if="property.suspended_reason" class="mb-0 mt-1.5 text-[12.5px] leading-[1.45] text-danger-fg-deep"><span class="font-bold">Motif :</span> {{ property.suspended_reason }}</p>
    </div>
    <div v-else-if="inSearch" class="mt-3.5 rounded-md border border-ok-border bg-ok-bg px-3.5 py-3">
      <p class="m-0 text-[13.5px] font-bold text-green-900">Annonce en ligne</p>
      <p class="mb-0 mt-1 text-[12.5px] leading-[1.45] text-green-900">Visible dans la recherche : au moins un logement est libre.</p>
    </div>
    <div v-else class="mt-3.5 rounded-md bg-sand-100 px-3.5 py-3">
      <p class="m-0 text-[13.5px] font-bold text-sand-900">Hors recherche</p>
      <p class="mb-0 mt-1 text-[12.5px] leading-[1.45] text-[var(--text-secondary)]">
        {{ unitsCount ? 'Aucun logement libre : l\'annonce réapparaîtra quand un logement se libérera.' : 'Le bien n\'a aucun logement.' }}
      </p>
    </div>
    <p v-if="suspendedUnits" class="mb-0 mt-2.5 text-[12.5px] font-semibold text-danger-fg">
      {{ suspendedUnits }} logement{{ suspendedUnits > 1 ? 's' : '' }} suspendu{{ suspendedUnits > 1 ? 's' : '' }} individuellement.
    </p>

    <p v-if="!canModerate" class="mb-0 mt-4 text-[13px] text-[var(--text-muted)]">
      Lecture seule : votre niveau d'accès ne permet pas de modérer les annonces.
    </p>

    <p v-else-if="isVirtual" class="mb-0 mt-4 text-[13px] leading-[1.5] text-[var(--text-muted)]">
      Logement indépendant, sans bien parent : il se modère depuis sa ligne, dans « Logements ».
    </p>

    <template v-else>
      <!-- Suspendre / réactiver -->
      <div class="mt-4">
        <AdminInlineConfirm
          v-if="confirming === 'suspend'"
          tone="danger"
          :message="`Suspendre « ${property.name} » ? L'annonce disparaît de la recherche jusqu'à sa réactivation, sans rien supprimer. ${ownerLabel} reçoit une notification.`"
          confirm-label="Suspendre"
          :loading="busy"
          :disabled="!reason.trim()"
          @confirm="setSuspended(true)"
          @cancel="emit('update:confirming', null)"
        >
          <AdminPropertyReasonField v-model="reason" :reasons="PROPERTY_SUSPEND_REASONS" />
        </AdminInlineConfirm>
        <AdminInlineConfirm
          v-else-if="confirming === 'reactivate'"
          tone="warning"
          :message="`Réactiver « ${property.name} » ? L'annonce revient dans la recherche dès qu'un logement est libre.`"
          confirm-label="Réactiver"
          :loading="busy"
          @confirm="setSuspended(false)"
          @cancel="emit('update:confirming', null)"
        />
        <AdminButton v-else-if="property.is_suspended" variant="secondary" full-width @click="ask('reactivate')">
          <RotateCcw class="h-4 w-4" :stroke-width="1.9" /> Réactiver l'annonce
        </AdminButton>
        <AdminButton v-else variant="danger" full-width @click="ask('suspend')">
          <Ban class="h-4 w-4" :stroke-width="1.9" /> Suspendre l'annonce
        </AdminButton>
      </div>

      <p v-if="statusError" class="mb-0 mt-2.5 text-[13px] font-semibold text-danger-fg">{{ statusError }}</p>
      <p v-if="notice" class="mb-0 mt-3 rounded-md border border-ok-border bg-ok-bg px-3.5 py-2.5 text-[13px] font-semibold text-green-900">{{ notice }}</p>

      <!-- Supprimer -->
      <div class="mt-5 border-t border-sand-200 pt-4">
        <p class="m-0 text-label font-bold uppercase tracking-label text-[var(--text-faint)]">Suppression</p>
        <p class="mb-3 mt-1.5 text-[12.5px] leading-[1.45] text-[var(--text-muted)]">
          Retire définitivement le bien, ses {{ unitsCount }} logement{{ unitsCount > 1 ? 's' : '' }} et ses photos de la plateforme. Préférez la suspension si l'annonce peut être corrigée.
        </p>
        <AdminInlineConfirm
          v-if="confirming === 'delete'"
          tone="danger"
          :message="`Supprimer « ${property.name} » ? Le bien, ses logements et ses photos disparaissent de la plateforme. Cette action ne peut pas être annulée.`"
          confirm-label="Supprimer"
          :loading="busy"
          @confirm="remove"
          @cancel="emit('update:confirming', null)"
        />
        <button v-else type="button" class="cursor-pointer text-[13px] font-bold text-danger-fg hover:underline" @click="ask('delete')">Supprimer le bien</button>
        <p v-if="deleteError" class="mb-0 mt-2 text-[13px] font-semibold text-danger-fg">{{ deleteError }}</p>
      </div>
    </template>
  </section>
</template>
