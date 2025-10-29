import { promises as fsPromises } from 'fs';
import { getSafeDataPath } from './pathSafety.js';

/**
 * Log levels in order of severity
 */
export enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3,
    SECURITY = 4
}

/**
 * Structured log entry
 */
export interface LogEntry {
    timestamp: string;
    level: string;
    source: string;
    message: string;
    data?: unknown;
}

/**
 * Structured logger with multiple log levels and optional file output
 */
export class Logger {
    private minLevel: LogLevel;
    private logToFile: boolean;
    private logBuffer: LogEntry[] = [];
    private flushInterval: NodeJS.Timeout | null = null;

    constructor(minLevel: LogLevel = LogLevel.INFO, logToFile = false) {
        this.minLevel = minLevel;
        this.logToFile = logToFile;

        if (this.logToFile) {
            // Flush logs every 5 seconds
            this.flushInterval = setInterval(() => {
                this.flush().catch(error => {
                    console.error('[Logger] Failed to flush logs:', error);
                });
            }, 5000);
        }
    }

    /**
     * Internal log method
     */
    private log(level: LogLevel, source: string, message: string, data?: unknown): void {
        if (level < this.minLevel) return;

        const entry: LogEntry = {
            timestamp: new Date().toISOString(),
            level: LogLevel[level],
            source,
            message,
            ...(data !== undefined && { data })
        };

        // Format for console output
        const formatted = `[${entry.timestamp}] [${entry.level}] [${entry.source}] ${entry.message}`;
        const hasData = data !== undefined && data !== null;

        // Console output with appropriate method
        if (level >= LogLevel.ERROR) {
            console.error(formatted, hasData ? data : '');
        } else if (level >= LogLevel.WARN) {
            console.warn(formatted, hasData ? data : '');
        } else {
            console.log(formatted, hasData ? data : '');
        }

        // Add to buffer for file logging
        if (this.logToFile && level >= LogLevel.WARN) {
            this.logBuffer.push(entry);
        }
    }

    /**
     * Log debug message (lowest priority)
     */
    debug(source: string, message: string, data?: unknown): void {
        this.log(LogLevel.DEBUG, source, message, data);
    }

    /**
     * Log informational message
     */
    info(source: string, message: string, data?: unknown): void {
        this.log(LogLevel.INFO, source, message, data);
    }

    /**
     * Log warning message
     */
    warn(source: string, message: string, data?: unknown): void {
        this.log(LogLevel.WARN, source, message, data);
    }

    /**
     * Log error message
     */
    error(source: string, message: string, data?: unknown): void {
        this.log(LogLevel.ERROR, source, message, data);
    }

    /**
     * Log security-related event (highest priority)
     */
    security(source: string, event: string, data?: unknown): void {
        this.log(LogLevel.SECURITY, source, `SECURITY: ${event}`, data);
    }

    /**
     * Flush log buffer to file
     */
    private async flush(): Promise<void> {
        if (this.logBuffer.length === 0) return;

        const entries = [...this.logBuffer];
        this.logBuffer = [];

        try {
            const logPath = getSafeDataPath('application.log');
            const logLines = entries.map(entry => JSON.stringify(entry)).join('\n') + '\n';

            await fsPromises.appendFile(logPath, logLines);
        } catch (error: unknown) {
            // Fallback to console if file write fails
            console.error('[Logger] Failed to write to log file:', error);
            console.error('[Logger] Lost entries:', entries.length);
        }
    }

    /**
     * Get current log level
     */
    getLevel(): LogLevel {
        return this.minLevel;
    }

    /**
     * Set log level
     */
    setLevel(level: LogLevel): void {
        this.minLevel = level;
        this.info('Logger', `Log level changed to ${LogLevel[level]}`);
    }

    /**
     * Cleanup and flush remaining logs
     */
    async destroy(): Promise<void> {
        if (this.flushInterval) {
            clearInterval(this.flushInterval);
            this.flushInterval = null;
        }

        if (this.logToFile && this.logBuffer.length > 0) {
            await this.flush();
        }
    }
}

/**
 * Parse log level from environment variable
 */
function parseLogLevel(level?: string): LogLevel {
    if (!level) return LogLevel.INFO;

    const normalized = level.toUpperCase();
    switch (normalized) {
        case 'DEBUG':
            return LogLevel.DEBUG;
        case 'INFO':
            return LogLevel.INFO;
        case 'WARN':
        case 'WARNING':
            return LogLevel.WARN;
        case 'ERROR':
            return LogLevel.ERROR;
        case 'SECURITY':
            return LogLevel.SECURITY;
        default:
            console.warn(`[Logger] Unknown log level "${level}", defaulting to INFO`);
            return LogLevel.INFO;
    }
}

/**
 * Global logger instance
 */
export const logger = new Logger(
    parseLogLevel(process.env.LOG_LEVEL),
    process.env.LOG_TO_FILE === 'true'
);

/**
 * Create a bound logger for a specific source
 */
export function createLogger(source: string) {
    return {
        debug: (message: string, data?: unknown) => logger.debug(source, message, data),
        info: (message: string, data?: unknown) => logger.info(source, message, data),
        warn: (message: string, data?: unknown) => logger.warn(source, message, data),
        error: (message: string, data?: unknown) => logger.error(source, message, data),
        security: (event: string, data?: unknown) => logger.security(source, event, data)
    };
}
