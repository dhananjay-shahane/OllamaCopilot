import * as vscode from 'vscode';
import * as WebSocket from 'ws';
import axios from 'axios';

export interface MCPConfig {
    serverUrl: string;
    apiKey?: string;
}

export class MCPClient {
    private config: MCPConfig = { serverUrl: '' };
    private ws?: WebSocket;
    private connected = false;

    constructor() {
        this.updateConfiguration();
    }

    public updateConfiguration() {
        const config = vscode.workspace.getConfiguration('replitCopilot');
        this.config = {
            serverUrl: config.get<string>('mcpServerUrl') || '',
            apiKey: config.get<string>('mcpApiKey') || ''
        };
    }

    public async connect(): Promise<boolean> {
        if (!this.config.serverUrl) {
            console.log('MCP Server URL not configured');
            return false;
        }

        try {
            // Try HTTP connection first
            if (this.config.serverUrl.startsWith('http')) {
                const response = await axios.get(`${this.config.serverUrl}/health`, {
                    headers: this.config.apiKey ? { 'Authorization': `Bearer ${this.config.apiKey}` } : {}
                });
                this.connected = response.status === 200;
                return this.connected;
            }

            // Try WebSocket connection
            if (this.config.serverUrl.startsWith('ws')) {
                this.ws = new WebSocket(this.config.serverUrl);
                
                return new Promise((resolve) => {
                    this.ws!.on('open', () => {
                        this.connected = true;
                        console.log('Connected to MCP server via WebSocket');
                        resolve(true);
                    });

                    this.ws!.on('error', (error: any) => {
                        console.error('MCP WebSocket connection error:', error);
                        this.connected = false;
                        resolve(false);
                    });

                    this.ws!.on('close', () => {
                        this.connected = false;
                        console.log('MCP WebSocket connection closed');
                    });
                });
            }

        } catch (error) {
            console.error('Failed to connect to MCP server:', error);
            this.connected = false;
        }

        return this.connected;
    }

    public disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = undefined;
        }
        this.connected = false;
    }

    public isConnected(): boolean {
        return this.connected;
    }

    public async sendRequest(method: string, params: any = {}): Promise<any> {
        if (!this.connected) {
            throw new Error('MCP client not connected');
        }

        try {
            // HTTP-based MCP communication
            if (this.config.serverUrl.startsWith('http')) {
                const response = await axios.post(`${this.config.serverUrl}/mcp`, {
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

                    const handleMessage = (data: WebSocket.RawData) => {
                        try {
                            const response = JSON.parse(data.toString());
                            if (response.id === id) {
                                clearTimeout(timeout);
                                this.ws!.off('message', handleMessage);
                                
                                if (response.error) {
                                    reject(new Error(response.error.message));
                                } else {
                                    resolve(response.result);
                                }
                            }
                        } catch (error) {
                            reject(error);
                        }
                    };

                    this.ws!.on('message', handleMessage);
                    this.ws!.send(JSON.stringify(message));
                });
            }

            throw new Error('No valid connection method available');
            
        } catch (error) {
            throw new Error(`MCP request failed: ${error}`);
        }
    }

    // MCP-specific methods
    public async getTools(): Promise<any[]> {
        return await this.sendRequest('tools/list');
    }

    public async callTool(name: string, arguments_: any = {}): Promise<any> {
        return await this.sendRequest('tools/call', {
            name: name,
            arguments: arguments_
        });
    }

    public async getResources(): Promise<any[]> {
        return await this.sendRequest('resources/list');
    }

    public async readResource(uri: string): Promise<any> {
        return await this.sendRequest('resources/read', {
            uri: uri
        });
    }
}