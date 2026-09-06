import fs from 'fs';

export function isStringArray(value) {
    return Array.isArray(value) && value.every((item) => typeof item === 'string');
}


/**
 * Validates the shape of the incoming config object.
 * @param {*} value - The config object to validate.
 */
export function validateIncomingConfigShape(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('config must be an object');
    }

    const next = value;
    if (next.autoSave !== undefined) {
        if (!next.autoSave || typeof next.autoSave !== 'object' || Array.isArray(next.autoSave)) {
            throw new Error('autoSave must be an object');
        }
        if (typeof next.autoSave.enabled !== 'boolean') {
            throw new Error('autoSave.enabled must be a boolean');
        }
        if (typeof next.autoSave.delayMs !== 'number' || !Number.isFinite(next.autoSave.delayMs)) {
            throw new Error('autoSave.delayMs must be a number');
        }
    }
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
            if (typeof script.branch !== 'string' || !script.branch.trim()) {
                throw new Error('projects[].scripts[].branch is required');
            }
            if (typeof script.cmd !== 'string' || !script.cmd.trim()) {
                throw new Error('projects[].scripts[].cmd is required');
            }
            if (typeof script.cwd !== 'string' || !script.cwd.trim()) {
                throw new Error('projects[].scripts[].cwd is required');
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

export function isLoopbackAddress(value) {
    if (!value) return false;
    return value === '127.0.0.1'
        || value === '::1'
        || value === '::ffff:127.0.0.1';
}

/**
 * Sanitizes the config object by removing any sensitive information.
 * @param {*} value - The config object to sanitize.
 * @returns {Object} - The sanitized config object.
 */
export function sanitizeConfig(value) {
    return {
        autoSave: value.autoSave,
        server: {
            port: value.server.port,
            secretConfigured: Boolean(value.server.secret),
            allowIps: value.server.allowIps || [],
        },
        logging: value.logging,
        projectCount: value.projects.length,
    };
}

export function findScript(project, eventType, branch) {
    if (!project?.scripts) return null;
    return project.scripts.find((item) => item.event === eventType && item.branch === branch) || null;
}

export function queueProjectJob({ config, runner, logger }, projectName, eventType, branch) {
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

export function parseLogs(logFilePath, limit = 200) {
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

export function ensureConfigFileExists(configFilePath, fallbackConfigPath, defaultLogFilePath) {
    if (fs.existsSync(configFilePath)) return;

    let seed = {
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
            file: defaultLogFilePath,
            maxSize: '10m',
            maxFiles: 5,
        },
    };

    if (fallbackConfigPath && fs.existsSync(fallbackConfigPath)) {
        const raw = fs.readFileSync(fallbackConfigPath, 'utf8');
        const parsed = JSON.parse(raw);
        seed = {
            ...seed,
            ...parsed,
            logging: {
                ...seed.logging,
                ...(parsed.logging || {}),
                file: defaultLogFilePath,
            },
        };
    }

    fs.writeFileSync(configFilePath, JSON.stringify(seed, null, 2), 'utf8');
}
