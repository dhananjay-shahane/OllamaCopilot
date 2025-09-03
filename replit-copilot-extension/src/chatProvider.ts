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
        console.log('🎯 Replit Chat webview is being resolved');
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
    <title>Replit Copilot Chat</title>
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
    </style>
</head>
<body>
    <div class="chat-header">
        <div class="chat-title">
            <div class="copilot-icon">R</div>
            Replit Copilot
        </div>
        <div class="chat-subtitle">AI assistant for your Replit projects</div>
    </div>

    <div class="chat-container" id="chatContainer">
        <div class="messages-wrapper" id="messagesWrapper">
            <div class="welcome-message">
                <div class="welcome-title">👋 Welcome to Replit Copilot</div>
                <div class="welcome-subtitle">
                    I can help you write code, debug issues, explain concepts, and work with your files.
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
                    placeholder="Ask Replit Copilot..."
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
                        <span>\${isUser ? 'You' : 'Replit Copilot'}</span>
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
                        <span>Replit Copilot is thinking</span>
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

            window.insertSuggestion = insertSuggestion;

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
                }
            });

            setTimeout(() => chatInput.focus(), 100);
        })();
    </script>
</body>
</html>`;
    }
}