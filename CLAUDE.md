# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Discord-Ollama is a Discord bot that integrates locally-run Ollama AI models into Discord servers. The bot supports:
- Per-user model preferences and conversation history
- Per-server chat toggles and configuration
- Per-channel conversation context for all users
- Message streaming and blocking modes
- Image attachments and text file processing
- Multi-user concurrent chat handling

## Core Architecture

### State Management (File-Based Persistence)

The bot uses a file-based persistence system stored in the `data/` directory:

1. **User Configurations** (`{username}-config.json`):
   - Model preference (`switch-model`)
   - Message capacity (`modify-capacity`)
   - Streaming preference (`message-stream`)

2. **Server Configurations** (`{guildId}-config.json`):
   - Chat enabled/disabled (`toggle-chat`)

3. **Per-User Channel History** (`{channelId}-{username}.json`):
   - Individual user's conversation history in each channel/thread
   - Used for generating personalized responses

4. **Channel Context** (`{channelId}-context.json`):
   - Recent messages from ALL users in a channel
   - Provides broader context awareness for the bot

All configuration/history files are managed through handlers in `src/utils/handlers/`:
- `configHandler.ts` - User and server configs
- `chatHistoryHandler.ts` - Channel-specific chat histories

### Message Flow

1. **Message Received** (`src/events/messageCreate.ts`):
   - Saves all messages to channel context (for awareness)
   - Bot only responds when mentioned
   - Retrieves server config (chat enabled?)
   - Retrieves user config (model, capacity, streaming)
   - Loads user's channel-specific history
   - Manages queue capacity (removes old messages when full)

2. **Ollama Query** (`src/utils/messageNormal.ts`):
   - Sends "Generating Response..." placeholder
   - Calls stream or block handler based on user preference
   - Handles Discord's 2000-char limit by splitting messages
   - Filters `<think>...</think>` tags from responses

3. **Response Handlers** (`src/utils/handlers/streamHandler.ts`):
   - `streamResponse()`: Real-time streaming (slow due to Discord rate limits)
   - `blockResponse()`: Wait for full response then send
   - Both use Ollama client with configured parameters (mirostat, top_k)

### Queue System

`src/queues/queue.ts` implements a fixed-capacity FIFO queue for message history:
- Default capacity: 5 messages
- Auto-dequeues oldest when full
- Used for both user history and channel context
- Manages conversation context window for Ollama

### Command System

Slash commands are defined in `src/commands/` and registered via `src/utils/commands.ts`:
- Each command exports a `SlashCommand` object
- Commands are dynamically registered on bot startup
- Commands validate channel types (AdminCommand vs UserCommand)

**Admin Commands** (Guild Text Channels only):
- `/pull-model` - Download models from Ollama library
- `/delete-model` - Remove models
- `/disable` - Toggle server chat on/off

**User Commands** (Any channel/thread):
- `/switch-model` - Change preferred model
- `/capacity` - Adjust message history size
- `/message-stream` - Toggle streaming mode
- `/clean-user-channel-history` - Clear personal history
- `/thread-create` / `/thread-private-create` - Create threads

## Development Commands

### Build and Run

```bash
# Install dependencies
npm install

# Build TypeScript to JavaScript
npm run build

# Run in production (after build)
npm run prod

# Or combined: build + run
npm run client

# Development with hot-reload
npm run watch
```

### Testing

```bash
# Run all tests
npm run tests

# Run tests with coverage
npm run coverage
```

### Docker

```bash
# Start services with docker-compose (recommended)
npm run start

# Clean up containers and images
npm run clean

# Manual docker setup (GPU)
npm run docker:network
npm run docker:build
npm run docker:ollama
npm run docker:client

# Manual setup (CPU only)
npm run docker:start-cpu
```

## Environment Variables

Required environment variables (see `.env.sample`):
- `CLIENT_TOKEN` - Discord bot token
- `MODEL` - Default model for new users (e.g., `llama3.2`)
- `OLLAMA_IP` - Ollama service IP (default: `127.0.0.1` local, `172.18.0.2` docker)
- `OLLAMA_PORT` - Ollama port (default: `11434`)
- `DISCORD_IP` - Discord bot container IP (docker only, e.g., `172.18.0.3`)
- `SUBNET_ADDRESS` - Docker subnet (e.g., `172.18.0.0`)

## Key Technical Details

### Entry Point
- `src/index.ts` imports `src/client.ts`
- `src/client.ts` initializes Discord client, Ollama connection, queues, and events

### Event System
- Events in `src/events/` are registered via `src/utils/events.ts`
- `registerEvents()` passes shared state (queues, ollama, client) to all events

### Type System
- Uses ES Modules (`"type": "module"` in package.json)
- All imports must use `.js` extension (even for `.ts` files)
- TypeScript config targets ES2020 with NodeNext module resolution

### Message Normalization
- `src/utils/mentionClean.ts` - Removes Discord mention syntax
- `src/utils/messageNormal.ts` - Handles response generation and Discord limits
- Filters `<think>...</think>` tags from model responses

### Ollama Configuration
Ollama client settings (in `streamHandler.ts`):
```typescript
{
  mirostat: 1,
  mirostat_tau: 2.0,
  top_k: 70
}
```

## Docker Architecture

The application runs as two containers:
1. **discord** - Bot application (Node.js)
2. **ollama** - Ollama service (with optional GPU support)

Connected via bridge network (`ollama-net`) with static IPs.
