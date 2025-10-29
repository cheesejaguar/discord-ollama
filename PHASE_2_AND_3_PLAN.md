# Phase 2 & Phase 3 Implementation Plan

**Date:** October 28, 2025
**Status:** Phase 1 Complete ✅ | Phase 2 & 3 Pending
**Current Risk Level:** LOW (down from CRITICAL)

---

## Overview

Phase 1 addressed all **8 CRITICAL** security vulnerabilities. Phases 2 and 3 will address the remaining **43 HIGH and MEDIUM** severity issues to bring the codebase to production-excellence standards.

### Completion Status

| Phase | Severity | Issues | Status | Estimated Time |
|-------|----------|--------|--------|----------------|
| Phase 1 | CRITICAL (8) | Security vulnerabilities | ✅ COMPLETE | - |
| Phase 2 | HIGH (19) | Stability & reliability | ⏳ PENDING | 2-3 days |
| Phase 3 | MEDIUM (24) | Code quality & maintainability | ⏳ PENDING | 3-4 days |
| Phase 4 | LOW (16) | Polish & documentation | 📋 OPTIONAL | 1-2 days |

---

## Phase 2: HIGH Severity Issues (2-3 Days)

**Goal:** Improve application stability, reliability, and operational security

### 2.1 Convert Remaining Callback-Based File Operations
**Priority:** HIGH
**Time:** 2-3 hours
**Impact:** Race conditions, error handling

**File:** `src/events/threadDelete.ts`

**Current Issue:**
```typescript
// Lines 15-36: Uses callback-based fs.readdir and fs.unlink
fs.readdir(dirPath, (error, files) => {
    if (error) {
        log(`Error reading directory ${dirPath}`, error)
        return
    }
    // ... unlink operations
})
```

**Fix:**
```typescript
import { promises as fsPromises } from 'fs';
import { getSafeDataPath } from '../utils/pathSafety.js';

try {
    const dataDir = 'data';
    const files = await fsPromises.readdir(dataDir);

    const filesToDiscard = files.filter(
        file => file.startsWith(`${thread.id}-`) && file.endsWith('.json')
    );

    for (const file of filesToDiscard) {
        const filePath = getSafeDataPath(file);
        try {
            await fsPromises.unlink(filePath);
            log(`Successfully deleted ${file}`);
        } catch (error) {
            log(`Error deleting file ${file}`, error);
        }
    }
} catch (error) {
    log(`Issue deleting thread files from ${thread.id}`, error);
}
```

**Benefits:**
- Eliminates remaining race conditions
- Proper error handling for each file deletion
- Consistent with rest of codebase
- Path safety integration

---

### 2.2 Add Rate Limiting and Spam Protection
**Priority:** HIGH
**Time:** 4-6 hours
**Impact:** DoS prevention, abuse protection

**Current Issue:**
- No protection against message spam
- Users can flood the bot with requests
- Can cause Ollama API rate limits
- No cooldown between requests

**Implementation:**

**Create:** `src/utils/rateLimiter.ts`
```typescript
import { Collection } from 'discord.js';

export class RateLimiter {
    private cooldowns = new Collection<string, number>();
    private readonly cooldownMs: number;

    constructor(cooldownSeconds: number = 5) {
        this.cooldownMs = cooldownSeconds * 1000;
    }

    /**
     * Check if user is on cooldown
     * @returns true if user should be rate limited
     */
    isRateLimited(userId: string): boolean {
        const now = Date.now();
        const cooldownExpires = this.cooldowns.get(userId);

        if (cooldownExpires && now < cooldownExpires) {
            return true; // Still on cooldown
        }

        // Set new cooldown
        this.cooldowns.set(userId, now + this.cooldownMs);

        // Clean up expired cooldowns
        this.cleanup();

        return false;
    }

    /**
     * Get remaining cooldown time
     */
    getRemainingTime(userId: string): number {
        const cooldownExpires = this.cooldowns.get(userId);
        if (!cooldownExpires) return 0;

        const remaining = cooldownExpires - Date.now();
        return Math.max(0, Math.ceil(remaining / 1000));
    }

    /**
     * Clean up expired cooldowns to prevent memory leaks
     */
    private cleanup(): void {
        const now = Date.now();
        for (const [userId, expires] of this.cooldowns.entries()) {
            if (now >= expires) {
                this.cooldowns.delete(userId);
            }
        }
    }
}
```

