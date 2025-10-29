/**
 * Error codes for different types of failures
 */
export enum ErrorCode {
    // User errors (4xx equivalent)
    RATE_LIMITED = 'RATE_LIMITED',
    INVALID_INPUT = 'INVALID_INPUT',
    NO_MODEL = 'NO_MODEL',
    MESSAGE_TOO_LONG = 'MESSAGE_TOO_LONG',
    PERMISSION_DENIED = 'PERMISSION_DENIED',
    CHANNEL_DISABLED = 'CHANNEL_DISABLED',

    // System errors (5xx equivalent)
    OLLAMA_OFFLINE = 'OLLAMA_OFFLINE',
    FILE_ERROR = 'FILE_ERROR',
    TIMEOUT = 'TIMEOUT',
    NETWORK_ERROR = 'NETWORK_ERROR',
    INTERNAL_ERROR = 'INTERNAL_ERROR',
    UNKNOWN = 'UNKNOWN'
}

/**
 * Get a user-friendly error message with helpful guidance
 *
 * @param code - The error code
 * @param details - Optional additional details
 * @returns Formatted error message suitable for Discord users
 */
export function getUserFriendlyError(code: ErrorCode, details?: string): string {
    const messages: Record<ErrorCode, string> = {
        [ErrorCode.RATE_LIMITED]:
            '⏳ **Slow Down!**\n\n' +
            'You\'re sending messages too quickly. Please wait a moment before trying again.\n\n' +
            '*This helps prevent spam and ensures the bot stays responsive for everyone.*',

        [ErrorCode.INVALID_INPUT]:
            '❌ **Invalid Input**\n\n' +
            'Your message contains invalid characters or formatting.\n\n' +
            'Please check your input and try again.',

        [ErrorCode.NO_MODEL]:
            '🤖 **No Model Selected**\n\n' +
            'You haven\'t selected an AI model yet.\n\n' +
            '**What to do:**\n' +
            '• Use `/switch-model` to choose from available models\n' +
            '• Ask an admin to run `/pull-model` to download new models',

        [ErrorCode.MESSAGE_TOO_LONG]:
            '📏 **Message Too Long**\n\n' +
            'Your message exceeds the maximum length allowed.\n\n' +
            '**Limits:**\n' +
            '• Maximum: 10,000 characters\n' +
            '• Your message should be concise and focused',

        [ErrorCode.PERMISSION_DENIED]:
            '🔒 **Permission Denied**\n\n' +
            'You don\'t have permission to use this command.\n\n' +
            'Some commands require **Administrator** permissions. Contact a server admin if you believe this is an error.',

        [ErrorCode.CHANNEL_DISABLED]:
            '⛔ **Chat Disabled**\n\n' +
            'Chat features have been disabled in this server.\n\n' +
            'Please contact a server administrator to enable chat using `/toggle-chat`.',

        [ErrorCode.OLLAMA_OFFLINE]:
            '🔌 **AI Service Unavailable**\n\n' +
            'The AI service is currently offline or unreachable.\n\n' +
            '**Possible causes:**\n' +
            '• Ollama is not running\n' +
            '• Network connectivity issues\n' +
            '• Service is temporarily down\n\n' +
            '**For administrators:**\n' +
            'Download and start Ollama: https://ollama.com/',

        [ErrorCode.FILE_ERROR]:
            '💾 **Storage Error**\n\n' +
            'There was a problem accessing or saving data.\n\n' +
            'This is usually temporary. Please try again in a moment.\n\n' +
            'If the issue persists, contact a server administrator.',

        [ErrorCode.TIMEOUT]:
            '⏱️ **Request Timeout**\n\n' +
            'The request took too long to complete.\n\n' +
            '**What to try:**\n' +
            '• Try again with a shorter message\n' +
            '• The model might be processing a large request\n' +
            '• Wait a moment and retry',

        [ErrorCode.NETWORK_ERROR]:
            '🌐 **Network Error**\n\n' +
            'Unable to connect to required services.\n\n' +
            'This might be a temporary connectivity issue. Please try again.',

        [ErrorCode.INTERNAL_ERROR]:
            '⚠️ **Internal Error**\n\n' +
            'An unexpected error occurred while processing your request.\n\n' +
            'The error has been logged. Please try again or contact support if the issue persists.',

        [ErrorCode.UNKNOWN]:
            '❓ **Unknown Error**\n\n' +
            'An unexpected error occurred.\n\n' +
            'Please try again. If the problem continues, contact a server administrator.'
    };

    let message = messages[code] || messages[ErrorCode.UNKNOWN];

    if (details) {
        message += `\n\n📋 *Additional info: ${details}*`;
    }

    return message;
}

/**
 * Classify an error into an appropriate error code
 *
 * @param error - The error to classify
 * @returns The appropriate error code
 */
export function classifyError(error: unknown): ErrorCode {
    if (!(error instanceof Error)) {
        return ErrorCode.UNKNOWN;
    }

    const message = error.message.toLowerCase();

    // Check for specific error patterns
    if (message.includes('fetch failed') || message.includes('econnrefused')) {
        return ErrorCode.OLLAMA_OFFLINE;
    }

    if (message.includes('timeout') || message.includes('timed out')) {
        return ErrorCode.TIMEOUT;
    }

    if (message.includes('enoent') || message.includes('file') || message.includes('permission')) {
        return ErrorCode.FILE_ERROR;
    }

    if (message.includes('network') || message.includes('dns') || message.includes('socket')) {
        return ErrorCode.NETWORK_ERROR;
    }

    if (message.includes('validation') || message.includes('invalid')) {
        return ErrorCode.INVALID_INPUT;
    }

    return ErrorCode.INTERNAL_ERROR;
}

/**
 * Get a short error title for logging
 *
 * @param code - The error code
 * @returns Short error title
 */
export function getErrorTitle(code: ErrorCode): string {
    const titles: Record<ErrorCode, string> = {
        [ErrorCode.RATE_LIMITED]: 'Rate Limited',
        [ErrorCode.INVALID_INPUT]: 'Invalid Input',
        [ErrorCode.NO_MODEL]: 'No Model',
        [ErrorCode.MESSAGE_TOO_LONG]: 'Message Too Long',
        [ErrorCode.PERMISSION_DENIED]: 'Permission Denied',
        [ErrorCode.CHANNEL_DISABLED]: 'Channel Disabled',
        [ErrorCode.OLLAMA_OFFLINE]: 'Ollama Offline',
        [ErrorCode.FILE_ERROR]: 'File Error',
        [ErrorCode.TIMEOUT]: 'Timeout',
        [ErrorCode.NETWORK_ERROR]: 'Network Error',
        [ErrorCode.INTERNAL_ERROR]: 'Internal Error',
        [ErrorCode.UNKNOWN]: 'Unknown Error'
    };

    return titles[code] || 'Error';
}
