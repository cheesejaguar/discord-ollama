import { TextChannel } from 'discord.js';
import { event, Events, normalMessage, UserMessage, clean } from '../utils/index.js';
import {
    getChannelInfo, getServerConfig, getUserConfig,
    openConfig, UserConfig, getAttachmentData, getTextFileAttachmentData,
    saveChannelContext, saveChannelInfo
} from '../utils/index.js';
import { validateCapacity, validateUsername, validateMessageContent, detectPromptInjection, ValidationError } from '../utils/validation.js';
import { ErrorCode, getUserFriendlyError } from '../utils/errorMessages.js';
import { logger } from '../utils/logger.js';

/**
 * Max Message length for free users is 2000 characters (bot or not).
 * Bot supports infinite lengths for normal messages.
 *
 * @param message the message received from the channel
 */
export default event(Events.MessageCreate, async ({ log, msgHist, channelHistory, ollama, client, defaultModel, rateLimiter }, message) => {
    // Safe null check for client user
    if (!client.user) {
        log('[Error] Client user not available');
        return;
    }
    const clientId = client.user.id;

    let cleanedMessage = clean(message.content, clientId);
    log(`Message "${cleanedMessage}" from ${message.author.tag} in channel/thread ${message.channelId}.`);

    // Do not respond if bot talks in the chat
    if (message.author.username === message.client.user.username) return;

    // Save User Chat even if not for the bot (Channel Context)
    try {
        let channelInfo = await getChannelInfo(`${message.channelId}-context.json`);

        if (!channelInfo) {
            log(`Channel/Thread ${message.channelId}-context does not exist. Creating...`);
            await saveChannelContext(message.channelId, message.channel as TextChannel, []);
            channelInfo = await getChannelInfo(`${message.channelId}-context.json`);
        }

        const channelContextHistory: UserMessage[] = channelInfo?.messages ?? [];

        // Set Channel History Queue
        channelHistory.setQueue(channelContextHistory);

        // Get message attachment if exists
        const attachment = message.attachments.first();
        let messageAttachment: string[] = [];

        if (attachment && attachment.name?.endsWith('.txt')) {
            cleanedMessage += ' ' + await getTextFileAttachmentData(attachment);
        } else if (attachment) {
            messageAttachment = await getAttachmentData(attachment);
        }

        // Auto-dequeue handled by queue now, but keep for backward compatibility
        while (channelHistory.size() >= channelHistory.capacity) {
            channelHistory.dequeue();
        }

        // Push user response to channel history
        channelHistory.enqueue({
            role: 'user',
            content: cleanedMessage,
            images: messageAttachment || []
        });

        // Store in Channel Context
        await saveChannelContext(
            message.channelId,
            message.channel as TextChannel,
            channelHistory.getItems()
        );

    } catch (error) {
        log('[Error] Failed to manage channel context:', error);
        // Continue execution - this is not critical for bot mention response
    }

    // Only respond if message mentions the bot
    if (!message.mentions.has(clientId)) return;

    // Check rate limit
    if (rateLimiter.isRateLimited(message.author.id)) {
        const remaining = rateLimiter.getRemainingTime(message.author.id);
        logger.warn('MessageCreate', `Rate limit hit for user ${message.author.tag}`, {
            userId: message.author.id,
            remaining
        });

        await message.reply({
            content: getUserFriendlyError(ErrorCode.RATE_LIMITED, `Please wait ${remaining} seconds`)
        }).catch(() => {
            // Ignore reply errors (user might have DMs disabled)
            log('[Warning] Failed to send rate limit message');
        });
        return;
    }

    // Validate message content
    try {
        const validatedContent = validateMessageContent(cleanedMessage);
        cleanedMessage = validatedContent;

        // Detect potential prompt injection
        if (detectPromptInjection(cleanedMessage)) {
            logger.security('MessageCreate', 'Potential prompt injection detected', {
                userId: message.author.id,
                username: message.author.tag,
                messagePreview: cleanedMessage.slice(0, 100)
            });
            // Log but don't block - could be false positive
            log('[Security] Prompt injection pattern detected in message');
        }
    } catch (error: unknown) {
        if (error instanceof ValidationError) {
            logger.warn('MessageCreate', `Message validation failed: ${error.message}`, {
                userId: message.author.id
            });

            await message.reply({
                content: getUserFriendlyError(ErrorCode.INVALID_INPUT, error.message)
            }).catch(() => {
                log('[Warning] Failed to send validation error message');
            });
            return;
        }
        // Re-throw if not a validation error
        throw error;
    }

    // Default stream to false
    let shouldStream = false;

    try {
        // Retrieve Server/Guild Preferences
        const safeGuildId = message.guildId;
        if (!safeGuildId) {
            await message.reply('This bot can only be used in servers, not in DMs.');
            return;
        }

        let serverConfig = await getServerConfig(`${safeGuildId}-config.json`);

        if (!serverConfig) {
            // Create default server config
            log(`Creating default server config for guild ${safeGuildId}`);
            await openConfig(`${safeGuildId}-config.json`, 'toggle-chat', true);
            serverConfig = await getServerConfig(`${safeGuildId}-config.json`);

            if (!serverConfig) {
                throw new Error('Failed to create server preferences. Please try again.');
            }
        }

        // Check if chat is disabled
        if (!serverConfig.options['toggle-chat']) {
            await message.reply('**Chat Disabled**\n\nAdmin(s) have disabled chat features.\n\nPlease contact your server\'s admin(s).');
            return;
        }

        // Retrieve User Preferences
        const safeUsername = validateUsername(message.author.username);
        let userConfig = await getUserConfig(`${safeUsername}-config.json`);

        if (!userConfig) {
            // Create default user config
            log(`Creating default user config for ${message.author.username}`);
            await openConfig(`${safeUsername}-config.json`, 'switch-model', String(defaultModel));
            userConfig = await getUserConfig(`${safeUsername}-config.json`);

            if (!userConfig) {
                throw new Error(`Failed to create user preferences for ${message.author.username}. Please try again.`);
            }
        }

        // Validate and set capacity
        if (typeof userConfig.options['modify-capacity'] === 'number') {
            try {
                const capacity = validateCapacity(userConfig.options['modify-capacity']);
                if (capacity !== msgHist.capacity) {
                    log(`Setting Context Capacity to ${capacity} for ${message.author.username}`);
                    msgHist.capacity = capacity;
                }
            } catch (error) {
                log(`Invalid capacity in config, using default ${msgHist.capacity}`);
            }
        }

        // Set stream state
        shouldStream = (userConfig.options['message-stream'] as boolean) || false;

        // Validate model is set
        if (typeof userConfig.options['switch-model'] !== 'string') {
            await message.reply(
                '**No Model Set**\n\n' +
                'Please set a model by running `/switch-model <model-name>`.\n\n' +
                'If you don\'t have any models, ask an admin to run `/pull-model <model-name>`.'
            );
            return;
        }

        const model: string = userConfig.options['switch-model'];

        // Get user's chat history for this channel
        let channelInfo = await getChannelInfo(`${message.channelId}-${safeUsername}.json`);

        if (!channelInfo) {
            log(`Creating chat history for ${message.author.username} in channel ${message.channelId}`);
            await saveChannelInfo(
                message.channelId,
                message.channel as TextChannel,
                message.author.tag,
                []
            );
            channelInfo = await getChannelInfo(`${message.channelId}-${safeUsername}.json`);

            if (!channelInfo) {
                throw new Error(`Failed to create chat history for ${message.author.username}. Try again.`);
            }
        }

        const chatMessages: UserMessage[] = channelInfo.messages;

        // Set up message queue
        msgHist.setQueue(chatMessages);

        // Auto-dequeue if at capacity (queue handles this now, but keep for safety)
        while (msgHist.size() >= msgHist.capacity) {
            msgHist.dequeue();
        }

        // Get attachment for the query
        const attachment = message.attachments.first();
        let messageAttachment: string[] = [];

        if (attachment && attachment.name?.endsWith('.txt')) {
            cleanedMessage += ' ' + await getTextFileAttachmentData(attachment);
        } else if (attachment) {
            messageAttachment = await getAttachmentData(attachment);
        }

        // Push user message before ollama query
        msgHist.enqueue({
            role: 'user',
            content: cleanedMessage,
            images: messageAttachment || []
        });

        // Query Ollama for response
        const response: string = await normalMessage(message, ollama, model, msgHist, shouldStream);

        // If something bad happened, remove user query and stop
        if (response === undefined || response === null || response.length === 0) {
            msgHist.removeLast(); // Remove the message we just added
            log('[Warning] Empty response from Ollama');
            return;
        }

        // Auto-dequeue if at capacity before adding response
        while (msgHist.size() >= msgHist.capacity) {
            msgHist.dequeue();
        }

        // Successful query, add assistant response to history
        msgHist.enqueue({
            role: 'assistant',
            content: response,
            images: []
        });

        // Save updated history to file
        await saveChannelInfo(
            message.channelId,
            message.channel as TextChannel,
            message.author.tag,
            msgHist.getItems()
        );

    } catch (error: unknown) {
        // Remove the user message we added on error
        msgHist.removeLast();

        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
        log('[Error] Message processing failed:', errorMessage);

        await message.reply(
            `**Error Occurred:**\n\n**Reason:** *${errorMessage}*`
        ).catch(replyError => {
            log('[Error] Failed to send error reply:', replyError);
        });
    }
});
