<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()

const activeMenu = computed(() => route.path)

function onSelect(path: string) {
  router.push(path)
}

const menuItems = [
  { path: '/', label: '控制台', icon: 'Monitor' },
  { path: '/config', label: '配置编辑', icon: 'Setting' },
  { path: '/logs', label: '日志查看', icon: 'Document' },
]
</script>

<template>
  <div class="app-shell">
    <header class="app-header">
      <div class="header-brand" @click="$router.push('/')">
        <span class="brand-icon">⚡</span>
        <span class="brand-text">WebHook Server</span>
      </div>

      <el-menu
        mode="horizontal"
        :default-active="activeMenu"
        :ellipsis="false"
        class="app-nav"
        @select="onSelect"
      >
        <el-menu-item v-for="item in menuItems" :key="item.path" :index="item.path">
          <span>{{ item.label }}</span>
        </el-menu-item>
      </el-menu>
    </header>

    <main class="app-main">
      <RouterView v-slot="{ Component }">
        <Transition name="fade-slide" mode="out-in">
          <component :is="Component" />
        </Transition>
      </RouterView>
    </main>
  </div>
</template>

<style scoped>
.app-shell {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.app-header {
  position: sticky;
  top: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  height: 56px;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--border-light);
  box-shadow: var(--shadow-sm);
}

.header-brand {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
}
.brand-icon {
  font-size: 22px;
}
.brand-text {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-main);
  letter-spacing: -0.3px;
}

.app-nav {
  --el-menu-border-color: transparent;
  border-bottom: none !important;
  background: transparent;
}
.app-nav :deep(.el-menu-item) {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-secondary);
  height: 56px;
  line-height: 56px;
  border-bottom: 2px solid transparent;
  transition: color var(--transition-fast), border-color var(--transition-fast);
}
.app-nav :deep(.el-menu-item:hover) {
  color: var(--color-primary);
  background: transparent;
}
.app-nav :deep(.el-menu-item.is-active) {
  color: var(--color-primary);
  border-bottom-color: var(--color-primary);
}

.app-main {
  flex: 1;
}
</style>
