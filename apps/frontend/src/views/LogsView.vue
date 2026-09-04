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
const searchText = ref('')
const timeSort = ref<'desc' | 'asc'>('desc')

const levelOptions = ['all', 'error', 'warn', 'info', 'debug']
const timeSortOptions = [
  { label: '时间倒序（最新）', value: 'desc' },
  { label: '时间顺序（最早）', value: 'asc' },
]

function timestampValue(item: LogEntry) {
  const timestamp = item.parsed?.timestamp
  if (typeof timestamp !== 'string' && typeof timestamp !== 'number') return NaN
  return Date.parse(String(timestamp))
}

const filteredLogs = computed(() => {
  let result = logs.value
  if (levelFilter.value !== 'all') {
    result = result.filter((item) => {
      const parsedLevel = item.parsed && typeof item.parsed.level === 'string' ? item.parsed.level : ''
      return parsedLevel.toLowerCase() === levelFilter.value
    })
  }
  if (searchText.value.trim()) {
    const keyword = searchText.value.trim().toLowerCase()
    result = result.filter((item) => {
      const raw = item.raw || ''
      const timestamp = item.parsed?.timestamp ? String(item.parsed.timestamp) : ''
      const message = item.parsed?.message ? String(item.parsed.message) : ''
      return raw.toLowerCase().includes(keyword)
        || timestamp.toLowerCase().includes(keyword)
        || message.toLowerCase().includes(keyword)
    })
  }
  return [...result].sort((left, right) => {
    const leftTime = timestampValue(left)
    const rightTime = timestampValue(right)
    if (Number.isNaN(leftTime) || Number.isNaN(rightTime)) return 0
    return timeSort.value === 'desc' ? rightTime - leftTime : leftTime - rightTime
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
  if (text.includes('debug')) return ''
  return 'success'
}

function levelColor(level: unknown) {
  if (typeof level !== 'string') return undefined
  const text = level.toLowerCase()
  if (text.includes('error')) return '#dc2626'
  if (text.includes('warn')) return '#d97706'
  if (text.includes('debug')) return '#6366f1'
  return '#0d9488'
}

function copyLog(log: LogEntry) {
  const text = formatLogJson(log)
  navigator.clipboard.writeText(text).then(() => {
    ElMessage.success('已复制到剪贴板')
  }).catch(() => {
    ElMessage.error('复制失败')
  })
}

loadLogs()
</script>

<template>
  <div class="page">
    <el-card class="panel" shadow="never" v-loading="loading">
      <template #header>
        <div class="panel-header-row">
          <div class="panel-title">日志查看</div>
          <el-button type="primary" plain size="small" @click="loadLogs" :loading="loading">
            刷新
          </el-button>
        </div>
      </template>

      <div class="log-toolbar">
        <el-form inline class="log-form">
          <el-form-item label="条数">
            <el-input-number v-model="limit" :min="1" :max="1000" :step="50" size="small" />
          </el-form-item>
          <el-form-item label="级别">
            <el-select v-model="levelFilter" size="small" style="width: 110px">
              <el-option v-for="item in levelOptions" :key="item" :label="item" :value="item" />
            </el-select>
          </el-form-item>
          <el-form-item label="时间">
            <el-select v-model="timeSort" size="small" style="width: 150px">
              <el-option
                v-for="item in timeSortOptions"
                :key="item.value"
                :label="item.label"
                :value="item.value"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="搜索">
            <el-input
              v-model="searchText"
              placeholder="输入关键词过滤…"
              clearable
              size="small"
              style="width: 200px"
            />
          </el-form-item>
        </el-form>
      </div>

      <el-alert :closable="false" type="info" show-icon style="margin-bottom: 14px">
        <template #title>日志文件：{{ filePath || '未知' }}</template>
      </el-alert>

      <el-empty v-if="!filteredLogs.length" description="暂无日志数据" :image-size="80" />

      <div v-else class="json-log-list">
        <el-card
          v-for="item in filteredLogs"
          :key="item.id"
          class="json-log-card"
          shadow="hover"
        >
          <template #header>
            <div class="json-log-header">
              <div class="json-log-meta">
                <span class="log-timestamp">{{ (item.parsed && item.parsed.timestamp) || '—' }}</span>
                <el-tag
                  size="small"
                  :type="levelType(item.parsed && item.parsed.level)"
                  :color="levelColor(item.parsed && item.parsed.level)"
                  effect="dark"
                  round
                >
                  {{ (item.parsed && item.parsed.level) || 'unknown' }}
                </el-tag>
              </div>
              <el-button link size="small" @click="copyLog(item)">复制</el-button>
            </div>
          </template>
          <pre class="json-log-content">{{ formatLogJson(item) }}</pre>
        </el-card>
      </div>
    </el-card>
  </div>
</template>

<style scoped>
.log-toolbar {
  margin-bottom: 8px;
}
.log-form {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.json-log-list {
  display: grid;
  gap: 10px;
}
.json-log-card {
  border-radius: var(--radius-md);
  border: 1px solid var(--border-light);
  transition: border-color var(--transition-fast);
}
.json-log-card:hover {
  border-color: var(--color-primary);
}

.json-log-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.json-log-meta {
  display: flex;
  align-items: center;
  gap: 10px;
}
.log-timestamp {
  font-size: 13px;
  color: var(--text-secondary);
  font-family: 'SF Mono', 'Consolas', 'Courier New', monospace;
}

.json-log-content {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-all;
  font-family: 'SF Mono', 'Consolas', 'Courier New', monospace;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-main);
  max-height: 300px;
  overflow-y: auto;
  background: var(--surface-hover);
  padding: 10px;
  border-radius: var(--radius-sm);
}
</style>
