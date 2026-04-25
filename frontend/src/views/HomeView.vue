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
const allowIpCount = computed(() => config.value?.server.allowIps.length || 0)

const selectedProject = computed(() => projects.value.find((item) => item.name === selectedProjectName.value))
const currentProject = computed(() => projects.value.find((item) => item.name === triggerForm.project))

const availableEvents = computed(() => currentProject.value?.events || [])
const availableBranches = computed(() => currentProject.value?.branches || [])

function setDefaultTrigger() {
  if (!projects.value.length) {
    triggerForm.project = ''
    triggerForm.event = ''
    triggerForm.branch = ''
    return
  }
  const first = projects.value[0]
  if (!first) {
    return
  }
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
    ElMessage.warning('项目(project)/事件(event)/分支(branch) 不能为空')
    return
  }
  triggerLoading.value = true
  try {
    const result = await triggerJob({ ...triggerForm })
    const message = `${triggerForm.project} ${triggerForm.event} ${triggerForm.branch} 已入队，任务ID: ${result.jobId}`
    triggerLogs.value.unshift({
      time: new Date().toLocaleString(),
      text: message,
      type: 'success',
    })
    ElMessage.success('任务已入队')
  } catch (error: any) {
    const message = error?.response?.data?.message || error?.message || '请求失败'
    triggerLogs.value.unshift({
      time: new Date().toLocaleString(),
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
    <section class="stats" v-loading="loading">
      <el-card shadow="hover" class="stat-card">
        <div class="stat-label">项目数(projects)</div>
        <div class="stat-value">{{ summaries.length }}</div>
      </el-card>
      <el-card shadow="hover" class="stat-card">
        <div class="stat-label">脚本映射数(scripts)</div>
        <div class="stat-value">{{ totalScripts }}</div>
      </el-card>
      <el-card shadow="hover" class="stat-card">
        <div class="stat-label">允许IP数(allowIps)</div>
        <div class="stat-value">{{ allowIpCount }}</div>
      </el-card>
      <el-card shadow="hover" class="stat-card">
        <div class="stat-label">服务端口(port)</div>
        <div class="stat-value">{{ config?.server.port || '-' }}</div>
      </el-card>
    </section>

    <section class="content-grid">
      <el-card class="panel" shadow="never" v-loading="loading">
        <template #header>
          <div class="panel-header-row">
            <div class="panel-title">项目概览(projects)</div>
            <el-button :loading="loading" type="primary" plain @click="loadData">刷新</el-button>
          </div>
        </template>
        <el-table :data="summaries" stripe>
          <el-table-column prop="name" label="项目名(name)" min-width="210" />
          <el-table-column prop="scriptCount" label="脚本数(scripts)" width="120" />
          <el-table-column label="事件(events)" min-width="180">
            <template #default="scope">
              <el-space wrap>
                <el-tag v-for="event in scope.row.events" :key="event" type="info">{{ event }}</el-tag>
              </el-space>
            </template>
          </el-table-column>
          <el-table-column label="分支(branches)" min-width="180">
            <template #default="scope">
              <el-space wrap>
                <el-tag v-for="branch in scope.row.branches" :key="branch" effect="plain">{{ branch }}</el-tag>
              </el-space>
            </template>
          </el-table-column>
          <el-table-column label="操作(action)" width="140">
            <template #default="scope">
              <el-button link type="primary" @click="openScripts(scope.row.name)">查看脚本(scripts)</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-card>

      <el-card class="panel" shadow="never">
        <template #header>
          <div class="panel-title">手动触发(trigger)</div>
        </template>

        <el-form label-position="top" class="trigger-form">
          <el-form-item label="项目(project)">
            <el-select v-model="triggerForm.project" placeholder="请选择项目" @change="onProjectChange">
              <el-option
                v-for="project in projects"
                :key="project.name"
                :label="project.name"
                :value="project.name"
              />
            </el-select>
          </el-form-item>

          <el-form-item label="事件(event)">
            <el-select v-model="triggerForm.event" placeholder="请选择事件">
              <el-option v-for="event in availableEvents" :key="event" :label="event" :value="event" />
            </el-select>
          </el-form-item>

          <el-form-item label="分支(branch)">
            <el-select v-model="triggerForm.branch" placeholder="请选择分支">
              <el-option v-for="branch in availableBranches" :key="branch" :label="branch" :value="branch" />
            </el-select>
          </el-form-item>

          <el-button type="primary" :loading="triggerLoading" @click="submitTrigger">触发并入队</el-button>
        </el-form>

        <el-divider />

        <div class="log-title">最近触发结果</div>
        <el-empty v-if="!triggerLogs.length" description="暂无触发记录" />
        <div v-else class="log-list">
          <div v-for="item in triggerLogs" :key="`${item.time}-${item.text}`" class="log-item">
            <el-tag :type="item.type === 'success' ? 'success' : 'danger'">
              {{ item.type === 'success' ? '成功' : '失败' }}
            </el-tag>
            <span class="log-time">{{ item.time }}</span>
            <span class="log-text">{{ item.text }}</span>
          </div>
        </div>
      </el-card>
    </section>

    <el-drawer v-model="scriptDrawerVisible" size="50%" title="脚本映射(scripts)">
      <template v-if="selectedProject">
        <h3>{{ selectedProject.name }}</h3>
        <el-table :data="selectedProject.scripts" stripe>
          <el-table-column prop="event" label="事件(event)" width="200" />
          <el-table-column prop="branch" label="分支(branch)" width="140" />
          <el-table-column prop="cmd" label="命令(cmd)" min-width="260" />
          <el-table-column prop="cwd" label="工作目录(cwd)" min-width="220" />
        </el-table>
      </template>
      <el-empty v-else description="未找到对应项目" />
    </el-drawer>
  </div>
</template>
