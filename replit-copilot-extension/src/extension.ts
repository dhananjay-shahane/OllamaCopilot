import * as vscode from 'vscode';
import { ChatProvider } from './chatProvider';
import { MCPClient } from './mcpClient';
import { OllamaClient } from './ollamaClient';
import { FileOperationsManager } from './fileOperations';

let chatProvider: ChatProvider;
let mcpClient: MCPClient;
let ollamaClient: OllamaClient;
let fileOpsManager: FileOperationsManager;

export function activate(context: vscode.ExtensionContext) {
    console.log('🚀 Replit Copilot Extension is now active!');
    
    try {
        // Initialize services
        mcpClient = new MCPClient();
        ollamaClient = new OllamaClient();
        fileOpsManager = new FileOperationsManager();
        chatProvider = new ChatProvider(context.extensionUri, mcpClient, ollamaClient, fileOpsManager);

        // Register the webview provider
        console.log('📝 Registering webview provider with ID:', ChatProvider.viewType);
        const disposable = vscode.window.registerWebviewViewProvider(ChatProvider.viewType, chatProvider);
        context.subscriptions.push(disposable);
        console.log('✅ Webview provider registered successfully');
        
        vscode.window.showInformationMessage('Replit Copilot Extension loaded successfully!');

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('replit-copilot.openChat', () => {
            console.log('🎯 Opening Replit Chat...');
            vscode.commands.executeCommand('workbench.view.explorer');
            vscode.commands.executeCommand('replitCopilotChat.focus');
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('replit-copilot.configure', () => {
            vscode.commands.executeCommand('workbench.action.openSettings', 'replitCopilot');
        })
    );

        // Register configuration change listener
        context.subscriptions.push(
            vscode.workspace.onDidChangeConfiguration((e: vscode.ConfigurationChangeEvent) => {
                if (e.affectsConfiguration('replitCopilot')) {
                    // Update clients when configuration changes
                    mcpClient.updateConfiguration();
                    ollamaClient.updateConfiguration();
                }
            })
        );
        
        console.log('🎉 Extension activation completed successfully!');
        
    } catch (error) {
        console.error('❌ Extension activation failed:', error);
        vscode.window.showErrorMessage(`Replit Copilot Extension failed to activate: ${error}`);
    }
}

export function deactivate() {
    mcpClient?.disconnect();
}