# Replit Copilot Extension

A VS Code extension that provides Copilot-like AI chat functionality with MCP (Model Context Protocol) server integration and local Ollama LLM support.

## Features

- **ChatGPT-Style Chat Interface**: Modern sidebar chat with streaming responses and message history
- **Local Ollama Integration**: Support for local Llama models (configured for llama3.2:1b)
- **MCP Server Support**: WebSocket, HTTP, and STDIO connections for enhanced AI capabilities
- **Complete VS Code Integration**: File operations, terminal commands, and workspace context awareness
- **Real-time Development**: TypeScript compilation with watch mode for instant updates

## Development Setup

### Prerequisites
- Node.js (already installed in Replit)
- VS Code (for extension development and testing)

### Getting Started

1. **Development Mode**: The extension is already set up for development. The TypeScript compiler runs in watch mode automatically via the Replit workflow.

2. **Install Dependencies** (already done):
   ```bash
   cd replit-copilot-extension
   npm install
   ```

3. **Compilation**: TypeScript files are automatically compiled to the `out/` directory when changed.

### Testing the Extension

Since this is a VS Code extension, you need VS Code to test it:

1. **Open in VS Code**: Open this project folder in VS Code
2. **Run Extension**: Press `F5` or go to Run & Debug and select "Extension"
3. **Test Features**: A new Extension Development Host window will open where you can test the extension

## Extension Architecture

- **Main Entry Point**: `src/extension.ts` - Activates the extension and registers commands
- **Chat Provider**: `src/chatProvider.ts` - Manages the webview chat interface
- **Ollama Client**: `src/ollamaClient.ts` - Handles local LLM communication
- **MCP Client**: `src/mcpClient.ts` - Manages MCP server connections
- **File Operations**: `src/fileOperations.ts` - VS Code workspace file management

## Configuration

The extension supports these VS Code settings:

- `replitCopilot.ollamaUrl`: Ollama server URL (default: https://ea22b928195e.ngrok-free.app)
- `replitCopilot.defaultModel`: Default Ollama model (default: llama3.2:1b)
- `replitCopilot.mcpServerUrl`: MCP server endpoint URL
- `replitCopilot.mcpApiKey`: Optional MCP server API key

## Usage in Replit

While this extension is designed for VS Code, you can:

1. **Develop and Test**: Use the Replit environment for development with automatic TypeScript compilation
2. **Package for Distribution**: Create a `.vsix` file for installation in VS Code
3. **Export to VS Code**: Download the project and open it in VS Code for full functionality

## Commands

- **Open Ollama Chat**: Opens the chat interface in the VS Code sidebar
- **Configure MCP & LLM Settings**: Opens the extension settings

## File Structure

```
replit-copilot-extension/
├── src/                    # TypeScript source files
│   ├── extension.ts        # Main extension entry point
│   ├── chatProvider.ts     # Chat webview provider
│   ├── ollamaClient.ts     # Ollama LLM integration
│   ├── mcpClient.ts        # MCP server client
│   └── fileOperations.ts   # VS Code file operations
├── out/                    # Compiled JavaScript files
├── .vscode/                # VS Code development configuration
├── package.json            # Extension manifest
├── tsconfig.json           # TypeScript configuration
└── mcp-config.json         # MCP server configuration
```

## Development Notes

- TypeScript compilation runs automatically in watch mode
- All source files are in the `src/` directory
- Compiled output goes to the `out/` directory
- Extension is configured for VS Code API version 1.74.0+

## Next Steps

To use this extension:
1. Download this project to your local machine
2. Open in VS Code
3. Press F5 to run in Extension Development Host
4. Or package with `vsce package` to create a .vsix file for installation