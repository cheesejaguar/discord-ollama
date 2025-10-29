import { Client, GatewayIntentBits } from 'discord.js';
import { Ollama } from 'ollama';
import { Queue } from './queues/queue.js';
import { UserMessage, registerEvents } from './utils/index.js';
import { ensureDataDirectory } from './utils/pathSafety.js';
import { RateLimiter } from './utils/rateLimiter.js';
import { logger } from './utils/logger.js';
import { validateConfig, printConfigSummary } from './utils/configValidation.js';
import Events from './events/index.js';
import Keys from './keys.js';

// Validate configuration on startup
console.log('[Startup] Validating configuration...');
const config = validateConfig();
printConfigSummary(config);

// Ensure data directory exists before any file operations
await ensureDataDirectory();

// initialize the client with the following permissions when logging in
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// initialize connection to ollama container
export const ollama = new Ollama({
    host: `http://${Keys.ipAddress}:${Keys.portAddress}`,
    ...(Keys.ollamaApiKey && {
        headers: {
            'Authorization': `Bearer ${Keys.ollamaApiKey}`
        }
    })
});

// Create Queue managed by Events
const messageHistory: Queue<UserMessage> = new Queue<UserMessage>();

// Create Channel History Queue managed by Events
const channelMessageHistory: Queue<UserMessage> = new Queue<UserMessage>();

// Create rate limiter using validated configuration
const rateLimiter = new RateLimiter(config.rateLimitSeconds);
console.log(`[Rate Limiter] Initialized with ${config.rateLimitSeconds} second cooldown`);

// register all events
registerEvents(client, Events, messageHistory, channelMessageHistory, ollama, Keys.defaultModel, rateLimiter);

// Try to log in the client
await client.login(Keys.clientToken)
    .catch((error) => {
        console.error('[Login Error]', error);
        process.exit(1);
    });

// queue up bots name
messageHistory.enqueue({
    role: 'assistant',
    content: `My name is ${client.user?.username}`,
    images: []
});

// Graceful shutdown handling
let isShuttingDown = false;

async function gracefulShutdown(signal: string): Promise<void> {
    if (isShuttingDown) return;
    isShuttingDown = true;

    console.log(`\n[Shutdown] Received ${signal}, shutting down gracefully...`);

    try {
        // Stop accepting new events
        console.log('[Shutdown] Stopping event listeners...');
        client.removeAllListeners('messageCreate');
        client.removeAllListeners('interactionCreate');

        // Cleanup rate limiter
        console.log('[Shutdown] Cleaning up rate limiter...');
        rateLimiter.destroy();

        // Flush and cleanup logger
        console.log('[Shutdown] Flushing logs...');
        await logger.destroy();

        // Wait briefly for in-flight operations (with timeout)
        console.log('[Shutdown] Waiting for in-flight operations...');
        await Promise.race([
            new Promise(resolve => setTimeout(resolve, 5000)), // 5 second max wait
            Promise.resolve() // Immediate if no operations
        ]);

        // Destroy Discord client connection
        console.log('[Shutdown] Destroying Discord client...');
        client.destroy();

        console.log('[Shutdown] Shutdown complete');
        process.exit(0);
    } catch (error) {
        console.error('[Shutdown] Error during shutdown:', error);
        process.exit(1);
    }
}

// Register signal handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
    console.error('[Fatal] Uncaught exception:', error);
    gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason) => {
    console.error('[Fatal] Unhandled rejection:', reason);
    gracefulShutdown('unhandledRejection');
});

console.log('[Startup] Graceful shutdown handlers registered');