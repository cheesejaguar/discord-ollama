/**
 * Chat History Handler
 *
 * Handles reading and writing channel-specific message histories.
 * Uses file locking to prevent race conditions and path safety to prevent traversal attacks.
 *
 * SECURITY IMPROVEMENTS:
 * - All file operations use async/await (no race conditions)
 * - File locking prevents concurrent modification
 * - Path traversal protection
 * - No JSON injection (use objects instead of JSON.parse with strings)
 * - Proper error handling and propagation
 * - Validates user input for filenames
 */

import { TextChannel, ThreadChannel } from 'discord.js';
import { promises as fsPromises } from 'fs';
import path from 'path';
import { Mutex } from 'async-mutex';
import { Channel, UserMessage } from '../index.js';
import { getSafeDataPath } from '../pathSafety.js';
import { validateUsername, validateChannelId } from '../validation.js';

/**
 * File lock manager to prevent concurrent modifications
 */
class FileLockManager {
    private locks = new Map<string, Mutex>();

    getLock(filePath: string): Mutex {
        if (!this.locks.has(filePath)) {
            this.locks.set(filePath, new Mutex());
        }
        return this.locks.get(filePath)!;
    }

    async withLock<T>(filePath: string, operation: () => Promise<T>): Promise<T> {
        const lock = this.getLock(filePath);
        return await lock.runExclusive(operation);
    }
}

const fileLocks = new FileLockManager();

/**
 * Checks if a channel history file exists
 *
 * @param channelId - Discord channel ID
 * @param username - Discord username
 * @returns true if file exists, false otherwise
 */
export async function checkChannelInfoExists(
    channelId: string,
    username: string
): Promise<boolean> {
    try {
        const filename = `${validateChannelId(channelId)}-${validateUsername(username)}.json`;
        const fullFileName = getSafeDataPath(filename);
        await fsPromises.access(fullFileName);
        return true;
    } catch {
        return false;
    }
}

/**
 * Clears message history for a specific user in a channel
 *
 * @param channelId - Discord channel ID
 * @param channel - Discord channel object
 * @param username - Discord username
 * @returns true if history was cleared, false if already empty or doesn't exist
 * @throws {Error} If file operations fail
 */
export async function clearChannelInfo(
    channelId: string,
    channel: TextChannel,
    username: string
): Promise<boolean> {
    const exists = await checkChannelInfoExists(channelId, username);

    if (!exists) {
        return false;  // File doesn't exist
    }

    const filename = `${validateChannelId(channelId)}-${validateUsername(username)}.json`;
    const fullFileName = getSafeDataPath(filename);

    return await fileLocks.withLock(fullFileName, async () => {
        try {
            const data = await fsPromises.readFile(fullFileName, 'utf8');
            const channelInfo = JSON.parse(data) as Channel;

            if (!channelInfo.messages || channelInfo.messages.length === 0) {
                return false;  // Already empty
            }

            // Clear messages
            channelInfo.messages = [];

            // Atomic write
            const tempFile = `${fullFileName}.tmp`;
            await fsPromises.writeFile(
                tempFile,
                JSON.stringify(channelInfo, null, 2),
                'utf8'
            );
            await fsPromises.rename(tempFile, fullFileName);

            console.log(`[ChatHistory] Cleared history for ${username} in channel ${channelId}`);
            return true;

        } catch (error) {
            throw new Error(
                `Failed to clear channel history: ${(error as Error).message}`
            );
        }
    });
}

/**
 * Saves message history for a channel (context for all users)
 *
 * @param channelId - Discord channel ID
 * @param channel - Discord channel object
 * @param messages - Array of messages to save (optional)
 * @throws {Error} If file operations fail
 */
export async function saveChannelContext(
    channelId: string,
    channel: TextChannel | ThreadChannel,
    messages: UserMessage[] = []
): Promise<void> {
    const filename = `${validateChannelId(channelId)}-context.json`;
    const fullFileName = getSafeDataPath(filename);

    await fileLocks.withLock(fullFileName, async () => {
        // Create channel info object (NO JSON injection!)
        const channelInfo: Channel = {
            id: channelId,
            name: channel.name,
            user: 'context',  // Special marker for context files
            messages: messages
        };

        try {
            // Ensure directory exists
            await fsPromises.mkdir(path.dirname(fullFileName), { recursive: true });

            // Atomic write
            const tempFile = `${fullFileName}.tmp`;
            await fsPromises.writeFile(
                tempFile,
                JSON.stringify(channelInfo, null, 2),
                'utf8'
            );
            await fsPromises.rename(tempFile, fullFileName);

        } catch (error) {
            throw new Error(
                `Failed to save channel context: ${(error as Error).message}`
            );
        }
    });
}

