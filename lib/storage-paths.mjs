import fs from 'fs';
import os from 'os';
import path from 'path';

function toWindowsDefaultLocalAppData() {
    // Fallback for environments where LOCALAPPDATA is missing.
    return path.join(os.homedir(), 'AppData', 'Local');
}

export function detectStoragePaths() {
    if (process.platform === 'win32') {
        // Windows: keep config under user home and logs under LocalAppData.
        const configDir = path.join(os.homedir(), '.webhookserver');
        const localAppData = process.env.LOCALAPPDATA || toWindowsDefaultLocalAppData();
        const logDir = path.join(localAppData, 'webhookserver');
        return {
            platform: 'windows',
            configDir,
            configFilePath: path.join(configDir, 'config.json'),
            logDir,
            logFilePath: path.join(logDir, 'webhook.log'),
        };
    }

    // Linux default policy: system config in /etc and logs in /var/log.
    return {
        platform: 'linux',
        configDir: '/etc/webhookserver',
        configFilePath: '/etc/webhookserver/config.json',
        logDir: '/var/log/webhookserver',
        logFilePath: '/var/log/webhookserver/webhook.log',
    };
}

export function ensureStorageDirectories(paths) {
    // Create target directories if they do not exist yet.
    fs.mkdirSync(paths.configDir, { recursive: true });
    fs.mkdirSync(paths.logDir, { recursive: true });
}