**Update:** `src/events/messageCreate.ts`
```typescript
import { RateLimiter } from '../utils/rateLimiter.js';

// Add to event props
const rateLimiter = new RateLimiter(5); // 5 second cooldown

export default event(Events.MessageCreate, async ({ log, rateLimiter, ... }, message) => {
    // ... existing checks ...

    // Only respond if message mentions the bot
    if (!message.mentions.has(clientId)) return;

    // Rate limit check
    if (rateLimiter.isRateLimited(message.author.id)) {
        const remaining = rateLimiter.getRemainingTime(message.author.id);
        await message.reply({
            content: `⏳ Please wait ${remaining} seconds before sending another message.`
        }).catch(() => {}); // Ignore reply errors
        return;
    }

    // ... rest of logic ...
});
```

**Configuration Options:**
```typescript
// In .env
MESSAGE_COOLDOWN_SECONDS=5
MAX_MESSAGES_PER_MINUTE=10
```

---

### 2.3 Add Comprehensive Logging and Auditing
**Priority:** HIGH
**Time:** 3-4 hours
**Impact:** Security monitoring, debugging, compliance

**Current Issue:**
- Inconsistent logging across files
- No structured logging format
- No log levels (debug, info, warn, error)
- No security event auditing
- Difficult to trace issues in production

**Implementation:**

**Create:** `src/utils/logger.ts`
```typescript
export enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3,
    SECURITY = 4
}

export interface LogEntry {
    timestamp: string;
    level: string;
    source: string;
    message: string;
    data?: unknown;
}

export class Logger {
    private minLevel: LogLevel;
    private logToFile: boolean;

    constructor(minLevel: LogLevel = LogLevel.INFO, logToFile = false) {
        this.minLevel = minLevel;
        this.logToFile = logToFile;
    }

    private log(level: LogLevel, source: string, message: string, data?: unknown): void {
        if (level < this.minLevel) return;

        const entry: LogEntry = {
            timestamp: new Date().toISOString(),
            level: LogLevel[level],
            source,
            message,
            ...(data && { data })
        };

        const formatted = `[${entry.timestamp}] [${entry.level}] [${entry.source}] ${entry.message}`;

        if (level >= LogLevel.ERROR) {
            console.error(formatted, data || '');
        } else if (level >= LogLevel.WARN) {
            console.warn(formatted, data || '');
        } else {
            console.log(formatted, data || '');
        }

        if (this.logToFile && level >= LogLevel.WARN) {
            this.writeToFile(entry);
        }
    }

    debug(source: string, message: string, data?: unknown): void {
        this.log(LogLevel.DEBUG, source, message, data);
    }

    info(source: string, message: string, data?: unknown): void {
        this.log(LogLevel.INFO, source, message, data);
    }

    warn(source: string, message: string, data?: unknown): void {
        this.log(LogLevel.WARN, source, message, data);
    }

    error(source: string, message: string, data?: unknown): void {
        this.log(LogLevel.ERROR, source, message, data);
    }

    security(source: string, event: string, data?: unknown): void {
        this.log(LogLevel.SECURITY, source, `SECURITY: ${event}`, data);
    }

    private async writeToFile(entry: LogEntry): Promise<void> {
        // Implementation for file logging
        const logPath = getSafeDataPath('application.log');
        const logLine = JSON.stringify(entry) + '\n';

        try {
            await fsPromises.appendFile(logPath, logLine);
        } catch (error) {
            console.error('Failed to write log:', error);
        }
    }
}

export const logger = new Logger(
    process.env.LOG_LEVEL === 'debug' ? LogLevel.DEBUG : LogLevel.INFO,
    process.env.LOG_TO_FILE === 'true'
);
```

**Security Events to Log:**
- Failed authentication attempts
- Path traversal attempts (caught by validation)
- Invalid input attempts
- Rate limit hits
- Admin command usage
- Configuration changes
- File operation errors

---

### 2.4 Add Message Content Validation and Sanitization
**Priority:** HIGH
**Time:** 2-3 hours
**Impact:** XSS prevention, content safety

