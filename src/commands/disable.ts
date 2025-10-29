import { Client, ChatInputCommandInteraction, ApplicationCommandOptionType, MessageFlags } from 'discord.js';
import { AdminCommand, openConfig, SlashCommand } from '../utils/index.js';
import { validateBoolean, validateGuildId, ValidationError } from '../utils/validation.js';
import { requireAdmin, validateChannel, safeReply } from '../utils/commandHelpers.js';
import { logger } from '../utils/logger.js';

export const Disable: SlashCommand = {
    name: 'toggle-chat',
    description: 'toggle all chat features. Administrator Only.',

    // set available user options to pass to the command
    options: [
        {
            name: 'enabled',
            description: 'true = enabled, false = disabled',
            type: ApplicationCommandOptionType.Boolean,
            required: true
        }
    ],

    // Query for message information and set the style
    run: async (client: Client, interaction: ChatInputCommandInteraction) => {
        try {
            // Check admin permissions FIRST (before any other operations)
            if (!await requireAdmin(interaction)) return;

            // Validate channel type
            const channel = await validateChannel(client, interaction.channelId, AdminCommand);
            if (!channel) {
                await safeReply(interaction, 'This command cannot be used in this type of channel.', true);
                return;
            }

            // Validate guild ID
            if (!interaction.guildId) {
                await safeReply(interaction, 'This command can only be used in a server.', true);
                return;
            }
            const safeGuildId = validateGuildId(interaction.guildId);

            // Validate boolean input
            const enabledInput = interaction.options.getBoolean('enabled');
            const enabled = validateBoolean(enabledInput, 'enabled');

            // Update configuration
            await openConfig(`${safeGuildId}-config.json`, interaction.commandName, enabled);

            // Get bot name safely
            const botName = client.user?.username ?? 'Bot';

            logger.info('Command:ToggleChat', `Chat features toggled`, {
                userId: interaction.user.id,
                guildId: safeGuildId,
                enabled
            });

            await interaction.reply({
                content: `✅ **${botName}** chat features are now **${enabled ? "enabled" : "disabled"}**.`,
                flags: MessageFlags.Ephemeral
            });

        } catch (error) {
            logger.error('Command:ToggleChat', 'Error toggling chat', {
                error: error instanceof Error ? error.message : 'Unknown',
                userId: interaction.user.id
            });

            if (error instanceof ValidationError) {
                await safeReply(interaction, `**Validation Error:** ${error.message}`, true);
            } else {
                await safeReply(interaction, `Failed to toggle chat: ${(error as Error).message}`, true);
            }
        }
    }
};