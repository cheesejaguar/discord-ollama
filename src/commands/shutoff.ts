import { Client, ChatInputCommandInteraction, MessageFlags } from 'discord.js'
import { AdminCommand, SlashCommand } from '../utils/index.js'
import { requireAdmin, validateChannel, safeReply } from '../utils/commandHelpers.js'
import { logger } from '../utils/logger.js'

export const Shutoff: SlashCommand = {
    name: 'shutoff',
    description: 'shutdown the bot. You will need to manually bring it online again. Administrator Only.',

    // Query for message information and set the style
    run: async (client: Client, interaction: ChatInputCommandInteraction) => {
        // CRITICAL FIX: Check admin permissions FIRST before any logging
        if (!await requireAdmin(interaction)) return;

        // Validate channel type with proper error message
        const channel = await validateChannel(client, interaction.channelId, AdminCommand);
        if (!channel) {
            await safeReply(interaction, 'This command cannot be used in this type of channel.', true);
            return;
        }

        // SECURITY: Log shutdown attempt AFTER permission verification
        logger.warn('Command:Shutoff', `Admin user attempting to shutdown bot`, {
            userId: interaction.user.id,
            username: interaction.user.tag,
            botName: client.user?.tag ?? 'Bot'
        });

        // Shutoff cleared, do it
        await interaction.reply({
            content: `${client.user?.tag} is shutting down.`,
            flags: MessageFlags.Ephemeral
        });

        logger.info('Command:Shutoff', 'Bot shutting down via admin command', {
            userId: interaction.user.id,
            username: interaction.user.tag
        });

        // clean up client instance and stop
        client.destroy();
    }
}