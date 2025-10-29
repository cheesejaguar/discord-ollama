import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { validateConfig, printConfigSummary, BotConfig } from '../src/utils/configValidation';

// Valid mock Discord token (70 characters, 3 parts separated by dots)
// Using obviously fake token to avoid GitHub secret scanning
const VALID_MOCK_TOKEN = 'TEST1234567890ABCDEFGH.FAKE12.MOCK5678901234567890ABCDEFGHIJKLMNOPQRST';

describe('validateConfig', () => {
    let originalEnv: NodeJS.ProcessEnv;

    beforeEach(() => {
        // Save original environment
        originalEnv = { ...process.env };
    });

    afterEach(() => {
        // Restore original environment
        process.env = originalEnv;
    });

    describe('basic configuration', () => {
        it('should load valid configuration with all required fields', () => {
            process.env.CLIENT_TOKEN = VALID_MOCK_TOKEN;
            process.env.IP_ADDRESS = '192.168.1.100';
            process.env.OLLAMA_PORT = '11434';
            process.env.DEFAULT_MODEL = 'llama3.2';
            process.env.DATA_DIR = 'data';
            process.env.LOG_LEVEL = 'info';
            process.env.LOG_TO_FILE = 'true';
            process.env.OLLAMA_TIMEOUT_MS = '60000';
            process.env.RATE_LIMIT_SECONDS = '5';

            const config = validateConfig();

            expect(config.token).toBe(VALID_MOCK_TOKEN);
            expect(config.ollamaHost).toBe('192.168.1.100');
            expect(config.ollamaPort).toBe('11434');
            expect(config.ollamaUrl).toBe('http://192.168.1.100:11434');
            expect(config.defaultModel).toBe('llama3.2');
            expect(config.dataDirectory).toBe('data');
            expect(config.logLevel).toBe('info');
            expect(config.logToFile).toBe(true);
            expect(config.messageTimeout).toBe(60000);
            expect(config.rateLimitSeconds).toBe(5);
        });

        it('should use default values when optional fields are missing', () => {
            process.env.CLIENT_TOKEN = VALID_MOCK_TOKEN;

            const config = validateConfig();

            expect(config.token).toBe(VALID_MOCK_TOKEN);
            expect(config.ollamaHost).toBe('127.0.0.1');
            expect(config.ollamaPort).toBe('11434');
            expect(config.ollamaUrl).toBe('http://127.0.0.1:11434');
            expect(config.defaultModel).toBe('llama3.2');
            expect(config.dataDirectory).toBe('data');
            expect(config.logLevel).toBe('info');
            expect(config.logToFile).toBe(false);
            expect(config.messageTimeout).toBe(60000);
            expect(config.rateLimitSeconds).toBe(5);
        });

        it('should throw error when CLIENT_TOKEN is missing', () => {
            delete process.env.CLIENT_TOKEN;

            expect(() => validateConfig()).toThrow(/CLIENT_TOKEN/i);
        });
    });

    describe('log level validation', () => {
        beforeEach(() => {
            process.env.CLIENT_TOKEN = VALID_MOCK_TOKEN;
        });

        it('should accept valid log levels', () => {
            const validLevels = ['debug', 'info', 'warn', 'error', 'security'];

            validLevels.forEach(level => {
                process.env.LOG_LEVEL = level;
                const config = validateConfig();
                expect(config.logLevel).toBe(level.toLowerCase());
            });
        });

        it('should be case-insensitive', () => {
            process.env.LOG_LEVEL = 'INFO';
            const config = validateConfig();
            expect(config.logLevel).toBe('info');

            process.env.LOG_LEVEL = 'WaRn';
            const config2 = validateConfig();
            expect(config2.logLevel).toBe('warn');
        });

        it('should use fallback for invalid log level', () => {
            const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

            process.env.LOG_LEVEL = 'invalid_level';
            const config = validateConfig();

            expect(config.logLevel).toBe('info'); // Fallback
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[Config] Configuration warnings:'));

            consoleSpy.mockRestore();
        });
    });

    describe('timeout validation', () => {
        beforeEach(() => {
            process.env.CLIENT_TOKEN = VALID_MOCK_TOKEN;
        });

        it('should accept valid timeout values', () => {
            const validTimeouts = ['5000', '30000', '60000', '120000', '300000'];

            validTimeouts.forEach(timeout => {
                process.env.OLLAMA_TIMEOUT_MS = timeout;
                const config = validateConfig();
                expect(config.messageTimeout).toBe(parseInt(timeout));
            });
        });

        it('should use fallback for timeout below minimum', () => {
            const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

            process.env.OLLAMA_TIMEOUT_MS = '1000'; // Too low
            const config = validateConfig();

            expect(config.messageTimeout).toBe(60000); // Fallback
            expect(consoleSpy).toHaveBeenCalled();

            consoleSpy.mockRestore();
        });

        it('should use fallback for timeout above maximum', () => {
            const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

            process.env.OLLAMA_TIMEOUT_MS = '500000'; // Too high
            const config = validateConfig();

            expect(config.messageTimeout).toBe(60000); // Fallback
            expect(consoleSpy).toHaveBeenCalled();

            consoleSpy.mockRestore();
        });

        it('should use fallback for non-integer timeout', () => {
            const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

            process.env.OLLAMA_TIMEOUT_MS = '60000.5';
            const config = validateConfig();

            expect(config.messageTimeout).toBe(60000); // Fallback

            consoleSpy.mockRestore();
        });
    });

    describe('rate limit validation', () => {
        beforeEach(() => {
            process.env.CLIENT_TOKEN = VALID_MOCK_TOKEN;
        });

        it('should accept valid rate limits', () => {
            const validLimits = ['1', '5', '10', '30', '60', '300', '3600'];

            validLimits.forEach(limit => {
                process.env.RATE_LIMIT_SECONDS = limit;
                const config = validateConfig();
                expect(config.rateLimitSeconds).toBe(parseInt(limit));
            });
        });

        it('should use fallback for rate limit below minimum', () => {
            const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

            process.env.RATE_LIMIT_SECONDS = '0';
            const config = validateConfig();

            expect(config.rateLimitSeconds).toBe(5); // Fallback
            expect(consoleSpy).toHaveBeenCalled();

            consoleSpy.mockRestore();
        });

        it('should use fallback for rate limit above maximum', () => {
            const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

            process.env.RATE_LIMIT_SECONDS = '7200'; // Too high (2 hours)
            const config = validateConfig();

            expect(config.rateLimitSeconds).toBe(5); // Fallback
            expect(consoleSpy).toHaveBeenCalled();

            consoleSpy.mockRestore();
        });

        it('should use fallback for non-integer rate limit', () => {
            const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

            process.env.RATE_LIMIT_SECONDS = '5.5';
            const config = validateConfig();

            expect(config.rateLimitSeconds).toBe(5); // Fallback

            consoleSpy.mockRestore();
        });
    });

    describe('Ollama URL validation', () => {
        beforeEach(() => {
            process.env.CLIENT_TOKEN = VALID_MOCK_TOKEN;
        });

        it('should construct valid Ollama URL', () => {
            process.env.IP_ADDRESS = '192.168.1.50';
            process.env.OLLAMA_PORT = '8080';

            const config = validateConfig();

            expect(config.ollamaUrl).toBe('http://192.168.1.50:8080');
            expect(config.ollamaHost).toBe('192.168.1.50');
            expect(config.ollamaPort).toBe('8080');
        });

        it('should reject localhost string (not IPv4)', () => {
            process.env.IP_ADDRESS = 'localhost';
            process.env.OLLAMA_PORT = '11434';

            // getEnvVar validates IP_ADDRESS as IPv4, so 'localhost' is rejected
            expect(() => validateConfig()).toThrow(/IP_ADDRESS.*not a valid IPv4/i);
        });

        it('should throw error for invalid port', () => {
            process.env.OLLAMA_PORT = '99999'; // Out of range

            // getEnvVar validates port before configValidation can handle it
            expect(() => validateConfig()).toThrow(/OLLAMA_PORT.*not a valid port/i);
        });

        it('should throw error for negative port', () => {
            process.env.OLLAMA_PORT = '-1';

            expect(() => validateConfig()).toThrow(/OLLAMA_PORT.*not a valid port/i);
        });

        it('should throw error for non-numeric port', () => {
            process.env.OLLAMA_PORT = 'not_a_port';

            expect(() => validateConfig()).toThrow(/OLLAMA_PORT.*not a valid port/i);
        });
    });

    describe('model name validation', () => {
        beforeEach(() => {
            process.env.CLIENT_TOKEN = VALID_MOCK_TOKEN;
        });

        it('should accept valid model names', () => {
            const validModels = ['llama3.2', 'mixtral-8x7b', 'gpt-4', 'model:latest'];

            validModels.forEach(model => {
                process.env.DEFAULT_MODEL = model;
                const config = validateConfig();
                expect(config.defaultModel).toBe(model);
            });
        });

        it('should warn but accept model name too long', () => {
            const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

            const longModel = 'a'.repeat(101);
            process.env.DEFAULT_MODEL = longModel;
            const config = validateConfig();

            // Config validation warns but still uses the value
            expect(config.defaultModel).toBe(longModel);
            expect(consoleSpy).toHaveBeenCalled();

            consoleSpy.mockRestore();
        });

        it('should use default when model name not provided', () => {
            delete process.env.DEFAULT_MODEL;
            const config = validateConfig();

            // Uses getEnvVar fallback when env var is not set
            expect(config.defaultModel).toBe('llama3.2');
        });
    });

    describe('data directory validation', () => {
        beforeEach(() => {
            process.env.CLIENT_TOKEN = VALID_MOCK_TOKEN;
        });

        it('should accept valid data directory paths', () => {
            const validPaths = ['data', './data', '/var/lib/bot/data', '../data'];

            validPaths.forEach(path => {
                process.env.DATA_DIR = path;
                const config = validateConfig();
                expect(config.dataDirectory).toBe(path);
            });
        });

        it('should use default when data directory not provided', () => {
            delete process.env.DATA_DIR;
            const config = validateConfig();

            // Uses getEnvVar fallback when env var is not set
            expect(config.dataDirectory).toBe('data');
        });
    });

    describe('log to file flag', () => {
        beforeEach(() => {
            process.env.CLIENT_TOKEN = VALID_MOCK_TOKEN;
        });

        it('should enable file logging when set to "true"', () => {
            process.env.LOG_TO_FILE = 'true';
            const config = validateConfig();
            expect(config.logToFile).toBe(true);
        });

        it('should disable file logging for any other value', () => {
            const falseValues = ['false', 'False', '0', 'no', '', undefined];

            falseValues.forEach(value => {
                if (value === undefined) {
                    delete process.env.LOG_TO_FILE;
                } else {
                    process.env.LOG_TO_FILE = value;
                }
                const config = validateConfig();
                expect(config.logToFile).toBe(false);
            });
        });
    });
});

