import { resolve } from 'path';
import { config } from 'dotenv';

// resolve config file
const envFilePath = resolve(process.cwd(), '.env');

// set current environment variable file
config({ path: envFilePath });

/**
 * Validates IPv4 address format
 * Ensures each octet is 0-255 and properly formatted
 *
 * @param ip - IP address string to validate
 * @returns true if valid IPv4, false otherwise
 */
function isValidIPv4(ip: string): boolean {
    const parts = ip.split('.');

    if (parts.length !== 4) {
        return false;
    }

    return parts.every(part => {
        // Check if part is a number
        const num = parseInt(part, 10);

        // Verify range and no leading zeros (except "0" itself)
        return (
            !isNaN(num) &&
            num >= 0 &&
            num <= 255 &&
            part === num.toString()
        );
    });
}

/**
 * Validates hostname format (for Docker container names, DNS names, etc.)
 * Allows alphanumeric characters, hyphens, underscores, and dots
 *
 * @param hostname - Hostname string to validate
 * @returns true if valid hostname, false otherwise
 */
function isValidHostname(hostname: string): boolean {
    // Allow localhost as special case
    if (hostname === 'localhost') {
        return true;
    }

    // Hostname must be 1-253 characters
    if (hostname.length < 1 || hostname.length > 253) {
        return false;
    }

    // Allow alphanumeric, hyphens, underscores, and dots
    // Cannot start or end with hyphen or dot
    const hostnameRegex = /^[a-zA-Z0-9]([a-zA-Z0-9\-_]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-_]*[a-zA-Z0-9])?)*$/;
    return hostnameRegex.test(hostname);
}

/**
 * Validates Discord bot token format
 * Discord bot tokens are 70-72 characters with 3 base64 segments separated by dots
 *
 * @param token - The bot token to validate
 * @throws {Error} If token format is invalid
 */
function validateDiscordToken(token: string): void {
    // Check length (Discord tokens are 70-72 characters)
    if (token.length < 70 || token.length > 72) {
        throw new Error(
            `Invalid CLIENT_TOKEN length. ` +
            `Discord bot tokens must be 70-72 characters. ` +
            `Provided token length: ${token.length}.\n\n` +
            `Get your bot token from: https://discord.com/developers/applications`
        );
    }

    // Check format: three parts separated by dots
    const parts = token.split('.');
    if (parts.length !== 3) {
        throw new Error(
            `Invalid CLIENT_TOKEN format. ` +
            `Discord bot tokens consist of three base64 segments separated by dots. ` +
            `Found ${parts.length} segments.`
        );
    }

    // Verify each part uses base64-url characters
    const base64UrlRegex = /^[A-Za-z0-9_-]+$/;
    parts.forEach((part, index) => {
        if (part.length === 0) {
            throw new Error(
                `Invalid CLIENT_TOKEN format. ` +
                `Segment ${index + 1} is empty.`
            );
        }
        if (!base64UrlRegex.test(part)) {
            throw new Error(
                `Invalid CLIENT_TOKEN format. ` +
                `Segment ${index + 1} contains invalid characters. ` +
                `Only alphanumeric characters, dashes, and underscores are allowed.`
            );
        }
    });
}

/**
 * Retrieves and validates environment variables
 *
 * @param name - Name of the environment variable in .env
 * @param fallback - Fallback value if environment variable is not set
 * @returns Environment variable value
 * @throws {Error} If variable is not set or validation fails
 *
 * @example
 * const token = getEnvVar('CLIENT_TOKEN');
 * const ollamaIp = getEnvVar('OLLAMA_IP', '127.0.0.1');
 */
export function getEnvVar(name: string, fallback?: string): string {
    const value = process.env[name] ?? fallback;

    if (!value) {
        throw new Error(
            `Environment variable ${name} is required but not set.\n\n` +
            `Please create a .env file in the project root with this variable.\n` +
            `See .env.sample for an example.`
        );
    }

    // Validate Discord bot token
    if (name === 'CLIENT_TOKEN') {
        try {
            validateDiscordToken(value);
        } catch (error) {
            throw new Error(
                `${(error as Error).message}\n\n` +
                `Please check your .env file and ensure CLIENT_TOKEN is set correctly.`
            );
        }
    }

    // Validate IPv4 addresses or hostnames (for Docker container names, etc.)
    if (name.endsWith('_IP') || name.endsWith('_ADDRESS')) {
        if (!isValidIPv4(value) && !isValidHostname(value)) {
            throw new Error(
                `Environment variable ${name} must be either a valid IPv4 address or hostname: "${value}".\n\n` +
                `IPv4 format: X.X.X.X where each X is 0-255.\n` +
                `Hostname format: alphanumeric with optional hyphens/underscores/dots\n` +
                `Examples: 127.0.0.1, open-webui, localhost, my-container.local`
            );
        }
    }

    // Validate port numbers
    if (name.endsWith('_PORT')) {
        const port = parseInt(value, 10);
        if (isNaN(port) || port < 1 || port > 65535) {
            throw new Error(
                `Environment variable ${name} is not a valid port number: "${value}".\n\n` +
                `Port must be between 1 and 65535.`
            );
        }
    }

    return value;
}