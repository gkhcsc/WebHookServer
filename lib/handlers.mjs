// Extract repository full name from webhook payload
function extractRepo(body) {
    return body?.source_repo?.project?.full_name
        || body?.project?.full_name
        || body?.repository?.full_name
        || null;
}

// Convert ref string to branch name
function extractBranchFromRef(ref) {
    if (typeof ref !== 'string') return null;
    const prefix = 'refs/heads/';
    return ref.startsWith(prefix) ? ref.slice(prefix.length) : ref;
}

// Resolve event type/branch/action based on header and payload
function resolveEvent(eventHeader, body) {
    if (eventHeader === 'push_hooks') {
        const branch = extractBranchFromRef(body?.ref);
        if (!branch) return null;
        return { type: 'push', branch, action: 'push' };
    }
    if (eventHeader === 'merge_request_hooks') {
        const isMerged = body?.action === 'merge' && body?.pull_request?.state === 'merged';
        if (!isMerged) return null;
        const branch = body?.target_branch || null;
        return { type: 'pull_request_merged', branch, action: 'merge' };
    }
    return null;
}

// Get client IP considering proxies
function clientIp(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.length) {
        return forwarded.split(',')[0].trim();
    }
    return (req.ip || '').replace('::ffff:', '') || '';
}

// Find matching script in project config
function findScript(project, eventType, branch) {
    if (!project.scripts) return null;
    return project.scripts.find((s) => s.event === eventType && (!s.branch || s.branch === branch)) || null;
}

// Build express handler for Gitee webhook
export function createWebhookHandler({ config, logger, runner }) {
    return (req, res) => {
        const body = req.body || {};
        const ip = clientIp(req);
        if (config.server.allowIps.length && !config.server.allowIps.includes(ip)) {
            logger.warn('request rejected by IP allowlist', { ip });
            return res.status(403).send('forbidden');
        }

        if (body.password !== config.server.secret) {
            logger.warn('request rejected due to bad secret', { ip });
            return res.status(401).send('unauthorized');
        }

        const eventBody = body.hook_name;
        const repo = extractRepo(body);
        const event = resolveEvent(eventBody, body);

        if (!event || !repo) {
            logger.info('ignored event', { reason: 'unsupported', event: eventBody, repo });
            return res.status(200).send('ignored');
        }

        const project = config.projects.find((p) => p.name === repo);
        if (!project) {
            logger.info('ignored event', { reason: 'unknown project', repo });
            return res.status(200).send('ignored');
        }

        const script = findScript(project, event.type, event.branch);
        if (!script) {
            logger.info('ignored event', { reason: 'no script mapped', repo, branch: event.branch, event: event.type });
            return res.status(200).send('ignored');
        }

        const jobId = runner.enqueue(script.cmd, { cwd: script.cwd, env: script.env });
        logger.info('job queued', {
            jobId,
            repo,
            branch: event.branch,
            event: event.type,
            action: event.action,
            ip,
        });
        return res.status(202).json({ status: 'queued', jobId });
    };
}
