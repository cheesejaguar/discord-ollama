/**
 * Input Validation Utilities
 *
 * Provides validation functions for user inputs from Discord commands.
 * All user inputs should be validated before use to prevent security issues.
 */

import { sanitizeFilename } from './pathSafety.js';

/**
 * Custom error class for validation failures
 */
export class ValidationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ValidationError';
    }
}

/**
 * Validates a model name from user input
 *
 * @param input - The model name to validate
 * @returns Validated model name
 * @throws {ValidationError} If validation fails
 *
 * @example
 * validateModelName("llama3.2") → "llama3.2" ✓
 * validateModelName("../../../evil") → throws ValidationError ✗
 * validateModelName("model; rm -rf /") → throws ValidationError ✗
 */
export function validateModelName(input: string | null): string {
    if (!input || input.length === 0) {
        throw new ValidationError('Model name cannot be empty');
    }

    if (typeof input !== 'string') {
        throw new ValidationError('Model name must be a string');
    }

    // Check length
    if (input.length > 100) {
        throw new ValidationError(
            'Model name too long (maximum 100 characters)'
        );
    }

    // Allow only safe characters for model names
    // Ollama models typically use: alphanumeric, dash, underscore, dot, colon
    if (!/^[a-zA-Z0-9\-_.:]+$/.test(input)) {
        throw new ValidationError(
            'Model name contains invalid characters. ' +
            'Allowed characters: letters, numbers, dash (-), underscore (_), dot (.), colon (:)'
        );
    }

    // Prevent path traversal attempts
    if (input.includes('..') || input.includes('/') || input.includes('\\')) {
        throw new ValidationError(
            'Model name cannot contain path separators or parent directory references'
        );
    }

    // Prevent starting with special characters
    if (input.startsWith('.') || input.startsWith('-')) {
        throw new ValidationError(
            'Model name cannot start with a dot or dash'
        );
    }

    return input;
}

/**
 * Validates message history capacity
 *
 * @param input - The capacity value to validate
 * @returns Validated capacity as integer
 * @throws {ValidationError} If validation fails
 *
 * @example
 * validateCapacity(10) → 10 ✓
 * validateCapacity(-5) → throws ValidationError ✗
 * validateCapacity(1000) → throws ValidationError ✗
 */
export function validateCapacity(input: number | null): number {
    if (input === null || input === undefined) {
        throw new ValidationError('Capacity is required');
    }

    if (typeof input !== 'number') {
        throw new ValidationError('Capacity must be a number');
    }

    if (!Number.isFinite(input)) {
        throw new ValidationError('Capacity must be a finite number');
    }

    if (!Number.isInteger(input)) {
        throw new ValidationError(
            'Capacity must be a whole number (no decimals)'
        );
    }

    if (input < 1) {
        throw new ValidationError(
            'Capacity must be at least 1 message'
        );
    }

    if (input > 100) {
        throw new ValidationError(
            'Capacity cannot exceed 100 messages (resource limit). ' +
            'Large capacities may cause performance issues and high API costs.'
        );
    }

    return input;
}

/**
 * Validates and sanitizes a Discord username for file operations
 *
 * @param input - The username to validate
 * @returns Sanitized username safe for filesystem
 * @throws {ValidationError} If validation fails
 *
 * @example
 * validateUsername("JohnDoe#1234") → "JohnDoe#1234" (sanitized)
 * validateUsername("") → throws ValidationError
 * validateUsername("../admin") → throws ValidationError (path traversal)
 */
export function validateUsername(input: string | null): string {
    if (!input || input.length === 0) {
        throw new ValidationError('Username cannot be empty');
    }

    if (typeof input !== 'string') {
        throw new ValidationError('Username must be a string');
    }

    if (input.length > 37) {  // Discord max username (32) + discriminator (#1234)
        throw new ValidationError(
            'Username too long (maximum 37 characters)'
        );
    }

    // TEST FIX: Reject path traversal attempts (security best practice)
    if (input.includes('..') || input.includes('/') || input.includes('\\')) {
        throw new ValidationError(
            'Username contains invalid path characters'
        );
    }

    // Sanitize for filesystem safety
    try {
        return sanitizeFilename(input);
    } catch (error) {
        throw new ValidationError(
            `Invalid username: ${(error as Error).message}`
        );
    }
}

/**
 * Validates a guild/server ID
 *
 * @param input - The guild ID to validate
 * @returns Validated guild ID
 * @throws {ValidationError} If validation fails
 */
