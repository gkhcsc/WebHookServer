<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { createScript, exportConfigFile, exportLogFile, fetchConfig, readScript, saveConfig, saveScript } from '@/api/webhook'
document.addEventListener('keydown', function(event) {
    if ((event.ctrlKey || event.metaKey) && (event.key === 's' || event.key === 'S')) {
        event.preventDefault();
        submitFormConfig();
    }
});

interface EditableScript {
  event: string
  branch: string
  cmd: string
  cwd: string
  scriptName: string
  scriptRemark: string
}

interface EditableProject {
  uid: string
  isDeleted: boolean
  name: string
  branches: string[]
  events: string[]
  scripts: EditableScript[]
}

interface EditableConfig {
  autoSave: {
    enabled: boolean
    delayMs: number
  }
  server: {
    port: number
    secret: string
    allowIps: string[]
  }
  projects: EditableProject[]
  logging: {
    level: string
    file: string
    maxSize: string
    maxFiles: number
  }
}

const loading = ref(false)
const saving = ref(false)
const editorText = ref('')
const lastSaved = ref('')
const activeTab = ref('form')
const activeFormSection = ref('server')
const activeProjectPanels = ref<string[]>([])
const addProjectDialogVisible = ref(false)
const scriptDialogVisible = ref(false)
const scriptDialogLoading = ref(false)
const scriptDialogSaving = ref(false)
const scriptDialogMode = ref<'create' | 'edit'>('edit')
const scriptFilePath = ref('')
const scriptEditorText = ref('')
const editingScriptCommand = ref('')
const editingScriptCwd = ref('')
const editingScript = ref<EditableScript | null>(null)
const scriptDraftName = ref('')
const scriptDraftRemark = ref('')
const hasUserChanges = ref(false)
const suppressAutoSaveChanges = ref(false)
let projectUidSeed = 0

const hasUnsavedChanges = computed(() => {
  if (!lastSaved.value) return false
  return editorText.value !== lastSaved.value
})

const eventOptions = [
  { label: 'push', value: 'push' },
  { label: 'pull_request_merged', value: 'pull_request_merged' },
  { label: 'issue_hooks', value: 'issue_hooks' },
  { label: 'push_hooks', value: 'push_hooks' },
  { label: 'tag_push_hooks', value: 'tag_push_hooks' },
  { label: 'note_hooks', value: 'note_hooks' },
]

const branchOptions = [
  { label: 'main', value: 'main' },
  { label: 'master', value: 'master' },
  { label: 'develop', value: 'develop' },
]

const newProjectDraft = ref({
  name: '',
  branches: [] as string[],
  events: [] as string[],
})

const configForm = ref<EditableConfig>({
  autoSave: {
    enabled: true,
    delayMs: 1000,
  },
  server: {
    port: 8000,
    secret: '',
    allowIps: [],
  },
  projects: [],
  logging: {
    level: 'info',
    file: './logs/webhook.log',
    maxSize: '10m',
    maxFiles: 5,
  },
})

function createEmptyScript(): EditableScript {
  return { event: '', branch: '', cmd: '', cwd: '', scriptName: '', scriptRemark: '' }
}

function normalizeEventValue(value: unknown) {
  const event = String(value ?? '').trim()
  if (event === 'merge_request_hooks') return 'pull_request_merged'
  return event
}

function normalizeStringList(values: unknown[] = []) {
  return Array.from(new Set(values.map((item) => String(item).trim()).filter(Boolean)))
}

function inferScriptName(command: unknown) {
  const value = String(command ?? '').trim()
  const match = value.match(/(?:^|\s)(["']?[^\s"']+\.(?:js|mjs|cjs|ts|py|sh|bash|bat|cmd|ps1))["']?(?:\s|$)/i)
  return match?.[1] || ''
}

function formatTimestamp(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, '0')
  return [
    date.getFullYear(), pad(date.getMonth() + 1), pad(date.getDate()),
    '-',
    pad(date.getHours()), pad(date.getMinutes()), pad(date.getSeconds()),
  ].join('')
}

function buildExportFilename(name: string, extension: string) {
  return `${name}-${formatTimestamp()}.${extension}`
}

function getProjectEventValues(project: EditableProject) {
  return normalizeStringList(project.events)
}

function getProjectBranchValues(project: EditableProject) {
  return normalizeStringList(project.branches)
}

