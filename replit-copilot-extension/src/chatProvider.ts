import * as vscode from 'vscode';
import { MCPClient } from './mcpClient';
import { OllamaClient } from './ollamaClient';
import { FileOperationsManager } from './fileOperations';

export class ChatProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'replitCopilotChat';

    private _view?: vscode.WebviewView;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly mcpClient: MCPClient,
        private readonly ollamaClient: OllamaClient,
        private readonly fileOpsManager: FileOperationsManager
    ) {}

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        console.log('🎯 Ollama Chat webview is being resolved');
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                this._extensionUri
            ]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // Handle messages from the webview
        webviewView.webview.onDidReceiveMessage(
            async (message: any) => {
                switch (message.type) {
                    case 'sendMessage':
                        await this.handleChatMessage(message.text);
                        break;
                    case 'applyEdit':
                        await this.handleApplyEdit(message.edit);
                        break;
                    case 'previewFile':
                        await this.handlePreviewFile(message.filePath);
                        break;
                    case 'getSettings':
                        await this.handleGetSettings();
                        break;
                    case 'saveSettings':
                        await this.handleSaveSettings(message.settings);
                        break;
                    case 'testConnection':
                        await this.handleTestConnection();
                        break;
                    case 'refreshModels':
                        await this.handleRefreshModels();
                        break;
                }
            },
            undefined,
        );
    }

    private async handleChatMessage(message: string) {
        try {
            // Add user message to chat
            this.postMessage({
                type: 'userMessage',
                message: message
            });

            // Get response from Ollama
            const response = await this.ollamaClient.chat(message);
            
            // Add assistant message to chat
            this.postMessage({
                type: 'assistantMessage',
                message: response
            });

            // Check if response suggests file operations
            if (response.includes('file:') || response.includes('edit:')) {
                const suggestions = await this.generateFileSuggestions(response);
                this.postMessage({
                    type: 'fileSuggestions',
                    suggestions: suggestions
                });
            }

        } catch (error) {
            this.postMessage({
                type: 'error',
                message: `Error: ${error}`
            });
        }
    }

    private async handleApplyEdit(edit: any) {
        try {
            await this.fileOpsManager.applyEdit(edit);
            this.postMessage({
                type: 'editApplied',
                message: 'Edit applied successfully'
            });
        } catch (error) {
            this.postMessage({
                type: 'error',
                message: `Failed to apply edit: ${error}`
            });
        }
    }

    private async handlePreviewFile(filePath: string) {
        try {
            const content = await this.fileOpsManager.readFile(filePath);
            this.postMessage({
                type: 'filePreview',
                filePath: filePath,
                content: content
            });
        } catch (error) {
            this.postMessage({
                type: 'error',
                message: `Failed to preview file: ${error}`
            });
        }
    }

    private async generateFileSuggestions(response: string): Promise<any[]> {
        // Parse response for file operation suggestions
        const suggestions = [];
        
        // Simple pattern matching for now - can be enhanced with better parsing
        if (response.includes('create file')) {
            suggestions.push({
                type: 'create',
                description: 'Create new file',
                action: 'createFile'
            });
        }
        
        if (response.includes('edit file') || response.includes('modify file')) {
            suggestions.push({
                type: 'edit',
                description: 'Edit existing file',
                action: 'editFile'
            });
        }
        
        return suggestions;
    }

    private async handleGetSettings() {
        const config = vscode.workspace.getConfiguration('replitCopilot');
        this.postMessage({
            type: 'settingsLoaded',
            settings: {
                model: config.get<string>('defaultModel') || 'llama3.2:1b',
                mcpServerUrl: config.get<string>('mcpServerUrl') || '',
                mcpApiKey: config.get<string>('mcpApiKey') || ''
            }
        });
    }

    private async handleSaveSettings(settings: any) {
        try {
            const config = vscode.workspace.getConfiguration('replitCopilot');
            await config.update('defaultModel', settings.model, vscode.ConfigurationTarget.Global);
            await config.update('mcpServerUrl', settings.mcpServerUrl, vscode.ConfigurationTarget.Global);
            await config.update('mcpApiKey', settings.mcpApiKey, vscode.ConfigurationTarget.Global);
            
            // Update clients with new configuration
            this.ollamaClient.updateConfiguration();
            this.mcpClient.updateConfiguration();
        } catch (error) {
            this.postMessage({
                type: 'error',
                message: `Failed to save settings: ${error}`
            });
        }
    }

    private async handleTestConnection() {
        try {
            const ollamaAvailable = await this.ollamaClient.isAvailable();
            const mcpConnected = await this.mcpClient.connect();
            
            let message = '🔍 Connection Test Results:\n\n';
            message += `🤖 Ollama: ${ollamaAvailable ? '✅ Connected' : '❌ Not available'}\n`;
            message += `🔗 MCP Server: ${mcpConnected ? '✅ Connected' : '❌ Not connected'}`;
            
            this.postMessage({
                type: 'connectionTest',
                message: message
            });
        } catch (error) {
            this.postMessage({
                type: 'error',
                message: `Connection test failed: ${error}`
            });
        }
    }

    private async handleRefreshModels() {
        try {
            const models = await this.ollamaClient.getModels();
            this.postMessage({
                type: 'modelsRefreshed',
                models: models.length > 0 ? models : ['llama3.2:1b', 'llama3.2:3b', 'llama3.2', 'llama3.1', 'codellama']
            });
        } catch (error) {
            this.postMessage({
                type: 'error',
                message: `Failed to refresh models: ${error}`
            });
        }
    }

    private postMessage(message: any) {
        if (this._view) {
            this._view.webview.postMessage(message);
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Ollama Chat</title>
    <style>
        :root {
            --copilot-primary: #0969da;
            --copilot-primary-hover: #0860ca;
            --copilot-border: var(--vscode-panel-border);
            --copilot-bg: var(--vscode-sideBar-background);
            --copilot-text: var(--vscode-foreground);
            --copilot-muted: var(--vscode-descriptionForeground);
            --copilot-input-bg: var(--vscode-input-background);
            --copilot-input-border: var(--vscode-input-border);
            --copilot-message-user: var(--vscode-textBlockQuote-background);
            --copilot-message-assistant: transparent;
        }

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif;
            height: 100vh;
            background: var(--copilot-bg);
            color: var(--copilot-text);
            display: flex;
            flex-direction: column;
            font-size: 13px;
            line-height: 1.4;
        }

        .chat-header {
            padding: 12px 16px;
            border-bottom: 1px solid var(--copilot-border);
            background: var(--copilot-bg);
            flex-shrink: 0;
        }

        .chat-title {
            font-size: 13px;
            font-weight: 600;
            color: var(--copilot-text);
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .chat-subtitle {
            font-size: 11px;
            color: var(--copilot-muted);
            margin-top: 2px;
        }

        .copilot-icon {
            width: 16px;
            height: 16px;
            background: linear-gradient(135deg, #0969da, #0860ca);
            border-radius: 3px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: 10px;
            font-weight: bold;
        }

        .chat-container {
            flex: 1;
            overflow-y: auto;
            padding: 0;
            display: flex;
            flex-direction: column;
            scroll-behavior: smooth;
        }

        .messages-wrapper {
            padding: 12px 0;
            min-height: 100%;
            display: flex;
            flex-direction: column;
            gap: 16px;
        }

        .message {
            padding: 0 16px;
            animation: fadeIn 0.3s ease-in;
        }

        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }

        .message-content {
            padding: 12px 16px;
            border-radius: 8px;
            line-height: 1.5;
            word-wrap: break-word;
            font-size: 13px;
            position: relative;
        }

        .user-message .message-content {
            background: var(--copilot-message-user);
            margin-left: 40px;
            border: 1px solid var(--copilot-input-border);
        }

        .assistant-message .message-content {
            background: var(--copilot-message-assistant);
        }

        .message-header {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 8px;
            font-size: 12px;
            font-weight: 600;
        }

        .message-avatar {
            width: 20px;
            height: 20px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 11px;
            flex-shrink: 0;
        }

        .user-avatar {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }

        .assistant-avatar {
            background: linear-gradient(135deg, #0969da, #0860ca);
            color: white;
        }

        .thinking {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 12px 16px;
            color: var(--copilot-muted);
            font-size: 12px;
            font-style: italic;
        }

        .thinking-dots {
            display: flex;
            gap: 2px;
        }

        .thinking-dot {
            width: 4px;
            height: 4px;
            background: var(--copilot-muted);
            border-radius: 50%;
            animation: pulse 1.5s infinite;
        }

        .thinking-dot:nth-child(2) { animation-delay: 0.2s; }
        .thinking-dot:nth-child(3) { animation-delay: 0.4s; }

        @keyframes pulse {
            0%, 80%, 100% { opacity: 0.3; }
            40% { opacity: 1; }
        }

        .input-area {
            flex-shrink: 0;
            border-top: 1px solid var(--copilot-border);
            background: var(--copilot-bg);
        }

        .input-container {
            padding: 12px 16px 16px;
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        .input-wrapper {
            display: flex;
            align-items: flex-end;
            gap: 8px;
            position: relative;
        }

        .chat-input {
            flex: 1;
            min-height: 32px;
            max-height: 120px;
            padding: 8px 40px 8px 12px;
            border: 1px solid var(--copilot-input-border);
            border-radius: 6px;
            background: var(--copilot-input-bg);
            color: var(--copilot-text);
            font-size: 13px;
            font-family: inherit;
            resize: none;
            outline: none;
            transition: border-color 0.2s;
        }

        .chat-input:focus {
            border-color: var(--copilot-primary);
        }

        .chat-input::placeholder {
            color: var(--copilot-muted);
        }

        .send-button {
            position: absolute;
            right: 6px;
            bottom: 6px;
            width: 24px;
            height: 24px;
            border: none;
            border-radius: 4px;
            background: var(--copilot-primary);
            color: white;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 12px;
            transition: background-color 0.2s;
        }

        .send-button:hover:not(:disabled) {
            background: var(--copilot-primary-hover);
        }

        .send-button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        .suggestions {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            margin-top: 8px;
        }

        .suggestion {
            padding: 6px 12px;
            border: 1px solid var(--copilot-border);
            border-radius: 16px;
            background: transparent;
            color: var(--copilot-text);
            font-size: 12px;
            cursor: pointer;
            transition: all 0.2s;
        }

        .suggestion:hover {
            background: var(--copilot-input-bg);
            border-color: var(--copilot-primary);
        }

        .welcome-message {
            text-align: center;
            padding: 32px 16px;
            color: var(--copilot-muted);
        }

        .welcome-title {
            font-size: 16px;
            font-weight: 600;
            color: var(--copilot-text);
            margin-bottom: 8px;
        }

        .welcome-subtitle {
            font-size: 13px;
            line-height: 1.4;
        }

        .chat-container::-webkit-scrollbar {
            width: 8px;
        }

        .chat-container::-webkit-scrollbar-track {
            background: transparent;
        }

        .chat-container::-webkit-scrollbar-thumb {
            background: var(--vscode-scrollbarSlider-background);
            border-radius: 4px;
        }

        .chat-container::-webkit-scrollbar-thumb:hover {
            background: var(--vscode-scrollbarSlider-hoverBackground);
        }

        .settings-button {
            margin-left: auto;
            background: transparent;
            border: none;
            color: var(--copilot-text);
            cursor: pointer;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 14px;
            transition: background-color 0.2s;
        }

        .settings-button:hover {
            background: var(--copilot-input-bg);
        }

        .settings-panel {
            background: var(--copilot-bg);
            border-bottom: 1px solid var(--copilot-border);
            padding: 16px;
            animation: slideDown 0.3s ease-out;
        }

        @keyframes slideDown {
            from { opacity: 0; max-height: 0; }
            to { opacity: 1; max-height: 300px; }
        }

        .settings-section {
            margin-bottom: 16px;
        }

        .settings-label {
            display: flex;
            flex-direction: column;
            gap: 6px;
            font-size: 12px;
            font-weight: 500;
            color: var(--copilot-text);
        }

        .model-select, .settings-input {
            padding: 8px 12px;
            border: 1px solid var(--copilot-input-border);
            border-radius: 4px;
            background: var(--copilot-input-bg);
            color: var(--copilot-text);
            font-size: 12px;
            width: 100%;
        }

        .model-select:focus, .settings-input:focus {
            outline: none;
            border-color: var(--copilot-primary);
        }

        .settings-actions {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
        }

        .action-button {
            padding: 6px 12px;
            border: 1px solid var(--copilot-primary);
            border-radius: 4px;
            background: var(--copilot-primary);
            color: white;
            font-size: 11px;
            cursor: pointer;
            transition: all 0.2s;
        }

        .action-button:hover {
            background: var(--copilot-primary-hover);
        }

        .action-button.secondary {
            background: transparent;
            color: var(--copilot-primary);
        }

        .action-button.secondary:hover {
            background: var(--copilot-primary);
            color: white;
        }
    </style>
</head>
<body>
    <div class="chat-header">
        <div class="chat-title">
            <div class="copilot-icon">O</div>
            Ollama Chat
            <button class="settings-button" onclick="toggleSettings()" title="Settings">
                ⚙️
            </button>
        </div>
        <div class="chat-subtitle">AI assistant powered by Ollama</div>
    </div>

    <div class="settings-panel" id="settingsPanel" style="display: none;">
        <div class="settings-section">
            <label class="settings-label">
                🤖 Ollama Model:
                <select id="modelSelect" class="model-select">
                    <option value="llama3.2:1b">Llama-3.2:1b</option>
                    <option value="llama3.2:3b">Llama-3.2:3b</option>
                    <option value="llama3.2">Llama-3.2</option>
                    <option value="llama3.1">Llama-3.1</option>
                    <option value="codellama">CodeLlama</option>
                </select>
            </label>
        </div>
        <div class="settings-section">
            <label class="settings-label">
                🔗 MCP Server URL:
                <input type="text" id="mcpServerUrl" class="settings-input" placeholder="ws://localhost:8080 or http://localhost:8080" />
            </label>
        </div>
        <div class="settings-section">
            <label class="settings-label">
                🔑 MCP API Key (optional):
                <input type="password" id="mcpApiKey" class="settings-input" placeholder="Enter API key..." />
            </label>
        </div>
        <div class="settings-actions">
            <button class="action-button" onclick="saveSettings()">Save</button>
            <button class="action-button secondary" onclick="testConnection()">Test Connection</button>
            <button class="action-button secondary" onclick="refreshModels()">🔄 Refresh Models</button>
        </div>
    </div>

    <div class="chat-container" id="chatContainer">
        <div class="messages-wrapper" id="messagesWrapper">
            <div class="welcome-message">
                <div class="welcome-title">👋 Welcome to Ollama Chat</div>
                <div class="welcome-subtitle">
                    I can help you write code, debug issues, explain concepts, and work with your files using Ollama.
                    <br>Start by asking me a question or describing what you'd like to build.
                </div>
            </div>
        </div>
    </div>

    <div class="input-area">
        <div class="input-container">
            <div class="input-wrapper">
                <textarea 
                    id="chatInput" 
                    class="chat-input" 
                    placeholder="Ask Ollama Chat..."
                    rows="1"
                    maxlength="4000"
                ></textarea>
                <button id="sendButton" class="send-button" title="Send message">
                    ▶
                </button>
            </div>
            <div class="suggestions" id="suggestions">
                <button class="suggestion" onclick="insertSuggestion('Explain this code')">Explain this code</button>
                <button class="suggestion" onclick="insertSuggestion('Write a function to...')">Write a function</button>
                <button class="suggestion" onclick="insertSuggestion('Debug this error')">Debug error</button>
                <button class="suggestion" onclick="insertSuggestion('Optimize my code')">Optimize code</button>
            </div>
        </div>
    </div>

    <script>
        (function() {
            const vscode = acquireVsCodeApi();
            const chatContainer = document.getElementById('chatContainer');
            const messagesWrapper = document.getElementById('messagesWrapper');
            const chatInput = document.getElementById('chatInput');
            const sendButton = document.getElementById('sendButton');
            let isThinking = false;

            chatInput.addEventListener('input', function() {
                this.style.height = 'auto';
                this.style.height = Math.min(this.scrollHeight, 120) + 'px';
            });

            function addMessage(content, isUser, timestamp = null) {
                const welcomeMsg = document.querySelector('.welcome-message');
                if (welcomeMsg && !isUser) {
                    welcomeMsg.remove();
                }

                const messageDiv = document.createElement('div');
                messageDiv.className = 'message ' + (isUser ? 'user-message' : 'assistant-message');
                
                const messageContent = \`
                    <div class="message-header">
                        <div class="message-avatar \${isUser ? 'user-avatar' : 'assistant-avatar'}">
                            \${isUser ? 'U' : 'R'}
                        </div>
                        <span>\${isUser ? 'You' : 'Ollama Chat'}</span>
                        \${timestamp ? \`<span style="color: var(--copilot-muted); font-weight: normal; margin-left: auto;">\${timestamp}</span>\` : ''}
                    </div>
                    <div class="message-content">\${content}</div>
                \`;
                
                messageDiv.innerHTML = messageContent;
                messagesWrapper.appendChild(messageDiv);
                scrollToBottom();
            }

            function showThinking() {
                if (isThinking) return;
                isThinking = true;

                const thinkingDiv = document.createElement('div');
                thinkingDiv.className = 'message assistant-message thinking-message';
                thinkingDiv.innerHTML = \`
                    <div class="thinking">
                        <div class="message-avatar assistant-avatar">R</div>
                        <span>Ollama Chat is thinking</span>
                        <div class="thinking-dots">
                            <div class="thinking-dot"></div>
                            <div class="thinking-dot"></div>
                            <div class="thinking-dot"></div>
                        </div>
                    </div>
                \`;
                
                messagesWrapper.appendChild(thinkingDiv);
                scrollToBottom();
            }

            function hideThinking() {
                const thinkingMsg = document.querySelector('.thinking-message');
                if (thinkingMsg) {
                    thinkingMsg.remove();
                }
                isThinking = false;
            }

            function scrollToBottom() {
                setTimeout(() => {
                    chatContainer.scrollTop = chatContainer.scrollHeight;
                }, 50);
            }

            function sendMessage() {
                const message = chatInput.value.trim();
                if (!message || isThinking) return;

                addMessage(message, true);
                chatInput.value = '';
                chatInput.style.height = 'auto';
                sendButton.disabled = true;
                showThinking();

                vscode.postMessage({
                    type: 'sendMessage',
                    text: message
                });
            }

            function insertSuggestion(text) {
                chatInput.value = text;
                chatInput.focus();
                chatInput.style.height = 'auto';
                chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + 'px';
            }

            // Settings functions
            function toggleSettings() {
                const panel = document.getElementById('settingsPanel');
                panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
                
                if (panel.style.display === 'block') {
                    loadCurrentSettings();
                }
            }

            function loadCurrentSettings() {
                vscode.postMessage({
                    type: 'getSettings'
                });
            }

            function saveSettings() {
                const modelSelect = document.getElementById('modelSelect');
                const mcpServerUrl = document.getElementById('mcpServerUrl');
                const mcpApiKey = document.getElementById('mcpApiKey');

                vscode.postMessage({
                    type: 'saveSettings',
                    settings: {
                        model: modelSelect.value,
                        mcpServerUrl: mcpServerUrl.value,
                        mcpApiKey: mcpApiKey.value
                    }
                });

                // Show confirmation
                const saveBtn = event.target;
                const originalText = saveBtn.textContent;
                saveBtn.textContent = '✓ Saved';
                setTimeout(() => {
                    saveBtn.textContent = originalText;
                }, 2000);
            }

            function testConnection() {
                vscode.postMessage({
                    type: 'testConnection'
                });
            }

            function refreshModels() {
                vscode.postMessage({
                    type: 'refreshModels'
                });
            }

            // Make functions global
            window.insertSuggestion = insertSuggestion;
            window.toggleSettings = toggleSettings;
            window.saveSettings = saveSettings;
            window.testConnection = testConnection;
            window.refreshModels = refreshModels;

            sendButton.addEventListener('click', sendMessage);
            
            chatInput.addEventListener('keydown', function(e) {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                }
            });

            window.addEventListener('message', function(event) {
                const message = event.data;
                hideThinking();
                sendButton.disabled = false;

                switch (message.type) {
                    case 'assistantMessage':
                        addMessage(message.message, false);
                        break;
                    case 'error':
                        addMessage('❌ ' + message.message, false);
                        break;
                    case 'settingsLoaded':
                        document.getElementById('modelSelect').value = message.settings.model || 'llama3.2:1b';
                        document.getElementById('mcpServerUrl').value = message.settings.mcpServerUrl || '';
                        document.getElementById('mcpApiKey').value = message.settings.mcpApiKey || '';
                        break;
                    case 'modelsRefreshed':
                        const modelSelect = document.getElementById('modelSelect');
                        const currentValue = modelSelect.value;
                        modelSelect.innerHTML = '';
                        message.models.forEach(model => {
                            const option = document.createElement('option');
                            option.value = model;
                            option.textContent = model;
                            modelSelect.appendChild(option);
                        });
                        if (message.models.includes(currentValue)) {
                            modelSelect.value = currentValue;
                        }
                        break;
                    case 'connectionTest':
                        addMessage(message.message, false);
                        break;
                }
            });

            setTimeout(() => chatInput.focus(), 100);
        })();
    </script>
</body>
</html>`;
    }
}