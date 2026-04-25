<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()

const activeMenu = computed(() => route.path)

function onSelect(path: string) {
  router.push(path)
}
</script>

<template>
  <div class="app-shell">
    <el-menu mode="horizontal" :default-active="activeMenu" @select="onSelect">
      <el-menu-item index="/">控制台</el-menu-item>
      <el-menu-item index="/config">配置编辑</el-menu-item>
      <el-menu-item index="/logs">日志查看</el-menu-item>
    </el-menu>

    <RouterView />
  </div>
</template>

<style scoped>
.app-shell {
  min-height: 100vh;
}
</style>
