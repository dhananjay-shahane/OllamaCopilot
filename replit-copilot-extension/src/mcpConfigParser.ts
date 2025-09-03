import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

export interface MCPServerConfig {
    type: 'stdio' | 'websocket' | 'http';
    command?: string;
    args?: string[];
    url?: string;
    apiKey?: string;
    timeout?: number;
    name: string;
}

export interface MCPJsonConfig {
    servers: { [key: string]: Omit<MCPServerConfig, 'name'> };
    inputs?: any[];
}

export class MCPConfigParser {
    private configPath: string = '';
    private config: MCPJsonConfig | null = null;

    constructor() {
        this.updateConfigPath();
    }

    public updateConfigPath() {
        const config = vscode.workspace.getConfiguration('replitCopilot');
        this.configPath = config.get<string>('mcpConfigFile') || '';
        
        // If no explicit path set, try to find mcp.json in workspace
        if (!this.configPath && vscode.workspace.workspaceFolders) {
            const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
            const defaultPath = path.join(workspaceRoot, 'mcp.json');
            if (fs.existsSync(defaultPath)) {
                this.configPath = defaultPath;
            }
        }
    }

    public async loadConfig(): Promise<MCPJsonConfig | null> {
        try {
            if (!this.configPath || !fs.existsSync(this.configPath)) {
                console.log('[MCP-CONFIG] No MCP config file found at:', this.configPath);
                return null;
            }

            const configContent = fs.readFileSync(this.configPath, 'utf-8');
            this.config = JSON.parse(configContent);
            
            console.log('[MCP-CONFIG] Loaded MCP configuration from:', this.configPath);
            console.log('[MCP-CONFIG] Found servers:', Object.keys(this.config?.servers || {}));
            
            return this.config;
        } catch (error) {
            console.error('[MCP-CONFIG] Failed to load MCP config:', error);
            vscode.window.showErrorMessage(`Failed to load MCP config: ${error}`);
            return null;
        }
    }

    public getServers(): MCPServerConfig[] {
        if (!this.config?.servers) {
            return [];
        }

        return Object.entries(this.config.servers).map(([name, config]) => ({
            name,
            type: config.type || 'stdio',
            command: config.command,
            args: config.args || [],
            url: config.url,
            apiKey: config.apiKey,
            timeout: config.timeout || 5000
        }));
    }

    public getServerByName(name: string): MCPServerConfig | null {
        const servers = this.getServers();
        return servers.find(server => server.name === name) || null;
    }

    public async validateConfig(): Promise<boolean> {
        try {
            const config = await this.loadConfig();
            if (!config) return false;

            // Basic validation
            if (!config.servers || typeof config.servers !== 'object') {
                throw new Error('Invalid servers configuration');
            }

            for (const [name, serverConfig] of Object.entries(config.servers)) {
                if (!serverConfig.type) {
                    throw new Error(`Server '${name}' missing type`);
                }

                if (serverConfig.type === 'stdio') {
                    if (!serverConfig.command) {
                        throw new Error(`STDIO server '${name}' missing command`);
                    }
                } else if (serverConfig.type === 'http' || serverConfig.type === 'websocket') {
                    if (!serverConfig.url) {
                        throw new Error(`${serverConfig.type.toUpperCase()} server '${name}' missing URL`);
                    }
                }
            }

            return true;
        } catch (error) {
            console.error('[MCP-CONFIG] Config validation failed:', error);
            vscode.window.showErrorMessage(`MCP config validation failed: ${error}`);
            return false;
        }
    }

    public getConfigPath(): string {
        return this.configPath;
    }

    public hasConfig(): boolean {
        return !!this.configPath && fs.existsSync(this.configPath);
    }
}