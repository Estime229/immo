<script setup lang="ts">
/** Maintenance : signalements de plomberie, électricité, serrurerie… (liste partagée avec Litiges). */
definePageMeta({ layout: 'admin', middleware: 'require-admin', requiredPermission: 'manage:leases' })
</script>

<template>
  <AdminSignalList kind="maintenance" />
</template>
