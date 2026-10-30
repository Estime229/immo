<script setup lang="ts">
/** Litiges : signalements de type différend, nuisance, insalubrité… (liste partagée avec Maintenance). */
definePageMeta({ layout: 'admin', middleware: 'require-admin', requiredPermission: 'manage:leases' })
</script>

<template>
  <AdminSignalList kind="dispute" />
</template>
