"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deactivate = exports.activate = void 0;
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
    console.log('Replit Copilot Extension is now active!');
    // Initialize services
    mcpClient = new mcpClient_1.MCPClient();
    ollamaClient = new ollamaClient_1.OllamaClient();
    fileOpsManager = new fileOperations_1.FileOperationsManager();
    chatProvider = new chatProvider_1.ChatProvider(context.extensionUri, mcpClient, ollamaClient, fileOpsManager);
    // Register the webview provider
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(chatProvider_1.ChatProvider.viewType, chatProvider));
    // Register commands
    context.subscriptions.push(vscode.commands.registerCommand('replit-copilot.openChat', () => {
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
}
exports.activate = activate;
function deactivate() {
    mcpClient?.disconnect();
}
exports.deactivate = deactivate;
//# sourceMappingURL=extension.js.map