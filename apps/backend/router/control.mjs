import express from 'express';
import fs from 'fs';
import { 
    sanitizeConfig, 
    queueProjectJob, 
    validateIncomingConfigShape, 
    parseLogs,
    isLoopbackAddress
} from '../lib/api-utils.mjs';

export function createControlRouter({ configContext, logger, runner, storagePaths, loadConfig, reloadConfig, frontendDistPath, frontendIndexFilePath }) {
    const router = express.Router();

    router.use(express.json({ limit: '1mb' }));

    router.use((req, res, next) => {
        const remoteAddress = req.socket.remoteAddress;
        if (!isLoopbackAddress(remoteAddress)) {
            return res.status(403).json({ message: 'control api only allows localhost access' });
        }
        return next();
    });

    router.get('/api/summary', (req, res) => {
        const config = configContext.get();
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

    router.get('/api/projects', (req, res) => {
        const config = configContext.get();
        const projects = config.projects.map((project) => ({
            name: project.name,
            branches: project.branches || [],
            events: project.events || [],
            scripts: project.scripts || [],
        }));
        res.json({ projects });
    });

    router.post('/api/jobs/trigger', (req, res) => {
        const config = configContext.get();
        const { project, event, branch } = req.body || {};
        if (!project || !event || !branch) {
            return res.status(400).json({ message: 'project/event/branch are required' });
        }

        const result = queueProjectJob({ config, runner, logger }, project, event, branch);
        if (!result.ok) {
            return res.status(result.code).json({ message: result.message });
        }
        return res.status(result.code).json(result.data);
    });

    router.get('/api/config', (req, res) => {
        try {
            const raw = fs.readFileSync(storagePaths.configFilePath, 'utf8');
            const parsed = JSON.parse(raw);
            return res.json({ config: parsed });
        } catch (error) {
            logger.error('read config failed', { message: error.message });
            return res.status(500).json({ message: 'failed to read config' });
        }
    });

    router.put('/api/config', (req, res) => {
        const { config: nextConfig } = req.body || {};
        if (!nextConfig || typeof nextConfig !== 'object') {
            return res.status(400).json({ message: 'config object is required' });
        }

        const tempPath = `${storagePaths.configFilePath}.tmp`;
        try {
            validateIncomingConfigShape(nextConfig);
            fs.writeFileSync(tempPath, JSON.stringify(nextConfig, null, 2), 'utf8');
            const validated = loadConfig(tempPath, { defaultLogFile: storagePaths.logFilePath });
            fs.renameSync(tempPath, storagePaths.configFilePath);
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

    router.get('/api/logs', (req, res) => {
        const config = configContext.get();
        const limit = Number(req.query.limit || 200);
        const logFilePath = config.logging.file || storagePaths.logFilePath;
        try {
            const logs = parseLogs(logFilePath, limit);
            return res.json({ logs, file: logFilePath });
        } catch (error) {
            logger.error('read logs failed', { message: error.message, file: logFilePath });
            return res.status(500).json({ message: 'failed to read logs' });
        }
    });

    // Export config as downloadable JSON file.
    router.get('/api/config/export', (req, res) => {
        if (!fs.existsSync(storagePaths.configFilePath)) {
            return res.status(404).json({ message: 'config file not found' });
        }
        try {
            const stat = fs.statSync(storagePaths.configFilePath);
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.setHeader('Content-Disposition', 'attachment; filename="webhookserver-config.json"');
            res.setHeader('Content-Length', String(stat.size));
            fs.createReadStream(storagePaths.configFilePath).pipe(res);
            return undefined;
        } catch (error) {
            logger.error('export config failed', { message: error.message, file: storagePaths.configFilePath });
            return res.status(500).json({ message: 'failed to export config file' });
        }
    });

    // Export raw .log file for troubleshooting/archiving.
    router.get('/api/logs/export', (req, res) => {
        const config = configContext.get();
        const logFilePath = config.logging.file || storagePaths.logFilePath;
        if (!fs.existsSync(logFilePath)) {
            return res.status(404).json({ message: 'log file not found' });
        }
        try {
            const stat = fs.statSync(logFilePath);
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.setHeader('Content-Disposition', 'attachment; filename="webhookserver.log"');
            res.setHeader('Content-Length', String(stat.size));
            fs.createReadStream(logFilePath).pipe(res);
            return undefined;
        } catch (error) {
            logger.error('export logs failed', { message: error.message, file: logFilePath });
            return res.status(500).json({ message: 'failed to export log file' });
        }
    });

    if (fs.existsSync(frontendIndexFilePath)) {
        router.use(express.static(frontendDistPath));
        router.get('/{*any}', (req, res) => {
            res.sendFile(frontendIndexFilePath);
        });
    } else {
        router.get('/', (req, res) => {
            res.status(503).send('frontend dist not found, run: npm run build --prefix frontend');
        });
    }

    return router;
}
