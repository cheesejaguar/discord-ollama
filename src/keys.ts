import { getEnvVar } from './utils/index.js'

export const Keys = {
    clientToken: getEnvVar('CLIENT_TOKEN'),
    ipAddress: getEnvVar('OLLAMA_IP', '127.0.0.1'), // default ollama ip if none
    portAddress: getEnvVar('OLLAMA_PORT', '11434'), // default ollama port if none
    defaultModel: getEnvVar('MODEL', 'llama3.2'),
    ollamaApiKey: process.env.OLLAMA_API_KEY || '' // optional API key, read directly to avoid required check
} as const // readonly keys

export default Keys