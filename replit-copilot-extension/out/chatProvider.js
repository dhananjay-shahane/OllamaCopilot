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
        console.log('[REPLIT-COPILOT] Ollama Chat webview is being resolved');
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
            console.log('[REPLIT-COPILOT] Backend received message:', message);
            switch (message.type) {
                case 'ready':
                    console.log('[REPLIT-COPILOT] Webview is ready and JavaScript is working!');
                    break;
                case 'sendMessage':
                    console.log('[REPLIT-COPILOT] Handling chat message:', message.text);
                    await this.handleChatMessage(message.text);
                    break;
                case 'saveSettings':
                    await this.handleSaveSettings(message.settings);
                    break;
                case 'getSettings':
                    await this.handleGetSettings();
                    break;
                case 'testConnection':
                    await this.handleTestConnection();
                    break;
                case 'refreshModels':
                    await this.handleRefreshModels();
                    break;
                case 'debug':
                    console.log('[REPLIT-COPILOT] Debug from webview:', message.data);
                    break;
            }
        }, undefined, []);
    }
    async handleChatMessage(message) {
        console.log('[REPLIT-COPILOT] Processing chat message:', message);
        try {
            // Add user message to chat immediately
            this.postMessage({
                type: 'userMessage',
                message: message
            });
            // Start typing indicator with faster response
            this.postMessage({ type: 'startTyping' });
            // Get streaming response from Ollama with fast mode
            let fullResponse = '';
            const startTime = Date.now();
            const response = await this.ollamaClient.chat(message, (token) => {
                fullResponse += token;
                // Send streaming tokens with ChatGPT-style effect
                this.postMessage({
                    type: 'streamToken',
                    token: token,
                    fullMessage: fullResponse
                });
            }, true // includeContext parameter
            );
            const responseTime = Date.now() - startTime;
            console.log(`[REPLIT-COPILOT] Response time: ${responseTime}ms`);
            // Final complete message
            this.postMessage({
                type: 'assistantMessage',
                message: response,
                formatted: this.formatMessage(response)
            });
        }
        catch (error) {
            this.postMessage({
                type: 'error',
                message: `Error: ${error}`
            });
        }
    }
    async handleSaveSettings(settings) {
        try {
            const config = vscode.workspace.getConfiguration("replitCopilot");
            await config.update("defaultModel", settings.model, vscode.ConfigurationTarget.Global);
            await config.update("mcpServerUrl", settings.mcpServerUrl, vscode.ConfigurationTarget.Global);
            await config.update("mcpApiKey", settings.mcpApiKey, vscode.ConfigurationTarget.Global);
            await config.update("mcpConnectionType", settings.mcpConnectionType || "stdio", vscode.ConfigurationTarget.Global);
            await config.update("mcpStdioCommand", settings.mcpStdioCommand || "node", vscode.ConfigurationTarget.Global);
            await config.update("mcpStdioArgs", settings.mcpStdioArgs || [], vscode.ConfigurationTarget.Global);
            await config.update("mcpTimeout", settings.mcpTimeout || 2000, vscode.ConfigurationTarget.Global);
            await config.update("enableStreaming", settings.enableStreaming !== false, vscode.ConfigurationTarget.Global);
            await config.update("enableFastMode", settings.enableFastMode !== false, vscode.ConfigurationTarget.Global);
            this.ollamaClient?.updateConfiguration?.();
            this.mcpClient?.updateConfiguration?.();
            this.postMessage({ type: "settingsSaved", message: "⚡ Settings saved! Fast mode enabled." });
        }
        catch (error) {
            this.postMessage({ type: "error", message: `Failed to save settings: ${error}` });
        }
    }
    async handleGetSettings() {
        const config = vscode.workspace.getConfiguration("replitCopilot");
        this.postMessage({
            type: "settingsLoaded",
            settings: {
                model: config.get("defaultModel") || "llama3.2:1b",
                mcpServerUrl: config.get("mcpServerUrl") || "",
                mcpApiKey: config.get("mcpApiKey") || "",
                mcpConnectionType: config.get("mcpConnectionType") || "stdio",
                mcpStdioCommand: config.get("mcpStdioCommand") || "node",
                mcpStdioArgs: config.get("mcpStdioArgs") || ['-e', 'console.log("MCP Ready"); process.stdin.pipe(process.stdout);'],
                mcpTimeout: config.get("mcpTimeout") || 2000,
                enableStreaming: config.get("enableStreaming") !== false,
                enableFastMode: config.get("enableFastMode") !== false
            },
        });
    }
    async handleTestConnection() {
        try {
            const ollamaAvailable = await this.ollamaClient.isAvailable();
            const mcpConnected = await this.mcpClient.connect();
            let message = "🔍 Connection Test Results:\n\n";
            message += `🤖 Ollama: ${ollamaAvailable ? "✅ Connected" : "❌ Not available"}\n`;
            message += `🔗 MCP Server: ${mcpConnected ? "✅ Connected (STDIO)" : "❌ Not connected"}\n`;
            message += `⚡ Fast Mode: ${vscode.workspace.getConfiguration("replitCopilot").get("enableFastMode") ? "✅ Enabled" : "❌ Disabled"}`;
            this.postMessage({ type: "connectionTest", message });
        }
        catch (error) {
            this.postMessage({ type: "error", message: `Connection test failed: ${error}` });
        }
    }
    async handleRefreshModels() {
        try {
            const models = await this.ollamaClient.getModels();
            this.postMessage({
                type: "modelsRefreshed",
                models: models.length > 0
                    ? models
                    : ["llama3.2:1b", "llama3.2:3b", "llama3.2", "llama3.1", "codellama"],
            });
        }
        catch (error) {
            this.postMessage({ type: "error", message: `Failed to refresh models: ${error}` });
        }
    }
    formatMessage(message) {
        // Format code blocks
        let formatted = message.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, language, code) => {
            return `<pre style="background: #1e293b; color: #10b981; padding: 12px; border-radius: 6px; overflow-x: auto; margin: 8px 0;"><code>${this.escapeHtml(code.trim())}</code></pre>`;
        });
        // Format inline code
        formatted = formatted.replace(/`([^`]+)`/g, '<code style="background: #e5e7eb; color: #374151; padding: 2px 4px; border-radius: 3px; font-size: 0.9em;">$1</code>');
        // Format bold text
        formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong style="font-weight: 600;">$1</strong>');
        // Format italic text
        formatted = formatted.replace(/\*(.*?)\*/g, '<em style="font-style: italic;">$1</em>');
        // Convert line breaks
        formatted = formatted.replace(/\n/g, '<br>');
        return formatted;
    }
    escapeHtml(text) {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
    postMessage(message) {
        if (this._view) {
            this._view.webview.postMessage(message);
        }
    }
    _getHtmlForWebview(webview) {
        // Get proper nonce for security
        const nonce = getNonce();
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}' ${webview.cspSource};">
    <title>Replit Copilot Chat</title>
    <style>
        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
            height: 100vh;
            display: flex;
            flex-direction: column;
            background: #0f172a;
            color: #f8fafc;
            font-size: 14px;
        }
        
        .header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 16px;
            border-bottom: 1px solid #374151;
            background: #1e293b;
        }
        
        .header-left {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        
        .logo {
            width: 16px;
            height: 16px;
            background: linear-gradient(45deg, #3b82f6, #1d4ed8);
            border-radius: 2px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-weight: bold;
            font-size: 10px;
        }
        
        .settings-btn {
            padding: 8px;
            background: none;
            border: none;
            color: #f8fafc;
            cursor: pointer;
            border-radius: 6px;
            transition: background 0.2s;
        }
        
        .settings-btn:hover {
            background: #374151;
        }
        
        .settings-panel {
            background: #1e293b;
            border-bottom: 1px solid #374151;
            padding: 16px;
            display: none;
        }
        
        .settings-panel.visible {
            display: block;
        }
        
        .form-group {
            margin-bottom: 12px;
        }
        
        .form-label {
            display: block;
            margin-bottom: 4px;
            font-size: 12px;
            font-weight: 500;
            color: #d1d5db;
        }
        
        .form-input, .form-select {
            width: 100%;
            padding: 8px 12px;
            background: #374151;
            border: 1px solid #4b5563;
            border-radius: 6px;
            color: #f8fafc;
            font-size: 14px;
        }
        
        .form-input:focus, .form-select:focus {
            outline: none;
            border-color: #3b82f6;
        }
        
        .btn {
            padding: 8px 16px;
            border: none;
            border-radius: 6px;
            font-weight: 500;
            cursor: pointer;
            transition: background 0.2s;
            margin-right: 8px;
            margin-bottom: 8px;
        }
        
        .btn-primary { background: #3b82f6; color: white; }
        .btn-primary:hover { background: #2563eb; }
        
        .btn-success { background: #10b981; color: white; }
        .btn-success:hover { background: #059669; }
        
        .btn-warning { background: #f59e0b; color: white; }
        .btn-warning:hover { background: #d97706; }
        
        .chat-container {
            flex: 1;
            overflow-y: auto;
            background: #0f172a;
        }
        
        .messages {
            padding: 16px;
            min-height: 100%;
        }
        
        .welcome {
            text-align: center;
            color: #6b7280;
            margin-bottom: 24px;
        }
        
        .welcome h3 {
            color: #3b82f6;
            margin-bottom: 8px;
            font-size: 18px;
        }
        
        .message {
            display: flex;
            margin-bottom: 16px;
            animation: slideIn 0.3s ease-out;
        }
        
        .message.user {
            flex-direction: row-reverse;
            margin-left: 32px;
        }
        
        .message.assistant {
            margin-right: 32px;
        }
        
        .avatar {
            width: 32px;
            height: 32px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
            font-size: 12px;
            margin: 0 12px;
        }
        
        .avatar.user {
            background: #059669;
        }
        
        .avatar.assistant {
            background: #3b82f6;
        }
        
        .message-content {
            flex: 1;
            padding: 12px;
            border-radius: 12px;
            word-wrap: break-word;
        }
        
        .message.user .message-content {
            background: #064e3b;
        }
        
        .message.assistant .message-content {
            background: #1e293b;
        }
        
        .input-area {
            border-top: 1px solid #374151;
            background: #1e293b;
            padding: 16px;
        }
        
        .input-row {
            display: flex;
            align-items: flex-end;
            gap: 12px;
        }
        
        .input-wrapper {
            flex: 1;
        }
        
        .chat-input {
            width: 100%;
            min-height: 40px;
            max-height: 120px;
            padding: 12px;
            background: #374151;
            border: 1px solid #4b5563;
            border-radius: 12px;
            color: #f8fafc;
            resize: none;
            font-family: inherit;
            font-size: 14px;
        }
        
        .chat-input:focus {
            outline: none;
            border-color: #3b82f6;
        }
        
        .send-btn {
            padding: 12px 24px;
            background: #3b82f6;
            border: none;
            border-radius: 12px;
            color: white;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s;
        }
        
        .send-btn:hover:not(:disabled) {
            background: #2563eb;
        }
        
        .send-btn:disabled {
            background: #4b5563;
            cursor: not-allowed;
        }
        
        .typing {
            display: flex;
            align-items: center;
            gap: 8px;
            color: #6b7280;
        }
        
        .typing-dots {
            display: flex;
            gap: 2px;
        }
        
        .typing-dot {
            width: 4px;
            height: 4px;
            background: #6b7280;
            border-radius: 50%;
            animation: bounce 1.5s infinite;
        }
        
        .typing-dot:nth-child(2) { animation-delay: 0.1s; }
        .typing-dot:nth-child(3) { animation-delay: 0.2s; }
        
        @keyframes slideIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }
        
        @keyframes bounce {
            0%, 60%, 100% { transform: translateY(0); }
            30% { transform: translateY(-6px); }
        }
        
        .cursor {
            animation: blink 1s infinite;
        }
        
        @keyframes blink {
            0%, 50% { opacity: 1; }
            51%, 100% { opacity: 0; }
        }
    </style>
</head>
<body>
    <!-- Header -->
    <div class="header">
        <div class="header-left">
            <div class="logo">R</div>
            <span style="font-weight: 600;">Replit Copilot</span>
            <span id="status" style="font-size: 12px; color: #10b981;">⚡ Ready</span>
        </div>
        <button class="settings-btn" onclick="toggleSettings()">
            <svg width="16" height="16" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clip-rule="evenodd"></path>
            </svg>
        </button>
    </div>

    <!-- Settings Panel -->
    <div id="settingsPanel" class="settings-panel">
        <div class="form-group">
            <label class="form-label">Model</label>
            <select id="modelSelect" class="form-select">
                <option value="llama3.2:1b">Llama-3.2:1b (Fast)</option>
                <option value="llama3.2:3b">Llama-3.2:3b</option>
                <option value="codellama">CodeLlama</option>
            </select>
        </div>
        
        <div style="margin: 16px 0;">
            <button class="btn btn-primary" onclick="saveSettings()">💾 Save</button>
            <button class="btn btn-success" onclick="testConnection()">🔍 Test</button>
            <button class="btn btn-warning" onclick="refreshModels()">↻ Refresh</button>
        </div>
    </div>

    <!-- Chat Container -->
    <div class="chat-container">
        <div class="messages" id="messages">
            <div class="welcome">
                <h3>⚡ Replit Copilot</h3>
                <p>Fast AI-powered coding assistant.<br>Ask me anything about code!</p>
            </div>
        </div>
    </div>

    <!-- Input Area -->
    <div class="input-area">
        <div class="input-row">
            <div class="input-wrapper">
                <textarea 
                    id="chatInput" 
                    class="chat-input"
                    placeholder="Ask about code, debugging, or anything..."
                    rows="1"
                ></textarea>
            </div>
            <button id="sendBtn" class="send-btn">Send</button>
        </div>
    </div>

    <script nonce="${nonce}">
        console.log('[WEBVIEW] Script starting...');
        
        let vscode;
        try {
            vscode = acquireVsCodeApi();
            console.log('[WEBVIEW] VS Code API acquired successfully');
        } catch (error) {
            console.error('[WEBVIEW] Failed to acquire VS Code API:', error);
        }

        let isThinking = false;
        let currentMessage = null;

        // Initialize the extension
        function init() {
            console.log('[WEBVIEW] Initializing...');
            
            // Setup event listeners
            const chatInput = document.getElementById('chatInput');
            const sendBtn = document.getElementById('sendBtn');
            
            if (chatInput && sendBtn) {
                console.log('[WEBVIEW] Elements found, setting up event listeners');
                
                chatInput.addEventListener('keydown', handleKeyPress);
                sendBtn.addEventListener('click', sendMessage);
                
                // Auto-resize textarea
                chatInput.addEventListener('input', function() {
                    this.style.height = 'auto';
                    this.style.height = Math.min(this.scrollHeight, 120) + 'px';
                });
                
                // Focus input
                setTimeout(() => chatInput.focus(), 100);
            } else {
                console.error('[WEBVIEW] Could not find chat elements!');
            }
            
            // Tell backend we're ready
            if (vscode) {
                vscode.postMessage({ type: 'ready' });
                vscode.postMessage({ type: 'getSettings' });
            }
        }

        function handleKeyPress(event) {
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                sendMessage();
            }
        }

        function sendMessage() {
            console.log('[WEBVIEW] Send message clicked');
            
            const input = document.getElementById('chatInput');
            const message = input.value.trim();
            
            if (!message || isThinking) {
                console.log('[WEBVIEW] No message or thinking, skipping');
                return;
            }
            
            console.log('[WEBVIEW] Sending message:', message);
            
            input.value = '';
            input.style.height = 'auto';
            
            // Add user message immediately
            addMessage(message, true);
            
            if (vscode) {
                vscode.postMessage({
                    type: 'sendMessage',
                    text: message
                });
            } else {
                console.error('[WEBVIEW] VS Code API not available!');
            }
        }

        function addMessage(content, isUser, timestamp = null) {
            console.log('[WEBVIEW] Adding message:', content, 'isUser:', isUser);
            
            const messages = document.getElementById('messages');
            const messageDiv = document.createElement('div');
            messageDiv.className = \`message \${isUser ? 'user' : 'assistant'}\`;
            
            messageDiv.innerHTML = \`
                <div class="avatar \${isUser ? 'user' : 'assistant'}">\${isUser ? 'U' : 'R'}</div>
                <div class="message-content">
                    <div>\${content}</div>
                    \${timestamp ? \`<div style="font-size: 11px; color: #6b7280; margin-top: 4px;">\${timestamp}</div>\` : ''}
                </div>
            \`;
            
            messages.appendChild(messageDiv);
            scrollToBottom();
        }

        function showTyping() {
            const messages = document.getElementById('messages');
            const typingDiv = document.createElement('div');
            typingDiv.className = 'message assistant typing-message';
            typingDiv.innerHTML = \`
                <div class="avatar assistant">R</div>
                <div class="message-content">
                    <div class="typing">
                        <span>Thinking</span>
                        <div class="typing-dots">
                            <div class="typing-dot"></div>
                            <div class="typing-dot"></div>
                            <div class="typing-dot"></div>
                        </div>
                    </div>
                </div>
            \`;
            messages.appendChild(typingDiv);
            scrollToBottom();
        }

        function hideTyping() {
            const typingMsg = document.querySelector('.typing-message');
            if (typingMsg) {
                typingMsg.remove();
            }
        }

        function scrollToBottom() {
            const container = document.querySelector('.chat-container');
            setTimeout(() => {
                container.scrollTop = container.scrollHeight;
            }, 10);
        }

        function toggleSettings() {
            console.log('[WEBVIEW] Toggle settings clicked');
            const panel = document.getElementById('settingsPanel');
            panel.classList.toggle('visible');
            
            if (panel.classList.contains('visible') && vscode) {
                vscode.postMessage({ type: 'getSettings' });
            }
        }

        function saveSettings() {
            console.log('[WEBVIEW] Save settings clicked');
            
            const settings = {
                model: document.getElementById('modelSelect')?.value || 'llama3.2:1b'
            };
            
            if (vscode) {
                vscode.postMessage({ type: 'saveSettings', settings });
            }
        }

        function testConnection() {
            console.log('[WEBVIEW] Test connection clicked');
            
            if (vscode) {
                vscode.postMessage({ type: 'testConnection' });
            }
        }

        function refreshModels() {
            console.log('[WEBVIEW] Refresh models clicked');
            
            if (vscode) {
                vscode.postMessage({ type: 'refreshModels' });
            }
        }

        // Message handler
        window.addEventListener('message', event => {
            const message = event.data;
            console.log('[WEBVIEW] Received message:', message);
            
            const sendBtn = document.getElementById('sendBtn');
            
            switch (message.type) {
                case 'userMessage':
                    // Already added in sendMessage
                    break;
                    
                case 'startTyping':
                    showTyping();
                    isThinking = true;
                    if (sendBtn) sendBtn.disabled = true;
                    break;
                    
                case 'assistantMessage':
                    hideTyping();
                    addMessage(message.formatted || message.message, false);
                    isThinking = false;
                    if (sendBtn) sendBtn.disabled = false;
                    break;
                    
                case 'error':
                    hideTyping();
                    addMessage('❌ ' + message.message, false);
                    isThinking = false;
                    if (sendBtn) sendBtn.disabled = false;
                    break;
                    
                case 'settingsLoaded':
                    const modelSelect = document.getElementById('modelSelect');
                    if (modelSelect && message.settings) {
                        modelSelect.value = message.settings.model || 'llama3.2:1b';
                    }
                    break;
                    
                case 'settingsSaved':
                    addMessage(message.message, false);
                    document.getElementById('status').textContent = '⚡ Ready';
                    break;
                    
                case 'connectionTest':
                    addMessage(message.message, false);
                    break;
                    
                case 'modelsRefreshed':
                    // Update model dropdown
                    const select = document.getElementById('modelSelect');
                    if (select && message.models) {
                        const currentValue = select.value;
                        select.innerHTML = '';
                        message.models.forEach(model => {
                            const option = document.createElement('option');
                            option.value = model;
                            option.textContent = model;
                            select.appendChild(option);
                        });
                        if (message.models.includes(currentValue)) {
                            select.value = currentValue;
                        }
                    }
                    break;
            }
        });

        // Initialize when DOM is loaded
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init);
        } else {
            init();
        }
        
        console.log('[WEBVIEW] Script setup complete');
    </script>
</body>
</html>`;
    }
}
exports.ChatProvider = ChatProvider;
ChatProvider.viewType = 'replitCopilotChat';
function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
//# sourceMappingURL=chatProvider.js.map