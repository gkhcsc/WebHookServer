import axios from 'axios'
import type {
  ConfigResponse,
  LogEntry,
  LogsResponse,
  ProjectsResponse,
  SummaryResponse,
  TriggerPayload,
  TriggerResponse,
} from '@/types/webhook'

const client = axios.create({
  baseURL: '/api',
  timeout: 8000,
})

export async function fetchSummary() {
  const { data } = await client.get<SummaryResponse>('/summary')
  return data
}

export async function fetchProjects() {
  const { data } = await client.get<ProjectsResponse>('/projects')
  return data
}

export async function triggerJob(payload: TriggerPayload) {
  const { data } = await client.post<TriggerResponse>('/jobs/trigger', payload)
  return data
}

export async function fetchConfig() {
  const { data } = await client.get<ConfigResponse>('/config')
  return data
}

export async function saveConfig(config: Record<string, unknown>) {
  const { data } = await client.put<{ status: string }>('/config', { config })
  return data
}

export async function exportConfigFile() {
  // Download as blob to keep original file bytes.
  const response = await client.get('/config/export', { responseType: 'blob' })
  const contentType = String(response.headers?.['content-type'] || '')
  if (contentType.includes('text/html')) {
    throw new Error('配置导出接口返回了HTML页面，请检查后端路由顺序')
  }
  return response.data
}

export async function exportLogFile() {
  // Download as blob to keep original file bytes.
  const response = await client.get('/logs/export', { responseType: 'blob' })
  const contentType = String(response.headers?.['content-type'] || '')
  if (contentType.includes('text/html')) {
    throw new Error('日志导出接口返回了HTML页面，请检查后端路由顺序')
  }
  return response.data
}

export async function fetchLogs(limit = 200) {
  const { data } = await client.get<LogsResponse>('/logs', { params: { limit } })
  return data
}

export function formatLogJson(log: LogEntry) {
  if (log.parsed) {
    return JSON.stringify(log.parsed, null, 2)
  }
  return log.raw
}
