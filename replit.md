# Replit Copilot Extension

## Overview
A VS Code extension that mimics Copilot's UI and provides a step-by-step prompt experience for Replit. The extension integrates with MCP (Model Context Protocol) servers and supports local Ollama LLMs for file operations.

## Project Architecture
- **Extension Framework**: TypeScript-based VS Code extension
- **UI**: Custom webview with Copilot-like chat interface
- **LLM Integration**: Local Ollama support via HTTP API
- **MCP Integration**: WebSocket and HTTP support for MCP servers
- **File Operations**: Full VS Code workspace file management

## Core Features
1. **Chat Interface**: Copilot-style sidebar chat with message history
2. **Ollama Integration**: Local LLM support with configurable models
3. **MCP Server Support**: Connect to external MCP servers for enhanced capabilities
4. **File Operations**: Read, write, edit, delete files using VS Code APIs
5. **Configuration UI**: User-friendly settings for MCP servers and LLM models

## Project Structure
```
replit-copilot-extension/
├── src/
│   ├── extension.ts          # Main extension entry point
│   ├── chatProvider.ts       # Webview chat interface provider
│   ├── mcpClient.ts         # MCP server integration
│   ├── ollamaClient.ts      # Ollama LLM client
│   └── fileOperations.ts    # VS Code file operations wrapper
├── .vscode/                 # VS Code configuration
│   ├── launch.json         # Debug configuration
│   └── tasks.json          # Build tasks
├── package.json            # Extension manifest and dependencies
└── tsconfig.json          # TypeScript configuration
```

## Recent Changes
**2025-09-03**: Initial project setup
- Created VS Code extension scaffold with TypeScript
- Implemented basic chat webview with Copilot-like styling
- Added Ollama LLM integration with conversation history
- Implemented MCP client with WebSocket and HTTP support
- Created file operations manager for VS Code workspace
- Set up development workflow with TypeScript compilation

## User Preferences
- Architecture follows modern VS Code extension patterns
- Uses TypeScript for type safety and better developer experience
- Implements clean separation of concerns with dedicated service classes
- Follows Continue extension architecture patterns for LLM integration

## Configuration
The extension supports these settings:
- `replitCopilot.mcpServerUrl`: MCP server endpoint URL
- `replitCopilot.ollamaUrl`: Local Ollama server URL (default: http://localhost:11434)
- `replitCopilot.defaultModel`: Default Ollama model to use (default: llama3.2)

## Development
- Run `npm run watch` to start TypeScript compilation in watch mode
- Use VS Code's Extension Development Host for testing
- Extension activates automatically when VS Code starts

## Next Steps
- Test extension functionality in VS Code
- Add more sophisticated file operation suggestions
- Enhance MCP server integration with tool discovery
- Implement streaming responses for better UX