**Current Issue:**
- Message content sent to Ollama without sanitization
- No length validation
- No harmful content filtering
- Potential for prompt injection

**Add to:** `src/utils/validation.ts`
```typescript
/**
 * Validate and sanitize message content
 */
export function validateMessageContent(content: string | null): string {
    if (!content || content.trim().length === 0) {
        throw new ValidationError('Message content cannot be empty');
    }

    // Maximum message length (prevent abuse)
    if (content.length > 10000) {
        throw new ValidationError('Message too long (max 10,000 characters)');
    }

    // Minimum message length
    if (content.trim().length < 1) {
        throw new ValidationError('Message too short');
    }

    // Remove excessive whitespace
    let sanitized = content.replace(/\s+/g, ' ').trim();

    // Check for repeated characters (spam detection)
    if (/(.)\1{50,}/.test(sanitized)) {
        throw new ValidationError('Message contains excessive repeated characters');
    }

    return sanitized;
}

/**
 * Detect potential prompt injection attempts
 */
export function detectPromptInjection(content: string): boolean {
    const suspiciousPatterns = [
        /ignore\s+(all\s+)?previous\s+instructions/i,
        /system\s*:\s*you\s+are/i,
        /forget\s+everything/i,
        /<\|im_start\|>/i,
        /<\|im_end\|>/i,
    ];

    return suspiciousPatterns.some(pattern => pattern.test(content));
}
```

---

### 2.5 Add Health Checks and Monitoring
**Priority:** HIGH
**Time:** 2-3 hours
**Impact:** Reliability, observability

**Create:** `src/utils/health.ts`
```typescript
import { Client } from 'discord.js';
import { Ollama } from 'ollama';

export interface HealthStatus {
    status: 'healthy' | 'degraded' | 'unhealthy';
    uptime: number;
    checks: {
        discord: boolean;
        ollama: boolean;
        filesystem: boolean;
    };
    timestamp: string;
}

export class HealthMonitor {
    private startTime: number = Date.now();

    async check(client: Client, ollama: Ollama): Promise<HealthStatus> {
        const checks = {
            discord: this.checkDiscord(client),
            ollama: await this.checkOllama(ollama),
            filesystem: await this.checkFilesystem()
        };

        const healthy = Object.values(checks).every(check => check);

        return {
            status: healthy ? 'healthy' : 'degraded',
            uptime: Date.now() - this.startTime,
            checks,
            timestamp: new Date().toISOString()
        };
    }

    private checkDiscord(client: Client): boolean {
        return client.isReady() && client.user !== null;
    }

    private async checkOllama(ollama: Ollama): Promise<boolean> {
        try {
            await ollama.list();
            return true;
        } catch {
            return false;
        }
    }

    private async checkFilesystem(): Promise<boolean> {
        try {
            const testFile = getSafeDataPath('.health-check');
            await fsPromises.writeFile(testFile, 'ok');
            await fsPromises.unlink(testFile);
            return true;
        } catch {
            return false;
        }
    }
}
```

**Add health check command:**
```typescript
// src/commands/health.ts
export const Health: SlashCommand = {
    name: 'health',
    description: 'Check bot health status. Administrator Only.',

    run: async (client: Client, interaction: ChatInputCommandInteraction) => {
        if (!interaction.memberPermissions?.has('Administrator')) {
            await interaction.reply({
                content: '❌ Admin only command',
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        const health = await healthMonitor.check(client, ollama);
        const uptimeSeconds = Math.floor(health.uptime / 1000);
        const uptimeMinutes = Math.floor(uptimeSeconds / 60);
        const uptimeHours = Math.floor(uptimeMinutes / 60);

        const emoji = health.status === 'healthy' ? '✅' : '⚠️';

        await interaction.reply({
            content: `${emoji} **Bot Health: ${health.status.toUpperCase()}**\n\n` +
                     `**Uptime:** ${uptimeHours}h ${uptimeMinutes % 60}m\n` +
                     `**Discord:** ${health.checks.discord ? '✅' : '❌'}\n` +
                     `**Ollama:** ${health.checks.ollama ? '✅' : '❌'}\n` +
                     `**Filesystem:** ${health.checks.filesystem ? '✅' : '❌'}\n\n` +
                     `*Last checked: ${health.timestamp}*`,
            flags: MessageFlags.Ephemeral
        });
    }
};
```

