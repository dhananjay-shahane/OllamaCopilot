"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatProvider = void 0;
class ChatProvider {
    constructor(_extensionUri, mcpClient, ollamaClient, fileOpsManager) {
        this._extensionUri = _extensionUri;
        this.mcpClient = mcpClient;
        this.ollamaClient = ollamaClient;
        this.fileOpsManager = fileOpsManager;
    }
    resolveWebviewView(webviewView, context, _token) {
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
        }
        catch (error) {
            this.postMessage({
                type: 'error',
                message: `Error: ${error}`
            });
        }
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
    <title>Replit Chat</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 0;
            padding: 10px;
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            height: 100vh;
            display: flex;
            flex-direction: column;
        }
        .chat-container {
            flex: 1;
            overflow-y: auto;
            padding: 10px 0;
        }
        .message {
            margin-bottom: 15px;
            padding: 10px;
            border-radius: 8px;
        }
        .user-message {
            background-color: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border);
            margin-left: 20px;
        }
        .assistant-message {
            background-color: var(--vscode-editor-selectionBackground);
            margin-right: 20px;
        }
        .input-container {
            display: flex;
            gap: 8px;
            padding: 10px 0;
            border-top: 1px solid var(--vscode-panel-border);
        }
        .chat-input {
            flex: 1;
            padding: 8px 12px;
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            font-size: 14px;
        }
        .send-button {
            padding: 8px 16px;
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
        }
        .send-button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
    </style>
</head>
<body>
    <div class="chat-container" id="chatContainer">
        <div class="message assistant-message">
            <strong>🤖 Replit Assistant</strong><br>
            Hello! I'm your Replit assistant. I can help you with code, file operations, and integrate with MCP servers and Ollama models.
            <br><br>
            <em>💡 Try asking me to create files, explain code, or help with development tasks!</em>
        </div>
    </div>
    <div class="input-container">
        <input type="text" id="chatInput" class="chat-input" placeholder="Ask me anything about your project..." />
        <button id="sendButton" class="send-button">Send</button>
    </div>

    <script>
        (function() {
            const vscode = acquireVsCodeApi();
            const chatContainer = document.getElementById('chatContainer');
            const chatInput = document.getElementById('chatInput');
            const sendButton = document.getElementById('sendButton');

            function addMessage(content, isUser) {
                const messageDiv = document.createElement('div');
                messageDiv.className = 'message ' + (isUser ? 'user-message' : 'assistant-message');
                messageDiv.innerHTML = '<strong>' + (isUser ? '👤 You' : '🤖 Assistant') + '</strong><br>' + content;
                chatContainer.appendChild(messageDiv);
                chatContainer.scrollTop = chatContainer.scrollHeight;
            }

            function sendMessage() {
                const message = chatInput.value.trim();
                if (!message) return;

                addMessage(message, true);
                chatInput.value = '';
                sendButton.disabled = true;

                vscode.postMessage({
                    type: 'sendMessage',
                    text: message
                });
            }

            sendButton.addEventListener('click', sendMessage);
            chatInput.addEventListener('keypress', function(e) {
                if (e.key === 'Enter') {
                    sendMessage();
                }
            });

            window.addEventListener('message', function(event) {
                const message = event.data;
                sendButton.disabled = false;

                switch (message.type) {
                    case 'assistantMessage':
                        addMessage(message.message, false);
                        break;
                    case 'error':
                        addMessage('❌ ' + message.message, false);
                        break;
                }
            });
        })();
    </script>
</body>
</html>`;
    }
}
exports.ChatProvider = ChatProvider;
ChatProvider.viewType = 'replitCopilotChat';
//# sourceMappingURL=chatProvider.js.map