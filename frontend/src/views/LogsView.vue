<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { fetchLogs, formatLogJson } from '@/api/webhook'
import type { LogEntry } from '@/types/webhook'

const loading = ref(false)
const logs = ref<LogEntry[]>([])
const filePath = ref('')
const limit = ref(200)
const levelFilter = ref('all')

const levelOptions = ['all', 'error', 'warn', 'info', 'debug']

const filteredLogs = computed(() => {
  if (levelFilter.value === 'all') {
    return logs.value
  }
  return logs.value.filter((item) => {
    const parsedLevel = item.parsed && typeof item.parsed.level === 'string' ? item.parsed.level : ''
    return parsedLevel.toLowerCase() === levelFilter.value
  })
})

async function loadLogs() {
  loading.value = true
  try {
    const data = await fetchLogs(limit.value)
    logs.value = data.logs
    filePath.value = data.file
  } catch (error: any) {
    const message = error?.response?.data?.message || error?.message || '加载日志失败'
    ElMessage.error(message)
  } finally {
    loading.value = false
  }
}

function levelType(level: unknown) {
  if (typeof level !== 'string') return 'info'
  const text = level.toLowerCase()
  if (text.includes('error')) return 'danger'
  if (text.includes('warn')) return 'warning'
  if (text.includes('debug')) return 'info'
  return 'success'
}

loadLogs()
</script>

<template>
  <div class="page">
    <el-card class="panel" shadow="never" v-loading="loading">
      <template #header>
        <div class="panel-title">日志查看</div>
      </template>

      <el-form inline>
        <el-form-item label="条数">
          <el-input-number v-model="limit" :min="1" :max="1000" :step="50" />
        </el-form-item>
        <el-form-item label="级别过滤">
          <el-select v-model="levelFilter" style="width: 140px">
            <el-option v-for="item in levelOptions" :key="item" :label="item" :value="item" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="loadLogs" :loading="loading">刷新日志</el-button>
        </el-form-item>
      </el-form>

      <el-alert :closable="false" type="info" show-icon style="margin-bottom: 12px">
        <template #title>日志文件：{{ filePath || '未知' }}</template>
      </el-alert>

      <el-empty v-if="!filteredLogs.length" description="暂无日志数据" />

      <div v-else class="json-log-list">
        <el-card v-for="item in filteredLogs" :key="item.id" class="json-log-card" shadow="hover">
          <template #header>
            <div class="json-log-header">
              <span>{{ (item.parsed && item.parsed.timestamp) || '无时间戳' }}</span>
              <el-tag size="small" :type="levelType(item.parsed && item.parsed.level)">
                {{ (item.parsed && item.parsed.level) || 'unknown' }}
              </el-tag>
            </div>
          </template>
          <pre class="json-log-content">{{ formatLogJson(item) }}</pre>
        </el-card>
      </div>
    </el-card>
  </div>
</template>

<style scoped>
.json-log-list {
  display: grid;
  gap: 12px;
}

.json-log-card {
  border-radius: 12px;
}

.json-log-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 13px;
  color: #59637a;
}

.json-log-content {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-all;
  font-family: 'Consolas', 'Courier New', monospace;
  font-size: 13px;
  line-height: 1.5;
  color: #1f2a44;
}
</style>