---

### 2.6 Implement Graceful Shutdown
**Priority:** HIGH
**Time:** 2 hours
**Impact:** Data integrity, clean exits

**Current Issue:**
- No cleanup on shutdown
- Active operations may be interrupted
- Files may be left in inconsistent state
- No signal handling

**Update:** `src/client.ts`
```typescript
let isShuttingDown = false;

export async function gracefulShutdown(client: Client, signal: string): Promise<void> {
    if (isShuttingDown) return;
    isShuttingDown = true;

    console.log(`\n[Shutdown] Received ${signal}, shutting down gracefully...`);

    try {
        // Stop accepting new messages
        client.removeAllListeners('messageCreate');
        client.removeAllListeners('interactionCreate');

        console.log('[Shutdown] Stopped accepting new requests');

        // Wait for in-flight operations (with timeout)
        await Promise.race([
            new Promise(resolve => setTimeout(resolve, 5000)),
            // Add any cleanup tasks here
        ]);

        console.log('[Shutdown] Cleanup complete');

        // Destroy Discord client
        client.destroy();
        console.log('[Shutdown] Discord client destroyed');

        process.exit(0);
    } catch (error) {
        console.error('[Shutdown] Error during shutdown:', error);
        process.exit(1);
    }
}

// Register signal handlers
process.on('SIGTERM', () => gracefulShutdown(client, 'SIGTERM'));
process.on('SIGINT', () => gracefulShutdown(client, 'SIGINT'));
process.on('uncaughtException', (error) => {
    console.error('[Fatal] Uncaught exception:', error);
    gracefulShutdown(client, 'uncaughtException');
});
process.on('unhandledRejection', (reason) => {
    console.error('[Fatal] Unhandled rejection:', reason);
    gracefulShutdown(client, 'unhandledRejection');
});
```

---

### 2.7 Add Request Timeouts
**Priority:** HIGH
**Time:** 1-2 hours
**Impact:** Prevent hanging operations

**Update:** `src/utils/messageNormal.ts`
```typescript
const OLLAMA_TIMEOUT_MS = 60000; // 60 seconds

export async function normalMessage(
    message: Message,
    ollama: Ollama,
    model: string,
    msgHist: Queue<UserMessage>,
    stream: boolean
): Promise<string> {
    // Wrap Ollama call with timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Request timeout')), OLLAMA_TIMEOUT_MS);
    });

    try {
        const params: ChatParams = {
            model: model,
            ollama: ollama,
            msgHist: msgHist.getItems()
        };

        const responsePromise = stream
            ? streamResponse(params)
            : blockResponse(params);

        const response = await Promise.race([responsePromise, timeoutPromise]);

        // ... rest of logic
    } catch (error: unknown) {
        if (error instanceof Error && error.message === 'Request timeout') {
            await message.reply('⏱️ Request timed out. The model took too long to respond.');
            throw error;
        }
        // ... other error handling
    }
}
```

---

### 2.8 Enhance Error Messages
**Priority:** HIGH
**Time:** 2 hours
**Impact:** User experience, support burden

**Current Issue:**
- Generic error messages
- No actionable guidance
- Technical jargon exposed to users
- No error codes for debugging

