/**
 * Path Safety Utilities
 *
 * Provides functions to safely handle file paths and prevent path traversal attacks.
 * All file operations should use these utilities to ensure security.
 */

import path from 'path';
import { promises as fsPromises } from 'fs';

/**
 * The secure data directory where all application data is stored
 */
const DATA_DIR = path.resolve(process.cwd(), 'data');

/**
 * Sanitizes a filename to remove dangerous characters and patterns
 *
 * @param input - The filename to sanitize
 * @returns Sanitized filename safe for filesystem operations
 *
 * @example
 * sanitizeFilename("../../../etc/passwd") → "...etc.passwd"
 * sanitizeFilename("user@example.com") → "user@example.com"
 * sanitizeFilename("file\0name") → "file.name"
 */
export function sanitizeFilename(input: string): string {
    if (!input || typeof input !== 'string') {
        throw new Error('Filename must be a non-empty string');
    }

    // Remove or replace dangerous characters
    let sanitized = input
        // Remove null bytes
        .replace(/\x00/g, '')
        // Replace path separators with underscores
        .replace(/[\/\\]/g, '_')
        // Replace control characters
        .replace(/[\x00-\x1f\x7f-\x9f]/g, '_')
        // Prevent hidden files (files starting with dot)
        .replace(/^\.+/, '_');

    // Limit length to prevent filesystem issues
    if (sanitized.length > 255) {
        sanitized = sanitized.slice(0, 255);
    }

    // Ensure result is not empty after sanitization
    if (sanitized.length === 0) {
        throw new Error('Filename cannot be empty after sanitization');
    }

    return sanitized;
}

/**
 * Constructs a safe file path within the data directory
 *
 * @param filename - The filename (will be sanitized)
 * @returns Absolute path within the data directory
 * @throws {Error} If path traversal is detected or path is invalid
 *
 * @example
 * getSafeDataPath("config.json") → "/app/data/config.json"
 * getSafeDataPath("../../../etc/passwd") → throws Error
 */
export function getSafeDataPath(filename: string): string {
    // Sanitize the filename
    const sanitized = sanitizeFilename(filename);

    // Construct full path
    const fullPath = path.join(DATA_DIR, sanitized);

    // Resolve to absolute path (resolves .. and .)
    const resolvedPath = path.resolve(fullPath);

    // Security check: ensure resolved path is within DATA_DIR
    // Add path.sep to prevent matching "/data2" when checking "/data"
    if (!resolvedPath.startsWith(DATA_DIR + path.sep) && resolvedPath !== DATA_DIR) {
        throw new Error(
            `Security: Path traversal detected. ` +
            `Attempted to access: ${filename}. ` +
            `All files must be within the data directory.`
        );
    }

    return resolvedPath;
}

/**
 * Ensures the data directory exists, creating it if necessary
 * Should be called once at application startup
 *
 * @returns Promise that resolves when directory is ready
 */
export async function ensureDataDirectory(): Promise<void> {
    try {
        await fsPromises.mkdir(DATA_DIR, { recursive: true });
        console.log(`[PathSafety] Data directory ready: ${DATA_DIR}`);
    } catch (error) {
        throw new Error(
            `Failed to create data directory: ${(error as Error).message}`
        );
    }
}

/**
 * Gets the data directory path
 * @returns The absolute path to the data directory
 */
export function getDataDirectory(): string {
    return DATA_DIR;
}

/**
 * Checks if a path is safe (within data directory)
 *
 * @param filePath - The file path to check
 * @returns true if path is safe, false otherwise
 */
export function isPathSafe(filePath: string): boolean {
    try {
        const resolvedPath = path.resolve(filePath);
        return resolvedPath.startsWith(DATA_DIR + path.sep) || resolvedPath === DATA_DIR;
    } catch {
        return false;
    }
}