export function validateGuildId(input: string | null): string {
    if (!input || input.length === 0) {
        throw new ValidationError('Guild ID cannot be empty');
    }

    if (typeof input !== 'string') {
        throw new ValidationError('Guild ID must be a string');
    }

    // Discord snowflake IDs are 17-19 digits
    if (!/^\d{17,19}$/.test(input)) {
        throw new ValidationError(
            'Invalid Guild ID format (must be 17-19 digits)'
        );
    }

    return input;
}

/**
 * Validates a channel ID
 *
 * @param input - The channel ID to validate
 * @returns Validated channel ID
 * @throws {ValidationError} If validation fails
 */
export function validateChannelId(input: string | null): string {
    if (!input || input.length === 0) {
        throw new ValidationError('Channel ID cannot be empty');
    }

    if (typeof input !== 'string') {
        throw new ValidationError('Channel ID must be a string');
    }

    // Discord snowflake IDs are 17-19 digits
    if (!/^\d{17,19}$/.test(input)) {
        throw new ValidationError(
            'Invalid Channel ID format (must be 17-19 digits)'
        );
    }

    return input;
}

/**
 * Validates message content before sending to AI
 * Prevents excessively long messages and potential injection attacks
 *
 * @param input - The message content to validate
 * @returns Validated and sanitized message content
 * @throws {ValidationError} If validation fails
 */
export function validateMessageContent(input: string): string {
    if (!input || input.length === 0) {
        throw new ValidationError('Message content cannot be empty');
    }

    if (typeof input !== 'string') {
        throw new ValidationError('Message content must be a string');
    }

    // Limit message length to prevent resource exhaustion
    const MAX_MESSAGE_LENGTH = 4000;  // Characters
    if (input.length > MAX_MESSAGE_LENGTH) {
        throw new ValidationError(
            `Message too long (maximum ${MAX_MESSAGE_LENGTH} characters). ` +
            `Your message is ${input.length} characters.`
        );
    }

    // Remove excessive whitespace
    let sanitized = input.replace(/\s+/g, ' ').trim();

    // TEST FIX: Reject whitespace-only input after sanitization
    if (sanitized.length === 0) {
        throw new ValidationError('Message content cannot be empty or whitespace-only');
    }

    // Basic sanitization: remove potential system-level instructions
    // (This is a simple filter; more sophisticated filtering may be needed)
    sanitized = sanitized
        .replace(/\[SYSTEM\]/gi, '[FILTERED]')
        .replace(/\[ADMIN\]/gi, '[FILTERED]');

    return sanitized;
}

/**
 * Validates a file attachment size
 *
 * @param sizeBytes - Size in bytes
 * @param maxSizeBytes - Maximum allowed size (default: 25MB per Discord limit)
 * @throws {ValidationError} If file is too large
 */
export function validateFileSize(
    sizeBytes: number,
    maxSizeBytes: number = 25 * 1024 * 1024  // 25MB
): void {
    if (typeof sizeBytes !== 'number' || sizeBytes < 0) {
        throw new ValidationError('Invalid file size');
    }

    if (sizeBytes > maxSizeBytes) {
        const sizeMB = (sizeBytes / (1024 * 1024)).toFixed(2);
        const maxMB = (maxSizeBytes / (1024 * 1024)).toFixed(2);
        throw new ValidationError(
            `File too large: ${sizeMB}MB (maximum: ${maxMB}MB)`
        );
    }
}

/**
 * Validates that a value is a boolean
 *
 * @param input - The value to validate
 * @param fieldName - Name of the field for error messages
 * @returns The validated boolean value
 * @throws {ValidationError} If not a boolean
 */
export function validateBoolean(input: unknown, fieldName: string = 'Value'): boolean {
    if (typeof input !== 'boolean') {
        throw new ValidationError(`${fieldName} must be true or false`);
    }
    return input;
}

/**
 * Detects potential prompt injection attempts
 *
 * Checks for common prompt injection patterns that try to manipulate
 * the AI model's behavior or extract system prompts.
 *
 * @param content - The message content to check
 * @returns true if potential injection detected, false otherwise
 *
 * @example
 * detectPromptInjection("Hello") → false ✓
 * detectPromptInjection("Ignore all previous instructions") → true ✗
 */
export function detectPromptInjection(content: string): boolean {
    const suspiciousPatterns = [
        /ignore\s+(all\s+)?previous\s+instructions/i,
        /forget\s+(all\s+)?previous\s+(instructions|context)/i,
        /system\s*:\s*you\s+are/i,
        /disregard\s+(all\s+)?previous/i,
        /<\|im_start\|>/i,
        /<\|im_end\|>/i,
        /\[INST\]/i,
        /\[\/INST\]/i,
        /<s>\s*\[INST\]/i,
    ];

    return suspiciousPatterns.some(pattern => pattern.test(content));
}