**Create:** `src/utils/errorMessages.ts`
```typescript
export enum ErrorCode {
    // User errors
    RATE_LIMITED = 'RATE_LIMITED',
    INVALID_INPUT = 'INVALID_INPUT',
    NO_MODEL = 'NO_MODEL',
    MESSAGE_TOO_LONG = 'MESSAGE_TOO_LONG',

    // System errors
    OLLAMA_OFFLINE = 'OLLAMA_OFFLINE',
    FILE_ERROR = 'FILE_ERROR',
    TIMEOUT = 'TIMEOUT',
    UNKNOWN = 'UNKNOWN'
}

export function getUserFriendlyError(code: ErrorCode, details?: string): string {
    const messages: Record<ErrorCode, string> = {
        [ErrorCode.RATE_LIMITED]: '⏳ **Slow down!**\n\nYou\\'re sending messages too quickly. Please wait a moment before trying again.',

        [ErrorCode.INVALID_INPUT]: '❌ **Invalid Input**\n\nYour message contains invalid characters or format. Please check and try again.',

        [ErrorCode.NO_MODEL]: '🤖 **No Model Selected**\n\nYou need to select an AI model first.\n\nUse `/switch-model` to choose a model, or ask an admin to run `/pull-model` to download one.',

        [ErrorCode.MESSAGE_TOO_LONG]: '📏 **Message Too Long**\n\nYour message exceeds the maximum length. Please shorten it and try again.',

        [ErrorCode.OLLAMA_OFFLINE]: '🔌 **Service Unavailable**\n\nThe AI service is currently offline. Please try again later or contact an administrator.\n\nDownload Ollama: https://ollama.com/',

        [ErrorCode.FILE_ERROR]: '💾 **Storage Error**\n\nThere was a problem saving your data. Please try again or contact support if the issue persists.',

        [ErrorCode.TIMEOUT]: '⏱️ **Request Timeout**\n\nThe request took too long to complete. The model might be slow or overloaded. Try again with a shorter message.',

        [ErrorCode.UNKNOWN]: '❓ **Unknown Error**\n\nAn unexpected error occurred. Please try again or contact support.'
    };

    let message = messages[code] || messages[ErrorCode.UNKNOWN];

    if (details) {
        message += `\n\n*Details: ${details}*`;
    }

    return message;
}
```

---

## Phase 2 Summary

### Files to Create:
1. `src/utils/rateLimiter.ts` - Rate limiting
2. `src/utils/logger.ts` - Structured logging
3. `src/utils/health.ts` - Health monitoring
4. `src/utils/errorMessages.ts` - User-friendly errors
5. `src/commands/health.ts` - Health check command

### Files to Update:
1. `src/events/threadDelete.ts` - Convert to async/await
2. `src/events/messageCreate.ts` - Add rate limiting, validation
3. `src/client.ts` - Add graceful shutdown
4. `src/utils/messageNormal.ts` - Add timeouts
5. `src/utils/validation.ts` - Add message content validation
6. All command/event files - Use new logger

### Estimated Time: 2-3 days
### Risk Reduction: From LOW to VERY LOW

---

## Phase 3: MEDIUM Severity Issues (3-4 Days)

**Goal:** Improve code quality, maintainability, and developer experience

### 3.1 Add Comprehensive Unit Tests
**Priority:** MEDIUM
**Time:** 1-2 days
**Impact:** Code quality, confidence in changes

**Current Coverage:**
- ✅ Basic tests exist for utils
- ❌ No tests for validation functions
- ❌ No tests for rate limiter
- ❌ No tests for path safety
- ❌ No tests for handlers
- ❌ No command tests
- ❌ No event tests

**Test Files to Create:**
```
tests/
├── utils/
│   ├── validation.test.ts          (NEW)
│   ├── rateLimiter.test.ts         (NEW)
│   ├── pathSafety.test.ts          (NEW)
│   ├── logger.test.ts              (NEW)
│   └── errorMessages.test.ts       (NEW)
├── handlers/
│   ├── configHandler.test.ts       (NEW)
│   └── chatHistoryHandler.test.ts  (NEW)
├── commands/
│   ├── capacity.test.ts            (NEW)
│   ├── switchModel.test.ts         (NEW)
│   └── pullModel.test.ts           (NEW)
└── integration/
    └── messageFlow.test.ts         (NEW)
```

