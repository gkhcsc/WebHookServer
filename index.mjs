import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadConfig } from './lib/config.mjs';
import { createLogger } from './lib/logger.mjs';
import { createRunner } from './lib/runner.mjs';
import { createWebhookHandler } from './lib/handlers.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const configFilePath = path.resolve(__dirname, 'config.json');
const frontendDistPath = path.resolve(__dirname, 'frontend', 'dist');
const frontendIndexFilePath = path.resolve(frontendDistPath, 'index.html');

let config = loadConfig(configFilePath);
const logger = createLogger(config.logging);
const runner = createRunner(logger, { timeoutMs: 5 * 60 * 1000 });
const publicApp = express();
const controlApp = express();

publicApp.use(express.json({ limit: '1mb' }));
controlApp.use(express.json({ limit: '1mb' }));

function isStringArray(value) {
    return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function validateIncomingConfigShape(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('config must be an object');
    }

    const next = value;
    if (!next.server || typeof next.server !== 'object' || Array.isArray(next.server)) {
        throw new Error('server is required');
    }
    if (typeof next.server.port !== 'number' || !Number.isFinite(next.server.port)) {
        throw new Error('server.port must be a number');
    }
    if (typeof next.server.secret !== 'string' || !next.server.secret.trim()) {
        throw new Error('server.secret is required');
    }
    if (!isStringArray(next.server.allowIps || [])) {
        throw new Error('server.allowIps must be a string array');
    }

    if (!Array.isArray(next.projects)) {
        throw new Error('projects must be an array');
    }
    for (const project of next.projects) {
        if (!project || typeof project !== 'object' || Array.isArray(project)) {
            throw new Error('project item must be an object');
        }
        if (typeof project.name !== 'string' || !project.name.trim()) {
            throw new Error('projects[].name is required');
        }
        if (!isStringArray(project.branches || [])) {
            throw new Error('projects[].branches must be a string array');
        }
        if (!isStringArray(project.events || [])) {
            throw new Error('projects[].events must be a string array');
        }
        if (!Array.isArray(project.scripts || [])) {
            throw new Error('projects[].scripts must be an array');
        }
        for (const script of (project.scripts || [])) {
            if (!script || typeof script !== 'object' || Array.isArray(script)) {
                throw new Error('script item must be an object');
            }
            if (typeof script.event !== 'string' || !script.event.trim()) {
                throw new Error('projects[].scripts[].event is required');
            }
            if (typeof script.cmd !== 'string' || !script.cmd.trim()) {
                throw new Error('projects[].scripts[].cmd is required');
            }
            if (script.branch !== undefined && typeof script.branch !== 'string') {
                throw new Error('projects[].scripts[].branch must be a string');
            }
            if (script.cwd !== undefined && typeof script.cwd !== 'string') {
                throw new Error('projects[].scripts[].cwd must be a string');
            }
        }
    }

    if (!next.logging || typeof next.logging !== 'object' || Array.isArray(next.logging)) {
        throw new Error('logging is required');
    }
    if (typeof next.logging.level !== 'string' || !next.logging.level.trim()) {
        throw new Error('logging.level is required');
    }
    if (typeof next.logging.file !== 'string' || !next.logging.file.trim()) {
        throw new Error('logging.file is required');
    }
    if (typeof next.logging.maxSize !== 'string' || !next.logging.maxSize.trim()) {
        throw new Error('logging.maxSize is required');
    }
    if (typeof next.logging.maxFiles !== 'number' || !Number.isFinite(next.logging.maxFiles)) {
        throw new Error('logging.maxFiles must be a number');
    }
}

function isLoopbackAddress(value) {
    if (!value) return false;
    return value === '127.0.0.1'
        || value === '::1'
        || value === '::ffff:127.0.0.1';
}

controlApp.use((req, res, next) => {
    const remoteAddress = req.socket.remoteAddress;
    if (!isLoopbackAddress(remoteAddress)) {
        return res.status(403).json({ message: 'control api only allows localhost access' });
    }
    return next();
});


function sanitizeConfig(value) {
    return {
        server: {
            port: value.server.port,
            secretConfigured: Boolean(value.server.secret),
            allowIps: value.server.allowIps || [],
        },
        logging: value.logging,
        projectCount: value.projects.length,
    };
}

function findScript(project, eventType, branch) {
    if (!project?.scripts) return null;
    return project.scripts.find((item) => item.event === eventType && (!item.branch || item.branch === branch)) || null;
}

function queueProjectJob(projectName, eventType, branch) {
    const project = config.projects.find((item) => item.name === projectName);
    if (!project) {
        return { ok: false, code: 404, message: 'project not found' };
    }

    const script = findScript(project, eventType, branch);
    if (!script) {
        return { ok: false, code: 400, message: 'script mapping not found' };
    }

    const jobId = runner.enqueue(script.cmd, { cwd: script.cwd, env: script.env });
    logger.info('manual job queued', { jobId, project: projectName, event: eventType, branch });
    return { ok: true, code: 202, data: { status: 'queued', jobId } };
}