function validateFormConfig() {
  const activeProjects = configForm.value.projects.filter((project) => !project.isDeleted)
  for (const project of activeProjects) {
    const projectName = project.name.trim() || '未命名项目'
    const projectEvents = getProjectEventValues(project)
    const projectBranches = getProjectBranchValues(project)

    if (!project.name.trim()) { ElMessage.warning('项目名称不能为空'); return false }
    if (projectBranches.length === 0) { ElMessage.warning(`项目 ${projectName} 至少需要配置一个分支`); return false }
    if (projectEvents.length === 0) { ElMessage.warning(`项目 ${projectName} 至少需要配置一个事件`); return false }

    for (const [index, script] of project.scripts.entries()) {
      const event = normalizeEventValue(script.event)
      const branch = script.branch.trim()
      const cmd = script.cmd.trim()
      const cwd = script.cwd.trim()
      const scriptLabel = `项目 ${projectName} 的脚本 ${index + 1}`

      if (!event) { ElMessage.warning(`${scriptLabel} 必须选择事件`); return false }
      if (!projectEvents.includes(event)) { ElMessage.warning(`${scriptLabel} 的事件必须来自当前项目 events`); return false }
      if (!branch) { ElMessage.warning(`${scriptLabel} 必须选择分支`); return false }
      if (!projectBranches.includes(branch)) { ElMessage.warning(`${scriptLabel} 的分支必须来自当前项目 branches`); return false }
      if (!cmd) { ElMessage.warning(`${scriptLabel} 的执行命令不能为空`); return false }
      if (!cwd) { ElMessage.warning(`${scriptLabel} 的工作目录不能为空`); return false }
    }
  }
  return true
}

function createEmptyProject(): EditableProject {
  return {
    uid: `project-${Date.now()}-${projectUidSeed++}`,
    isDeleted: false, name: '', branches: [], events: [], scripts: [createEmptyScript()],
  }
}

function normalizeConfig(raw: Record<string, unknown>): EditableConfig {
  const value = raw as Partial<EditableConfig>
  const autoSave = value.autoSave ?? ({} as EditableConfig['autoSave'])
  const server = value.server ?? ({} as EditableConfig['server'])
  const logging = value.logging ?? ({} as EditableConfig['logging'])
  const projects = Array.isArray(value.projects) ? value.projects : []

  return {
    autoSave: {
      enabled: autoSave.enabled !== false,
      delayMs: Math.max(300, Math.min(Number(autoSave.delayMs ?? 1000), 60000)),
    },
    server: {
      port: Number(server.port ?? 8000),
      secret: String(server.secret ?? ''),
      allowIps: Array.isArray(server.allowIps) ? server.allowIps.map((item) => String(item)).filter(Boolean) : [],
    },
    projects: projects.map((item) => {
      const project = item as Partial<EditableProject>
      const scripts = Array.isArray(project.scripts) ? project.scripts : []
      return {
        uid: `project-${Date.now()}-${projectUidSeed++}`,
        isDeleted: false,
        name: String(project.name ?? ''),
        branches: Array.isArray(project.branches) ? normalizeStringList(project.branches) : [],
        events: Array.isArray(project.events) ? normalizeStringList(project.events.map((event) => normalizeEventValue(event))) : [],
        scripts: scripts.map((scriptItem) => {
          const script = scriptItem as Partial<EditableScript>
          return {
            event: normalizeEventValue(script.event),
            branch: String(script.branch ?? ''),
            cmd: String(script.cmd ?? ''),
            cwd: String(script.cwd ?? ''),
            scriptName: String(script.scriptName ?? '') || inferScriptName(script.cmd),
            scriptRemark: String(script.scriptRemark ?? ''),
          }
        }),
      }
    }),
    logging: {
      level: String(logging.level ?? 'info'),
      file: String(logging.file ?? './logs/webhook.log'),
      maxSize: String(logging.maxSize ?? '10m'),
      maxFiles: Number(logging.maxFiles ?? 5),
    },
  }
}