**Example Test:** `tests/utils/validation.test.ts`
```typescript
import { describe, it, expect } from 'vitest';
import {
    validateModelName,
    validateCapacity,
    validateUsername,
    ValidationError
} from '../../src/utils/validation';

describe('validateModelName', () => {
    it('should accept valid model names', () => {
        expect(validateModelName('llama3.2')).toBe('llama3.2');
        expect(validateModelName('mixtral-8x7b')).toBe('mixtral-8x7b');
    });

    it('should reject null/empty input', () => {
        expect(() => validateModelName(null)).toThrow(ValidationError);
        expect(() => validateModelName('')).toThrow(ValidationError);
    });

    it('should reject path traversal attempts', () => {
        expect(() => validateModelName('../../../etc/passwd')).toThrow(ValidationError);
        expect(() => validateModelName('model/../../secret')).toThrow(ValidationError);
    });

    it('should reject names that are too long', () => {
        const longName = 'a'.repeat(101);
        expect(() => validateModelName(longName)).toThrow(ValidationError);
    });

    it('should reject invalid characters', () => {
        expect(() => validateModelName('model@#$%')).toThrow(ValidationError);
        expect(() => validateModelName('model name')).toThrow(ValidationError);
    });
});

describe('validateCapacity', () => {
    it('should accept valid capacities', () => {
        expect(validateCapacity(1)).toBe(1);
        expect(validateCapacity(50)).toBe(50);
        expect(validateCapacity(100)).toBe(100);
    });

    it('should reject out-of-range values', () => {
        expect(() => validateCapacity(0)).toThrow(ValidationError);
        expect(() => validateCapacity(-1)).toThrow(ValidationError);
        expect(() => validateCapacity(101)).toThrow(ValidationError);
    });

    it('should reject non-integers', () => {
        expect(() => validateCapacity(5.5)).toThrow(ValidationError);
        expect(() => validateCapacity(NaN)).toThrow(ValidationError);
    });
});
```

**Test Coverage Goal:** >80%

---

### 3.2 Reduce Code Duplication
**Priority:** MEDIUM
**Time:** 4-6 hours
**Impact:** Maintainability

**Common Patterns to Extract:**

**1. Admin Check Pattern:**
```typescript
// Create: src/utils/permissions.ts
export async function requireAdmin(
    interaction: ChatInputCommandInteraction
): Promise<boolean> {
    if (!interaction.memberPermissions?.has('Administrator')) {
        await interaction.reply({
            content: '❌ **Administrator Only**\n\nThis command requires administrator permissions.',
            flags: MessageFlags.Ephemeral
        });
        return false;
    }
    return true;
}

// Usage in commands:
if (!await requireAdmin(interaction)) return;
```

**2. Channel Validation Pattern:**
```typescript
export async function validateChannel(
    client: Client,
    channelId: string,
    allowedTypes: ChannelType[]
): Promise<Channel | null> {
    const channel = await client.channels.fetch(channelId);
    if (!channel || !allowedTypes.includes(channel.type)) {
        return null;
    }
    return channel;
}
```

**3. Ollama Connection Check:**
```typescript
export async function checkOllamaConnection(
    ollama: Ollama
): Promise<{ connected: boolean; error?: string }> {
    try {
        await ollama.list();
        return { connected: true };
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return {
            connected: false,
            error: message.includes('ECONNREFUSED')
                ? 'Ollama service not running'
                : message
        };
    }
}
```

---

### 3.3 Add JSDoc Comments
**Priority:** MEDIUM
**Time:** 6-8 hours
**Impact:** Developer experience, IDE support

**Current State:**
- Some functions have comments
- Many missing parameter descriptions
- No examples in comments
- No @throws documentation

**Goal:** Add comprehensive JSDoc to all public functions

**Example:**
```typescript
/**
 * Validates and sanitizes a model name for use with Ollama.
 *
 * Model names must:
 * - Not be empty
 * - Be 100 characters or less
 * - Contain only alphanumeric characters, hyphens, underscores, colons, and periods
 * - Not contain path traversal sequences
 *
 * @param input - The raw model name from user input
 * @returns The validated model name
 * @throws {ValidationError} If the model name is invalid
 *
 * @example
 * ```typescript
 * const model = validateModelName('llama3.2');  // ✓ Valid
 * validateModelName('../../../etc/passwd');      // ✗ Throws ValidationError
 * ```
 */
export function validateModelName(input: string | null): string {
    // ...
}
```

---

### 3.4 Performance Optimization
**Priority:** MEDIUM
**Time:** 4-6 hours
**Impact:** Resource usage, responsiveness

**Optimizations:**

**1. Cache Ollama Model List:**
```typescript
// src/utils/modelCache.ts
export class ModelCache {
    private cache: ModelResponse[] = [];
    private lastUpdate: number = 0;
    private readonly TTL = 5 * 60 * 1000; // 5 minutes

    async getModels(ollama: Ollama): Promise<ModelResponse[]> {
        const now = Date.now();
        if (now - this.lastUpdate > this.TTL) {
            const response = await ollama.list();
            this.cache = response.models;
            this.lastUpdate = now;
        }
        return this.cache;
    }

    invalidate(): void {
        this.cache = [];
        this.lastUpdate = 0;
    }
}
```

