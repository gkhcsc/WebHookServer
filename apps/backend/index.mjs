import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadConfig } from './lib/config.mjs';
import { createLogger } from './lib/logger.mjs';
import { createRunner } from './lib/runner.mjs';
import { createWebhookHandler } from './lib/handlers.mjs';
import { detectStoragePaths, ensureStorageDirectories } from './lib/storage-paths.mjs';
import { ensureConfigFileExists } from './lib/api-utils.mjs';
import { createControlRouter } from './router/control.mjs';
import { createPublicRouter } from './router/public.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const legacyConfigFilePath = path.resolve(__dirname, 'config.json');
const frontendDistPath = path.resolve(__dirname, '..', '..', 'dist');
const frontendIndexFilePath = path.resolve(frontendDistPath, 'index.html');
// Detect platform-specific config/log storage locations.
const storagePaths = detectStoragePaths();

try {
    // Ensure required storage directories exist before loading config.
    ensureStorageDirectories(storagePaths);
    // Seed config on first run (migrate from legacy config when available).
    ensureConfigFileExists(storagePaths.configFilePath, legacyConfigFilePath, storagePaths.logFilePath);
} catch (error) {
    console.error('failed to prepare storage directories or config file', error.message);
    process.exit(1);
}

const configFilePath = storagePaths.configFilePath;
let config = loadConfig(configFilePath, { defaultLogFile: storagePaths.logFilePath });
const logger = createLogger(config.logging);
const runner = createRunner(logger, { timeoutMs: 5 * 60 * 1000 });
const publicApp = express();
const controlApp = express();

const configContext = {
    get: () => config,
};

let webhookHandler = createWebhookHandler({ config, logger, runner });

function reloadConfig(nextConfig) {
    config = nextConfig;
    webhookHandler = createWebhookHandler({ config, logger, runner });
}

const getWebhookHandler = () => webhookHandler;

controlApp.use(createControlRouter({
    configContext,
    logger,
    runner,
    storagePaths,
    loadConfig,
    reloadConfig,
    frontendDistPath,
    frontendIndexFilePath,
}));

publicApp.use(createPublicRouter({
    getWebhookHandler,
}));

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