/**
 * Saves message history for a specific user in a channel
 *
 * @param channelId - Discord channel ID
 * @param channel - Discord channel object
 * @param username - Discord username
 * @param messages - Array of messages to save (optional)
 * @throws {Error} If file operations fail
 */
export async function saveChannelInfo(
    channelId: string,
    channel: TextChannel | ThreadChannel,
    username: string,
    messages: UserMessage[] = []
): Promise<void> {
    const filename = `${validateChannelId(channelId)}-${validateUsername(username)}.json`;
    const fullFileName = getSafeDataPath(filename);

    await fileLocks.withLock(fullFileName, async () => {
        // Create channel info object (NO JSON injection!)
        const channelInfo: Channel = {
            id: channelId,
            name: channel.name,
            user: username,
            messages: messages
        };

        try {
            // Ensure directory exists
            await fsPromises.mkdir(path.dirname(fullFileName), { recursive: true });

            // Atomic write
            const tempFile = `${fullFileName}.tmp`;
            await fsPromises.writeFile(
                tempFile,
                JSON.stringify(channelInfo, null, 2),
                'utf8'
            );
            await fsPromises.rename(tempFile, fullFileName);

        } catch (error) {
            throw new Error(
                `Failed to save channel info: ${(error as Error).message}`
            );
        }
    });
}

/**
 * Retrieves channel information/history from file
 * Returns null if file doesn't exist
 *
 * @param filename - Name of the channel info file (e.g., "channelId-username.json")
 * @returns Channel information or null if not found
 * @throws {Error} If file read or parse fails (not ENOENT)
 */
export async function getChannelInfo(filename: string): Promise<Channel | null> {
    const fullFileName = getSafeDataPath(filename);

    try {
        const data = await fsPromises.readFile(fullFileName, 'utf8');

        // Validate data is not empty
        if (data.trim().length === 0) {
            throw new Error('Channel info file is empty');
        }

        const parsed = JSON.parse(data) as Channel;

        // Validate structure
        if (!parsed.id || !parsed.name || !Array.isArray(parsed.messages)) {
            throw new Error('Invalid channel info structure');
        }

        return parsed;

    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return null;  // File doesn't exist - expected case
        }

        // Real error - propagate it
        throw new Error(
            `Failed to read channel info ${filename}: ${(error as Error).message}`
        );
    }
}

/**
 * Deletes a channel history file
 *
 * @param filename - Name of the channel info file
 * @returns true if deleted, false if didn't exist
 * @throws {Error} If delete operation fails
 */
export async function deleteChannelInfo(filename: string): Promise<boolean> {
    const fullFileName = getSafeDataPath(filename);

    try {
        await fsPromises.unlink(fullFileName);
        console.log(`[ChatHistory] Deleted '${filename}'`);
        return true;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return false;  // File doesn't exist
        }

        throw new Error(
            `Failed to delete channel info ${filename}: ${(error as Error).message}`
        );
    }
}

/**
 * DEPRECATED: Use saveChannelContext instead
 * Kept for backwards compatibility
 */
export async function addToChannelContext(
    filename: string,
    channel: TextChannel | ThreadChannel,
    messages: UserMessage[] = []
): Promise<void> {
    console.warn('[ChatHistory] addToChannelContext is deprecated. Use saveChannelContext instead.');
    await saveChannelContext(filename, channel, messages);
}

/**
 * DEPRECATED: Use saveChannelInfo instead
 * Kept for backwards compatibility
 */
export async function openChannelInfo(
    filename: string,
    channel: TextChannel | ThreadChannel,
    user: string,
    messages: UserMessage[] = []
): Promise<void> {
    console.warn('[ChatHistory] openChannelInfo is deprecated. Use saveChannelInfo instead.');
    await saveChannelInfo(filename, channel, user, messages);
}
