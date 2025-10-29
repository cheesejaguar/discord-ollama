import { ApplicationCommandOptionType, Client, ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import { ollama } from '../client.js';
import { openConfig, UserCommand, SlashCommand } from '../utils/index.js';
import { validateModelName, validateUsername, ValidationError } from '../utils/validation.js';
import { validateChannel, checkOllamaConnection, modelExists, safeReply } from '../utils/commandHelpers.js';
import { logger } from '../utils/logger.js';
import { ErrorCode, getUserFriendlyError } from '../utils/errorMessages.js';

export const SwitchModel: SlashCommand = {
    name: 'switch-model',
    description: 'switches current model to use.',

    // set available user options to pass to the command
    options: [
        {
            name: 'model-to-use',
            description: 'the name of the model to use',
            type: ApplicationCommandOptionType.String,
            required: true
        }
    ],

    // Switch user preferred model if available in local library
    run: async (client: Client, interaction: ChatInputCommandInteraction) => {
        try {
            // STANDARDIZATION FIX: Follow same pattern as other commands
            // Validate channel type with proper error reply
            const channel = await validateChannel(client, interaction.channelId, UserCommand);
            if (!channel) {
                await interaction.reply({
                    content: 'This command cannot be used in this type of channel.',
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            // Validate inputs BEFORE defer (in try-catch)
            let modelInput: string;
            let safeUsername: string;
            try {
                modelInput = validateModelName(
                    interaction.options.getString('model-to-use')
                );
                safeUsername = validateUsername(interaction.user.username);
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

            // Check if model exists in Ollama library
            const exists = await modelExists(ollama, modelInput);

            if (exists) {
                // Update configuration with validated inputs
                await openConfig(
                    `${safeUsername}-config.json`,
                    interaction.commandName,
                    modelInput
                );

                logger.info('Command:SwitchModel', `Model switched successfully`, {
                    userId: interaction.user.id,
                    username: safeUsername,
                    modelName: modelInput
                });

                await interaction.editReply({
                    content: `✅ Successfully switched to **${modelInput}** as the preferred model for ${interaction.user.username}.`
                });
            } else {
                // Model not found in library
                await interaction.editReply({
                    content: `❌ Could not find **${modelInput}** in local model library.\n\n` +
                             `Please contact a server admin to pull this model using \`/pull-model ${modelInput}\`.`
                });
            }

        } catch (error: unknown) {
            logger.error('Command:SwitchModel', 'Error switching model', {
                error: error instanceof Error ? error.message : 'Unknown',
                userId: interaction.user.id
            });

            let errorMessage: string;
            if (error instanceof ValidationError) {
                errorMessage = `**Validation Error:** ${error.message}`;
            } else if (error instanceof Error) {
                // Check for specific error types
                if (error.message.includes('fetch failed') || error.message.includes('ECONNREFUSED')) {
                    errorMessage = getUserFriendlyError(ErrorCode.OLLAMA_OFFLINE);
                } else {
                    errorMessage = `**Error:** ${error.message}`;
                }
            } else {
                errorMessage = 'An unknown error occurred while switching models.';
            }

            // Use safeReply to handle deferred/non-deferred states
            await safeReply(
                interaction,
                `Unable to switch model.\n\n${errorMessage}`,
                true
            );
        }
    }
};