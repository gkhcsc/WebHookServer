import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { detectStoragePaths } from './storage-paths.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const detectedPaths = detectStoragePaths();
const defaultConfigPath = detectedPaths.configFilePath;

// Ensure value is an array, otherwise return fallback
function ensureArray(value, fallback = []) {
    if (Array.isArray(value)) return value;
    return fallback;
}

// Normalize logging config with defaults
function normalizeLogging(logging = {}, options = {}) {
    const defaultLogFile = options.defaultLogFile || detectedPaths.logFilePath;
    const configDir = options.configDir || path.dirname(defaultConfigPath);
    const candidate = logging.file || defaultLogFile;
    const filePath = path.isAbsolute(candidate) ? candidate : path.resolve(configDir, candidate);

    return {
        level: logging.level || 'info',
        file: filePath,
        maxSize: logging.maxSize || '10m',
        maxFiles: logging.maxFiles || 5,
    };
}

// Normalize server config and support env overrides
function normalizeServer(server = {}) {
    return {
        port: Number(process.env.WEBHOOK_PORT || server.port || 8000),
        secret: process.env.WEBHOOK_SECRET || server.secret || '',
        allowIps: ensureArray(server.allowIps, []),
    };
}

// Normalize projects config, ensuring arrays exist
function normalizeProjects(projects = []) {
    return projects.map((project) => ({
        name: project.name,
        branches: ensureArray(project.branches, []),
        events: ensureArray(project.events, []),
        scripts: ensureArray(project.scripts, []),
    }));
}

// Validate required config fields
function validateConfig(config) {
    if (!config.server.secret) {
        throw new Error('server.secret 未配置，无法校验 webhook');
    }
    if (!config.projects || !Array.isArray(config.projects) || config.projects.length === 0) {
        throw new Error('projects 为空，无法匹配任何仓库');
    }
    for (const project of config.projects) {
        if (!project.name) {
            throw new Error('projects.name 缺失');
        }
    }
}

// Load config file, apply normalization, and validate
export function loadConfig(customPath = defaultConfigPath, options = {}) {
    const resolvedPath = customPath.startsWith('file:') ? fileURLToPath(customPath) : customPath;
    const raw = fs.readFileSync(resolvedPath, 'utf8');
    const parsed = JSON.parse(raw);
    const configDir = path.dirname(resolvedPath);

    const config = {
        server: normalizeServer(parsed.server),
        projects: normalizeProjects(parsed.projects),
        logging: normalizeLogging(parsed.logging, {
            defaultLogFile: options.defaultLogFile,
            configDir,
        }),
    };

    validateConfig(config);
    return config;
}
