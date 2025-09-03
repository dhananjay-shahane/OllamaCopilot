"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatProvider = void 0;
const vscode = require("vscode");
class ChatProvider {
    constructor(_extensionUri, mcpClient, ollamaClient, fileOpsManager) {
        this._extensionUri = _extensionUri;
        this.mcpClient = mcpClient;
        this.ollamaClient = ollamaClient;
        this.fileOpsManager = fileOpsManager;
    }
    resolveWebviewView(webviewView, context, _token) {
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
        webviewView.webview.onDidReceiveMessage(async (message) => {
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
                case 'changeModel':
                    await this.handleChangeModel(message.model);
                    break;
                case 'addMCPServer':
                    await this.handleAddMCPServer(message.config);
                    break;
                case 'attachFile':
                    await this.handleAttachFile();
                    break;
            }
        }, undefined);
    }
    async handleChatMessage(message) {
        try {
            // Add user message to chat
            this.postMessage({
                type: 'userMessage',
                message: message
            });
            // Show typing indicator
            this.postMessage({
                type: 'startTyping'
            });
            // Get streaming response from Ollama
            let fullResponse = '';
            const response = await this.ollamaClient.chat(message, (token) => {
                fullResponse += token;
                this.postMessage({
                    type: 'streamToken',
                    token: token,
                    fullMessage: fullResponse
                });
            });
            // Final complete message
            this.postMessage({
                type: 'assistantMessage',
                message: response,
                formatted: this.formatMessage(response)
            });
            // Check if response suggests file operations
            if (response.includes('file:') || response.includes('edit:')) {
                const suggestions = await this.generateFileSuggestions(response);
                this.postMessage({
                    type: 'fileSuggestions',
                    suggestions: suggestions
                });
            }
        }
        catch (error) {
            this.postMessage({
                type: 'error',
                message: `Error: ${error}`
            });
        }
    }
    formatMessage(message) {
        // Format code blocks
        let formatted = message.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, language, code) => {
            return `<pre class="code-block"><code class="language-${language || 'text'}">${this.escapeHtml(code.trim())}</code></pre>`;
        });
        // Format inline code
        formatted = formatted.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
        // Format bold text
        formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        // Format italic text
        formatted = formatted.replace(/\*(.*?)\*/g, '<em>$1</em>');
        // Convert line breaks
        formatted = formatted.replace(/\n/g, '<br>');
        return formatted;
    }
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    async handleApplyEdit(edit) {
        try {
            await this.fileOpsManager.applyEdit(edit);
            this.postMessage({
                type: 'editApplied',
                message: 'Edit applied successfully'
            });
        }
        catch (error) {
            this.postMessage({
                type: 'error',
                message: `Failed to apply edit: ${error}`
            });
        }
    }
    async handlePreviewFile(filePath) {
        try {
            const content = await this.fileOpsManager.readFile(filePath);
            this.postMessage({
                type: 'filePreview',
                filePath: filePath,
                content: content
            });
        }
        catch (error) {
            this.postMessage({
                type: 'error',
                message: `Failed to preview file: ${error}`
            });
        }
    }
    async generateFileSuggestions(response) {
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
    async handleGetSettings() {
        const config = vscode.workspace.getConfiguration('replitCopilot');
        this.postMessage({
            type: 'settingsLoaded',
            settings: {
                model: config.get('defaultModel') || 'llama3.2:1b',
                mcpServerUrl: config.get('mcpServerUrl') || '',
                mcpApiKey: config.get('mcpApiKey') || ''
            }
        });
    }
    async handleSaveSettings(settings) {
        try {
            const config = vscode.workspace.getConfiguration('replitCopilot');
            await config.update('defaultModel', settings.model, vscode.ConfigurationTarget.Global);
            await config.update('mcpServerUrl', settings.mcpServerUrl, vscode.ConfigurationTarget.Global);
            await config.update('mcpApiKey', settings.mcpApiKey, vscode.ConfigurationTarget.Global);
            // Update clients with new configuration
            this.ollamaClient.updateConfiguration();
            this.mcpClient.updateConfiguration();
        }
        catch (error) {
            this.postMessage({
                type: 'error',
                message: `Failed to save settings: ${error}`
            });
        }
    }
    async handleTestConnection() {
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
        }
        catch (error) {
            this.postMessage({
                type: 'error',
                message: `Connection test failed: ${error}`
            });
        }
    }
    async handleRefreshModels() {
        try {
            const models = await this.ollamaClient.getModels();
            this.postMessage({
                type: 'modelsRefreshed',
                models: models.length > 0 ? models : ['llama3.2:1b', 'llama3.2:3b', 'llama3.2', 'llama3.1', 'codellama']
            });
        }
        catch (error) {
            this.postMessage({
                type: 'error',
                message: `Failed to refresh models: ${error}`
            });
        }
    }
    async handleChangeModel(model) {
        try {
            const config = vscode.workspace.getConfiguration('replitCopilot');
            await config.update('defaultModel', model, vscode.ConfigurationTarget.Global);
            this.ollamaClient.updateConfiguration();
        }
        catch (error) {
            this.postMessage({
                type: 'error',
                message: `Failed to change model: ${error}`
            });
        }
    }
    async handleAddMCPServer(config) {
        try {
            // For now, just update the configuration with the MCP server details
            // In a full implementation, you'd save this to a configuration file
            const serverConfig = vscode.workspace.getConfiguration('replitCopilot');
            if (config.type === 'stdio') {
                await serverConfig.update('mcpServerStdio', config, vscode.ConfigurationTarget.Global);
            }
            else {
                await serverConfig.update('mcpServerUrl', config.url, vscode.ConfigurationTarget.Global);
                await serverConfig.update('mcpApiKey', config.apiKey, vscode.ConfigurationTarget.Global);
            }
            this.mcpClient.updateConfiguration();
            this.postMessage({
                type: 'connectionTest',
                message: `✅ MCP Server "${config.name}" added successfully!`
            });
        }
        catch (error) {
            this.postMessage({
                type: 'error',
                message: `Failed to add MCP server: ${error}`
            });
        }
    }
    async handleAttachFile() {
        // This would integrate with VS Code's file picker
        // For now, just show a message
        this.postMessage({
            type: 'connectionTest',
            message: '📎 File attachment feature coming soon!'
        });
    }
    postMessage(message) {
        if (this._view) {
            this._view.webview.postMessage(message);
        }
    }
    _getHtmlForWebview(webview) {
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

        /* New UI Styles */
        .header-toolbar {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 8px 12px;
            background: var(--copilot-bg);
            border-bottom: 1px solid var(--copilot-border);
        }

        .tool-button {
            background: transparent;
            border: none;
            color: var(--copilot-text);
            cursor: pointer;
            padding: 6px 8px;
            border-radius: 4px;
            font-size: 14px;
            transition: background-color 0.2s;
        }

        .tool-button:hover {
            background: var(--copilot-input-bg);
        }

        .header-spacer {
            flex: 1;
        }

        .agent-status {
            font-size: 11px;
            color: var(--copilot-muted);
        }

        .agent-selector {
            padding: 12px 16px;
            background: var(--copilot-bg);
            border-bottom: 1px solid var(--copilot-border);
        }

        .agent-info {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 8px;
        }

        .agent-icon {
            font-size: 16px;
        }

        .agent-name {
            font-size: 13px;
            font-weight: 500;
            color: var(--copilot-text);
        }

        .agent-model-dropdown {
            padding: 4px 8px;
            border: 1px solid var(--copilot-input-border);
            border-radius: 4px;
            background: var(--copilot-input-bg);
            color: var(--copilot-text);
            font-size: 11px;
            margin-left: auto;
        }

        .add-mcp-button {
            width: 100%;
            padding: 8px 12px;
            border: 1px dashed var(--copilot-border);
            border-radius: 4px;
            background: transparent;
            color: var(--copilot-primary);
            font-size: 12px;
            cursor: pointer;
            transition: all 0.2s;
        }

        .add-mcp-button:hover {
            background: var(--copilot-input-bg);
            border-color: var(--copilot-primary);
        }

        .attach-button {
            background: transparent;
            border: none;
            color: var(--copilot-muted);
            cursor: pointer;
            padding: 8px;
            font-size: 14px;
            transition: color 0.2s;
        }

        .attach-button:hover {
            color: var(--copilot-text);
        }

        .input-actions {
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .file-counter {
            font-size: 11px;
            color: var(--copilot-muted);
            white-space: nowrap;
        }

        .send-button {
            background: var(--copilot-primary);
            border: none;
            color: white;
            cursor: pointer;
            padding: 6px 12px;
            border-radius: 4px;
            font-size: 11px;
            font-weight: 500;
            transition: background-color 0.2s;
        }

        /* Modal Styles */
        .modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            z-index: 1000;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .modal-content {
            background: var(--copilot-bg);
            border: 1px solid var(--copilot-border);
            border-radius: 8px;
            width: 90%;
            max-width: 500px;
            max-height: 80vh;
            overflow: hidden;
        }

        .modal-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 16px 20px;
            border-bottom: 1px solid var(--copilot-border);
        }

        .modal-header h3 {
            margin: 0;
            font-size: 14px;
            font-weight: 600;
            color: var(--copilot-text);
        }

        .modal-close {
            background: none;
            border: none;
            color: var(--copilot-muted);
            cursor: pointer;
            font-size: 18px;
            padding: 4px;
        }

        .modal-body {
            padding: 20px;
            max-height: 400px;
            overflow-y: auto;
        }

        .mcp-config-section {
            margin-bottom: 16px;
        }

        .config-label {
            display: flex;
            flex-direction: column;
            gap: 6px;
            font-size: 12px;
            font-weight: 500;
            color: var(--copilot-text);
        }

        .config-input, .config-select, .config-textarea {
            padding: 8px 12px;
            border: 1px solid var(--copilot-input-border);
            border-radius: 4px;
            background: var(--copilot-input-bg);
            color: var(--copilot-text);
            font-size: 12px;
            width: 100%;
        }

        .config-textarea {
            min-height: 60px;
            resize: vertical;
        }

        .modal-footer {
            display: flex;
            gap: 8px;
            justify-content: flex-end;
            padding: 16px 20px;
            border-top: 1px solid var(--copilot-border);
        }

        .modal-button {
            padding: 8px 16px;
            border: 1px solid var(--copilot-primary);
            border-radius: 4px;
            font-size: 12px;
            cursor: pointer;
            transition: all 0.2s;
        }

        .modal-button.primary {
            background: var(--copilot-primary);
            color: white;
        }

        .modal-button.secondary {
            background: transparent;
            color: var(--copilot-primary);
        }

        .modal-button:hover {
            background: var(--copilot-primary-hover);
            color: white;
        }

        /* Code formatting styles */
        .code-block {
            background: var(--vscode-textCodeBlock-background);
            border: 1px solid var(--copilot-border);
            border-radius: 4px;
            padding: 12px;
            margin: 8px 0;
            overflow-x: auto;
            font-family: 'Courier New', monospace;
            font-size: 11px;
            line-height: 1.4;
        }

        .inline-code {
            background: var(--vscode-textCodeBlock-background);
            padding: 2px 4px;
            border-radius: 3px;
            font-family: 'Courier New', monospace;
            font-size: 11px;
        }

        /* Typing animation */
        .typing-indicator {
            display: flex;
            align-items: center;
            gap: 4px;
            color: var(--copilot-muted);
            font-style: italic;
        }

        .typing-dots {
            display: flex;
            gap: 2px;
        }

        .typing-dot {
            width: 4px;
            height: 4px;
            border-radius: 50%;
            background: var(--copilot-muted);
            animation: typingBounce 1.4s infinite ease-in-out;
        }

        .typing-dot:nth-child(2) {
            animation-delay: 0.2s;
        }

        .typing-dot:nth-child(3) {
            animation-delay: 0.4s;
        }

        @keyframes typingBounce {
            0%, 80%, 100% {
                transform: scale(0.8);
                opacity: 0.5;
            }
            40% {
                transform: scale(1);
                opacity: 1;
            }
        }
    </style>
</head>
<body>
    <div class="chat-header">
        <div class="header-toolbar">
            <button class="tool-button" onclick="goBack()" title="Back">←</button>
            <button class="tool-button" onclick="openFork()" title="Fork">🔀</button>
            <button class="tool-button" onclick="openEdit()" title="Edit">✏️</button>
            <button class="tool-button" onclick="openChat()" title="Chat">💬</button>
            <button class="tool-button" onclick="openTools()" title="Tools">🔧</button>
            <button class="tool-button" onclick="toggleMCP()" title="MCP">📡</button>
            <span class="header-spacer"></span>
            <span class="agent-status">🟢 Local Agent</span>
            <button class="settings-button" onclick="toggleSettings()" title="Settings">⚙️</button>
        </div>
    </div>

    <div class="agent-selector">
        <div class="agent-info">
            <span class="agent-icon">🤖</span>
            <span class="agent-name">Agent</span>
            <select id="agentModelSelect" class="agent-model-dropdown">
                <option value="llama3.2:1b">Llama3.2 1B</option>
                <option value="llama3.2:3b">Llama3.2 3B</option>
                <option value="llama3.2">Llama3.2</option>
                <option value="llama3.1">Llama3.1</option>
                <option value="codellama">CodeLlama</option>
            </select>
        </div>
        <div class="mcp-servers" id="mcpServersList" style="display: none;">
            <button class="add-mcp-button" onclick="showMCPModal()">
                ➕ Add MCP Servers
            </button>
        </div>
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
                <button class="attach-button" onclick="attachFile()" title="Attach file">📎</button>
                <textarea 
                    id="chatInput" 
                    class="chat-input" 
                    placeholder="Ask about this codebase..."
                    rows="1"
                    maxlength="4000"
                ></textarea>
                <div class="input-actions">
                    <span class="file-counter" id="fileCounter">Alt⌘ Active file</span>
                    <button id="sendButton" class="send-button" title="Send message">
                        Enter
                    </button>
                </div>
            </div>
        </div>
    </div>

    <!-- MCP Modal -->
    <div class="modal-overlay" id="mcpModal" style="display: none;">
        <div class="modal-content">
            <div class="modal-header">
                <h3>Add MCP Servers</h3>
                <button class="modal-close" onclick="closeMCPModal()">×</button>
            </div>
            <div class="modal-body">
                <div class="mcp-config-section">
                    <label class="config-label">
                        Server Name:
                        <input type="text" id="mcpServerName" class="config-input" placeholder="My MCP Server" />
                    </label>
                </div>
                <div class="mcp-config-section">
                    <label class="config-label">
                        Connection Type:
                        <select id="mcpConnectionType" class="config-select">
                            <option value="stdio">STDIO</option>
                            <option value="websocket">WebSocket</option>
                            <option value="http">HTTP</option>
                        </select>
                    </label>
                </div>
                <div class="mcp-config-section" id="stdioConfig">
                    <label class="config-label">
                        Command:
                        <input type="text" id="mcpCommand" class="config-input" placeholder="node server.js" />
                    </label>
                    <label class="config-label">
                        Arguments (one per line):
                        <textarea id="mcpArgs" class="config-textarea" placeholder="--port 3000\n--verbose"></textarea>
                    </label>
                </div>
                <div class="mcp-config-section" id="urlConfig" style="display: none;">
                    <label class="config-label">
                        Server URL:
                        <input type="text" id="mcpUrl" class="config-input" placeholder="ws://localhost:8080 or http://localhost:8080" />
                    </label>
                    <label class="config-label">
                        API Key (optional):
                        <input type="password" id="mcpKey" class="config-input" placeholder="Enter API key..." />
                    </label>
                </div>
            </div>
            <div class="modal-footer">
                <button class="modal-button secondary" onclick="closeMCPModal()">Cancel</button>
                <button class="modal-button primary" onclick="addMCPServer()">Add Server</button>
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
            let currentStreamingMessage = null;

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

            // Streaming and typing functions
            function showTypingIndicator() {
                if (currentStreamingMessage) return;
                
                const typingDiv = document.createElement('div');
                typingDiv.className = 'message assistant-message typing-message';
                typingDiv.innerHTML = \`
                    <div class="message-header">
                        <div class="message-avatar assistant-avatar">O</div>
                        <span>Ollama Chat</span>
                    </div>
                    <div class="message-content typing-indicator">
                        <span>Thinking</span>
                        <div class="typing-dots">
                            <div class="typing-dot"></div>
                            <div class="typing-dot"></div>
                            <div class="typing-dot"></div>
                        </div>
                    </div>
                \`;
                
                messagesWrapper.appendChild(typingDiv);
                scrollToBottom();
                isThinking = true;
            }

            function hideTypingIndicator() {
                const typingMsg = document.querySelector('.typing-message');
                if (typingMsg) {
                    typingMsg.remove();
                }
                isThinking = false;
            }

            function handleStreamingToken(token, fullMessage) {
                if (!currentStreamingMessage) {
                    // Create new streaming message
                    currentStreamingMessage = document.createElement('div');
                    currentStreamingMessage.className = 'message assistant-message streaming-message';
                    currentStreamingMessage.innerHTML = \`
                        <div class="message-header">
                            <div class="message-avatar assistant-avatar">O</div>
                            <span>Ollama Chat</span>
                        </div>
                        <div class="message-content"></div>
                    \`;
                    messagesWrapper.appendChild(currentStreamingMessage);
                }

                // Update content with typing effect
                const contentDiv = currentStreamingMessage.querySelector('.message-content');
                contentDiv.textContent = fullMessage;
                scrollToBottom();
            }

            function finalizeStreamingMessage(finalMessage, formattedMessage) {
                if (currentStreamingMessage) {
                    const contentDiv = currentStreamingMessage.querySelector('.message-content');
                    contentDiv.innerHTML = formattedMessage || finalMessage;
                    currentStreamingMessage.classList.remove('streaming-message');
                    currentStreamingMessage = null;
                }
                scrollToBottom();
            }

            function updateModelDropdowns(models) {
                const modelSelects = ['modelSelect', 'agentModelSelect'];
                modelSelects.forEach(selectId => {
                    const select = document.getElementById(selectId);
                    if (select) {
                        const currentValue = select.value;
                        select.innerHTML = '';
                        const modelsToUse = models.length > 0 ? models : ['llama3.2:1b', 'llama3.2:3b', 'llama3.2', 'llama3.1', 'codellama'];
                        modelsToUse.forEach(model => {
                            const option = document.createElement('option');
                            option.value = model;
                            option.textContent = model;
                            select.appendChild(option);
                        });
                        if (modelsToUse.includes(currentValue)) {
                            select.value = currentValue;
                        }
                    }
                });
            }

            // UI action functions
            function goBack() { /* Navigate back */ }
            function openFork() { /* Open fork functionality */ }
            function openEdit() { /* Open edit mode */ }
            function openChat() { /* Focus on chat */ chatInput.focus(); }
            function openTools() { /* Show tools panel */ }
            function toggleMCP() {
                const mcpList = document.getElementById('mcpServersList');
                mcpList.style.display = mcpList.style.display === 'none' ? 'block' : 'none';
            }

            function attachFile() {
                vscode.postMessage({ type: 'attachFile' });
            }

            function showMCPModal() {
                document.getElementById('mcpModal').style.display = 'flex';
                
                // Handle connection type change
                const connectionType = document.getElementById('mcpConnectionType');
                const stdioConfig = document.getElementById('stdioConfig');
                const urlConfig = document.getElementById('urlConfig');
                
                connectionType.addEventListener('change', function() {
                    if (this.value === 'stdio') {
                        stdioConfig.style.display = 'block';
                        urlConfig.style.display = 'none';
                    } else {
                        stdioConfig.style.display = 'none';
                        urlConfig.style.display = 'block';
                    }
                });
            }

            function closeMCPModal() {
                document.getElementById('mcpModal').style.display = 'none';
            }

            function addMCPServer() {
                const name = document.getElementById('mcpServerName').value;
                const type = document.getElementById('mcpConnectionType').value;
                
                let config = { name, type };
                
                if (type === 'stdio') {
                    config.command = document.getElementById('mcpCommand').value;
                    config.args = document.getElementById('mcpArgs').value.split('\n').filter(arg => arg.trim());
                } else {
                    config.url = document.getElementById('mcpUrl').value;
                    config.apiKey = document.getElementById('mcpKey').value;
                }
                
                vscode.postMessage({
                    type: 'addMCPServer',
                    config: config
                });
                
                closeMCPModal();
            }

            // Model selection handler
            document.getElementById('agentModelSelect').addEventListener('change', function() {
                vscode.postMessage({
                    type: 'changeModel',
                    model: this.value
                });
            });

            // Make functions global
            window.insertSuggestion = insertSuggestion;
            window.toggleSettings = toggleSettings;
            window.saveSettings = saveSettings;
            window.testConnection = testConnection;
            window.refreshModels = refreshModels;
            window.goBack = goBack;
            window.openFork = openFork;
            window.openEdit = openEdit;
            window.openChat = openChat;
            window.openTools = openTools;
            window.toggleMCP = toggleMCP;
            window.attachFile = attachFile;
            window.showMCPModal = showMCPModal;
            window.closeMCPModal = closeMCPModal;
            window.addMCPServer = addMCPServer;

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
                    case 'startTyping':
                        showTypingIndicator();
                        break;
                    case 'streamToken':
                        handleStreamingToken(message.token, message.fullMessage);
                        break;
                    case 'assistantMessage':
                        hideTypingIndicator();
                        finalizeStreamingMessage(message.message, message.formatted);
                        break;
                    case 'error':
                        hideTypingIndicator();
                        addMessage('❌ ' + message.message, false);
                        break;
                    case 'settingsLoaded':
                        document.getElementById('modelSelect').value = message.settings.model || 'llama3.2:1b';
                        document.getElementById('agentModelSelect').value = message.settings.model || 'llama3.2:1b';
                        document.getElementById('mcpServerUrl').value = message.settings.mcpServerUrl || '';
                        document.getElementById('mcpApiKey').value = message.settings.mcpApiKey || '';
                        break;
                    case 'modelsRefreshed':
                        updateModelDropdowns(message.models);
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
exports.ChatProvider = ChatProvider;
ChatProvider.viewType = 'replitCopilotChat';
//# sourceMappingURL=chatProvider.js.map