function parseLogs(logFilePath, limit = 200) {
    if (!logFilePath || !fs.existsSync(logFilePath)) {
        return [];
    }
    const raw = fs.readFileSync(logFilePath, 'utf8');
    const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const rows = lines.slice(-Math.max(1, Math.min(Number(limit) || 200, 1000)));
    return rows.map((line, index) => {
        try {
            const parsed = JSON.parse(line);
            return { id: `${Date.now()}-${index}`, raw: line, parsed };
        } catch (error) {
            return { id: `${Date.now()}-${index}`, raw: line, parsed: null };
        }
    });
}

function reloadConfig(nextConfig) {
    config = nextConfig;
    webhookHandler = createWebhookHandler({ config, logger, runner });
}

let webhookHandler = createWebhookHandler({ config, logger, runner });

controlApp.get('/api/summary', (req, res) => {
    const projects = config.projects.map((project) => ({
        name: project.name,
        branches: project.branches || [],
        events: project.events || [],
        scriptCount: (project.scripts || []).length,
    }));

    res.json({
        config: sanitizeConfig(config),
        projects,
    });
});

controlApp.get('/api/projects', (req, res) => {
    const projects = config.projects.map((project) => ({
        name: project.name,
        branches: project.branches || [],
        events: project.events || [],
        scripts: project.scripts || [],
    }));
    res.json({ projects });
});

controlApp.post('/api/jobs/trigger', (req, res) => {
    const { project, event, branch } = req.body || {};
    if (!project || !event || !branch) {
        return res.status(400).json({ message: 'project/event/branch are required' });
    }

    const result = queueProjectJob(project, event, branch);
    if (!result.ok) {
        return res.status(result.code).json({ message: result.message });
    }
    return res.status(result.code).json(result.data);
});

controlApp.get('/api/config', (req, res) => {
    try {
        const raw = fs.readFileSync(configFilePath, 'utf8');
        const parsed = JSON.parse(raw);
        return res.json({ config: parsed });
    } catch (error) {
        logger.error('read config failed', { message: error.message });
        return res.status(500).json({ message: 'failed to read config' });
    }
});

controlApp.put('/api/config', (req, res) => {
    const { config: nextConfig } = req.body || {};
    if (!nextConfig || typeof nextConfig !== 'object') {
        return res.status(400).json({ message: 'config object is required' });
    }

    const tempPath = `${configFilePath}.tmp`;
    try {
        validateIncomingConfigShape(nextConfig);
        fs.writeFileSync(tempPath, JSON.stringify(nextConfig, null, 2), 'utf8');
        const validated = loadConfig(tempPath);
        fs.renameSync(tempPath, configFilePath);
        reloadConfig(validated);
        logger.info('config updated from api');
        return res.json({ status: 'ok' });
    } catch (error) {
        if (fs.existsSync(tempPath)) {
            fs.unlinkSync(tempPath);
        }
        logger.error('update config failed', { message: error.message });
        return res.status(400).json({ message: error.message || 'invalid config' });
    }
});

controlApp.get('/api/logs', (req, res) => {
    const limit = Number(req.query.limit || 200);
    const logFilePath = path.resolve(__dirname, config.logging.file || './logs/webhook.log');
    try {
        const logs = parseLogs(logFilePath, limit);
        return res.json({ logs, file: logFilePath });
    } catch (error) {
        logger.error('read logs failed', { message: error.message, file: logFilePath });
        return res.status(500).json({ message: 'failed to read logs' });
    }
});

publicApp.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

publicApp.post('/webHook', (req, res, next) => webhookHandler(req, res, next));

if (fs.existsSync(frontendIndexFilePath)) {
    controlApp.use(express.static(frontendDistPath));
    controlApp.get('/{*any}', (req, res) => {
        res.sendFile(frontendIndexFilePath);
    });
} else {
    controlApp.get('/', (req, res) => {
        res.status(503).send('frontend dist not found, run: npm run build --prefix frontend');
    });
}

function handleError(err, req, res, next) {
    logger.error('unhandled error', { message: err.message, stack: err.stack });
    res.status(500).send('internal error');
}

publicApp.use(handleError);
controlApp.use(handleError);

const publicPort = config.server.port || 8000;
const controlPort = Number(process.env.CONTROL_API_PORT || 18000);

publicApp.listen(publicPort, '0.0.0.0', () => {
    logger.info(`Public webhook server running on 0.0.0.0:${publicPort}`);
});

controlApp.listen(controlPort, '127.0.0.1', () => {
    logger.info(`Control API server running on 127.0.0.1:${controlPort}`);
});