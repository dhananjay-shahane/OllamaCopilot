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
            return `<pre class="bg-gray-800 text-green-400 p-3 rounded-lg overflow-x-auto"><code class="language-${language || 'text'}">${this.escapeHtml(code.trim())}</code></pre>`;
        });
        // Format inline code
        formatted = formatted.replace(/`([^`]+)`/g, '<code class="bg-gray-200 px-1 rounded text-sm">$1</code>');
        // Format bold text
        formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold">$1</strong>');
        // Format italic text
        formatted = formatted.replace(/\*(.*?)\*/g, '<em class="italic">$1</em>');
        // Convert line breaks
        formatted = formatted.replace(/\n/g, '<br>');
        return formatted;
    }
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
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
    <title>Replit Copilot Chat</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script>
        tailwind.config = {
            theme: {
                extend: {
                    colors: {
                        'vscode-bg': 'var(--vscode-sideBar-background)',
                        'vscode-text': 'var(--vscode-foreground)',
                        'vscode-border': 'var(--vscode-panel-border)',
                        'vscode-input': 'var(--vscode-input-background)',
                        'vscode-button': 'var(--vscode-button-background)',
                    }
                }
            }
        }
    </script>
    <style>
        :root {
            --copilot-primary: #0969da;
            --copilot-primary-hover: #0860ca;
        }
        
        .typing-cursor {
            animation: blink 1s infinite;
        }
        
        @keyframes blink {
            0%, 50% { opacity: 1; }
            51%, 100% { opacity: 0; }
        }
        
        .message-slide-in {
            animation: slideIn 0.3s ease-out;
        }
        
        @keyframes slideIn {
            from {
                opacity: 0;
                transform: translateY(10px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }
        
        .typing-dots {
            animation: pulse 1.5s infinite;
        }
    </style>
</head>
<body class="h-screen bg-gray-900 text-white flex flex-col font-mono text-sm">
    <!-- Header with Settings -->
    <div class="flex items-center justify-between p-4 border-b border-gray-700 bg-gray-800">
        <div class="flex items-center space-x-2">
            <div class="w-4 h-4 bg-gradient-to-r from-blue-500 to-blue-600 rounded-sm flex items-center justify-center text-white text-xs font-bold">R</div>
            <span class="font-semibold">Replit Copilot</span>
            <span class="text-xs text-green-400" id="statusIndicator">⚡ Fast Mode</span>
        </div>
        <button onclick="toggleSettings()" class="p-2 hover:bg-gray-700 rounded-md transition-colors duration-200">
            <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clip-rule="evenodd"></path>
            </svg>
        </button>
    </div>

    <!-- Settings Panel -->
    <div id="settingsPanel" class="hidden bg-gray-800 border-b border-gray-700 p-4 space-y-4">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <!-- Model Selection -->
            <div class="space-y-2">
                <label class="block text-sm font-medium text-gray-300">Model</label>
                <select id="modelSelect" class="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="llama3.2:1b">Llama-3.2:1b (Fast)</option>
                    <option value="llama3.2:3b">Llama-3.2:3b</option>
                    <option value="llama3.2">Llama-3.2</option>
                    <option value="llama3.1">Llama-3.1</option>
                    <option value="codellama">CodeLlama</option>
                </select>
            </div>

            <!-- MCP Connection Type -->
            <div class="space-y-2">
                <label class="block text-sm font-medium text-gray-300">MCP Connection</label>
                <select id="mcpConnectionType" onchange="updateMcpSettings()" class="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="stdio">STDIO (Fastest)</option>
                    <option value="http">HTTP Server</option>
                    <option value="websocket">WebSocket</option>
                </select>
            </div>
        </div>

        <!-- STDIO Configuration -->
        <div id="mcpStdioSection" class="space-y-3 bg-gray-700 p-3 rounded-lg">
            <h4 class="text-sm font-medium text-blue-400">STDIO Configuration</h4>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                    <label class="block text-xs text-gray-300 mb-1">Command</label>
                    <input type="text" id="mcpStdioCommand" value="node" class="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500">
                </div>
                <div>
                    <label class="block text-xs text-gray-300 mb-1">Timeout (ms)</label>
                    <input type="number" id="mcpTimeout" value="2000" min="1000" max="10000" class="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500">
                </div>
            </div>
            <div>
                <label class="block text-xs text-gray-300 mb-1">Args (JSON Array)</label>
                <textarea id="mcpStdioArgs" rows="2" class="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500">[\"-e\", \"console.log('MCP Ready'); process.stdin.pipe(process.stdout);\"]</textarea>
            </div>
        </div>

        <!-- Server Configuration (Hidden by default) -->
        <div id="mcpServerSection" class="hidden space-y-3 bg-gray-700 p-3 rounded-lg">
            <h4 class="text-sm font-medium text-blue-400">Server Configuration</h4>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                    <label class="block text-xs text-gray-300 mb-1">Server URL</label>
                    <input type="text" id="mcpServerUrl" placeholder="ws://localhost:8080" class="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500">
                </div>
                <div>
                    <label class="block text-xs text-gray-300 mb-1">API Key</label>
                    <input type="password" id="mcpApiKey" placeholder="Optional..." class="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500">
                </div>
            </div>
        </div>

        <!-- Feature Toggles -->
        <div class="flex flex-wrap gap-4">
            <label class="flex items-center space-x-2 text-sm">
                <input type="checkbox" id="enableStreaming" checked class="rounded bg-gray-700 border-gray-600 text-blue-500 focus:ring-blue-500">
                <span class="text-gray-300">ChatGPT-style streaming</span>
            </label>
            <label class="flex items-center space-x-2 text-sm">
                <input type="checkbox" id="enableFastMode" checked class="rounded bg-gray-700 border-gray-600 text-blue-500 focus:ring-blue-500">
                <span class="text-gray-300">Fast mode (2s timeouts)</span>
            </label>
        </div>

        <!-- Action Buttons -->
        <div class="flex flex-wrap gap-2">
            <button onclick="saveSettings()" class="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-sm font-medium transition-colors duration-200">💾 Save</button>
            <button onclick="testConnection()" class="px-3 py-1 bg-green-600 hover:bg-green-700 rounded text-sm font-medium transition-colors duration-200">🔍 Test</button>
            <button onclick="refreshModels()" class="px-3 py-1 bg-yellow-600 hover:bg-yellow-700 rounded text-sm font-medium transition-colors duration-200">↻ Refresh</button>
            <button onclick="resetToDefaults()" class="px-3 py-1 bg-gray-600 hover:bg-gray-700 rounded text-sm font-medium transition-colors duration-200">🔄 Reset</button>
        </div>
    </div>

    <!-- Chat Container -->
    <div id="chatContainer" class="flex-1 overflow-y-auto bg-gray-900">
        <div id="messagesWrapper" class="p-4 space-y-4 min-h-full">
            <div class="text-center text-gray-400 text-sm message-slide-in">
                <div class="text-lg font-semibold text-blue-400 mb-2">⚡ Replit Copilot</div>
                <div>Fast AI-powered coding assistant with MCP STDIO integration.<br>Ask me anything about code, and I'll respond quickly!</div>
            </div>
        </div>
    </div>

    <!-- Input Area -->
    <div class="border-t border-gray-700 bg-gray-800 p-4">
        <div class="flex items-end space-x-3">
            <div class="flex-1 relative">
                <textarea 
                    id="chatInput" 
                    placeholder="Ask about code, debugging, or anything..." 
                    rows="1"
                    class="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    onkeydown="handleKeyPress(event)"
                ></textarea>
            </div>
            <button 
                id="sendButton" 
                onclick="sendMessage()" 
                class="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-medium transition-colors duration-200"
            >
                Send
            </button>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        let isThinking = false;
        let currentStreamingMessage = null;

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
            
            vscode.postMessage({
                type: 'sendMessage',
                text: message
            });
        }

        function addMessage(content, isUser, timestamp = null) {
            const wrapper = document.getElementById('messagesWrapper');
            const messageDiv = document.createElement('div');
            messageDiv.className = \`message-slide-in \${isUser ? 'ml-8' : 'mr-8'}\`;
            
            messageDiv.innerHTML = \`
                <div class="flex items-start space-x-3 \${isUser ? 'flex-row-reverse space-x-reverse' : ''}">
                    <div class="w-8 h-8 rounded-full \${isUser ? 'bg-green-600' : 'bg-blue-600'} flex items-center justify-center text-white text-sm font-bold">
                        \${isUser ? 'U' : 'R'}
                    </div>
                    <div class="flex-1 \${isUser ? 'bg-green-800' : 'bg-gray-800'} rounded-lg p-3">
                        <div class="text-sm">\${content}</div>
                        \${timestamp ? \`<div class="text-xs text-gray-400 mt-1">\${timestamp}</div>\` : ''}
                    </div>
                </div>
            \`;
            
            wrapper.appendChild(messageDiv);
            scrollToBottom();
        }

        function showTypingIndicator() {
            if (currentStreamingMessage) return;
            
            const wrapper = document.getElementById('messagesWrapper');
            const typingDiv = document.createElement('div');
            typingDiv.className = 'typing-message message-slide-in mr-8';
            typingDiv.innerHTML = \`
                <div class="flex items-start space-x-3">
                    <div class="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-bold">R</div>
                    <div class="flex-1 bg-gray-800 rounded-lg p-3">
                        <div class="flex items-center space-x-2 text-sm text-gray-400">
                            <span>Thinking</span>
                            <div class="flex space-x-1 typing-dots">
                                <div class="w-1 h-1 bg-gray-400 rounded-full animate-bounce"></div>
                                <div class="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style="animation-delay: 0.1s"></div>
                                <div class="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style="animation-delay: 0.2s"></div>
                            </div>
                        </div>
                    </div>
                </div>
            \`;
            
            wrapper.appendChild(typingDiv);
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
                hideTypingIndicator();
                
                const wrapper = document.getElementById('messagesWrapper');
                currentStreamingMessage = document.createElement('div');
                currentStreamingMessage.className = 'streaming-message message-slide-in mr-8';
                currentStreamingMessage.innerHTML = \`
                    <div class="flex items-start space-x-3">
                        <div class="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-bold">R</div>
                        <div class="flex-1 bg-gray-800 rounded-lg p-3">
                            <div class="text-sm content-area"></div>
                        </div>
                    </div>
                \`;
                wrapper.appendChild(currentStreamingMessage);
            }

            const contentDiv = currentStreamingMessage.querySelector('.content-area');
            
            // ChatGPT-style character-by-character typing effect
            if (document.getElementById('enableStreaming')?.checked) {
                const currentText = contentDiv.textContent || '';
                const newText = fullMessage;
                
                if (newText.length > currentText.length) {
                    const nextChar = newText[currentText.length];
                    contentDiv.innerHTML = newText.substring(0, currentText.length + 1) + '<span class="typing-cursor text-blue-400">▋</span>';
                    
                    // Continue typing with delay
                    setTimeout(() => {
                        if (contentDiv && newText.length > currentText.length + 1) {
                            contentDiv.innerHTML = newText.substring(0, currentText.length + 2) + '<span class="typing-cursor text-blue-400">▋</span>';
                        }
                    }, 50); // Fast typing speed
                }
            } else {
                contentDiv.innerHTML = fullMessage + '<span class="typing-cursor text-blue-400">▋</span>';
            }
            
            scrollToBottom();
        }

        function finalizeStreamingMessage(finalMessage, formattedMessage) {
            if (currentStreamingMessage) {
                const contentDiv = currentStreamingMessage.querySelector('.content-area');
                contentDiv.innerHTML = formattedMessage || finalMessage;
                currentStreamingMessage.classList.remove('streaming-message');
                currentStreamingMessage = null;
            }
            scrollToBottom();
        }

        function scrollToBottom() {
            const container = document.getElementById('chatContainer');
            setTimeout(() => {
                container.scrollTop = container.scrollHeight;
            }, 50);
        }

        function toggleSettings() {
            const panel = document.getElementById('settingsPanel');
            panel.classList.toggle('hidden');
            if (!panel.classList.contains('hidden')) {
                vscode.postMessage({ type: 'getSettings' });
            }
        }

        function updateMcpSettings() {
            const connectionType = document.getElementById('mcpConnectionType').value;
            const stdioSection = document.getElementById('mcpStdioSection');
            const serverSection = document.getElementById('mcpServerSection');
            
            if (connectionType === 'stdio') {
                stdioSection.classList.remove('hidden');
                serverSection.classList.add('hidden');
            } else {
                stdioSection.classList.add('hidden');
                serverSection.classList.remove('hidden');
            }
        }

        function saveSettings() {
            const settings = {
                model: document.getElementById('modelSelect').value,
                mcpConnectionType: document.getElementById('mcpConnectionType').value,
                mcpStdioCommand: document.getElementById('mcpStdioCommand').value,
                mcpStdioArgs: JSON.parse(document.getElementById('mcpStdioArgs').value || '[]'),
                mcpTimeout: parseInt(document.getElementById('mcpTimeout').value) || 2000,
                mcpServerUrl: document.getElementById('mcpServerUrl').value,
                mcpApiKey: document.getElementById('mcpApiKey').value,
                enableStreaming: document.getElementById('enableStreaming').checked,
                enableFastMode: document.getElementById('enableFastMode').checked
            };

            vscode.postMessage({ type: 'saveSettings', settings });
        }

        function testConnection() {
            vscode.postMessage({ type: 'testConnection' });
        }

        function refreshModels() {
            vscode.postMessage({ type: 'refreshModels' });
        }

        function resetToDefaults() {
            document.getElementById('modelSelect').value = 'llama3.2:1b';
            document.getElementById('mcpConnectionType').value = 'stdio';
            document.getElementById('mcpStdioCommand').value = 'node';
            document.getElementById('mcpStdioArgs').value = '[\"-e\", \"console.log(\'MCP Ready\'); process.stdin.pipe(process.stdout);\"]';
            document.getElementById('mcpTimeout').value = '2000';
            document.getElementById('enableStreaming').checked = true;
            document.getElementById('enableFastMode').checked = true;
            updateMcpSettings();
        }

        // Message handlers
        window.addEventListener('message', function(event) {
            const message = event.data;
            console.log('Received message:', message);
            
            const sendButton = document.getElementById('sendButton');
            
            switch (message.type) {
                case 'userMessage':
                    addMessage(message.message, true);
                    break;
                case 'startTyping':
                    showTypingIndicator();
                    if (sendButton) sendButton.disabled = true;
                    break;
                case 'streamToken':
                    handleStreamingToken(message.token, message.fullMessage);
                    break;
                case 'assistantMessage':
                    hideTypingIndicator();
                    finalizeStreamingMessage(message.message, message.formatted);
                    if (sendButton) sendButton.disabled = false;
                    break;
                case 'error':
                    hideTypingIndicator();
                    addMessage('❌ ' + message.message, false);
                    if (sendButton) sendButton.disabled = false;
                    break;
                case 'settingsLoaded':
                    const settings = message.settings;
                    document.getElementById('modelSelect').value = settings.model;
                    document.getElementById('mcpConnectionType').value = settings.mcpConnectionType;
                    document.getElementById('mcpStdioCommand').value = settings.mcpStdioCommand;
                    document.getElementById('mcpStdioArgs').value = JSON.stringify(settings.mcpStdioArgs);
                    document.getElementById('mcpTimeout').value = settings.mcpTimeout;
                    document.getElementById('mcpServerUrl').value = settings.mcpServerUrl;
                    document.getElementById('mcpApiKey').value = settings.mcpApiKey;
                    document.getElementById('enableStreaming').checked = settings.enableStreaming;
                    document.getElementById('enableFastMode').checked = settings.enableFastMode;
                    updateMcpSettings();
                    break;
                case 'settingsSaved':
                    addMessage(message.message, false);
                    document.getElementById('statusIndicator').textContent = '⚡ Fast Mode';
                    document.getElementById('statusIndicator').className = 'text-xs text-green-400';
                    break;
                case 'connectionTest':
                    addMessage(message.message, false);
                    break;
                case 'modelsRefreshed':
                    // Update model dropdowns
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
            }
        });

        // Initialize
        setTimeout(() => {
            document.getElementById('chatInput').focus();
        }, 100);
    </script>
</body>
</html>`;
    }
}
exports.ChatProvider = ChatProvider;
ChatProvider.viewType = 'replitCopilotChat';
//# sourceMappingURL=chatProvider.js.map