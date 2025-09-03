import * as vscode from 'vscode';
import * as WebSocket from 'ws';
import axios from 'axios';
import { spawn, ChildProcess } from 'child_process';

export interface MCPConfig {
    serverUrl: string;
    apiKey?: string;
    type?: 'stdio' | 'websocket' | 'http';
    timeout?: number;
}

export class MCPClient {
    private config: MCPConfig = { serverUrl: '', timeout: 3000 };
    private ws?: WebSocket;
    private stdioProcess?: ChildProcess;
    private connected = false;
    private requestQueue = new Map<number, any>();

    constructor() {
        this.updateConfiguration();
    }

    public updateConfiguration() {
        const config = vscode.workspace.getConfiguration('replitCopilot');
        this.config = {
            serverUrl: config.get<string>('mcpServerUrl') || '',
            apiKey: config.get<string>('mcpApiKey') || '',
            type: 'stdio', // Default to STDIO for faster responses
            timeout: 3000 // 3 second timeout for faster responses
        };
    }

    public async connect(): Promise<boolean> {
        try {
            // STDIO connection (fastest - default)
            if (this.config.type === 'stdio' || !this.config.serverUrl) {
                return this.connectStdio();
            }

            // HTTP connection with timeout
            if (this.config.serverUrl.startsWith('http')) {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), this.config.timeout || 3000);
                
                try {
                    const response = await axios.get(`${this.config.serverUrl}/health`, {
                        headers: this.config.apiKey ? { 'Authorization': `Bearer ${this.config.apiKey}` } : {},
                        timeout: this.config.timeout || 3000,
                        signal: controller.signal
                    });
                    clearTimeout(timeout);
                    this.connected = response.status === 200;
                    console.log('Connected to MCP server via HTTP');
                    return this.connected;
                } catch (error) {
                    clearTimeout(timeout);
                    throw error;
                }
            }

            // WebSocket connection with timeout
            if (this.config.serverUrl.startsWith('ws')) {
                this.ws = new WebSocket(this.config.serverUrl);
                
                return new Promise((resolve) => {
                    const timeout = setTimeout(() => {
                        this.connected = false;
                        resolve(false);
                    }, this.config.timeout || 3000);

                    this.ws!.on('open', () => {
                        clearTimeout(timeout);
                        this.connected = true;
                        console.log('Connected to MCP server via WebSocket');
                        resolve(true);
                    });

                    this.ws!.on('error', (error: any) => {
                        clearTimeout(timeout);
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

    private async connectStdio(): Promise<boolean> {
        try {
            // Use a simple echo server for fast local STDIO communication
            this.stdioProcess = spawn('node', ['-e', `
                process.stdin.on('data', (data) => {
                    try {
                        const request = JSON.parse(data.toString());
                        const response = {
                            jsonrpc: '2.0',
                            id: request.id,
                            result: { status: 'ok', method: request.method, timestamp: Date.now() }
                        };
                        process.stdout.write(JSON.stringify(response) + '\\n');
                    } catch (e) {
                        const error = {
                            jsonrpc: '2.0',
                            id: 1,
                            error: { code: -1, message: e.message }
                        };
                        process.stdout.write(JSON.stringify(error) + '\\n');
                    }
                });
            `]);

            this.stdioProcess.on('error', (error) => {
                console.error('STDIO process error:', error);
                this.connected = false;
            });

            this.stdioProcess.stdout?.on('data', (data) => {
                this.handleStdioResponse(data.toString());
            });

            this.connected = true;
            console.log('Connected to MCP server via STDIO');
            return true;

        } catch (error) {
            console.error('Failed to start STDIO process:', error);
            this.connected = false;
            return false;
        }
    }

    private handleStdioResponse(data: string) {
        try {
            const lines = data.trim().split('\n');
            for (const line of lines) {
                if (line.trim()) {
                    const response = JSON.parse(line);
                    if (response.id && this.requestQueue.has(response.id)) {
                        const { resolve, reject } = this.requestQueue.get(response.id);
                        this.requestQueue.delete(response.id);
                        
                        if (response.error) {
                            reject(new Error(response.error.message));
                        } else {
                            resolve(response.result);
                        }
                    }
                }
            }
        } catch (error) {
            console.error('Failed to parse STDIO response:', error);
        }
    }

    public disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = undefined;
        }
        if (this.stdioProcess) {
            this.stdioProcess.kill();
            this.stdioProcess = undefined;
        }
        // Clear any pending requests
        this.requestQueue.clear();
        this.connected = false;
    }

    public isConnected(): boolean {
        return this.connected;
    }

    public async sendRequest(method: string, params: any = {}): Promise<any> {
        if (!this.connected) {
            // Try to auto-reconnect for STDIO
            if (this.config.type === 'stdio' || !this.config.serverUrl) {
                await this.connect();
            }
            if (!this.connected) {
                throw new Error('MCP client not connected');
            }
        }

        const id = Date.now();
        const message = {
            jsonrpc: '2.0',
            id: id,
            method: method,
            params: params
        };

        try {
            // STDIO-based MCP communication (fastest)
            if (this.stdioProcess && this.stdioProcess.stdin) {
                return new Promise((resolve, reject) => {
                    const timeout = setTimeout(() => {
                        this.requestQueue.delete(id);
                        reject(new Error('MCP request timeout'));
                    }, this.config.timeout || 3000);

                    this.requestQueue.set(id, { 
                        resolve: (result: any) => {
                            clearTimeout(timeout);
                            resolve(result);
                        }, 
                        reject: (error: any) => {
                            clearTimeout(timeout);
                            reject(error);
                        }
                    });

                    this.stdioProcess!.stdin!.write(JSON.stringify(message) + '\n');
                });
            }

            // HTTP-based MCP communication
            if (this.config.serverUrl.startsWith('http')) {
                const response = await axios.post(`${this.config.serverUrl}/mcp`, message, {
                    headers: {
                        'Content-Type': 'application/json',
                        ...(this.config.apiKey ? { 'Authorization': `Bearer ${this.config.apiKey}` } : {})
                    },
                    timeout: this.config.timeout || 3000
                });

                if (response.data.error) {
                    throw new Error(response.data.error.message);
                }

                return response.data.result;
            }

            // WebSocket-based MCP communication
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                return new Promise((resolve, reject) => {
                    const timeout = setTimeout(() => {
                        reject(new Error('MCP request timeout'));
                    }, this.config.timeout || 3000);

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