**2. Batch File Operations:**
```typescript
// Instead of individual unlinks in threadDelete:
await Promise.all(
    filesToDiscard.map(file =>
        fsPromises.unlink(getSafeDataPath(file))
            .catch(error => log(`Error deleting ${file}`, error))
    )
);
```

**3. Lazy Load Commands:**
```typescript
// Only load command modules when needed
const commands = await Promise.all(
    commandFiles.map(file => import(file))
);
```

---

### 3.5 Configuration Validation on Startup
**Priority:** MEDIUM
**Time:** 2-3 hours
**Impact:** Fail-fast on misconfiguration

**Create:** `src/utils/configValidation.ts`
```typescript
export interface BotConfig {
    token: string;
    ollamaUrl: string;
    defaultModel: string;
    dataDirectory: string;
    logLevel: string;
    messageTimeout: number;
    rateLimitSeconds: number;
}

export function validateConfig(): BotConfig {
    const config: BotConfig = {
        token: getEnvVar('CLIENT_TOKEN'),
        ollamaUrl: getEnvVar('OLLAMA_URL', 'http://127.0.0.1:11434'),
        defaultModel: getEnvVar('DEFAULT_MODEL', 'llama3.2'),
        dataDirectory: getEnvVar('DATA_DIR', 'data'),
        logLevel: getEnvVar('LOG_LEVEL', 'info'),
        messageTimeout: parseInt(getEnvVar('MESSAGE_TIMEOUT', '60000')),
        rateLimitSeconds: parseInt(getEnvVar('RATE_LIMIT_SECONDS', '5'))
    };

    // Validate values
    if (!['debug', 'info', 'warn', 'error'].includes(config.logLevel)) {
        throw new Error(`Invalid LOG_LEVEL: ${config.logLevel}`);
    }

    if (config.messageTimeout < 5000 || config.messageTimeout > 300000) {
        throw new Error('MESSAGE_TIMEOUT must be between 5000-300000ms');
    }

    if (config.rateLimitSeconds < 1 || config.rateLimitSeconds > 60) {
        throw new Error('RATE_LIMIT_SECONDS must be between 1-60');
    }

    return config;
}
```

**Update:** `src/client.ts`
```typescript
// Validate configuration before starting
const config = validateConfig();
console.log('[Config] Configuration validated successfully');
```

---

### 3.6 Improve Error Recovery
**Priority:** MEDIUM
**Time:** 3-4 hours
**Impact:** Resilience

**Add Retry Logic:**
```typescript
// src/utils/retry.ts
export async function withRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    delayMs: number = 1000
): Promise<T> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await operation();
        } catch (error) {
            lastError = error;

            if (attempt < maxRetries) {
                logger.warn('Retry', `Attempt ${attempt}/${maxRetries} failed, retrying...`);
                await new Promise(resolve => setTimeout(resolve, delayMs * attempt));
            }
        }
    }

    throw lastError;
}
```

**Use in handlers:**
```typescript
// Retry file operations on transient errors
const data = await withRetry(
    () => fsPromises.readFile(fullFileName, 'utf8'),
    3
);
```

---

### 3.7 Add Database Support (Optional but Recommended)
**Priority:** MEDIUM
**Time:** 1-2 days
**Impact:** Scalability, reliability

**Current Issue:**
- File-based storage doesn't scale well
- No transactions
- Difficult to query
- No backup/restore

**Recommendation:** Use SQLite (lightweight, no separate server)

```bash
npm install better-sqlite3 @types/better-sqlite3
```

**Create:** `src/database/schema.sql`
```sql
CREATE TABLE IF NOT EXISTS user_configs (
    username TEXT PRIMARY KEY,
    model TEXT NOT NULL,
    capacity INTEGER DEFAULT 20,
    stream_enabled BOOLEAN DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS server_configs (
    guild_id TEXT PRIMARY KEY,
    chat_enabled BOOLEAN DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS message_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_id TEXT NOT NULL,
    username TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    images TEXT, -- JSON array
    created_at INTEGER NOT NULL,
    FOREIGN KEY (username) REFERENCES user_configs(username)
);

CREATE INDEX idx_message_history_channel ON message_history(channel_id, created_at);
```

