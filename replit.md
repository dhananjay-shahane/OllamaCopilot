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
1. **ChatGPT-Style Chat Interface**: Modern sidebar chat with streaming responses, typing effects, and message history
2. **Comprehensive Ollama Integration**: Local LLM support with llama3.2:1b model and configurable options
3. **Full MCP Server Support**: WebSocket, HTTP, and STDIO connection types for enhanced capabilities
4. **Complete VS Code Workflow Integration**: 
   - **File Operations**: read_file, create_new_file, edit_existing_file, search_and_replace_in_file
   - **Directory Management**: ls, view_subdirectory, view_repo_map, file_glob_search
   - **Code Analysis**: view_diff, grep_search, codebase understanding
   - **Terminal Integration**: run_terminal_command with VS Code terminal
   - **Workspace Context**: read_currently_open_file, project structure awareness
   - **External Content**: fetch_url_content, create_rule_block
5. **Configuration UI**: User-friendly settings for MCP servers and LLM models
6. **Smart Context Awareness**: LLM understands current file context and project structure
7. **Real-time Streaming**: Instant responses with token-by-token streaming like ChatGPT

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
**2025-09-03**: Complete VS Code workflow integration and chat functionality fixes
- Created VS Code extension scaffold with TypeScript
- Implemented ChatGPT-style chat interface with streaming responses and typing effects
- Added comprehensive Ollama LLM integration with conversation history and llama3.2:1b support
- Implemented full MCP client with WebSocket, HTTP, and STDIO support
- Created advanced file operations manager with complete VS Code workspace integration
- **Enhanced LLM with full VS Code workflow understanding and file operation capabilities**
- Added comprehensive workspace tools: read_file, create_new_file, edit_existing_file, search_and_replace_in_file
- Implemented directory operations: ls, view_subdirectory, view_repo_map, file_glob_search, grep_search
- Added terminal integration: run_terminal_command with VS Code terminal support
- Created code analysis tools: view_diff, codebase understanding, fetch_url_content
- Enhanced system prompt with detailed tool documentation and VS Code context awareness
- Set up development workflow with TypeScript compilation and error-free compilation
- **Fixed critical chat functionality issues**: Added missing userMessage handler, fixed duplicate message handling, improved message flow and user interaction

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