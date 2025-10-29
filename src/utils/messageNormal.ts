import { Message, SendableChannels } from 'discord.js';
import { ChatResponse, Ollama } from 'ollama';
import { ChatParams, UserMessage, streamResponse, blockResponse } from './index.js';
import { Queue } from '../queues/queue.js';
import { AbortableAsyncIterator } from 'ollama/src/utils.js';
import { ErrorCode, getUserFriendlyError } from './errorMessages.js';

// Configurable timeout in milliseconds (default 60 seconds)
const OLLAMA_TIMEOUT_MS = parseInt(process.env.OLLAMA_TIMEOUT_MS || '60000', 10);

/**
 * Wraps a promise with a timeout
 * @param promise The promise to wrap
 * @param timeoutMs Timeout in milliseconds
 * @returns The promise result or throws timeout error
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
            reject(new Error('TIMEOUT'));
        }, timeoutMs);
    });

    return Promise.race([promise, timeoutPromise]);
}

/**
 * Method to send replies as normal text on discord like any other user
 * @param message message sent by the user
 * @param model name of model to run query
 * @param msgHist message history between user and model
 */
export async function normalMessage(
    message: Message,
    ollama: Ollama,
    model: string,
    msgHist: Queue<UserMessage>,
    stream: boolean
): Promise<string> {
    // bot's respnse
    let response: ChatResponse | AbortableAsyncIterator<ChatResponse>
    let result: string = ''
    const channel = message.channel as SendableChannels

    await channel.send('Generating Response . . .').then(async sentMessage => {
        try {
            const params: ChatParams = {
                model: model,
                ollama: ollama,
                msgHist: msgHist.getItems()
            }

            // run query based on stream preference, true = stream, false = block
            if (stream) {
                let messageBlock: Message = sentMessage;
                // Wrap stream response with timeout
                response = await withTimeout(
                    streamResponse(params),
                    OLLAMA_TIMEOUT_MS
                ); // THIS WILL BE SLOW due to discord limits!
                for await (const portion of response) {
                    // check if over discord message limit
                    if (result.length + portion.message.content.length > 2000) {
                        result = portion.message.content

                        // new message block, wait for it to send and assign new block to respond.
                        await channel.send("Creating new stream block...")
                            .then(sentMessage => { messageBlock = sentMessage })
                    } else {
                        result += portion.message.content

                        // ensure block is not empty
                        if (result.length > 5)
                            await messageBlock.edit(result);
                    }
                    console.log(result)
                }
            }
            else {
                // Wrap block response with timeout
                response = await withTimeout(
                    blockResponse(params),
                    OLLAMA_TIMEOUT_MS
                );
                result = response.message.content;

                // check if there is a <think>...</think> sequence from the bot.
                if (hasThinking(result))
                    result = result.replace(/<think>[\s\S]*?<\/think>/g, '').trim()

                // check if message length > discord max for normal messages
                if (result.length > 2000) {
                    await sentMessage.edit(result.slice(0, 2000));
                    result = result.slice(2000);

                    // handle for rest of message that is >2000
                    while (result.length > 2000) {
                        await channel.send(result.slice(0, 2000));
                        result = result.slice(2000);
                    }

                    // last part of message
                    await channel.send(result);
                } else { // edit the 'generic' response to new message since <2000
                    await sentMessage.edit(result);
                }
            }
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.log(`[Util: messageNormal] Error creating message: ${errorMessage}`);

            let userMessage: string;
            if (error instanceof Error) {
                // Check for timeout error
                if (error.message === 'TIMEOUT') {
                    userMessage = getUserFriendlyError(
                        ErrorCode.TIMEOUT,
                        `Request exceeded ${OLLAMA_TIMEOUT_MS / 1000} seconds`
                    );
                } else if (error.message.includes('fetch failed') || error.message.includes('ECONNREFUSED')) {
                    userMessage = getUserFriendlyError(ErrorCode.OLLAMA_OFFLINE);
                } else if (error.message.includes('try pulling it first')) {
                    userMessage = getUserFriendlyError(
                        ErrorCode.NO_MODEL,
                        `Model "${model}" not found. Ask an admin to run /pull-model`
                    );
                } else {
                    userMessage = `**Error:** ${error.message}`;
                }
            } else {
                userMessage = getUserFriendlyError(ErrorCode.UNKNOWN);
            }

            await sentMessage.edit(userMessage);
        }
    })

    // return the string representation of ollama query response
    return result
}

function hasThinking(message: string): boolean {
    return /<think>[\s\S]*?<\/think>/i.test(message)
}
