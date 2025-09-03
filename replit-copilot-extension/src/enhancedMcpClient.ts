import * as vscode from 'vscode';
import * as WebSocket from 'ws';
import axios from 'axios';
import { spawn, ChildProcess } from 'child_process';
import { MCPConfigParser, MCPServerConfig } from './mcpConfigParser';

export interface MCPTool {
    name: string;
    description: string;
    inputSchema: any;
    serverId: string;
}

export class EnhancedMCPClient {
    private configParser: MCPConfigParser;
    private activeConnections = new Map<string, any>();
    private availableTools = new Map<string, MCPTool[]>();
    private connected = false;

    constructor() {
        this.configParser = new MCPConfigParser();
    }

    public updateConfiguration() {
        this.configParser.updateConfigPath();
    }

    public async connectAll(): Promise<boolean> {
        try {
            console.log('[ENHANCED-MCP] Connecting to all MCP servers...');
            
            const isValid = await this.configParser.validateConfig();
            if (!isValid) {
                console.log('[ENHANCED-MCP] No valid MCP configuration found');
                return false;
            }

            const servers = this.configParser.getServers();
            console.log('[ENHANCED-MCP] Found servers:', servers.map(s => s.name));

            const connectionPromises = servers.map(server => this.connectToServer(server));
            const results = await Promise.allSettled(connectionPromises);

            let successCount = 0;
            results.forEach((result, index) => {
                if (result.status === 'fulfilled' && result.value) {
                    successCount++;
                    console.log(`[ENHANCED-MCP] Connected to ${servers[index].name}`);
                } else {
                    console.error(`[ENHANCED-MCP] Failed to connect to ${servers[index].name}:`, 
                        result.status === 'rejected' ? result.reason : 'Unknown error');
                }
            });

            this.connected = successCount > 0;
            console.log(`[ENHANCED-MCP] Connected to ${successCount}/${servers.length} servers`);
            
            // Discover tools from connected servers
            await this.discoverTools();
            
            return this.connected;
        } catch (error) {
            console.error('[ENHANCED-MCP] Connection failed:', error);
            return false;
        }
    }

    private async connectToServer(server: MCPServerConfig): Promise<boolean> {
        try {
            console.log(`[ENHANCED-MCP] Connecting to server: ${server.name} (${server.type})`);

            switch (server.type) {
                case 'stdio':
                    return await this.connectStdio(server);
                case 'http':
                    return await this.connectHttp(server);
                case 'websocket':
                    return await this.connectWebSocket(server);
                default:
                    throw new Error(`Unsupported connection type: ${server.type}`);
            }
        } catch (error) {
            console.error(`[ENHANCED-MCP] Failed to connect to ${server.name}:`, error);
            return false;
        }
    }

    private async connectStdio(server: MCPServerConfig): Promise<boolean> {
        return new Promise((resolve) => {
            try {
                if (!server.command) {
                    resolve(false);
                    return;
                }

                console.log(`[ENHANCED-MCP] Starting STDIO process: ${server.command} ${server.args?.join(' ') || ''}`);
                
                const process = spawn(server.command, server.args || [], {
                    stdio: ['pipe', 'pipe', 'pipe'],
                    shell: true
                });

                const timeout = setTimeout(() => {
                    console.log(`[ENHANCED-MCP] STDIO connection timeout for ${server.name}`);
                    process.kill();
                    resolve(false);
                }, server.timeout || 5000);

                process.on('spawn', () => {
                    clearTimeout(timeout);
                    console.log(`[ENHANCED-MCP] STDIO process spawned for ${server.name}`);
                    
                    this.activeConnections.set(server.name, {
                        type: 'stdio',
                        process: process,
                        server: server
                    });
                    
                    resolve(true);
                });

                process.on('error', (error) => {
                    clearTimeout(timeout);
                    console.error(`[ENHANCED-MCP] STDIO process error for ${server.name}:`, error);
                    resolve(false);
                });

                process.stderr?.on('data', (data) => {
                    console.log(`[ENHANCED-MCP] ${server.name} stderr:`, data.toString());
                });

            } catch (error) {
                console.error(`[ENHANCED-MCP] STDIO connection failed for ${server.name}:`, error);
                resolve(false);
            }
        });
    }

    private async connectHttp(server: MCPServerConfig): Promise<boolean> {
        try {
            if (!server.url) return false;

            const response = await axios.get(`${server.url}/health`, {
                headers: server.apiKey ? { 'Authorization': `Bearer ${server.apiKey}` } : {},
                timeout: server.timeout || 5000
            });

            if (response.status === 200) {
                this.activeConnections.set(server.name, {
                    type: 'http',
                    url: server.url,
                    apiKey: server.apiKey,
                    server: server
                });
                return true;
            }
            return false;
        } catch (error) {
            console.error(`[ENHANCED-MCP] HTTP connection failed for ${server.name}:`, error);
            return false;
        }
    }

