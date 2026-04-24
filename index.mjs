import express from 'express';
import { loadConfig } from './lib/config.mjs';
import { createLogger } from './lib/logger.mjs';
import { createRunner } from './lib/runner.mjs';
import { createWebhookHandler } from './lib/handlers.mjs';

const config = loadConfig();
const logger = createLogger(config.logging);
const runner = createRunner(logger, { timeoutMs: 5 * 60 * 1000 });
const app = express();

app.use(express.json({ limit: '1mb' }));


const webhookHandler = createWebhookHandler({ config, logger, runner });

app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

app.post('/webHook', webhookHandler);

app.use((err, req, res, next) => {
    logger.error('unhandled error', { message: err.message, stack: err.stack });
    res.status(500).send('internal error');
});

const port = config.server.port || 8000;
app.listen(port, () => {
    logger.info(`Server running on port ${port}`);
});