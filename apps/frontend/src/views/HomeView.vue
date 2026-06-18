<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { fetchProjects, fetchSummary, triggerJob } from '@/api/webhook'
import type { ProjectDetail, ProjectSummary, SummaryConfig } from '@/types/webhook'

const loading = ref(false)
const triggerLoading = ref(false)
const summaries = ref<ProjectSummary[]>([])
const projects = ref<ProjectDetail[]>([])
const selectedProjectName = ref('')
const config = ref<SummaryConfig | null>(null)
const scriptDrawerVisible = ref(false)

const triggerForm = reactive({
  project: '',
  event: '',
  branch: '',
})

const triggerLogs = ref<Array<{ time: string; text: string; type: 'success' | 'error' }>>([])

const totalScripts = computed(() => summaries.value.reduce((acc, item) => acc + item.scriptCount, 0))
const allowIpCount = computed(() => config.value?.server.allowIps?.length || 0)

const selectedProject = computed(() => projects.value.find((item) => item.name === selectedProjectName.value))
const currentProject = computed(() => projects.value.find((item) => item.name === triggerForm.project))

const availableEvents = computed(() => currentProject.value?.events || [])
const availableBranches = computed(() => currentProject.value?.branches || [])

const statCards = computed(() => [
  { label: '项目数', value: summaries.value.length, icon: '📦', color: 'blue' },
  { label: '脚本映射', value: totalScripts.value, icon: '⚙️', color: 'green' },
  { label: '允许 IP', value: allowIpCount.value, icon: '🛡️', color: 'amber' },
  { label: '服务端口', value: config.value?.server.port || '-', icon: '🔌', color: 'indigo' },
])

function setDefaultTrigger() {
  if (!projects.value.length) {
    triggerForm.project = ''
    triggerForm.event = ''
    triggerForm.branch = ''
    return
  }
  const first = projects.value[0]
  if (!first) return
  triggerForm.project = first.name
  triggerForm.event = first.events[0] || ''
  triggerForm.branch = first.branches[0] || ''
}

function onProjectChange(projectName: string) {
  const project = projects.value.find((item) => item.name === projectName)
  triggerForm.event = project?.events[0] || ''
  triggerForm.branch = project?.branches[0] || ''
}

async function loadData() {
  loading.value = true
  try {
    const [summaryData, projectData] = await Promise.all([fetchSummary(), fetchProjects()])
    config.value = summaryData.config
    summaries.value = summaryData.projects
    projects.value = projectData.projects
    setDefaultTrigger()
  } catch (error) {
    ElMessage.error('加载控制台数据失败')
    console.error(error)
  } finally {
    loading.value = false
  }
}

function openScripts(projectName: string) {
  selectedProjectName.value = projectName
  scriptDrawerVisible.value = true
}

async function submitTrigger() {
  if (!triggerForm.project || !triggerForm.event || !triggerForm.branch) {
    ElMessage.warning('项目 / 事件 / 分支不能为空')
    return
  }
  triggerLoading.value = true
  try {
    const result = await triggerJob({ ...triggerForm })
    const message = `${triggerForm.project} · ${triggerForm.event} · ${triggerForm.branch} — 已入队，任务 ID: ${result.jobId}`
    triggerLogs.value.unshift({
      time: new Date().toLocaleString('zh-CN', { hour12: false }),
      text: message,
      type: 'success',
    })
    ElMessage.success('任务已入队')
  } catch (error: any) {
    const message = error?.response?.data?.message || error?.message || '请求失败'
    triggerLogs.value.unshift({
      time: new Date().toLocaleString('zh-CN', { hour12: false }),
      text: message,
      type: 'error',
    })
    ElMessage.error(message)
  } finally {
    triggerLoading.value = false
  }
}

onMounted(loadData)
</script>

