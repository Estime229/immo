<script setup lang="ts">
/** État vide ou erreur — RÈGLE : une erreur ne doit jamais ressembler à un vide. */
interface EmptyStateProps {
  title: string
  /** Pour une erreur : dire que les données existent toujours et que c'est la connexion qui a échoué */
  description?: string
  actionLabel?: string
  /** empty = pointillé neutre ; error = rouge, avec pictogramme */
  variant?: 'empty' | 'error'
}

const props = withDefaults(defineProps<EmptyStateProps>(), { variant: 'empty' })
const emit = defineEmits<{ action: [] }>()
</script>

<template>
  <div
    class="rounded-2xl p-12 text-center font-body"
    :class="props.variant === 'error' ? 'border border-danger-border bg-danger-bg' : 'border border-dashed border-[var(--border-default)] bg-white'"
  >
    <div
      v-if="props.variant === 'error'"
      class="mx-auto grid h-[46px] w-[46px] place-items-center rounded-pill bg-danger-tint text-xl font-black text-danger-fg"
    >!</div>
    <p
      class="text-lg font-bold"
      :class="props.variant === 'error' ? 'mb-0 mt-4 text-danger-fg' : 'm-0 text-[var(--text-primary)]'"
    >{{ title }}</p>
    <p
      v-if="description"
      class="mx-auto mb-[18px] mt-2 max-w-[440px] text-[14.5px] leading-[1.55]"
      :class="props.variant === 'error' ? 'text-danger-fg-deep' : 'text-[var(--text-muted)]'"
    >{{ description }}</p>
    <button
      v-if="actionLabel"
      type="button"
      class="rounded-md px-6 py-[13px] font-body text-[14.5px] font-bold"
      :class="props.variant === 'error' ? 'border-0 bg-danger-fg text-white' : 'border border-[var(--border-default)] bg-white text-[var(--text-primary)]'"
      @click="emit('action')"
    >{{ actionLabel }}</button>
  </div>
</template>
