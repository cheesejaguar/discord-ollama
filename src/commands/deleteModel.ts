import { ApplicationCommandOptionType, ChatInputCommandInteraction, Client, CommandInteraction, MessageFlags } from 'discord.js';
import { UserCommand, SlashCommand } from '../utils/index.js';
import { ollama } from '../client.js';
import { ModelResponse } from 'ollama';
import { validateModelName, ValidationError } from '../utils/validation.js';
import { requireAdmin, validateChannel, checkOllamaConnection, modelExists, safeReply } from '../utils/commandHelpers.js';
import { logger } from '../utils/logger.js';
import { ErrorCode, getUserFriendlyError } from '../utils/errorMessages.js';

export const DeleteModel: SlashCommand = {
    name: 'delete-model',
    description: 'deletes a model from the local list of models. Administrator Only.',

    // set available user options to pass to the command
    options: [
        {
            name: 'model-name',
            description: 'the name of the model to delete',
            type: ApplicationCommandOptionType.String,
            required: true
        }
    ],

    // Delete Model locally stored
    run: async (client: Client, interaction: ChatInputCommandInteraction) => {
        try {
            // CRITICAL FIX: Admin check FIRST
            if (!await requireAdmin(interaction)) return;

            // Validate channel type with proper error reply
            const channel = await validateChannel(client, interaction.channelId, UserCommand);
            if (!channel) {
                await interaction.reply({
                    content: 'This command cannot be used in this type of channel.',
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            // CRITICAL FIX: Validate inputs BEFORE defer (in try-catch)
            let modelInput: string;
            try {
                modelInput = validateModelName(
                    interaction.options.getString('model-name')
                );
            } catch (error) {
                if (error instanceof ValidationError) {
                    await interaction.reply({
                        content: `**Validation Error:** ${error.message}`,
                        flags: MessageFlags.Ephemeral
                    });
                }
                return;
            }

            // NOW defer after validation passes
            await interaction.deferReply();

            // Check Ollama connection
            const connectionStatus = await checkOllamaConnection(ollama);
            if (!connectionStatus.connected) {
                await interaction.editReply({
                    content: getUserFriendlyError(connectionStatus.errorCode!)
                });
                return;
            }

            // Check if model exists
            const exists = await modelExists(ollama, modelInput);

            // Call ollama to delete model
            if (exists) {
                await ollama.delete({ model: modelInput });
                logger.info('Command:DeleteModel', `Model deleted successfully`, {
                    userId: interaction.user.id,
                    modelName: modelInput
                });
                await interaction.editReply({
                    content: `✅ **${modelInput}** was removed from the local library.`
                });
            } else {
                await interaction.editReply({
                    content: `❌ Could not delete **${modelInput}**.\n\nThe model doesn't exist in the local library or may be spelled incorrectly.\n\nPlease check the model name and try again.`
                });
            }

        } catch (error: unknown) {
            logger.error('Command:DeleteModel', 'Error deleting model', {
                error: error instanceof Error ? error.message : 'Unknown',
                userId: interaction.user.id
            });

            let errorMessage: string;
            if (error instanceof ValidationError) {
                errorMessage = `**Validation Error:** ${error.message}`;
            } else if (error instanceof Error) {
                if (error.message.includes('fetch failed') || error.message.includes('ECONNREFUSED')) {
                    errorMessage = getUserFriendlyError(ErrorCode.OLLAMA_OFFLINE);
                } else {
                    errorMessage = `**Error:** ${error.message}`;
                }
            } else {
                errorMessage = 'An unknown error occurred while deleting the model.';
            }

            // Use safeReply to handle deferred/non-deferred states
            await safeReply(
                interaction,
                `Unable to delete model.\n\n${errorMessage}`,
                true
            );
        }
    }
};