<template>
  <div class="page">
    <!-- ── Hero ── -->
    <section class="hero">
      <div>
        <h1>WebHook 控制台</h1>
        <p class="hero-subtitle">管理 Gitee WebHook 项目配置、手动触发任务、查看运行日志</p>
      </div>
      <div class="hero-badge">
        <span class="hero-status" />
        <span>系统运行中</span>
      </div>
    </section>

    <!-- ── Stat cards ── -->
    <section class="stats" v-loading="loading">
      <el-card v-for="card in statCards" :key="card.label" shadow="hover" class="stat-card">
        <div class="stat-card-inner">
          <div class="stat-icon" :class="card.color">{{ card.icon }}</div>
          <div>
            <div class="stat-label">{{ card.label }}</div>
            <div class="stat-value">{{ card.value }}</div>
          </div>
        </div>
      </el-card>
    </section>

    <!-- ── Content grid ── -->
    <section class="content-grid">
      <el-card class="panel" shadow="never" v-loading="loading">
        <template #header>
          <div class="panel-header-row">
            <div class="panel-title">项目概览</div>
            <el-button :loading="loading" type="primary" plain size="small" @click="loadData">
              刷新
            </el-button>
          </div>
        </template>
        <el-table :data="summaries" stripe empty-text="暂无项目，请前往配置编辑页添加">
          <el-table-column prop="name" label="项目名称" min-width="200" />
          <el-table-column prop="scriptCount" label="脚本数" width="100" align="center" />
          <el-table-column label="事件" min-width="180">
            <template #default="scope">
              <el-space wrap>
                <el-tag v-for="event in scope.row.events" :key="event" size="small" type="info" round>
                  {{ event }}
                </el-tag>
              </el-space>
            </template>
          </el-table-column>
          <el-table-column label="分支" min-width="180">
            <template #default="scope">
              <el-space wrap>
                <el-tag v-for="branch in scope.row.branches" :key="branch" size="small" effect="plain" round>
                  {{ branch }}
                </el-tag>
              </el-space>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="120" align="center">
            <template #default="scope">
              <el-button link type="primary" @click="openScripts(scope.row.name)">查看脚本</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-card>

      <el-card class="panel" shadow="never">
        <template #header>
          <div class="panel-title">手动触发</div>
        </template>

        <el-form label-position="top" class="trigger-form">
          <el-form-item label="项目">
            <el-select v-model="triggerForm.project" placeholder="选择项目" @change="onProjectChange">
              <el-option
                v-for="project in projects"
                :key="project.name"
                :label="project.name"
                :value="project.name"
              />
            </el-select>
          </el-form-item>

          <el-form-item label="事件">
            <el-select v-model="triggerForm.event" placeholder="选择事件">
              <el-option
                v-for="event in availableEvents"
                :key="event"
                :label="event"
                :value="event"
              />
            </el-select>
          </el-form-item>

          <el-form-item label="分支">
            <el-select v-model="triggerForm.branch" placeholder="选择分支">
              <el-option
                v-for="branch in availableBranches"
                :key="branch"
                :label="branch"
                :value="branch"
              />
            </el-select>
          </el-form-item>

          <el-button
            type="primary"
            :loading="triggerLoading"
            style="width: 100%"
            @click="submitTrigger"
          >
            触发并入队
          </el-button>
        </el-form>

        <el-divider />

        <div class="log-title">最近触发结果</div>
        <el-empty v-if="!triggerLogs.length" description="暂无触发记录" :image-size="64" />
        <div v-else class="log-list">
          <div
            v-for="(item, idx) in triggerLogs"
            :key="idx"
            class="trigger-log-item"
          >
            <el-tag :type="item.type === 'success' ? 'success' : 'danger'" size="small" effect="dark">
              {{ item.type === 'success' ? '成功' : '失败' }}
            </el-tag>
            <span class="log-time">{{ item.time }}</span>
            <span class="log-text">{{ item.text }}</span>
          </div>
        </div>
      </el-card>
    </section>

    <!-- ── Script drawer ── -->
    <el-drawer
      v-model="scriptDrawerVisible"
      size="50%"
      title="脚本映射详情"
      :close-on-click-modal="false"
      :close-on-press-escape="false"
    >
      <template v-if="selectedProject">
        <h3 style="margin-bottom: 12px; color: var(--text-main);">{{ selectedProject.name }}</h3>
        <el-table :data="selectedProject.scripts" stripe empty-text="该项目暂无脚本映射">
          <el-table-column prop="event" label="事件" width="180" />
          <el-table-column prop="branch" label="分支" width="120" />
          <el-table-column prop="cmd" label="执行命令" min-width="240">
            <template #default="scope">
              <code style="font-size: 12px; background: #f3f5f9; padding: 2px 6px; border-radius: 4px;">
                {{ scope.row.cmd }}
              </code>
            </template>
          </el-table-column>
          <el-table-column prop="cwd" label="工作目录" min-width="200" />
        </el-table>
      </template>
      <el-empty v-else description="未找到对应项目" />
    </el-drawer>
  </div>
</template>