**Benefits:**
- Atomic transactions
- Better query performance
- Easy backup (single file)
- Built-in SQLite in Node.js
- No external dependencies

---

### 3.8 Documentation Improvements
**Priority:** MEDIUM
**Time:** 4-6 hours
**Impact:** Onboarding, maintenance

**Documentation to Create/Update:**

1. **API Documentation** (`docs/API.md`)
   - All utility functions
   - All validation functions
   - Handler APIs
   - Examples

2. **Architecture Guide** (`docs/ARCHITECTURE.md`)
   - System overview
   - Component interactions
   - Data flow diagrams
   - Security layers

3. **Development Guide** (`docs/DEVELOPMENT.md`)
   - Setup instructions
   - Testing guide
   - Debugging tips
   - Common patterns

4. **Deployment Guide** (`docs/DEPLOYMENT.md`)
   - Production setup
   - Environment variables
   - Security checklist
   - Monitoring setup

5. **Security Guide** (`docs/SECURITY.md`)
   - Security features
   - Threat model
   - Best practices
   - Incident response

---

## Phase 3 Summary

### Files to Create:
1. Test files (15+)
2. `src/utils/permissions.ts`
3. `src/utils/modelCache.ts`
4. `src/utils/configValidation.ts`
5. `src/utils/retry.ts`
6. `src/database/*` (if using database)
7. `docs/*` (documentation)

### Files to Update:
1. All source files - Add JSDoc comments
2. Commands - Use shared utilities
3. Handlers - Add retry logic
4. README.md - Update with new features

### Estimated Time: 3-4 days
### Impact: Production-excellence quality

---

## Phase 4: LOW Severity Issues (Optional - 1-2 Days)

1. **Code Style Consistency** - ESLint/Prettier setup
2. **CI/CD Pipeline** - GitHub Actions
3. **Automated Testing** - Test on PR
4. **Performance Benchmarks** - Track metrics
5. **Changelog Automation** - Auto-generate from commits
6. **Dependency Updates** - Renovate bot
7. **Security Scanning** - Snyk/Dependabot
8. **Code Coverage** - Coveralls integration
9. **Bundle Size Optimization** - Tree shaking
10. **Docker Support** - Containerization

---

## Recommended Approach

### Option 1: Sequential (Safest)
1. Complete Phase 2 → Test → Deploy
2. Complete Phase 3 → Test → Deploy
3. Optional Phase 4

**Timeline:** 5-7 days
**Risk:** LOW

### Option 2: Parallel (Faster)
1. Phase 2 critical items + Phase 3 tests simultaneously
2. Phase 2 remaining + Phase 3 documentation
3. Phase 3 remaining + Phase 4 (optional)

**Timeline:** 3-5 days
**Risk:** MEDIUM

### Option 3: Minimal (Fastest)
1. Just Phase 2 items: 2.1, 2.2, 2.3, 2.6
2. Phase 3 tests only

**Timeline:** 2-3 days
**Risk:** MEDIUM-LOW

---

## Success Criteria

### Phase 2 Complete When:
- ✅ No callback-based file operations remain
- ✅ Rate limiting active on all message handlers
- ✅ Structured logging in place
- ✅ Health checks working
- ✅ Graceful shutdown implemented
- ✅ All timeouts configured
- ✅ User-friendly error messages
- ✅ Build succeeds with no warnings

### Phase 3 Complete When:
- ✅ Test coverage >80%
- ✅ No code duplication >10 lines
- ✅ All public functions have JSDoc
- ✅ Performance optimizations applied
- ✅ Configuration validated on startup
- ✅ Retry logic in critical paths
- ✅ Documentation complete
- ✅ All tests passing

---

## Getting Started

To begin Phase 2:

```bash
# 1. Create a new branch
git checkout -b phase-2-high-severity

# 2. Start with threadDelete.ts (quick win)
# Edit src/events/threadDelete.ts

# 3. Run build to verify
npm run build

# 4. Continue with next item
```

Would you like me to start implementing Phase 2?