function buildConfigPayload(): Record<string, unknown> {
  return {
    autoSave: {
      enabled: configForm.value.autoSave.enabled,
      delayMs: Number(configForm.value.autoSave.delayMs || 1000),
    },
    server: {
      port: Number(configForm.value.server.port || 8000),
      secret: configForm.value.server.secret,
      allowIps: configForm.value.server.allowIps.map((item) => item.trim()).filter(Boolean),
    },
    projects: configForm.value.projects
      .filter((project) => !project.isDeleted)
      .map((project) => ({
        name: project.name.trim(),
        branches: normalizeStringList(project.branches),
        events: normalizeStringList(project.events.map((item) => normalizeEventValue(item))),
        scripts: project.scripts.map((script) => ({
          event: normalizeEventValue(script.event),
          branch: script.branch.trim(),
          cmd: script.cmd.trim(),
          cwd: script.cwd.trim(),
          scriptName: script.scriptName.trim(),
          scriptRemark: script.scriptRemark.trim(),
        })),
      }))
      .filter((project) => project.name),
    logging: {
      level: configForm.value.logging.level,
      file: configForm.value.logging.file,
      maxSize: configForm.value.logging.maxSize,
      maxFiles: Number(configForm.value.logging.maxFiles || 5),
    },
  }
}

