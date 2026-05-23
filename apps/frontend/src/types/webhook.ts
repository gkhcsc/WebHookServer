export interface ServerConfig {
  port: number
  secretConfigured: boolean
  allowIps: string[]
}

export interface LoggingConfig {
  level: string
  file: string
  maxSize: string
  maxFiles: number
}

export interface SummaryConfig {
  server: ServerConfig
  logging: LoggingConfig
  projectCount: number
}

export interface ProjectSummary {
  name: string
  branches: string[]
  events: string[]
  scriptCount: number
}

export interface ProjectScript {
  event: string
  branch?: string
  cmd: string
  cwd?: string
}

export interface ProjectDetail {
  name: string
  branches: string[]
  events: string[]
  scripts: ProjectScript[]
}

export interface SummaryResponse {
  config: SummaryConfig
  projects: ProjectSummary[]
}

export interface ProjectsResponse {
  projects: ProjectDetail[]
}

export interface TriggerPayload {
  project: string
  event: string
  branch: string
}

export interface TriggerResponse {
  status: string
  jobId: string
}

export interface ConfigResponse {
  config: Record<string, unknown>
}

export interface LogEntry {
  id: string
  raw: string
  parsed: Record<string, unknown> | null
}

export interface LogsResponse {
  logs: LogEntry[]
  file: string
}
