<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { fetchConfig, saveConfig } from '@/api/webhook'

interface EditableScript {
  event: string
  branch: string
  cmd: string
  cwd: string
}

interface EditableProject {
  name: string
  branches: string[]
  events: string[]
  scripts: EditableScript[]
}

interface EditableConfig {
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
const activeTab = ref('form')
const activeFormSection = ref('server')
const addProjectDialogVisible = ref(false)

const newProjectDraft = ref({
  name: '',
  branches: [] as string[],
  events: [] as string[],
})

const configForm = ref<EditableConfig>({
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
  return {
    event: '',
    branch: '',
    cmd: '',
    cwd: '',
  }
}

function createEmptyProject(): EditableProject {
  return {
    name: '',
    branches: [],
    events: [],
    scripts: [createEmptyScript()],
  }
}

function normalizeConfig(raw: Record<string, unknown>): EditableConfig {
  const value = raw as Partial<EditableConfig>
  const server = value.server ?? ({} as EditableConfig['server'])
  const logging = value.logging ?? ({} as EditableConfig['logging'])
  const projects = Array.isArray(value.projects) ? value.projects : []

  return {
    server: {
      port: Number(server.port ?? 8000),
      secret: String(server.secret ?? ''),
      allowIps: Array.isArray(server.allowIps)
        ? server.allowIps.map((item) => String(item)).filter(Boolean)
        : [],
    },
    projects: projects.map((item) => {
      const project = item as Partial<EditableProject>
      const scripts = Array.isArray(project.scripts) ? project.scripts : []
      return {
        name: String(project.name ?? ''),
        branches: Array.isArray(project.branches)
          ? project.branches.map((branch) => String(branch)).filter(Boolean)
          : [],
        events: Array.isArray(project.events)
          ? project.events.map((event) => String(event)).filter(Boolean)
          : [],
        scripts: scripts.map((scriptItem) => {
          const script = scriptItem as Partial<EditableScript>
          return {
            event: String(script.event ?? ''),
            branch: String(script.branch ?? ''),
            cmd: String(script.cmd ?? ''),
            cwd: String(script.cwd ?? ''),
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
    server: {
      port: Number(configForm.value.server.port || 8000),
      secret: configForm.value.server.secret,
      allowIps: configForm.value.server.allowIps.map((item) => item.trim()).filter(Boolean),
    },
    projects: configForm.value.projects
      .map((project) => ({
        name: project.name.trim(),
        branches: project.branches.map((item) => item.trim()).filter(Boolean),
        events: project.events.map((item) => item.trim()).filter(Boolean),
        scripts: project.scripts
          .map((script) => ({
            event: script.event.trim(),
            branch: script.branch.trim(),
            cmd: script.cmd.trim(),
            cwd: script.cwd.trim(),
          }))
          .filter((script) => script.event && script.cmd)
          .map((script) => ({
            event: script.event,
            ...(script.branch ? { branch: script.branch } : {}),
            cmd: script.cmd,
            ...(script.cwd ? { cwd: script.cwd } : {}),
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
  const payload = buildConfigPayload()
  editorText.value = JSON.stringify(payload, null, 2)
}

function syncFormFromEditor() {
  try {
    const parsed = JSON.parse(editorText.value) as Record<string, unknown>
    configForm.value = normalizeConfig(parsed)
    ElMessage.success('已同步到表单')
  } catch (error) {
    ElMessage.error('JSON 格式不正确，无法同步到表单')
  }
}

function openAddProjectDialog() {
  newProjectDraft.value = {
    name: '',
    branches: [],
    events: [],
  }
  addProjectDialogVisible.value = true
}

function confirmAddProject() {
  const name = newProjectDraft.value.name.trim()
  const branches = newProjectDraft.value.branches.map((item) => item.trim()).filter(Boolean)
  const events = newProjectDraft.value.events.map((item) => item.trim()).filter(Boolean)

  if (!name || branches.length === 0 || events.length === 0) {
    ElMessage.warning('新增项目时，name、branches、events 都是必填')
    return
  }

  const exists = configForm.value.projects.some((project) => project.name === name)
  if (exists) {
    ElMessage.warning('项目名称已存在，请使用其他 name')
    return
  }

  configForm.value.projects.push({
    name,
    branches,
    events,
    scripts: [],
  })

  addProjectDialogVisible.value = false
  ElMessage.success('项目已新增')
}

function removeProject(index: number) {
  configForm.value.projects.splice(index, 1)
}

function addScript(projectIndex: number) {
  configForm.value.projects[projectIndex]?.scripts.push(createEmptyScript())
}

function removeScript(projectIndex: number, scriptIndex: number) {
  configForm.value.projects[projectIndex]?.scripts.splice(scriptIndex, 1)
}

async function loadConfigData() {
  loading.value = true
  try {
    const data = await fetchConfig()
    const normalized = normalizeConfig(data.config)
    configForm.value = normalized
    editorText.value = JSON.stringify(normalized, null, 2)
  } catch (error) {
    ElMessage.error('读取配置失败')
    console.error(error)
  } finally {
    loading.value = false
  }
}

function formatJson() {
  try {
    const parsed = JSON.parse(editorText.value)
    editorText.value = JSON.stringify(parsed, null, 2)
    ElMessage.success('已格式化')
  } catch (error) {
    ElMessage.error('JSON 格式不正确，无法格式化')
  }
}

async function submitConfig() {
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(editorText.value)
  } catch (error) {
    ElMessage.error('JSON 格式不正确，请先修正')
    return
  }

  try {
    await ElMessageBox.confirm('保存后会立即生效，是否继续？', '确认保存', {
      type: 'warning',
      confirmButtonText: '保存',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }

  saving.value = true
  try {
    await saveConfig(parsed)
    ElMessage.success('配置保存成功')
    editorText.value = JSON.stringify(parsed, null, 2)
  } catch (error: any) {
    const message = error?.response?.data?.message || error?.message || '保存配置失败'
    ElMessage.error(message)
  } finally {
    saving.value = false
  }
}

async function submitFormConfig() {
  syncEditorFromForm()
  await submitConfig()
}

loadConfigData()
</script>

<template>
  <div class="page">
    <el-card class="panel" shadow="never" v-loading="loading">
      <template #header>
        <div class="panel-title">配置编辑</div>
      </template>

      <el-tabs v-model="activeTab">
        <el-tab-pane name="form" label="表单编辑">
          <el-alert
            title="通过固定字段编辑配置，可新增和修改项目及脚本映射"
            type="info"
            show-icon
            :closable="false"
            style="margin-bottom: 12px"
          />

          <el-radio-group v-model="activeFormSection" class="section-switcher">
            <el-radio-button label="server">服务配置</el-radio-button>
            <el-radio-button label="projects">项目配置</el-radio-button>
            <el-radio-button label="logging">日志配置</el-radio-button>
          </el-radio-group>

          <section v-if="activeFormSection === 'server'" class="section-wrap">
            <el-form label-position="top" class="fixed-form-grid">
              <el-form-item label="端口">
                <el-input-number v-model="configForm.server.port" :min="1" :max="65535" style="width: 100%" />
              </el-form-item>
              <el-form-item label="密钥 server.secret">
                <el-input v-model="configForm.server.secret" placeholder="请输入 webhook 密钥" />
              </el-form-item>
              <el-form-item label="允许 IP 列表 allowIps">
                <el-select
                  v-model="configForm.server.allowIps"
                  multiple
                  filterable
                  allow-create
                  default-first-option
                  placeholder="输入后回车新增"
                />
              </el-form-item>
            </el-form>
          </section>

          <section v-if="activeFormSection === 'projects'" class="section-wrap">
            <div class="project-header">
              <el-button type="primary" plain @click="openAddProjectDialog">新增项目</el-button>
            </div>

            <el-empty v-if="!configForm.projects.length" description="暂无项目，点击“新增项目”开始配置" />

            <div v-else class="project-list">
              <el-card
                v-for="(project, pIndex) in configForm.projects"
                :key="pIndex"
                class="project-card"
                shadow="never"
              >
                <template #header>
                  <div class="project-card-header">
                    <span class="project-title">{{ project.name || `未命名项目 ${pIndex + 1}` }}</span>
                    <el-button type="danger" link @click="removeProject(pIndex)">删除项目</el-button>
                  </div>
                </template>

                <el-form label-position="top" class="fixed-form-grid">
                  <el-form-item label="项目名 name">
                    <el-input v-model="project.name" placeholder="如 wygkhcsc/officialWebsite" />
                  </el-form-item>
                  <el-form-item label="分支 branches">
                    <el-select
                      v-model="project.branches"
                      multiple
                      filterable
                      allow-create
                      default-first-option
                      placeholder="输入分支后回车新增"
                    />
                  </el-form-item>
                  <el-form-item label="事件 events">
                    <el-select
                      v-model="project.events"
                      multiple
                      filterable
                      allow-create
                      default-first-option
                      placeholder="输入事件后回车新增"
                    />
                  </el-form-item>
                </el-form>

                <div class="script-header">
                  <span>脚本映射 scripts</span>
                  <el-button type="primary" link @click="addScript(pIndex)">新增脚本</el-button>
                </div>

                <el-empty v-if="!project.scripts.length" description="暂无脚本" />

                <div v-else class="script-list">
                  <el-card
                    v-for="(script, sIndex) in project.scripts"
                    :key="`${pIndex}-${sIndex}`"
                    class="script-card"
                    shadow="never"
                  >
                    <template #header>
                      <div class="project-card-header">
                        <span>脚本 {{ sIndex + 1 }}</span>
                        <el-button type="danger" link @click="removeScript(pIndex, sIndex)">删除脚本</el-button>
                      </div>
                    </template>
                    <el-form label-position="top" class="fixed-form-grid">
                      <el-form-item label="事件 event">
                        <el-input v-model="script.event" placeholder="如 push" />
                      </el-form-item>
                      <el-form-item label="分支 branch（可选）">
                        <el-input v-model="script.branch" placeholder="如 master" />
                      </el-form-item>
                      <el-form-item label="执行命令 cmd">
                        <el-input v-model="script.cmd" placeholder="请输入脚本命令" />
                      </el-form-item>
                      <el-form-item label="工作目录 cwd（可选）">
                        <el-input v-model="script.cwd" placeholder="如 /root/WebHook" />
                      </el-form-item>
                    </el-form>
                  </el-card>
                </div>
              </el-card>
            </div>
          </section>

          <section v-if="activeFormSection === 'logging'" class="section-wrap">
            <el-form label-position="top" class="fixed-form-grid">
              <el-form-item label="日志级别 level">
                <el-select v-model="configForm.logging.level" placeholder="选择日志级别">
                  <el-option label="error" value="error" />
                  <el-option label="warn" value="warn" />
                  <el-option label="info" value="info" />
                  <el-option label="debug" value="debug" />
                </el-select>
              </el-form-item>
              <el-form-item label="日志文件路径 file">
                <el-input v-model="configForm.logging.file" placeholder="如 ./logs/webhook.log" />
              </el-form-item>
              <el-form-item label="单文件大小 maxSize">
                <el-input v-model="configForm.logging.maxSize" placeholder="如 10m" />
              </el-form-item>
              <el-form-item label="最多文件数 maxFiles">
                <el-input-number v-model="configForm.logging.maxFiles" :min="1" :max="100" style="width: 100%" />
              </el-form-item>
            </el-form>
          </section>

          <div class="actions">
            <el-button @click="loadConfigData" :loading="loading">重新加载</el-button>
            <el-button @click="syncEditorFromForm">生成 JSON</el-button>
            <el-button type="primary" @click="submitFormConfig" :loading="saving">保存表单配置</el-button>
          </div>
        </el-tab-pane>

        <el-tab-pane name="raw" label="JSON 直接编辑">
          <el-alert
            title="直接编辑 config.json 内容（JSON）"
            type="warning"
            show-icon
            :closable="false"
            style="margin-bottom: 12px"
          />

          <el-input
            v-model="editorText"
            type="textarea"
            :rows="24"
            resize="vertical"
            placeholder="请输入 JSON 配置"
            class="config-editor"
          />

          <div class="actions">
            <el-button @click="loadConfigData" :loading="loading">重新加载</el-button>
            <el-button @click="formatJson">格式化</el-button>
            <el-button @click="syncFormFromEditor">同步到表单</el-button>
            <el-button type="primary" @click="submitConfig" :loading="saving">保存 JSON 配置</el-button>
          </div>
        </el-tab-pane>
      </el-tabs>

      <el-dialog v-model="addProjectDialogVisible" title="新增项目" width="620px">
        <el-alert
          title="新增项目时，name、branches、events 为必填"
          type="warning"
          show-icon
          :closable="false"
          style="margin-bottom: 12px"
        />

        <el-form label-position="top" class="fixed-form-grid">
          <el-form-item label="项目名 name" required>
            <el-input v-model="newProjectDraft.name" placeholder="如 wygkhcsc/new_repo" />
          </el-form-item>

          <el-form-item label="分支 branches" required>
            <el-select
              v-model="newProjectDraft.branches"
              multiple
              filterable
              allow-create
              default-first-option
              placeholder="输入分支后回车新增"
            />
          </el-form-item>

          <el-form-item label="事件 events" required>
            <el-select
              v-model="newProjectDraft.events"
              multiple
              filterable
              allow-create
              default-first-option
              placeholder="输入事件后回车新增"
            />
          </el-form-item>
        </el-form>

        <template #footer>
          <el-button @click="addProjectDialogVisible = false">取消</el-button>
          <el-button type="primary" @click="confirmAddProject">确认新增</el-button>
        </template>
      </el-dialog>
    </el-card>
  </div>
</template>

<style scoped>
.fixed-form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.project-header {
  margin-bottom: 12px;
}

.project-list {
  display: grid;
  gap: 12px;
}

.project-card {
  border-radius: 12px;
  border: 1px solid #5d7399;
  background: #f7faff;
}

.project-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.project-title {
  font-weight: 700;
  color: #20345a;
}

.section-switcher {
  margin: 8px 0 14px;
}

.section-wrap {
  border: 1px solid #cfd8ea;
  background: #fcfdff;
  border-radius: 10px;
  padding: 14px;
}

.script-header {
  margin: 4px 0 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: #43516d;
}

.script-list {
  display: grid;
  gap: 10px;
}

.script-card {
  background: #fafcff;
  border-radius: 10px;
  border: 1px solid #d6deed;
}

.config-editor :deep(textarea) {
  font-family: 'Consolas', 'Courier New', monospace;
  font-size: 13px;
  line-height: 1.5;
}

.actions {
  margin-top: 12px;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

@media (max-width: 900px) {
  .fixed-form-grid {
    grid-template-columns: 1fr;
  }
}
</style>
