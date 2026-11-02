<script setup lang="ts">
import { User, Users } from '@lucide/vue'

defineProps<{ team: boolean }>()
</script>

<template>
  <component :is="team ? Users : User" class="h-7 w-7" :stroke-width="1.8" />
</template>