function syncEditorFromForm() {
  if (!validateFormConfig()) return false
  const payload = buildConfigPayload()
  editorText.value = JSON.stringify(payload, null, 2)
  return true
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

function syncFormFromEditor() {
  try {
    const parsed = JSON.parse(editorText.value) as Record<string, unknown>
    configForm.value = normalizeConfig(parsed)
    ElMessage.success('已同步到表单')
  } catch {
    ElMessage.error('JSON 格式不正确，无法同步到表单')
  }
}

function openAddProjectDialog() {
  newProjectDraft.value = { name: '', branches: [], events: [] }
  addProjectDialogVisible.value = true
}

function confirmAddProject() {
  const name = newProjectDraft.value.name.trim()
  const branches = normalizeStringList(newProjectDraft.value.branches)
  const events = normalizeStringList(newProjectDraft.value.events.map((item) => normalizeEventValue(item)))

  if (!name || branches.length === 0 || events.length === 0) {
    ElMessage.warning('新增项目时，name、branches、events 都是必填')
    return
  }
  const exists = configForm.value.projects.some((project) => project.name === name)
  if (exists) { ElMessage.warning('项目名称已存在，请使用其他 name'); return }

  configForm.value.projects.push({
    uid: `project-${Date.now()}-${projectUidSeed++}`,
    isDeleted: false, name, branches, events, scripts: [],
  })
  activeProjectPanels.value = []
  addProjectDialogVisible.value = false
  ElMessage.success('项目已新增')
}

function removeProject(index: number) {
  const target = configForm.value.projects[index]
  if (!target) return
  const moved = { ...target, isDeleted: true }
  configForm.value.projects.splice(index, 1)
  configForm.value.projects.push(moved)
  activeProjectPanels.value = []
  ElMessage.warning('项目已移到列表底部，可点击"恢复项目"撤销')
}

function restoreProject(index: number) {
  const target = configForm.value.projects[index]
  if (!target) return
  const moved = { ...target, isDeleted: false }
  configForm.value.projects.splice(index, 1)
  const firstDeletedIndex = configForm.value.projects.findIndex((item) => item.isDeleted)
  if (firstDeletedIndex === -1) {
    configForm.value.projects.push(moved)
  } else {
    configForm.value.projects.splice(firstDeletedIndex, 0, moved)
  }
  activeProjectPanels.value = []
  ElMessage.success('项目已恢复')
}

function addScript(projectIndex: number) {
  const project = configForm.value.projects[projectIndex]
  if (!project) return
  project.scripts.push(createEmptyScript())
  ElMessage.success('脚本映射已新增，请创建构建脚本')
}

async function removeScript(projectIndex: number, scriptIndex: number) {
  const script = configForm.value.projects[projectIndex]?.scripts[scriptIndex]
  if (!script) return
  try {
    await ElMessageBox.confirm(
      `确定删除构建脚本“${script.scriptName || `脚本 ${scriptIndex + 1}`}”吗？此操作只会删除脚本映射，不会删除工作目录中的脚本文件。`,
      '确认删除',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
    )
    configForm.value.projects[projectIndex]?.scripts.splice(scriptIndex, 1)
  } catch {
    return
  }
}

async function openScriptEditor(script: EditableScript) {
  if (!script.cmd.trim() || !script.cwd.trim()) {
    ElMessage.warning('请先填写工作目录，再编辑构建脚本')
    return
  }
  scriptDialogMode.value = 'edit'
  editingScript.value = script
  scriptDraftName.value = script.scriptName || '脚本文件'
  scriptDraftRemark.value = script.scriptRemark
  editingScriptCommand.value = script.cmd
  editingScriptCwd.value = script.cwd
  scriptDialogLoading.value = true
  scriptDialogVisible.value = true
  try {
    const data = await readScript(script.cmd, script.cwd)
    scriptFilePath.value = data.path
    scriptEditorText.value = data.content
  } catch (error: any) {
    scriptDialogVisible.value = false
    const message = error?.response?.data?.message || error?.message || '读取脚本文件失败'
    ElMessage.error(message)
  } finally {
    scriptDialogLoading.value = false
  }
}

function openScriptCreator(script: EditableScript) {
  if (!script.cwd.trim()) {
    ElMessage.warning('请先填写工作目录，再创建构建脚本')
    return
  }
  scriptDialogMode.value = 'create'
  editingScript.value = script
  editingScriptCommand.value = ''
  editingScriptCwd.value = script.cwd
  scriptFilePath.value = ''
  scriptDraftName.value = ''
  scriptDraftRemark.value = ''
  scriptEditorText.value = ''
  scriptDialogVisible.value = true
}

async function confirmSaveScript() {
  scriptDialogSaving.value = true
  try {
    if (!editingScript.value) return
    if (!scriptDraftName.value.trim()) {
      ElMessage.warning('脚本名称不能为空')
      return
    }
    if (scriptDialogMode.value === 'create') {
      const data = await createScript(scriptDraftName.value, editingScriptCwd.value, scriptEditorText.value)
      editingScript.value.scriptName = scriptDraftName.value.trim()
      editingScript.value.scriptRemark = scriptDraftRemark.value.trim()
      editingScript.value.cmd = data.command
      scriptFilePath.value = data.path
      ElMessage.success('构建脚本创建成功')
    } else {
      await saveScript(editingScriptCommand.value, editingScriptCwd.value, scriptEditorText.value)
      editingScript.value.scriptName = scriptDraftName.value.trim()
      editingScript.value.scriptRemark = scriptDraftRemark.value.trim()
      ElMessage.success('构建脚本保存成功')
    }
    scriptDialogVisible.value = false
  } catch (error: any) {
    const message = error?.response?.data?.message || error?.message || '保存脚本失败'
    ElMessage.error(message)
  } finally {
    scriptDialogSaving.value = false
  }
}

async function loadConfigData() {
  loading.value = true
  try {
    const data = await fetchConfig()
    const normalized = normalizeConfig(data.config)
    suppressAutoSaveChanges.value = true
    configForm.value = normalized
    activeProjectPanels.value = []
    editorText.value = JSON.stringify(normalized, null, 2)
    lastSaved.value = editorText.value
    hasUserChanges.value = false
    await nextTick()
    suppressAutoSaveChanges.value = false
  } catch (error) {
    ElMessage.error('读取配置失败')
    console.error(error)
  } finally {
    suppressAutoSaveChanges.value = false
    loading.value = false
  }
}

function formatJson() {
  try {
    const parsed = JSON.parse(editorText.value)
    editorText.value = JSON.stringify(parsed, null, 2)
    ElMessage.success('已格式化')
  } catch {
    ElMessage.error('JSON 格式不正确，无法格式化')
  }
}

async function submitConfig() {
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(editorText.value)
  } catch {
    ElMessage.error('JSON 格式不正确，请先修正')
    return
  }
  try {
    await ElMessageBox.confirm('保存后会立即生效，是否继续？', '确认保存', {
      type: 'warning',
      confirmButtonText: '保存',
      cancelButtonText: '取消',
      closeOnClickModal: false,
      closeOnPressEscape: false,
    })
  } catch {
    return
  }

  saving.value = true
  try {
    await saveConfig(parsed)
    ElMessage.success('配置保存成功')
    editorText.value = JSON.stringify(parsed, null, 2)
    lastSaved.value = editorText.value
    hasUserChanges.value = false
  } catch (error: any) {
    const message = error?.response?.data?.message || error?.message || '保存配置失败'
    ElMessage.error(message)
  } finally {
    saving.value = false
  }
}

async function autoSaveConfig() {
  if (saving.value || !hasUserChanges.value || !hasUnsavedChanges.value) return
  let payload: Record<string, unknown>
  if (activeTab.value === 'raw') {
    try {
      const parsed = JSON.parse(editorText.value) as Record<string, unknown>
      payload = {
        ...parsed,
        autoSave: {
          enabled: configForm.value.autoSave.enabled,
          delayMs: Number(configForm.value.autoSave.delayMs || 1000),
        },
      }
    } catch {
      return
    }
  } else {
    if (!validateFormConfig()) return
    payload = buildConfigPayload()
  }

  saving.value = true
  try {
    await saveConfig(payload)
    editorText.value = JSON.stringify(payload, null, 2)
    lastSaved.value = editorText.value
    hasUserChanges.value = false
    ElMessage.success('配置已自动保存')
  } catch (error: any) {
    const message = error?.response?.data?.message || error?.message || '自动保存配置失败'
    ElMessage.error(message)
  } finally {
    saving.value = false
  }
}

