import { ApplicationCommandOptionType, Client, ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import { ollama } from '../client.js';
import { ModelResponse } from 'ollama';
import { UserCommand, SlashCommand } from '../utils/index.js';
import { validateModelName, ValidationError } from '../utils/validation.js';
import { requireAdmin, validateChannel, checkOllamaConnection, modelExists, safeReply } from '../utils/commandHelpers.js';
import { logger } from '../utils/logger.js';
import { ErrorCode, getUserFriendlyError } from '../utils/errorMessages.js';

export const PullModel: SlashCommand = {
    name: 'pull-model',
    description: 'pulls a model from the ollama model library. Administrator Only.',

    // set available user options to pass to the command
    options: [
        {
            name: 'model-to-pull',
            description: 'the name of the model to pull',
            type: ApplicationCommandOptionType.String,
            required: true
        }
    ],

    // Pull for model from Ollama library
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
                    interaction.options.getString('model-to-pull')
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

            // Check if model was already pulled
            const exists = await modelExists(ollama, modelInput);

            // Call ollama to pull desired model
            if (!exists) {
                await interaction.editReply({
                    content: `**${modelInput}** could not be found locally. Please wait patiently as I try to retrieve it from the Ollama library...`
                });

                try {
                    await ollama.pull({ model: modelInput });
                    logger.info('Command:PullModel', `Model pulled successfully`, {
                        userId: interaction.user.id,
                        modelName: modelInput
                    });
                    await interaction.editReply({
                        content: `✅ Successfully added **${modelInput}**.`
                    });
                } catch (pullError: unknown) {
                    // Could not resolve pull or model unfound
                    const errorMsg = pullError instanceof Error ? pullError.message : 'Unknown error';
                    logger.error('Command:PullModel', 'Pull failed', {
                        error: errorMsg,
                        userId: interaction.user.id,
                        modelName: modelInput
                    });

                    await interaction.editReply({
                        content: `❌ Could not retrieve the **${modelInput}** model.\n\nYou can find models at [Ollama Model Library](https://ollama.com/library).\n\nPlease check the model library and try again.`
                    });
                }
            } else {
                // Model already exists
                await interaction.editReply({
                    content: `✅ **${modelInput}** is already available in the local library.`
                });
            }

        } catch (error: unknown) {
            logger.error('Command:PullModel', 'Error pulling model', {
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
                errorMessage = 'An unknown error occurred while pulling the model.';
            }

            // Use safeReply to handle deferred/non-deferred states
            await safeReply(
                interaction,
                `Unable to pull model.\n\n${errorMessage}`,
                true
            );
        }
    }
};