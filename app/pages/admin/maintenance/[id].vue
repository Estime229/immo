<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'require-admin', requiredPermission: 'manage:leases' })
</script>

<template>
  <AdminSignalDetail kind="maintenance" />
</template>