async function persistAutoSaveSetting() {
  await autoSaveConfig()
}

let autoSaveTimer: ReturnType<typeof setTimeout> | undefined
function scheduleAutoSave() {
  if (autoSaveTimer) clearTimeout(autoSaveTimer)
  if (!configForm.value.autoSave.enabled) return
  autoSaveTimer = setTimeout(() => {
    autoSaveTimer = undefined
    void autoSaveConfig()
  }, configForm.value.autoSave.delayMs)
}

watch(configForm, () => {
  if (!loading.value && !suppressAutoSaveChanges.value) {
    hasUserChanges.value = true
    scheduleAutoSave()
  }
}, { deep: true })

watch(editorText, () => {
  if (!loading.value && activeTab.value === 'raw' && !suppressAutoSaveChanges.value) {
    hasUserChanges.value = true
    scheduleAutoSave()
  }
})

onBeforeUnmount(() => {
  if (autoSaveTimer) clearTimeout(autoSaveTimer)
})

async function downloadConfigExport() {
  try {
    const blob = await exportConfigFile()
    triggerBlobDownload(blob, buildExportFilename('webhookserver-config', 'json'))
    ElMessage.success('配置文件导出成功')
  } catch (error: any) {
    const message = error?.response?.data?.message || error?.message || '导出配置文件失败'
    ElMessage.error(message)
  }
}

async function downloadLogExport() {
  try {
    const blob = await exportLogFile()
    triggerBlobDownload(blob, buildExportFilename('webhookserver', 'log'))
    ElMessage.success('日志文件导出成功')
  } catch (error: any) {
    const message = error?.response?.data?.message || error?.message || '导出日志文件失败'
    ElMessage.error(message)
  }
}

async function submitFormConfig() {
  if (!syncEditorFromForm()) return
  await submitConfig()
}

loadConfigData()
</script>

