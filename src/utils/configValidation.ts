/**
 * Configuration Validation Utilities
 *
 * Validates environment variables and configuration on startup
 * to fail fast with clear error messages.
 */

import { getEnvVar } from './env.js';

/**
 * Bot configuration interface
 */
export interface BotConfig {
    token: string;
    ollamaUrl: string;
    ollamaHost: string;
    ollamaPort: string;
    ollamaApiKey?: string;
    defaultModel: string;
    dataDirectory: string;
    logLevel: string;
    logToFile: boolean;
    messageTimeout: number;
    rateLimitSeconds: number;
}

/**
 * Validates a log level string
 */
function validateLogLevel(level: string): string {
    const validLevels = ['debug', 'info', 'warn', 'error', 'security'];
    const normalized = level.toLowerCase();

    if (!validLevels.includes(normalized)) {
        throw new Error(
            `Invalid LOG_LEVEL: "${level}". Must be one of: ${validLevels.join(', ')}`
        );
    }

    return normalized;
}

/**
 * Validates a timeout value in milliseconds
 */
function validateTimeout(timeoutMs: number, min: number = 5000, max: number = 300000): number {
    if (!Number.isInteger(timeoutMs)) {
        throw new Error('Timeout must be an integer');
    }

    if (timeoutMs < min || timeoutMs > max) {
        throw new Error(
            `Timeout must be between ${min}ms (${min/1000}s) and ${max}ms (${max/1000}s), got ${timeoutMs}ms`
        );
    }

    return timeoutMs;
}

/**
 * Validates a rate limit in seconds
 */
function validateRateLimit(seconds: number): number {
    if (!Number.isInteger(seconds)) {
        throw new Error('Rate limit must be an integer');
    }

    if (seconds < 1 || seconds > 3600) {
        throw new Error(
            `Rate limit must be between 1-3600 seconds (1 hour), got ${seconds}s`
        );
    }

    return seconds;
}

/**
 * Validates Ollama URL format
 */
function validateOllamaUrl(host: string, port: string): string {
    // Validate host (IP or hostname)
    if (!host || host.trim().length === 0) {
        throw new Error('Ollama host cannot be empty');
    }

    // Validate port
    const portNum = parseInt(port, 10);
    if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
        throw new Error(`Invalid Ollama port: ${port}. Must be 1-65535`);
    }

    return `http://${host}:${port}`;
}

/**
 * Validates and loads bot configuration from environment variables
 *
 * @returns Validated configuration object
 * @throws Error if configuration is invalid
 *
 * @example
 * ```typescript
 * try {
 *     const config = validateConfig();
 *     console.log(`Bot configured with model: ${config.defaultModel}`);
 * } catch (error) {
 *     console.error('Configuration error:', error.message);
 *     process.exit(1);
 * }
 * ```
 */
export function validateConfig(): BotConfig {
    const errors: string[] = [];

    try {
        // Required: Discord token
        const token = getEnvVar('CLIENT_TOKEN');

        // Ollama configuration
        const ollamaHost = getEnvVar('IP_ADDRESS', '127.0.0.1');
        const ollamaPort = getEnvVar('OLLAMA_PORT', '11434');
        const ollamaApiKey = process.env.OLLAMA_API_KEY || ''; // Optional, read directly
        let ollamaUrl: string;

        try {
            ollamaUrl = validateOllamaUrl(ollamaHost, ollamaPort);
        } catch (error) {
            errors.push(`Ollama URL: ${error instanceof Error ? error.message : 'Invalid'}`);
            ollamaUrl = 'http://127.0.0.1:11434'; // Fallback
        }

        // Default model
        const defaultModel = getEnvVar('DEFAULT_MODEL', 'llama3.2');
        if (defaultModel.length === 0 || defaultModel.length > 100) {
            errors.push('DEFAULT_MODEL must be 1-100 characters');
        }

        // Data directory
        const dataDirectory = getEnvVar('DATA_DIR', 'data');
        if (dataDirectory.length === 0) {
            errors.push('DATA_DIR cannot be empty');
        }

        // Log level
        const logLevelRaw = process.env.LOG_LEVEL || 'info';
        let logLevel: string;
        try {
            logLevel = validateLogLevel(logLevelRaw);
        } catch (error) {
            errors.push(`Log level: ${error instanceof Error ? error.message : 'Invalid'}`);
            logLevel = 'info'; // Fallback
        }

        // Log to file
        const logToFile = process.env.LOG_TO_FILE === 'true';

        // Message timeout
        const messageTimeoutRaw = parseInt(process.env.OLLAMA_TIMEOUT_MS || '60000', 10);
        let messageTimeout: number;
        try {
            messageTimeout = validateTimeout(messageTimeoutRaw, 5000, 300000);
        } catch (error) {
            errors.push(`Message timeout: ${error instanceof Error ? error.message : 'Invalid'}`);
            messageTimeout = 60000; // Fallback
        }

        // Rate limit
        const rateLimitRaw = parseInt(process.env.RATE_LIMIT_SECONDS || '5', 10);
        let rateLimitSeconds: number;
        try {
            rateLimitSeconds = validateRateLimit(rateLimitRaw);
        } catch (error) {
            errors.push(`Rate limit: ${error instanceof Error ? error.message : 'Invalid'}`);
            rateLimitSeconds = 5; // Fallback
        }

        // If there were any errors, report them
        if (errors.length > 0) {
            console.warn('[Config] Configuration warnings:');
            errors.forEach(err => console.warn(`  - ${err}`));
            console.warn('[Config] Using fallback values where applicable');
        }

        const config: BotConfig = {
            token,
            ollamaUrl,
            ollamaHost,
            ollamaPort,
            ...(ollamaApiKey && { ollamaApiKey }),
            defaultModel,
            dataDirectory,
            logLevel,
            logToFile,
            messageTimeout,
            rateLimitSeconds
        };

        return config;

    } catch (error) {
        if (error instanceof Error) {
            throw new Error(`Configuration validation failed: ${error.message}`);
        }
        throw error;
    }
}

/**
 * Prints configuration summary to console
 */
export function printConfigSummary(config: BotConfig): void {
    console.log('\n═══════════════════════════════════════════');
    console.log('         BOT CONFIGURATION');
    console.log('═══════════════════════════════════════════');
    console.log(`  Ollama URL:        ${config.ollamaUrl}`);
    console.log(`  Default Model:     ${config.defaultModel}`);
    console.log(`  Data Directory:    ${config.dataDirectory}`);
    console.log(`  Log Level:         ${config.logLevel}`);
    console.log(`  Log to File:       ${config.logToFile ? 'enabled' : 'disabled'}`);
    console.log(`  Message Timeout:   ${config.messageTimeout}ms (${config.messageTimeout/1000}s)`);
    console.log(`  Rate Limit:        ${config.rateLimitSeconds}s`);
    console.log('═══════════════════════════════════════════\n');
}
