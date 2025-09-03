"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = require("vscode");
const chatProvider_1 = require("./chatProvider");
const mcpClient_1 = require("./mcpClient");
const ollamaClient_1 = require("./ollamaClient");
const fileOperations_1 = require("./fileOperations");
let chatProvider;
let mcpClient;
let ollamaClient;
let fileOpsManager;
function activate(context) {
    console.log('[REPLIT-COPILOT] Ollama Chat Extension is now active!');
    try {
        // Initialize services
        mcpClient = new mcpClient_1.MCPClient();
        ollamaClient = new ollamaClient_1.OllamaClient();
        fileOpsManager = new fileOperations_1.FileOperationsManager();
        chatProvider = new chatProvider_1.ChatProvider(context.extensionUri, mcpClient, ollamaClient, fileOpsManager);
        // Register the webview provider
        console.log('[REPLIT-COPILOT] Registering webview provider with ID:', chatProvider_1.ChatProvider.viewType);
        const disposable = vscode.window.registerWebviewViewProvider(chatProvider_1.ChatProvider.viewType, chatProvider);
        context.subscriptions.push(disposable);
        console.log('[REPLIT-COPILOT] Webview provider registered successfully');
        vscode.window.showInformationMessage('Ollama Chat Extension loaded successfully!');
        // Register commands
        context.subscriptions.push(vscode.commands.registerCommand('replit-copilot.openChat', () => {
            console.log('[REPLIT-COPILOT] Opening Ollama Chat...');
            vscode.commands.executeCommand('workbench.view.explorer');
            vscode.commands.executeCommand('replitCopilotChat.focus');
        }));
        context.subscriptions.push(vscode.commands.registerCommand('replit-copilot.configure', () => {
            vscode.commands.executeCommand('workbench.action.openSettings', 'replitCopilot');
        }));
        // Register configuration change listener
        context.subscriptions.push(vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('replitCopilot')) {
                // Update clients when configuration changes
                mcpClient.updateConfiguration();
                ollamaClient.updateConfiguration();
            }
        }));
        console.log('[REPLIT-COPILOT] Extension activation completed successfully!');
    }
    catch (error) {
        console.error('[REPLIT-COPILOT] Extension activation failed:', error);
        vscode.window.showErrorMessage(`Ollama Chat Extension failed to activate: ${error}`);
    }
}
function deactivate() {
    mcpClient?.disconnect();
}
//# sourceMappingURL=extension.js.map