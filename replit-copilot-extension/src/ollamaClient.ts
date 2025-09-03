import * as vscode from 'vscode';
import axios from 'axios';

export interface OllamaConfig {
    url: string;
    model: string;
    systemMessage?: string;
}

export interface ChatMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
}

export class OllamaClient {
    private config: OllamaConfig = { url: 'http://localhost:11434', model: 'llama3.2:1b' };
    private conversationHistory: ChatMessage[] = [];

    constructor() {
        this.updateConfiguration();
    }

    public updateConfiguration() {
        const config = vscode.workspace.getConfiguration('replitCopilot');
        this.config = {
            url: config.get<string>('ollamaUrl') || 'http://localhost:11434',
            model: config.get<string>('defaultModel') || 'llama3.2:1b',
            systemMessage: config.get<string>('systemMessage') || 'You are a helpful coding assistant for Replit. You can help with file operations, code explanations, and development tasks.'
        };

        // Add system message to conversation history if not present
        if (this.conversationHistory.length === 0 || this.conversationHistory[0].role !== 'system') {
            this.conversationHistory.unshift({
                role: 'system',
                content: this.config.systemMessage!
            });
        }
    }

    public async isAvailable(): Promise<boolean> {
        try {
            const response = await axios.get(`${this.config.url}/api/version`, {
                timeout: 5000
            });
            return response.status === 200;
        } catch (error) {
            console.error('Ollama not available:', error);
            return false;
        }
    }

    public async getModels(): Promise<string[]> {
        try {
            const response = await axios.get(`${this.config.url}/api/tags`);
            return response.data.models?.map((model: any) => model.name) || [];
        } catch (error) {
            console.error('Failed to fetch Ollama models:', error);
            return [];
        }
    }

    public async chat(message: string, includeContext: boolean = true): Promise<string> {
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
                stream: false,
                options: {
                    temperature: 0.7,
                    top_p: 0.9,
                    max_tokens: 2048
                }
            };

            const response = await axios.post(`${this.config.url}/api/chat`, payload, {
                timeout: 60000 // 60 seconds timeout for LLM responses
            });

            const assistantMessage = response.data.message?.content || 'Sorry, I couldn\'t generate a response.';
            
            // Add assistant response to history
            this.conversationHistory.push({
                role: 'assistant',
                content: assistantMessage
            });

            // Keep conversation history manageable (last 20 messages)
            if (this.conversationHistory.length > 21) { // 1 system + 20 conversation messages
                this.conversationHistory = [
                    this.conversationHistory[0], // Keep system message
                    ...this.conversationHistory.slice(-20) // Keep last 20 messages
                ];
            }

            return assistantMessage;

        } catch (error) {
            console.error('Ollama chat error:', error);
            
            if (axios.isAxiosError(error)) {
                if (error.code === 'ECONNREFUSED') {
                    return 'Unable to connect to Ollama. Please ensure Ollama is running locally.';
                } else if (error.response?.status === 404) {
                    return `Model '${this.config.model}' not found. Please check if the model is installed in Ollama.`;
                } else if (error.code === 'ETIMEDOUT') {
                    return 'Request timed out. The model might be taking too long to respond.';
                }
            }
            
            return `Error communicating with Ollama: ${error}`;
        }
    }

    public async generateCode(prompt: string, language?: string): Promise<string> {
        const codePrompt = `${language ? `Generate ${language} code for: ` : 'Generate code for: '}${prompt}\n\nPlease provide clean, well-commented code with explanations.`;
        return await this.chat(codePrompt, false);
    }

    public async explainCode(code: string, language?: string): Promise<string> {
        const explainPrompt = `Explain this ${language || ''} code:\n\n\`\`\`${language || ''}\n${code}\n\`\`\`\n\nPlease provide a clear explanation of what this code does, how it works, and any notable patterns or best practices used.`;
        return await this.chat(explainPrompt, false);
    }

    public async suggestImprovements(code: string, language?: string): Promise<string> {
        const improvePrompt = `Review and suggest improvements for this ${language || ''} code:\n\n\`\`\`${language || ''}\n${code}\n\`\`\`\n\nPlease suggest specific improvements for performance, readability, maintainability, or best practices.`;
        return await this.chat(improvePrompt, false);
    }

    public clearHistory() {
        this.conversationHistory = [
            {
                role: 'system',
                content: this.config.systemMessage!
            }
        ];
    }

    public getConversationHistory(): ChatMessage[] {
        return [...this.conversationHistory];
    }
}