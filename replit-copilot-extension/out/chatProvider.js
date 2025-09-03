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
        console.log('[OLLAMA-CHAT] Webview is being resolved');
        this._view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };
        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
        // Handle messages from the webview
        webviewView.webview.onDidReceiveMessage(async (message) => {
            console.log('[OLLAMA-CHAT] Backend received message:', message);
            switch (message.type) {
                case 'ready':
                    console.log('[OLLAMA-CHAT] Webview is ready!');
                    break;
                case 'sendMessage':
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
                case 'refreshMcpTools':
                    await this.handleRefreshMcpTools();
                    break;
                case 'loadMcpConfig':
                    await this.handleLoadMcpConfig();
                    break;
            }
        }, undefined, []);
    }
    async handleChatMessage(message) {
        console.log('[OLLAMA-CHAT] Processing chat message:', message);
        try {
            // Add user message to chat immediately
            this.postMessage({
                type: 'userMessage',
                message: message
            });
            // Check for file operations first
            const fileOperation = await this.fileOpsManager.detectFileOperation(message);
            if (fileOperation) {
                console.log('[OLLAMA-CHAT] Detected file operation:', fileOperation);
                this.postMessage({ type: 'startTyping' });
                const result = await this.fileOpsManager.executeFileOperation(fileOperation);
                this.postMessage({
                    type: 'assistantMessage',
                    message: result,
                    formatted: this.formatMessage(result)
                });
                return;
            }
            // Start typing indicator
            this.postMessage({ type: 'startTyping' });
            // Add workspace context to the message
            const workspaceContext = await this.getWorkspaceContext();
            const enhancedMessage = `${workspaceContext}\n\nUser Query: ${message}`;
            // Get fast response from Ollama
            let fullResponse = '';
            const startTime = Date.now();
            const response = await this.ollamaClient.chat(enhancedMessage, (token) => {
                fullResponse += token;
                this.postMessage({
                    type: 'streamToken',
                    token: token,
                    fullMessage: fullResponse
                });
            }, true);
            const responseTime = Date.now() - startTime;
            console.log(`[OLLAMA-CHAT] Response time: ${responseTime}ms`);
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
            await config.update("mcpConfigFile", settings.mcpConfigFile, vscode.ConfigurationTarget.Global);
            this.ollamaClient.updateConfiguration();
            this.mcpClient.updateConfiguration();
            this.postMessage({ type: "settingsSaved", message: "⚡ Settings saved!" });
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
                mcpConfigFile: config.get("mcpConfigFile") || "",
                enableFileOperations: config.get("enableFileOperations") !== false
            },
        });
    }
    async handleTestConnection() {
        try {
            const ollamaAvailable = await this.ollamaClient.isAvailable();
            const mcpConnected = await this.mcpClient.connectAll();
            let message = "🔍 Connection Test Results:\n\n";
            message += `🤖 Ollama: ${ollamaAvailable ? "✅ Connected" : "❌ Not available"}\n`;
            const connectedServers = this.mcpClient.getConnectedServers();
            message += `🔗 MCP Servers: ${connectedServers.length > 0 ? `✅ Connected (${connectedServers.join(', ')})` : "❌ Not connected"}\n`;
            if (this.mcpClient.hasConfig()) {
                message += `📄 Config: ${this.mcpClient.getConfigPath()}\n`;
            }
            const tools = this.mcpClient.getAllTools();
            message += `🛠️ Available Tools: ${tools.length}\n`;
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
                models: models.length > 0 ? models : ["llama3.2:1b", "llama3.2:3b", "codellama"],
            });
        }
        catch (error) {
            this.postMessage({ type: "error", message: `Failed to refresh models: ${error}` });
        }
    }
    async handleRefreshMcpTools() {
        try {
            const connected = await this.mcpClient.connectAll();
            const tools = this.mcpClient.getAllTools();
            const servers = this.mcpClient.getConnectedServers();
            this.postMessage({
                type: "mcpToolsRefreshed",
                tools: tools,
                servers: servers,
                connected: connected
            });
        }
        catch (error) {
            this.postMessage({ type: "error", message: `Failed to refresh MCP tools: ${error}` });
        }
    }
    async handleLoadMcpConfig() {
        try {
            const hasConfig = this.mcpClient.hasConfig();
            const configPath = this.mcpClient.getConfigPath();
            this.postMessage({
                type: "mcpConfigLoaded",
                hasConfig: hasConfig,
                configPath: configPath,
                message: hasConfig ? `📄 MCP config loaded from: ${configPath}` : "📄 No MCP config file found. Add path in settings."
            });
        }
        catch (error) {
            this.postMessage({ type: "error", message: `Failed to load MCP config: ${error}` });
        }
    }
    async getWorkspaceContext() {
        try {
            const workspaceOverview = await this.fileOpsManager.getWorkspaceOverview();
            const workspaceRoot = this.fileOpsManager.getCurrentWorkspace();
            return `WORKSPACE CONTEXT:\n${workspaceOverview}\n\nCurrent workspace: ${workspaceRoot}\n\nAvailable file operations: read, write, create, delete, list, search\nYou can help with file management through natural language commands.`;
        }
        catch (error) {
            return `WORKSPACE CONTEXT: Error loading workspace context: ${error}`;
        }
    }
    formatMessage(message) {
        let formatted = message.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, language, code) => {
            return `<pre style="background: #1e293b; color: #10b981; padding: 12px; border-radius: 6px; overflow-x: auto; margin: 8px 0;"><code>${this.escapeHtml(code.trim())}</code></pre>`;
        });
        formatted = formatted.replace(/`([^`]+)`/g, '<code style="background: #e5e7eb; color: #374151; padding: 2px 4px; border-radius: 3px; font-size: 0.9em;">$1</code>');
        formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong style="font-weight: 600;">$1</strong>');
        formatted = formatted.replace(/\*(.*?)\*/g, '<em style="font-style: italic;">$1</em>');
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
        const nonce = getNonce();
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}' ${webview.cspSource};">
    <title>Ollama Chat</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif; height: 100vh; display: flex; flex-direction: column; background: #0f172a; color: #f8fafc; font-size: 14px; }
        .header { display: flex; align-items: center; justify-content: space-between; padding: 16px; border-bottom: 1px solid #374151; background: #1e293b; }
        .header-left { display: flex; align-items: center; gap: 8px; }
        .logo { width: 16px; height: 16px; background: linear-gradient(45deg, #3b82f6, #1d4ed8); border-radius: 2px; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 10px; }
        .settings-btn { padding: 8px; background: none; border: none; color: #f8fafc; cursor: pointer; border-radius: 6px; transition: background 0.2s; }
        .settings-btn:hover { background: #374151; }
        .settings-panel { background: #1e293b; border-bottom: 1px solid #374151; padding: 16px; display: none; }
        .settings-panel.visible { display: block; }
        .form-group { margin-bottom: 12px; }
        .form-label { display: block; margin-bottom: 4px; font-size: 12px; font-weight: 500; color: #d1d5db; }
        .form-input, .form-select { width: 100%; padding: 8px 12px; background: #374151; border: 1px solid #4b5563; border-radius: 6px; color: #f8fafc; font-size: 14px; }
        .form-input:focus, .form-select:focus { outline: none; border-color: #3b82f6; }
        .btn { padding: 8px 16px; border: none; border-radius: 6px; font-weight: 500; cursor: pointer; transition: background 0.2s; margin-right: 8px; margin-bottom: 8px; }
        .btn-primary { background: #3b82f6; color: white; } .btn-primary:hover { background: #2563eb; }
        .btn-success { background: #10b981; color: white; } .btn-success:hover { background: #059669; }
        .btn-warning { background: #f59e0b; color: white; } .btn-warning:hover { background: #d97706; }
        .chat-container { flex: 1; overflow-y: auto; background: #0f172a; }
        .messages { padding: 16px; min-height: 100%; }
        .welcome { text-align: center; color: #6b7280; margin-bottom: 24px; }
        .welcome h3 { color: #3b82f6; margin-bottom: 8px; font-size: 18px; }
        .message { display: flex; margin-bottom: 16px; animation: slideIn 0.3s ease-out; }
        .message.user { flex-direction: row-reverse; margin-left: 32px; }
        .message.assistant { margin-right: 32px; }
        .avatar { width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 12px; margin: 0 12px; }
        .avatar.user { background: #059669; }
        .avatar.assistant { background: #3b82f6; }
        .message-content { flex: 1; padding: 12px; border-radius: 12px; word-wrap: break-word; }
        .message.user .message-content { background: #064e3b; }
        .message.assistant .message-content { background: #1e293b; }
        .input-area { border-top: 1px solid #374151; background: #1e293b; padding: 16px; }
        .input-row { display: flex; align-items: flex-end; gap: 12px; }
        .input-wrapper { flex: 1; }
        .chat-input { width: 100%; min-height: 40px; max-height: 120px; padding: 12px; background: #374151; border: 1px solid #4b5563; border-radius: 12px; color: #f8fafc; resize: none; font-family: inherit; font-size: 14px; }
        .chat-input:focus { outline: none; border-color: #3b82f6; }
        .send-btn { padding: 12px 24px; background: #3b82f6; border: none; border-radius: 12px; color: white; font-weight: 500; cursor: pointer; transition: all 0.2s; }
        .send-btn:hover:not(:disabled) { background: #2563eb; }
        .send-btn:disabled { background: #4b5563; cursor: not-allowed; }
        .typing { display: flex; align-items: center; gap: 8px; color: #6b7280; }
        .typing-dots { display: flex; gap: 2px; }
        .typing-dot { width: 4px; height: 4px; background: #6b7280; border-radius: 50%; animation: bounce 1.5s infinite; }
        .typing-dot:nth-child(2) { animation-delay: 0.1s; }
        .typing-dot:nth-child(3) { animation-delay: 0.2s; }
        @keyframes slideIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes bounce { 0%, 60%, 100% { transform: translateY(0); } 30% { transform: translateY(-6px); } }
    </style>
</head>
<body>
    <div class="header">
        <div class="header-left">
            <div class="logo">O</div>
            <span style="font-weight: 600;">Ollama Chat</span>
            <span id="status" style="font-size: 12px; color: #10b981;">⚡ Ready</span>
        </div>
        <button class="settings-btn" onclick="toggleSettings()">⚙️</button>
    </div>

    <div id="settingsPanel" class="settings-panel">
        <div class="form-group">
            <label class="form-label">Model</label>
            <select id="modelSelect" class="form-select">
                <option value="llama3.2:1b">Llama-3.2:1b (Fast)</option>
                <option value="llama3.2:3b">Llama-3.2:3b</option>
                <option value="codellama">CodeLlama</option>
            </select>
        </div>
        
        <div class="form-group">
            <label class="form-label">MCP Config File Path</label>
            <input type="text" id="mcpConfigFile" class="form-input" placeholder="/path/to/mcp.json">
        </div>
        
        <div style="margin: 16px 0;">
            <button class="btn btn-primary" onclick="saveSettings()">💾 Save</button>
            <button class="btn btn-success" onclick="testConnection()">🔍 Test</button>
            <button class="btn btn-warning" onclick="refreshMcpTools()">🛠️ MCP Tools</button>
        </div>
    </div>

    <div class="chat-container">
        <div class="messages" id="messages">
            <div class="welcome">
                <h3>⚡ Ollama Chat</h3>
                <p>Fast AI assistant with file operations.<br>Try: "create file test.js", "list files", "read package.json"</p>
            </div>
        </div>
    </div>

    <div class="input-area">
        <div class="input-row">
            <div class="input-wrapper">
                <textarea id="chatInput" class="chat-input" placeholder="Ask about code, files, or anything..." rows="1"></textarea>
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

        function init() {
            console.log('[WEBVIEW] Initializing...');
            
            const chatInput = document.getElementById('chatInput');
            const sendBtn = document.getElementById('sendBtn');
            const settingsBtn = document.querySelector('.settings-btn');
            
            if (chatInput && sendBtn) {
                chatInput.addEventListener('keydown', handleKeyPress);
                sendBtn.addEventListener('click', sendMessage);
                
                chatInput.addEventListener('input', function() {
                    this.style.height = 'auto';
                    this.style.height = Math.min(this.scrollHeight, 120) + 'px';
                });
                
                setTimeout(() => chatInput.focus(), 100);
            }
            
            if (settingsBtn) {
                settingsBtn.addEventListener('click', toggleSettings);
            }
            
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
            const input = document.getElementById('chatInput');
            const message = input.value.trim();
            
            if (!message || isThinking) return;
            
            input.value = '';
            input.style.height = 'auto';
            
            addMessage(message, true);
            
            if (vscode) {
                vscode.postMessage({ type: 'sendMessage', text: message });
            }
        }

        function addMessage(content, isUser) {
            const messages = document.getElementById('messages');
            const messageDiv = document.createElement('div');
            messageDiv.className = \`message \${isUser ? 'user' : 'assistant'}\`;
            
            messageDiv.innerHTML = \`
                <div class="avatar \${isUser ? 'user' : 'assistant'}">\${isUser ? 'U' : 'O'}</div>
                <div class="message-content"><div>\${content}</div></div>
            \`;
            
            messages.appendChild(messageDiv);
            scrollToBottom();
        }

        function showTyping() {
            const messages = document.getElementById('messages');
            const typingDiv = document.createElement('div');
            typingDiv.className = 'message assistant typing-message';
            typingDiv.innerHTML = \`
                <div class="avatar assistant">O</div>
                <div class="message-content">
                    <div class="typing">
                        <span>⚡ Processing</span>
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
            if (typingMsg) typingMsg.remove();
        }

        function scrollToBottom() {
            const container = document.querySelector('.chat-container');
            setTimeout(() => { container.scrollTop = container.scrollHeight; }, 10);
        }

        function toggleSettings() {
            const panel = document.getElementById('settingsPanel');
            panel.classList.toggle('visible');
            if (panel.classList.contains('visible') && vscode) {
                vscode.postMessage({ type: 'getSettings' });
            }
        }

        function saveSettings() {
            const settings = {
                model: document.getElementById('modelSelect')?.value || 'llama3.2:1b',
                mcpConfigFile: document.getElementById('mcpConfigFile')?.value || ''
            };
            if (vscode) {
                vscode.postMessage({ type: 'saveSettings', settings });
            }
        }

        function testConnection() {
            if (vscode) {
                vscode.postMessage({ type: 'testConnection' });
            }
        }

        function refreshMcpTools() {
            if (vscode) {
                vscode.postMessage({ type: 'refreshMcpTools' });
            }
        }

        // Message handler
        window.addEventListener('message', event => {
            const message = event.data;
            const sendBtn = document.getElementById('sendBtn');
            
            switch (message.type) {
                case 'startTyping':
                    showTyping();
                    isThinking = true;
                    if (sendBtn) sendBtn.disabled = true;
                    document.getElementById('status').textContent = '🤔 Thinking...';
                    break;
                    
                case 'assistantMessage':
                    hideTyping();
                    addMessage(message.formatted || message.message, false);
                    isThinking = false;
                    if (sendBtn) sendBtn.disabled = false;
                    document.getElementById('status').textContent = '⚡ Ready';
                    break;
                    
                case 'error':
                    hideTyping();
                    addMessage('❌ ' + message.message, false);
                    isThinking = false;
                    if (sendBtn) sendBtn.disabled = false;
                    break;
                    
                case 'settingsLoaded':
                    if (message.settings) {
                        const modelSelect = document.getElementById('modelSelect');
                        const mcpConfigFile = document.getElementById('mcpConfigFile');
                        if (modelSelect) modelSelect.value = message.settings.model || 'llama3.2:1b';
                        if (mcpConfigFile) mcpConfigFile.value = message.settings.mcpConfigFile || '';
                    }
                    break;
                    
                case 'settingsSaved':
                    addMessage(message.message, false);
                    break;
                    
                case 'connectionTest':
                    addMessage(message.message, false);
                    break;
                    
                case 'mcpToolsRefreshed':
                    let toolsMsg = \`🛠️ **MCP Tools Refreshed:**\\n\\n\`;
                    if (message.connected && message.tools.length > 0) {
                        toolsMsg += \`**Connected Servers:** \${message.servers.join(', ')}\\n\`;
                        toolsMsg += \`**Available Tools:**\\n\`;
                        message.tools.forEach(tool => {
                            toolsMsg += \`• \${tool.name}: \${tool.description}\\n\`;
                        });
                    } else {
                        toolsMsg += \`No MCP servers connected. Check your config file.\`;
                    }
                    addMessage(toolsMsg, false);
                    break;
            }
        });

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init);
        } else {
            init();
        }
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