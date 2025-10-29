/**
 * Command Helper Utilities
 *
 * Common patterns extracted from commands to reduce duplication
 * and improve maintainability.
 */

import { ChatInputCommandInteraction, MessageFlags, Client, Channel, ChannelType } from 'discord.js';
import { Ollama } from 'ollama';
import { ErrorCode, getUserFriendlyError } from './errorMessages.js';
import { logger } from './logger.js';

/**
 * Checks if the user has administrator permissions
 *
 * @param interaction - The command interaction
 * @returns true if user is admin, false otherwise (and sends error message)
 *
 * @example
 * ```typescript
 * if (!await requireAdmin(interaction)) return;
 * // User is admin, proceed with command
 * ```
 */
export async function requireAdmin(interaction: ChatInputCommandInteraction): Promise<boolean> {
    // LOW SEVERITY FIX: Explicit null check for DM context
    if (!interaction.memberPermissions) {
        await interaction.reply({
            content: '❌ **Server Only Command**\n\nThis command can only be used in a server, not in direct messages.',
            flags: MessageFlags.Ephemeral
        });

        logger.warn('CommandHelpers', `Admin command attempted in DM context`, {
            userId: interaction.user.id,
            username: interaction.user.tag,
            command: interaction.commandName
        });

        return false;
    }

    if (!interaction.memberPermissions.has('Administrator')) {
        await interaction.reply({
            content: getUserFriendlyError(ErrorCode.PERMISSION_DENIED),
            flags: MessageFlags.Ephemeral
        });

        logger.warn('CommandHelpers', `Non-admin user attempted admin command: ${interaction.commandName}`, {
            userId: interaction.user.id,
            username: interaction.user.tag,
            command: interaction.commandName
        });

        return false;
    }

    return true;
}

/**
 * Validates that a channel is of an allowed type
 *
 * @param client - Discord client
 * @param channelId - Channel ID to validate
 * @param allowedTypes - Array of allowed channel types
 * @returns Channel if valid, null otherwise
 *
 * @example
 * ```typescript
 * const channel = await validateChannel(client, interaction.channelId, [ChannelType.GuildText]);
 * if (!channel) {
 *     await interaction.reply('Cannot use in this channel type');
 *     return;
 * }
 * ```
 */
export async function validateChannel(
    client: Client,
    channelId: string,
    allowedTypes: ChannelType[]
): Promise<Channel | null> {
    try {
        const channel = await client.channels.fetch(channelId);

        if (!channel || !allowedTypes.includes(channel.type)) {
            return null;
        }

        return channel;
    } catch (error) {
        logger.error('CommandHelpers', 'Failed to fetch channel', {
            channelId,
            error: error instanceof Error ? error.message : 'Unknown'
        });
        return null;
    }
}

/**
 * Connection status for Ollama service
 */
export interface OllamaConnectionStatus {
    connected: boolean;
    error?: string;
    errorCode?: ErrorCode;
}

/**
 * Checks if Ollama service is available
 *
 * @param ollama - Ollama client instance
 * @returns Connection status with error details if unavailable
 *
 * @example
 * ```typescript
 * const status = await checkOllamaConnection(ollama);
 * if (!status.connected) {
 *     await interaction.editReply({
 *         content: getUserFriendlyError(status.errorCode!)
 *     });
 *     return;
 * }
 * ```
 */
export async function checkOllamaConnection(ollama: Ollama): Promise<OllamaConnectionStatus> {
    try {
        await ollama.list();
        return { connected: true };
    } catch (error: unknown) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';

        logger.warn('CommandHelpers', 'Ollama connection check failed', {
            error: errorMsg
        });

        // Determine error type
        let errorCode: ErrorCode;
        if (errorMsg.includes('ECONNREFUSED') || errorMsg.includes('fetch failed')) {
            errorCode = ErrorCode.OLLAMA_OFFLINE;
        } else if (errorMsg.includes('timeout')) {
            errorCode = ErrorCode.TIMEOUT;
        } else {
            errorCode = ErrorCode.NETWORK_ERROR;
        }

        return {
            connected: false,
            error: errorMsg,
            errorCode
        };
    }
}

/**
 * Checks if a model exists in the Ollama library
 *
 * IMPORTANT: This function does NOT catch connection errors.
 * Call checkOllamaConnection() first to ensure Ollama is online.
 *
 * @param ollama - Ollama client instance
 * @param modelName - Name of the model to check
 * @returns true if model exists, false otherwise
 * @throws Error if Ollama connection fails
 *
 * @example
 * ```typescript
 * // Check connection first
 * const status = await checkOllamaConnection(ollama);
 * if (!status.connected) {
 *     // Handle connection error
 *     return;
 * }
 *
 * // Now safe to check model existence
 * const exists = await modelExists(ollama, 'llama3.2');
 * if (!exists) {
 *     await interaction.reply('Model not found');
 *     return;
 * }
 * ```
 */
export async function modelExists(ollama: Ollama, modelName: string): Promise<boolean> {
    // HIGH SEVERITY FIX: Don't swallow errors - let them propagate
    // Callers should use checkOllamaConnection() first
    const response = await ollama.list();
    return response.models.some(model => model.name.startsWith(modelName));
}

/**
 * Safe interaction reply that handles errors gracefully
 *
 * @param interaction - The interaction to reply to
 * @param content - Message content
 * @param ephemeral - Whether message should be ephemeral (default: true)
 */
export async function safeReply(
    interaction: ChatInputCommandInteraction,
    content: string,
    ephemeral: boolean = true
): Promise<void> {
    try {
        if (interaction.deferred) {
            await interaction.editReply({ content });
        } else if (interaction.replied) {
            await interaction.followUp({
                content,
                flags: ephemeral ? MessageFlags.Ephemeral : undefined
            });
        } else {
            await interaction.reply({
                content,
                flags: ephemeral ? MessageFlags.Ephemeral : undefined
            });
        }
    } catch (error) {
        logger.error('CommandHelpers', 'Failed to send reply', {
            error: error instanceof Error ? error.message : 'Unknown',
            command: interaction.commandName
        });
    }
}