    private async connectWebSocket(server: MCPServerConfig): Promise<boolean> {
        return new Promise((resolve) => {
            try {
                if (!server.url) {
                    resolve(false);
                    return;
                }

                const ws = new WebSocket(server.url);
                
                const timeout = setTimeout(() => {
                    ws.close();
                    resolve(false);
                }, server.timeout || 5000);

                ws.on('open', () => {
                    clearTimeout(timeout);
                    this.activeConnections.set(server.name, {
                        type: 'websocket',
                        ws: ws,
                        server: server
                    });
                    resolve(true);
                });

                ws.on('error', (error) => {
                    clearTimeout(timeout);
                    console.error(`[ENHANCED-MCP] WebSocket error for ${server.name}:`, error);
                    resolve(false);
                });

            } catch (error) {
                console.error(`[ENHANCED-MCP] WebSocket connection failed for ${server.name}:`, error);
                resolve(false);
            }
        });
    }

    private async discoverTools(): Promise<void> {
        const promises = Array.from(this.activeConnections.entries()).map(
            async ([serverId, connection]) => {
                try {
                    const tools = await this.getToolsFromServer(serverId, connection);
                    this.availableTools.set(serverId, tools);
                    console.log(`[ENHANCED-MCP] Discovered ${tools.length} tools from ${serverId}`);
                } catch (error) {
                    console.error(`[ENHANCED-MCP] Failed to discover tools from ${serverId}:`, error);
                    this.availableTools.set(serverId, []);
                }
            }
        );

        await Promise.allSettled(promises);
    }

    private async getToolsFromServer(serverId: string, connection: any): Promise<MCPTool[]> {
        // Mock tools for demonstration - in real implementation, this would query the MCP server
        const mockTools: MCPTool[] = [
            {
                name: 'read_file',
                description: 'Read contents of a file',
                inputSchema: { type: 'object', properties: { path: { type: 'string' } } },
                serverId
            },
            {
                name: 'write_file',
                description: 'Write contents to a file',
                inputSchema: { 
                    type: 'object', 
                    properties: { 
                        path: { type: 'string' }, 
                        content: { type: 'string' } 
                    } 
                },
                serverId
            },
            {
                name: 'delete_file',
                description: 'Delete a file',
                inputSchema: { type: 'object', properties: { path: { type: 'string' } } },
                serverId
            },
            {
                name: 'list_directory',
                description: 'List contents of a directory',
                inputSchema: { type: 'object', properties: { path: { type: 'string' } } },
                serverId
            }
        ];

        return mockTools;
    }

    public getAllTools(): MCPTool[] {
        const allTools: MCPTool[] = [];
        for (const tools of this.availableTools.values()) {
            allTools.push(...tools);
        }
        return allTools;
    }

    public getConnectedServers(): string[] {
        return Array.from(this.activeConnections.keys());
    }

    public isConnected(): boolean {
        return this.connected && this.activeConnections.size > 0;
    }

    public getConfigPath(): string {
        return this.configParser.getConfigPath();
    }

    public hasConfig(): boolean {
        return this.configParser.hasConfig();
    }

    public async callTool(toolName: string, parameters: any): Promise<any> {
        // Find which server has this tool
        for (const [serverId, tools] of this.availableTools.entries()) {
            const tool = tools.find(t => t.name === toolName);
            if (tool) {
                return await this.executeToolOnServer(serverId, toolName, parameters);
            }
        }
        throw new Error(`Tool '${toolName}' not found in any connected server`);
    }

    private async executeToolOnServer(serverId: string, toolName: string, parameters: any): Promise<any> {
        const connection = this.activeConnections.get(serverId);
        if (!connection) {
            throw new Error(`No connection to server '${serverId}'`);
        }

        console.log(`[ENHANCED-MCP] Executing tool '${toolName}' on server '${serverId}'`, parameters);

        // Mock execution - in real implementation, this would send the tool call to the MCP server
        switch (toolName) {
            case 'read_file':
                return { content: `Mock content of file: ${parameters.path}` };
            case 'write_file':
                return { success: true, message: `Mock write to file: ${parameters.path}` };
            case 'delete_file':
                return { success: true, message: `Mock delete file: ${parameters.path}` };
            case 'list_directory':
                return { files: ['file1.txt', 'file2.js', 'subdir/'] };
            default:
                throw new Error(`Unknown tool: ${toolName}`);
        }
    }

    public disconnect(): void {
        console.log('[ENHANCED-MCP] Disconnecting all servers...');
        
        for (const [serverId, connection] of this.activeConnections.entries()) {
            try {
                if (connection.type === 'stdio' && connection.process) {
                    connection.process.kill();
                } else if (connection.type === 'websocket' && connection.ws) {
                    connection.ws.close();
                }
                console.log(`[ENHANCED-MCP] Disconnected from ${serverId}`);
            } catch (error) {
                console.error(`[ENHANCED-MCP] Error disconnecting from ${serverId}:`, error);
            }
        }

        this.activeConnections.clear();
        this.availableTools.clear();
        this.connected = false;
    }
}