<template>
  <div class="page">
    <!-- ── unsaved indicator ── -->
    <div v-if="hasUnsavedChanges" class="unsaved-bar">
      ⚠ 存在未保存的更改 — 请点击「保存」提交配置
    </div>

    <el-card class="panel" shadow="never" v-loading="loading">
      <template #header>
        <div class="panel-header-row">
          <div class="panel-title">配置编辑</div>
          <el-space>
            <el-button @click="loadConfigData" :loading="loading" size="small">重新加载</el-button>
            <el-button size="small" @click="downloadConfigExport">导出 JSON</el-button>
            <el-button size="small" @click="downloadLogExport">导出日志</el-button>
          </el-space>
        </div>
      </template>

      <el-tabs v-model="activeTab">
        <!-- ── Form tab ── -->
        <el-tab-pane name="form" label="表单编辑">
          <el-alert
            title="通过结构化表单编辑配置，支持新增/修改项目与脚本映射"
            type="info"
            show-icon
            :closable="false"
            style="margin-bottom: 14px"
          />

          <el-radio-group v-model="activeFormSection" class="section-switcher" size="small">
            <el-radio-button label="server">服务配置</el-radio-button>
            <el-radio-button label="projects">项目配置</el-radio-button>
            <el-radio-button label="logging">日志配置</el-radio-button>
          </el-radio-group>

          <section v-if="activeFormSection === 'server'" class="section-wrap">
            <el-form label-position="top" class="autosave-settings">
              <el-form-item label="自动保存">
                <el-switch v-model="configForm.autoSave.enabled" active-text="开启" inactive-text="关闭" @change="persistAutoSaveSetting" />
              </el-form-item>
              <el-form-item label="停止操作后延迟（毫秒）">
                <el-input-number v-model="configForm.autoSave.delayMs" :min="300" :max="60000" :step="100" style="width: 100%" />
              </el-form-item>
            </el-form>
            <el-form label-position="top" class="fixed-form-grid">
              <el-form-item label="服务端口">
                <el-input-number v-model="configForm.server.port" :min="1" :max="65535" style="width: 100%" />
              </el-form-item>
              <el-form-item label="WebHook 密钥">
                <el-input v-model="configForm.server.secret" type="password" show-password placeholder="请输入 webhook 密钥" />
              </el-form-item>
              <el-form-item label="允许访问 IP 列表">
                <el-select
                  v-model="configForm.server.allowIps"
                  multiple filterable allow-create default-first-option
                  placeholder="输入 IP 后回车新增"
                />
              </el-form-item>
            </el-form>
          </section>

          <section v-if="activeFormSection === 'projects'" class="section-wrap">
            <div class="project-header">
              <el-button type="primary" plain @click="openAddProjectDialog">+ 新增项目</el-button>
            </div>

            <el-empty v-if="!configForm.projects.length" description="暂无项目，点击「新增项目」开始配置" :image-size="80" />

            <div v-else class="project-list">
              <el-collapse v-model="activeProjectPanels">
                <el-collapse-item
                  v-for="(project, pIndex) in configForm.projects"
                  :key="project.uid"
                  :name="project.uid"
                  class="project-collapse-item"
                >
                  <template #title>
                    <div class="project-card-header">
                      <div class="project-title-wrap">
                        <span class="project-title">{{ project.name || `未命名项目 ${pIndex + 1}` }}</span>
                        <el-tag v-if="project.isDeleted" size="small" type="warning" round>已删除</el-tag>
                      </div>
                      <el-space>
                        <el-button v-if="project.isDeleted" type="success" link @click.stop="restoreProject(pIndex)">恢复</el-button>
                        <el-button v-else type="danger" link @click.stop="removeProject(pIndex)">删除</el-button>
                      </el-space>
                    </div>
                  </template>

                  <div class="project-card">
                    <el-form label-position="top" class="fixed-form-grid">
                      <el-form-item label="项目名称">
                        <el-input v-model="project.name" placeholder="如 wygkhcsc/officialWebsite" />
                      </el-form-item>
                      <el-form-item label="分支">
                        <el-select
                          v-model="project.branches"
                          multiple filterable allow-create default-first-option
                          placeholder="输入分支后回车新增"
                        >
                          <el-option v-for="item in branchOptions" :key="item.value" :label="item.label" :value="item.value" />
                        </el-select>
                      </el-form-item>
                      <el-form-item label="事件">
                        <el-select
                          v-model="project.events"
                          multiple filterable collapse-tags collapse-tags-tooltip
                          placeholder="请选择项目支持的事件"
                        >
                          <el-option v-for="item in eventOptions" :key="item.value" :label="item.label" :value="item.value" />
                        </el-select>
                      </el-form-item>
                    </el-form>

                    <div class="script-header">
                      <span>脚本映射</span>
                      <el-button type="primary" link @click="addScript(pIndex)">+ 新增脚本</el-button>
                    </div>

                    <el-empty v-if="!project.scripts.length" description="暂无脚本" :image-size="48" />

                    <div v-else class="script-list">
                      <el-card
                        v-for="(script, sIndex) in project.scripts"
                        :key="`${pIndex}-${sIndex}`"
                        class="script-card"
                        shadow="never"
                      >
                        <template #header>
                          <div class="project-card-header">
                            <span style="font-weight: 600; font-size: 13px;">脚本 {{ sIndex + 1 }}</span>
                            <el-button type="danger" link @click="removeScript(pIndex, sIndex)">删除</el-button>
                          </div>
                        </template>
                        <el-form label-position="top" class="fixed-form-grid">
                          <el-form-item label="事件" required>
                            <el-select
                              v-model="script.event"
                              placeholder="请选择事件"
                              :disabled="getProjectEventValues(project).length === 0"
                            >
                              <el-option v-for="event in getProjectEventValues(project)" :key="event" :label="event" :value="event" />
                            </el-select>
                          </el-form-item>
                          <el-form-item label="分支" required>
                            <el-select
                              v-model="script.branch"
                              placeholder="请选择分支"
                              :disabled="getProjectBranchValues(project).length === 0"
                            >
                              <el-option v-for="branch in getProjectBranchValues(project)" :key="branch" :label="branch" :value="branch" />
                            </el-select>
                          </el-form-item>
                          <el-form-item label="构建脚本" required>
                            <div class="script-summary">
                              <div v-if="script.scriptName" class="script-summary-info">
                                <strong>{{ script.scriptName }}</strong>
                                <span v-if="script.scriptRemark">{{ script.scriptRemark }}</span>
                              </div>
                              <span v-else class="script-summary-empty">尚未创建脚本</span>
                              <el-button v-if="script.scriptName" type="primary" plain @click="openScriptEditor(script)">编辑脚本</el-button>
                              <el-button v-else type="primary" plain @click="openScriptCreator(script)">创建脚本</el-button>
                            </div>
                          </el-form-item>
                          <el-form-item label="工作目录" required>
                            <el-input v-model="script.cwd" placeholder="如 /root/WebHook" />
                          </el-form-item>
                        </el-form>
                      </el-card>
                    </div>
                  </div>
                </el-collapse-item>
              </el-collapse>
            </div>
          </section>

          <section v-if="activeFormSection === 'logging'" class="section-wrap">
            <el-form label-position="top" class="fixed-form-grid">
              <el-form-item label="日志级别">
                <el-select v-model="configForm.logging.level" placeholder="选择日志级别">
                  <el-option label="error" value="error" />
                  <el-option label="warn" value="warn" />
                  <el-option label="info" value="info" />
                  <el-option label="debug" value="debug" />
                </el-select>
              </el-form-item>
              <el-form-item label="日志文件路径">
                <el-input v-model="configForm.logging.file" placeholder="如 ./logs/webhook.log" />
              </el-form-item>
              <el-form-item label="单文件大小限制">
                <el-input v-model="configForm.logging.maxSize" placeholder="如 10m" />
              </el-form-item>
              <el-form-item label="最大文件数">
                <el-input-number v-model="configForm.logging.maxFiles" :min="1" :max="100" style="width: 100%" />
              </el-form-item>
            </el-form>
          </section>

          <div class="form-actions">
            <el-button type="primary" @click="submitFormConfig" :loading="saving" size="large">
              保存配置
            </el-button>
          </div>
        </el-tab-pane>

        <!-- ── Raw JSON tab ── -->
        <el-tab-pane name="raw" label="JSON 直接编辑">
          <el-alert
            title="直接编辑 config.json 内容，支持格式化与表单双向同步"
            type="warning"
            show-icon
            :closable="false"
            style="margin-bottom: 14px"
          />

          <el-input
            v-model="editorText"
            type="textarea"
            :rows="24"
            resize="vertical"
            placeholder="请输入 JSON 配置"
            class="config-editor"
          />

          <div class="form-actions">
            <el-space wrap>
              <el-button @click="formatJson">格式化</el-button>
              <el-button @click="syncFormFromEditor">同步到表单</el-button>
              <el-button type="primary" @click="submitConfig" :loading="saving">保存 JSON 配置</el-button>
            </el-space>
          </div>
        </el-tab-pane>
      </el-tabs>
    </el-card>

    <!-- ── Add project dialog ── -->
    <el-dialog
      v-model="addProjectDialogVisible"
      title="新增项目"
      width="580px"
      :close-on-click-modal="false"
      :close-on-press-escape="false"
    >
      <el-alert title="项目名称、分支、事件均为必填" type="warning" show-icon :closable="false" style="margin-bottom: 14px" />

      <el-form label-position="top" class="fixed-form-grid">
        <el-form-item label="项目名称" required>
          <el-input v-model="newProjectDraft.name" placeholder="如 wygkhcsc/new_repo" />
        </el-form-item>
        <el-form-item label="分支" required>
          <el-select
            v-model="newProjectDraft.branches"
            multiple filterable allow-create default-first-option
            placeholder="输入分支后回车新增"
          >
            <el-option v-for="item in branchOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="事件" required>
          <el-select
            v-model="newProjectDraft.events"
            multiple filterable collapse-tags collapse-tags-tooltip
            placeholder="选择项目支持的事件"
          >
            <el-option v-for="item in eventOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="addProjectDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="confirmAddProject">确认新增</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="scriptDialogVisible"
      title="编辑脚本文件"
      width="820px"
      top="6vh"
      :close-on-click-modal="false"
      :close-on-press-escape="false"
    >
      <div v-loading="scriptDialogLoading" class="script-editor-dialog">
        <el-alert
          title="保存后会直接覆盖服务器上的脚本文件，请确认内容无误。"
          type="warning"
          show-icon
          :closable="false"
          style="margin-bottom: 12px"
        />
        <el-form label-position="top" class="script-draft-form">
          <el-form-item label="脚本名称" required>
            <el-input v-model="scriptDraftName" placeholder="如 deploy.mjs（脚本位于工作目录下）" :disabled="scriptDialogMode === 'edit'" />
          </el-form-item>
          <el-form-item label="备注">
            <el-input v-model="scriptDraftRemark" placeholder="填写脚本用途说明" />
          </el-form-item>
        </el-form>
        <div v-if="scriptFilePath" class="script-file-path" :title="scriptFilePath">{{ scriptFilePath }}</div>
        <el-input
          v-model="scriptEditorText"
          type="textarea"
          :rows="24"
          resize="vertical"
          placeholder="脚本内容"
          class="script-editor"
        />
      </div>
      <template #footer>
        <el-button @click="scriptDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="scriptDialogSaving" :disabled="scriptDialogLoading" @click="confirmSaveScript">
          {{ scriptDialogMode === 'create' ? '创建脚本' : '保存脚本' }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
/* ── unsaved bar ── */
.unsaved-bar {
  padding: 10px 18px;
  margin-bottom: 14px;
  background: var(--color-warning-light);
  color: var(--color-warning);
  border: 1px solid #fcd34d;
  border-radius: var(--radius-md);
  font-size: 14px;
  font-weight: 500;
  animation: fade-in 0.3s ease;
}
@keyframes fade-in {
  from { opacity: 0; transform: translateY(-4px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* ── layout ── */
.fixed-form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.project-header {
  margin-bottom: 10px;
}
.project-list {
  display: grid;
  gap: 8px;
}
.project-collapse-item {
  border: 1px solid var(--border-medium);
  border-radius: var(--radius-md);
  overflow: hidden;
  background: var(--surface-card);
  transition: border-color var(--transition-fast);
}
.project-collapse-item:hover {
  border-color: var(--color-primary);
}
.project-collapse-item :deep(.el-collapse-item__header) {
  padding: 0 14px;
  background: var(--color-primary-light);
  border-bottom: 1px solid var(--border-light);
  font-weight: 500;
}
.project-collapse-item :deep(.el-collapse-item__arrow) {
  margin: 0 10px 0 0;
  order: -1;
}
.project-collapse-item :deep(.el-collapse-item__content) {
  padding-bottom: 0;
}

.project-card {
  padding: 10px;
}
.project-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.project-title {
  font-weight: 700;
  color: var(--text-main);
}
.project-title-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
}

.section-switcher {
  margin: 8px 0 12px;
}
.section-wrap {
  border: 1px solid var(--border-light);
  background: var(--surface-hover);
  border-radius: var(--radius-md);
  padding: 14px;
}
.autosave-settings {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 14px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--border-light);
}
.autosave-settings .el-form-item {
  margin-bottom: 0;
}

.script-header {
  margin: 6px 0 8px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-secondary);
}
.script-list {
  display: grid;
  gap: 8px;
}
.script-card {
  background: #fafcff;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-light);
}
.script-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-height: 32px;
}
.script-summary-info {
  display: grid;
  min-width: 0;
  gap: 2px;
}
.script-summary-info strong,
.script-summary-info span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.script-summary-info strong {
  color: var(--text-main);
}
.script-summary-info span,
.script-summary-empty {
  color: var(--text-secondary);
  font-size: 12px;
}
.script-summary .el-button {
  flex-shrink: 0;
}
.script-draft-form {
  grid-template-columns: 1fr 1fr;
  display: grid;
  gap: 10px;
}
.script-draft-form .el-form-item {
  margin-bottom: 0;
}
.script-editor-dialog .script-editor {
  min-width: 0;
}
.script-editor-dialog .script-editor :deep(textarea) {
  min-width: 0;
}
.script-editor-dialog {
  min-height: 280px;
}
.script-file-path {
  overflow: hidden;
  margin-bottom: 8px;
  color: var(--text-secondary);
  font-family: 'SF Mono', 'Consolas', 'Courier New', monospace;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.script-editor :deep(textarea) {
  font-family: 'SF Mono', 'Consolas', 'Courier New', monospace;
  font-size: 13px;
  line-height: 1.6;
}

.config-editor :deep(textarea) {
  font-family: 'SF Mono', 'Consolas', 'Courier New', monospace;
  font-size: 13px;
  line-height: 1.6;
}

.form-actions {
  margin-top: 16px;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

@media (max-width: 900px) {
  .fixed-form-grid {
    grid-template-columns: 1fr;
  }
  .autosave-settings {
    grid-template-columns: 1fr;
  }
  .script-draft-form {
    grid-template-columns: 1fr;
  }
}
</style>
