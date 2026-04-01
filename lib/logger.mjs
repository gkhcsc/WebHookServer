import fs from 'fs';
import path from 'path';
import winston from 'winston';

// Parse human-readable size string into bytes
function parseSize(size) {
    if (!size) return 10 * 1024 * 1024;
    if (typeof size === 'number') return size;
    const lower = size.toLowerCase().trim();
    const match = lower.match(/^(\d+)(b|k|kb|m|mb|g|gb)?$/);
    if (!match) return 10 * 1024 * 1024;
    const value = Number(match[1]);
    const unit = match[2] || 'b';
    switch (unit) {
    case 'g':
    case 'gb':
        return value * 1024 * 1024 * 1024;
    case 'm':
    case 'mb':
        return value * 1024 * 1024;
    case 'k':
    case 'kb':
        return value * 1024;
    default:
        return value;
    }
}

// Create a winston logger with console and optional file transports
export function createLogger(loggingConfig) {
    const fileSize = parseSize(loggingConfig.maxSize);
    const transports = [
        new winston.transports.Console({
            level: loggingConfig.level,
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.timestamp(),
                winston.format.printf(({ level, message, timestamp, ...rest }) => {
                    const extra = Object.keys(rest).length ? ` ${JSON.stringify(rest)}` : '';
                    return `${timestamp} ${level}: ${message}${extra}`;
                }),
            ),
        }),
    ];

    if (loggingConfig.file) {
        const dir = path.dirname(loggingConfig.file);
        if (dir && dir !== '.' && !fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        transports.push(new winston.transports.File({
            filename: loggingConfig.file,
            level: loggingConfig.level,
            maxsize: fileSize,
            maxFiles: loggingConfig.maxFiles || 5,
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.json(),
            ),
        }));
    }

    return winston.createLogger({
        level: loggingConfig.level,
        transports,
    });
}
