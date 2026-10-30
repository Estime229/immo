<script setup lang="ts">
/**
 * Fiche d'un bien côté admin : galerie, informations, propriétaire / agent et logements à
 * gauche ; panneau de modération collant à droite (sous le contenu sur mobile).
 * Un seul panneau de confirmation ouvert à la fois sur toute la fiche (`confirming`).
 */
import { propertyPhotos, type PropertyDetail, type PropertyRefs, type PropertyUnit } from '~/composables/useProperty'
import type { UserDetailResponse } from '~/composables/useUsers'

definePageMeta({ layout: 'admin', middleware: 'require-admin', requiredPermission: ['manage:properties', 'view:properties'] })

const route = useRoute()
const { fetchProperty, loadRefs } = useProperty()
const { fetchUserDetail } = useUsers()
const { hasPermission } = useAdminAuth()

const canManage = computed(() => hasPermission('manage:properties'))
/** Filtres de la liste au moment où on l'a quittée, pour que « retour » et la suppression y ramènent. */
const listQuery = useState<Record<string, string>>('admin-biens-query', () => ({}))
const flash = useState<string | null>('admin-biens-flash', () => null)
const backTo = computed(() => ({ path: '/admin/biens', query: listQuery.value }))

const propertyId = computed(() => String(route.params.id))
const property = ref<PropertyDetail | null>(null)
const state = ref<'loading' | 'ready' | 'missing' | 'error'>('loading')
const refs = ref<PropertyRefs>({})

async function load() {
  state.value = 'loading'
  try {
    property.value = await fetchProperty(propertyId.value)
    state.value = 'ready'
    loadPeople()
  } catch (e: any) {
    state.value = e?.status === 404 || e?.status === 400 ? 'missing' : 'error'
  }
}

/** Rechargement silencieux après une action : la fiche reste affichée, l'état local a déjà été mis à jour. */
async function refresh() {
  try {
    property.value = await fetchProperty(propertyId.value)
  } catch {
    // On garde l'état local corrigé par l'action ; le prochain chargement complet resynchronisera.
  }
}

onMounted(async () => {
  load()
  refs.value = await loadRefs(['PROPERTY_TYPE', 'FURNISHED_LEVEL', 'WATER_SOURCE', 'METER_TYPE', 'TOILET_TYPE'])
})

/* ---------- Propriétaire et agent ---------- */
type PersonState = { detail: UserDetailResponse | null; state: 'loading' | 'ready' | 'error' }
const owner = ref<PersonState>({ detail: null, state: 'loading' })
const agent = ref<PersonState>({ detail: null, state: 'loading' })

async function loadPerson(target: typeof owner, id: string) {
  target.value = { detail: target.value.detail, state: 'loading' }
  try {
    target.value = { detail: await fetchUserDetail(id), state: 'ready' }
  } catch {
    target.value = { detail: null, state: 'error' }
  }
}
function loadPeople() {
  const p = property.value
  if (!p) return
  if (owner.value.detail?.user.id !== p.owner_id) loadPerson(owner, p.owner_id)
  if (p.agent_id && agent.value.detail?.user.id !== p.agent_id) loadPerson(agent, p.agent_id)
}
// Dans le template, `owner` et `agent` sont déballés : on passe par ces fonctions pour garder la ref.
function retryOwner() {
  if (property.value) loadPerson(owner, property.value.owner_id)
}
function retryAgent() {
  if (property.value?.agent_id) loadPerson(agent, property.value.agent_id)
}
const ownerName = computed(() => {
  const u = owner.value.detail?.user
  return u ? personName(u.first_name, u.last_name) || u.email : ''
})

/* ---------- Actions ---------- */
const confirming = ref<string | null>(null)
const photos = computed(() => (property.value ? propertyPhotos(property.value) : []))

function onPropertyChanged(patch: Partial<PropertyDetail>) {
  if (property.value) Object.assign(property.value, patch)
  refresh()
}
function onUnitChanged(unitId: string, patch: Partial<PropertyUnit>) {
  const unit = property.value?.units.find(u => u.id === unitId)
  if (unit) Object.assign(unit, patch)
  refresh()
}
function onDeleted() {
  const p = property.value
  if (!p) return
  const n = p.units?.length ?? 0
  flash.value = n
    ? `« ${p.name} » a été supprimé, avec ses ${n > 1 ? `${n} logements` : 'logement'} et ses photos.`
    : `« ${p.name} » a été supprimé.`
  navigateTo(backTo.value)
}
</script>

<template>
  <div class="animate-[im-fade_.3s_ease_backwards]">
    <NuxtLink :to="backTo" class="mb-4 inline-flex items-center gap-1.5 text-[13px] font-bold text-[var(--text-muted)] hover:text-green-700">← Biens &amp; annonces</NuxtLink>

    <div v-if="state === 'loading'" class="grid grid-cols-1 gap-4.5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div class="flex flex-col gap-4.5">
        <DataSkeletonCard :height="320" :lines="0" />
        <DataSkeletonCard :height="180" :lines="1" />
        <DataSkeletonCard :height="160" :lines="0" />
      </div>
      <DataSkeletonCard :height="260" :lines="0" />
    </div>

    <FeedbackAlertBanner v-else-if="state === 'missing'" tone="warn">
      Ce bien est introuvable : il a peut-être été supprimé.
      <NuxtLink :to="backTo" class="ml-2 font-bold underline">Retour à la liste</NuxtLink>
    </FeedbackAlertBanner>

    <FeedbackAlertBanner v-else-if="state === 'error' || !property" tone="danger">
      Impossible de charger ce bien pour le moment.
      <button type="button" class="ml-2 font-bold underline" @click="load">Réessayer</button>
    </FeedbackAlertBanner>

    <div v-else class="grid grid-cols-1 gap-4.5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div class="flex min-w-0 flex-col gap-4.5">
        <AdminPropertyGallery :photos="photos" :name="property.name" />

        <AdminPropertyInfo :property="property" :refs="refs" :can-edit="canManage" @saved="refresh" />

        <div class="grid grid-cols-1 gap-4.5" :class="property.agent_id ? 'md:grid-cols-2' : ''">
          <AdminPropertyPersonCard
            label="Propriétaire"
            role="owner"
            :user-id="property.owner_id"
            :detail="owner.detail"
            :state="owner.state"
            @retry="retryOwner"
          />
          <AdminPropertyPersonCard
            v-if="property.agent_id"
            label="Agent"
            role="agent"
            :user-id="property.agent_id"
            :detail="agent.detail"
            :state="agent.state"
            @retry="retryAgent"
          />
        </div>

        <AdminPropertyUnits
          v-model:confirming="confirming"
          :property="property"
          :refs="refs"
          :cover-photo="photos[0]?.url ?? null"
          :can-moderate="canManage"
          @unit-changed="onUnitChanged"
        />
      </div>

      <aside class="lg:sticky lg:top-[94px] lg:self-start">
        <AdminPropertyModeration
          v-model:confirming="confirming"
          :property="property"
          :can-moderate="canManage"
          :owner-name="ownerName"
          @changed="onPropertyChanged"
          @deleted="onDeleted"
        />
      </aside>
    </div>
  </div>
</template>
