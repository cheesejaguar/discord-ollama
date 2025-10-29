import { Client, ChatInputCommandInteraction, ApplicationCommandOptionType, MessageFlags } from 'discord.js';
import { openConfig, SlashCommand, UserCommand } from '../utils/index.js';
import { validateCapacity, validateUsername, ValidationError } from '../utils/validation.js';

export const Capacity: SlashCommand = {
    name: 'modify-capacity',
    description: 'maximum amount messages bot will hold for context.',

    // set available user options to pass to the command
    options: [
        {
            name: 'context-capacity',
            description: 'number of allowed messages to remember',
            type: ApplicationCommandOptionType.Number,
            required: true
        }
    ],

    // Query for message information and set the style
    run: async (client: Client, interaction: ChatInputCommandInteraction) => {
        try {
            // Fetch channel and validate
            const channel = await client.channels.fetch(interaction.channelId);
            if (!channel || !UserCommand.includes(channel.type)) {
                await interaction.reply({
                    content: 'This command cannot be used in this type of channel.',
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            // Validate capacity input
            const capacityInput = interaction.options.getNumber('context-capacity');
            const capacity = validateCapacity(capacityInput);

            // Validate username for safe file operations
            const safeUsername = validateUsername(interaction.user.username);

            // Update configuration
            await openConfig(`${safeUsername}-config.json`, interaction.commandName, capacity);

            await interaction.reply({
                content: `✅ Max message history is now set to **${capacity}** messages.`,
                flags: MessageFlags.Ephemeral
            });

        } catch (error) {
            if (error instanceof ValidationError) {
                await interaction.reply({
                    content: `**Validation Error:** ${error.message}`,
                    flags: MessageFlags.Ephemeral
                });
            } else {
                console.error('[Command: modify-capacity] Error:', error);
                await interaction.reply({
                    content: `Failed to update capacity: ${(error as Error).message}`,
                    flags: MessageFlags.Ephemeral
                });
            }
        }
    }
};