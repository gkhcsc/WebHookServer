import express from 'express';

export function createPublicRouter({ getWebhookHandler }) {
    const router = express.Router();

    router.use(express.json({ limit: '1mb' }));

    router.get('/health', (req, res) => {
        res.json({ status: 'ok' });
    });

    router.post('/webHook', (req, res, next) => {
        const handler = getWebhookHandler();
        if (handler) {
            handler(req, res, next);
        } else {
            res.status(503).json({ message: 'webhook handler not ready' });
        }
    });

    return router;
}
