"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MCPClient = void 0;
const vscode = require("vscode");
const WebSocket = require("ws");
const axios_1 = require("axios");
class MCPClient {
    constructor() {
        this.config = { serverUrl: '' };
        this.connected = false;
        this.updateConfiguration();
    }
    updateConfiguration() {
        const config = vscode.workspace.getConfiguration('replitCopilot');
        this.config = {
            serverUrl: config.get('mcpServerUrl') || '',
            apiKey: config.get('mcpApiKey') || ''
        };
    }
    async connect() {
        if (!this.config.serverUrl) {
            console.log('MCP Server URL not configured');
            return false;
        }
        try {
            // Try HTTP connection first
            if (this.config.serverUrl.startsWith('http')) {
                const response = await axios_1.default.get(`${this.config.serverUrl}/health`, {
                    headers: this.config.apiKey ? { 'Authorization': `Bearer ${this.config.apiKey}` } : {}
                });
                this.connected = response.status === 200;
                return this.connected;
            }
            // Try WebSocket connection
            if (this.config.serverUrl.startsWith('ws')) {
                this.ws = new WebSocket(this.config.serverUrl);
                return new Promise((resolve) => {
                    this.ws.on('open', () => {
                        this.connected = true;
                        console.log('Connected to MCP server via WebSocket');
                        resolve(true);
                    });
                    this.ws.on('error', (error) => {
                        console.error('MCP WebSocket connection error:', error);
                        this.connected = false;
                        resolve(false);
                    });
                    this.ws.on('close', () => {
                        this.connected = false;
                        console.log('MCP WebSocket connection closed');
                    });
                });
            }
        }
        catch (error) {
            console.error('Failed to connect to MCP server:', error);
            this.connected = false;
        }
        return this.connected;
    }
    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = undefined;
        }
        this.connected = false;
    }
    isConnected() {
        return this.connected;
    }
    async sendRequest(method, params = {}) {
        if (!this.connected) {
            throw new Error('MCP client not connected');
        }
        try {
            // HTTP-based MCP communication
            if (this.config.serverUrl.startsWith('http')) {
                const response = await axios_1.default.post(`${this.config.serverUrl}/mcp`, {
                    jsonrpc: '2.0',
                    id: Date.now(),
                    method: method,
                    params: params
                }, {
                    headers: {
                        'Content-Type': 'application/json',
                        ...(this.config.apiKey ? { 'Authorization': `Bearer ${this.config.apiKey}` } : {})
                    }
                });
                if (response.data.error) {
                    throw new Error(response.data.error.message);
                }
                return response.data.result;
            }
            // WebSocket-based MCP communication
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                return new Promise((resolve, reject) => {
                    const id = Date.now();
                    const message = {
                        jsonrpc: '2.0',
                        id: id,
                        method: method,
                        params: params
                    };
                    const timeout = setTimeout(() => {
                        reject(new Error('MCP request timeout'));
                    }, 30000);
                    const handleMessage = (data) => {
                        try {
                            const response = JSON.parse(data.toString());
                            if (response.id === id) {
                                clearTimeout(timeout);
                                this.ws.off('message', handleMessage);
                                if (response.error) {
                                    reject(new Error(response.error.message));
                                }
                                else {
                                    resolve(response.result);
                                }
                            }
                        }
                        catch (error) {
                            reject(error);
                        }
                    };
                    this.ws.on('message', handleMessage);
                    this.ws.send(JSON.stringify(message));
                });
            }
            throw new Error('No valid connection method available');
        }
        catch (error) {
            throw new Error(`MCP request failed: ${error}`);
        }
    }
    // MCP-specific methods
    async getTools() {
        return await this.sendRequest('tools/list');
    }
    async callTool(name, arguments_ = {}) {
        return await this.sendRequest('tools/call', {
            name: name,
            arguments: arguments_
        });
    }
    async getResources() {
        return await this.sendRequest('resources/list');
    }
    async readResource(uri) {
        return await this.sendRequest('resources/read', {
            uri: uri
        });
    }
}
exports.MCPClient = MCPClient;
//# sourceMappingURL=mcpClient.js.map