describe('printConfigSummary', () => {
    it('should print configuration summary without errors', () => {
        const mockConfig: BotConfig = {
            token: VALID_MOCK_TOKEN,
            ollamaUrl: 'http://localhost:11434',
            ollamaHost: 'localhost',
            ollamaPort: '11434',
            defaultModel: 'llama3.2',
            dataDirectory: 'data',
            logLevel: 'info',
            logToFile: true,
            messageTimeout: 60000,
            rateLimitSeconds: 5
        };

        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

        printConfigSummary(mockConfig);

        // Should have called console.log multiple times
        expect(consoleSpy).toHaveBeenCalled();
        expect(consoleSpy.mock.calls.length).toBeGreaterThan(5);

        // Check that it includes key configuration values
        const allOutput = consoleSpy.mock.calls.map(call => call[0]).join('\n');
        expect(allOutput).toContain('BOT CONFIGURATION');
        expect(allOutput).toContain('http://localhost:11434');
        expect(allOutput).toContain('llama3.2');
        expect(allOutput).toContain('data');
        expect(allOutput).toContain('info');
        expect(allOutput).toContain('enabled');
        expect(allOutput).toContain('60000ms');
        expect(allOutput).toContain('5s');

        consoleSpy.mockRestore();
    });

    it('should handle disabled file logging in summary', () => {
        const mockConfig: BotConfig = {
            token: VALID_MOCK_TOKEN,
            ollamaUrl: 'http://localhost:11434',
            ollamaHost: 'localhost',
            ollamaPort: '11434',
            defaultModel: 'llama3.2',
            dataDirectory: 'data',
            logLevel: 'debug',
            logToFile: false,
            messageTimeout: 30000,
            rateLimitSeconds: 10
        };

        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

        printConfigSummary(mockConfig);

        const allOutput = consoleSpy.mock.calls.map(call => call[0]).join('\n');
        expect(allOutput).toContain('disabled');
        expect(allOutput).toContain('debug');
        expect(allOutput).toContain('30000ms');
        expect(allOutput).toContain('10s');

        consoleSpy.mockRestore();
    });
});
