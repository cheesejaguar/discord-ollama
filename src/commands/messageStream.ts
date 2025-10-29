import { ApplicationCommandOptionType, Client, ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import { openConfig, SlashCommand, UserCommand } from '../utils/index.js';
import { validateBoolean, validateUsername, ValidationError } from '../utils/validation.js';

export const MessageStream: SlashCommand = {
    name: 'message-stream',
    description: 'change preference on message streaming from ollama. WARNING: can be very slow due to Discord limits.',

    // user option(s) for setting stream
    options: [
        {
            name: 'stream',
            description: 'enable or disable message streaming',
            type: ApplicationCommandOptionType.Boolean,
            required: true
        }
    ],

    // change preferences based on command
    run: async (client: Client, interaction: ChatInputCommandInteraction) => {
        try {
            // Verify channel
            const channel = await client.channels.fetch(interaction.channelId);
            if (!channel || !UserCommand.includes(channel.type)) {
                await interaction.reply({
                    content: 'This command cannot be used in this type of channel.',
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            // Validate boolean input
            const streamInput = interaction.options.getBoolean('stream');
            const stream = validateBoolean(streamInput, 'stream');

            // Validate username for safe file operations
            const safeUsername = validateUsername(interaction.user.username);

            // Update configuration
            await openConfig(`${safeUsername}-config.json`, interaction.commandName, stream);

            await interaction.reply({
                content: `✅ Message streaming is now **${stream ? "enabled" : "disabled"}**.\n\n${stream ? "⚠️ *Note: Streaming can be slow due to Discord rate limits.*" : ""}`,
                flags: MessageFlags.Ephemeral
            });

        } catch (error) {
            if (error instanceof ValidationError) {
                await interaction.reply({
                    content: `**Validation Error:** ${error.message}`,
                    flags: MessageFlags.Ephemeral
                });
            } else {
                console.error('[Command: message-stream] Error:', error);
                await interaction.reply({
                    content: `Failed to update streaming preference: ${(error as Error).message}`,
                    flags: MessageFlags.Ephemeral
                });
            }
        }
    }
};