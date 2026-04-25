import { spawn } from 'child_process';

// Truncate large text blobs to avoid huge logs
function summarize(text, limit = 2000) {
    if (!text) return '';
    return text.length > limit ? `${text.slice(0, limit)}...` : text;
}

// Create a simple serial command runner with timeout
export function createRunner(logger, options = {}) {
    const queue = [];
    let running = false;
    const timeoutMs = options.timeoutMs || 5 * 60 * 1000;

    // Start next job if idle
    function processNext() {
        if (running || queue.length === 0) return;
        const job = queue.shift();
        running = true;
        run(job);
    }

    // Execute a single job and capture output
    function run(job) {
        logger.info('command started', { jobId: job.id, cmd: job.cmd, cwd: job.cwd });
        const child = spawn(job.cmd, {
            cwd: job.cwd || process.cwd(),
            env: { ...process.env, ...job.env },
            shell: true,
        });

        let stdout = '';
        let stderr = '';
        const timer = setTimeout(() => {
            logger.warn('command timeout, killing process', { jobId: job.id, timeoutMs });
            child.kill('SIGTERM');
        }, timeoutMs);

        child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
        child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

        child.on('error', (err) => {
            clearTimeout(timer);
            logger.error('command error', { jobId: job.id, error: err.message });
            running = false;
            processNext();
        });

        child.on('close', (code) => {
            clearTimeout(timer);
            logger.info('command finished', {
                jobId: job.id,
                code,
                stdout: summarize(stdout),
                stderr: summarize(stderr),
            });
            running = false;
            processNext();
        });
    }

    // Enqueue a command and return job id
    function enqueue(cmd, { cwd, env } = {}) {
        const job = {
            id: `${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
            cmd,
            cwd,
            env,
        };
        queue.push(job);
        processNext();
        return job.id;
    }

    return { enqueue };
}
