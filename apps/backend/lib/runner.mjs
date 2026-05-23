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
    let currentJobStartTime = 0;
    const timeoutMs = options.timeoutMs || 5 * 60 * 1000;

    // 守护看门狗机制(Watchdog): 用于极端故障状况下的自愈检测
    const watchdog = setInterval(() => {
        // 场景 1：如果意外脱锁且队列中还有任务积压，重新捞起
        if (!running && queue.length > 0) {
            logger.warn('watchdog: recovered stalled queue, processing next');
            processNext();
        } 
        // 场景 2：如果死锁（超过了超大容忍时限依然 running=true 等不到任何退出事件），强行重置解环
        else if (running && currentJobStartTime > 0 && Date.now() - currentJobStartTime > timeoutMs + 10000) {
            logger.error('watchdog: zombie job lock detected, forcefully releasing');
            running = false;
            processNext();
        }
    }, 15000);
    // .unref() 保证看门狗定时器不会阻止 Node.js 进程在无需工作时自行退出
    if (watchdog.unref) watchdog.unref();

    // Start next job if idle
    function processNext() {
        if (running || queue.length === 0) return;
        const job = queue.shift();
        running = true;
        currentJobStartTime = Date.now();
        run(job);
    }

    // Execute a single job and capture output
    function run(job) {
        logger.info('command started', { jobId: job.id, cmd: job.cmd, cwd: job.cwd });
        let child;
        try {
            // 包裹 try/catch 以防底层库创建进程失败抛出同步异常进而导致 running = true 发生死锁
            child = spawn(job.cmd, {
                cwd: job.cwd || process.cwd(),
                env: { ...process.env, ...job.env },
                shell: true,
            });
        } catch (error) {
            logger.error('command sync spawn error', { jobId: job.id, error: error.message });
            running = false;
            // 使用 setTimeout 推出当前调用栈，避免递归栈溢出，继续顺延处理下一个
            return setTimeout(processNext, 0);
        }

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
