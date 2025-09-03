"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OllamaClient = void 0;
const vscode = require("vscode");
const axios_1 = require("axios");
class OllamaClient {
    constructor() {
        this.config = { url: 'http://localhost:11434', model: 'llama3.2:1b' };
        this.conversationHistory = [];
        this.updateConfiguration();
    }
    updateConfiguration() {
        const config = vscode.workspace.getConfiguration('replitCopilot');
        this.config = {
            url: config.get('ollamaUrl') || 'http://localhost:11434',
            model: config.get('defaultModel') || 'llama3.2:1b',
            systemMessage: config.get('systemMessage') || 'You are a helpful coding assistant for Replit. You can help with file operations, code explanations, and development tasks.'
        };
        // Add system message to conversation history if not present
        if (this.conversationHistory.length === 0 || this.conversationHistory[0].role !== 'system') {
            this.conversationHistory.unshift({
                role: 'system',
                content: this.config.systemMessage
            });
        }
    }
    async isAvailable() {
        try {
            const response = await axios_1.default.get(`${this.config.url}/api/version`, {
                timeout: 5000
            });
            return response.status === 200;
        }
        catch (error) {
            console.error('Ollama not available:', error);
            return false;
        }
    }
    async getModels() {
        try {
            const response = await axios_1.default.get(`${this.config.url}/api/tags`);
            return response.data.models?.map((model) => model.name) || [];
        }
        catch (error) {
            console.error('Failed to fetch Ollama models:', error);
            return [];
        }
    }
    async chat(message, onToken, includeContext = true) {
        try {
            // Add user message to history
            this.conversationHistory.push({
                role: 'user',
                content: message
            });
            const payload = {
                model: this.config.model,
                messages: includeContext ? this.conversationHistory : [
                    { role: 'system', content: this.config.systemMessage },
                    { role: 'user', content: message }
                ],
                stream: true, // Enable streaming for faster responses
                options: {
                    temperature: 0.7,
                    top_p: 0.9,
                    max_tokens: 2048
                }
            };
            const response = await axios_1.default.post(`${this.config.url}/api/chat`, payload, {
                responseType: 'stream',
                timeout: 60000
            });
            let assistantMessage = '';
            return new Promise((resolve, reject) => {
                response.data.on('data', (chunk) => {
                    const lines = chunk.toString().split('\n');
                    for (const line of lines) {
                        if (line.trim() === '')
                            continue;
                        try {
                            const data = JSON.parse(line);
                            if (data.message?.content) {
                                const token = data.message.content;
                                assistantMessage += token;
                                if (onToken) {
                                    onToken(token);
                                }
                            }
                            if (data.done) {
                                // Add complete assistant response to history
                                this.conversationHistory.push({
                                    role: 'assistant',
                                    content: assistantMessage
                                });
                                // Keep conversation history manageable
                                if (this.conversationHistory.length > 21) {
                                    this.conversationHistory = [
                                        this.conversationHistory[0],
                                        ...this.conversationHistory.slice(-20)
                                    ];
                                }
                                resolve(assistantMessage || 'Sorry, I couldn\'t generate a response.');
                            }
                        }
                        catch (e) {
                            // Ignore JSON parsing errors for incomplete chunks
                        }
                    }
                });
                response.data.on('error', (error) => {
                    reject(error);
                });
                response.data.on('end', () => {
                    if (assistantMessage === '') {
                        resolve('Sorry, I couldn\'t generate a response.');
                    }
                });
            });
        }
        catch (error) {
            console.error('Ollama chat error:', error);
            if (axios_1.default.isAxiosError(error)) {
                if (error.code === 'ECONNREFUSED') {
                    return 'Unable to connect to Ollama. Please ensure Ollama is running locally.';
                }
                else if (error.response?.status === 404) {
                    return `Model '${this.config.model}' not found. Please check if the model is installed in Ollama.`;
                }
                else if (error.code === 'ETIMEDOUT') {
                    return 'Request timed out. The model might be taking too long to respond.';
                }
            }
            return `Error communicating with Ollama: ${error}`;
        }
    }
    async generateCode(prompt, language, onToken) {
        const codePrompt = `${language ? `Generate ${language} code for: ` : 'Generate code for: '}${prompt}\n\nPlease provide clean, well-commented code with explanations.`;
        return await this.chat(codePrompt, onToken, false);
    }
    async explainCode(code, language, onToken) {
        const explainPrompt = `Explain this ${language || ''} code:\n\n\`\`\`${language || ''}\n${code}\n\`\`\`\n\nPlease provide a clear explanation of what this code does, how it works, and any notable patterns or best practices used.`;
        return await this.chat(explainPrompt, onToken, false);
    }
    async suggestImprovements(code, language, onToken) {
        const improvePrompt = `Review and suggest improvements for this ${language || ''} code:\n\n\`\`\`${language || ''}\n${code}\n\`\`\`\n\nPlease suggest specific improvements for performance, readability, maintainability, or best practices.`;
        return await this.chat(improvePrompt, onToken, false);
    }
    clearHistory() {
        this.conversationHistory = [
            {
                role: 'system',
                content: this.config.systemMessage
            }
        ];
    }
    getConversationHistory() {
        return [...this.conversationHistory];
    }
}
exports.OllamaClient = OllamaClient;
//# sourceMappingURL=ollamaClient.js.map