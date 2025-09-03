import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export interface FileOperation {
    type: 'read' | 'write' | 'delete' | 'create' | 'list' | 'search';
    path: string;
    content?: string;
    recursive?: boolean;
}

export class FileOperationsManager {
    private workspaceRoot: string = '';

    constructor() {
        this.updateWorkspaceRoot();
    }

    private updateWorkspaceRoot() {
        if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
            this.workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
        }
        console.log('[FILE-OPS] Workspace root:', this.workspaceRoot);
    }

    public async detectFileOperation(message: string): Promise<FileOperation | null> {
        const lowerMessage = message.toLowerCase();
        
        // Detect file operations from natural language
        if (lowerMessage.includes('create file') || lowerMessage.includes('make file') || lowerMessage.includes('new file')) {
            const pathMatch = this.extractFilePath(message);
            if (pathMatch) {
                return {
                    type: 'create',
                    path: pathMatch,
                    content: this.extractFileContent(message) || ''
                };
            }
        }

        if (lowerMessage.includes('delete file') || lowerMessage.includes('remove file')) {
            const pathMatch = this.extractFilePath(message);
            if (pathMatch) {
                return {
                    type: 'delete',
                    path: pathMatch
                };
            }
        }

        if (lowerMessage.includes('read file') || lowerMessage.includes('show file') || lowerMessage.includes('open file')) {
            const pathMatch = this.extractFilePath(message);
            if (pathMatch) {
                return {
                    type: 'read',
                    path: pathMatch
                };
            }
        }

        if (lowerMessage.includes('list files') || lowerMessage.includes('show directory') || lowerMessage.includes('ls ')) {
            const pathMatch = this.extractDirectoryPath(message) || '.';
            return {
                type: 'list',
                path: pathMatch,
                recursive: lowerMessage.includes('recursive') || lowerMessage.includes('-r')
            };
        }

        if (lowerMessage.includes('search for') || lowerMessage.includes('find file')) {
            const searchTerm = this.extractSearchTerm(message);
            if (searchTerm) {
                return {
                    type: 'search',
                    path: '.',
                    content: searchTerm
                };
            }
        }

        return null;
    }

    private extractFilePath(message: string): string | null {
        // Try to extract file paths from various patterns
        const patterns = [
            /[\"'`]([^\"'`]+\.[a-zA-Z0-9]+)[\"'`]/g, // "file.ext" or 'file.ext'
            /(?:file|path):\s*([^\s]+)/g,           // file: path/to/file
            /\b([a-zA-Z0-9_\-\/\\\.]+\.[a-zA-Z0-9]+)\b/g // standalone file.ext
        ];

        for (const pattern of patterns) {
            const matches = message.match(pattern);
            if (matches) {
                return matches[0].replace(/[\"'`:]/g, '').trim();
            }
        }

        return null;
    }

    private extractDirectoryPath(message: string): string | null {
        const patterns = [
            /[\"'`]([^\"'`]+\/)[\"'`]/g,
            /(?:directory|folder|dir):\s*([^\s]+)/g,
            /\b([a-zA-Z0-9_\-\/\\]+\/)\b/g
        ];

        for (const pattern of patterns) {
            const matches = message.match(pattern);
            if (matches) {
                return matches[0].replace(/[\"'`:]/g, '').trim();
            }
        }

        return null;
    }

    private extractFileContent(message: string): string | null {
        // Try to extract content from code blocks or quoted content
        const codeBlockMatch = message.match(/```[\s\S]*?\n([\s\S]*?)```/);
        if (codeBlockMatch) {
            return codeBlockMatch[1].trim();
        }

        const quotedMatch = message.match(/[\"'`]([\s\S]*?)[\"'`]/);
        if (quotedMatch && quotedMatch[1].length > 10) {
            return quotedMatch[1];
        }

        return null;
    }

    private extractSearchTerm(message: string): string | null {
        const patterns = [
            /search for [\"'`]([^\"'`]+)[\"'`]/i,
            /find [\"'`]([^\"'`]+)[\"'`]/i,
            /look for ([a-zA-Z0-9_\-\s]+)/i
        ];

        for (const pattern of patterns) {
            const match = message.match(pattern);
            if (match) {
                return match[1].trim();
            }
        }

        return null;
    }

    public async executeFileOperation(operation: FileOperation): Promise<string> {
        try {
            const fullPath = this.resolvePath(operation.path);
            console.log(`[FILE-OPS] Executing ${operation.type} on ${fullPath}`);

            switch (operation.type) {
                case 'read':
                    return await this.readFile(fullPath);
                case 'write':
                case 'create':
                    return await this.writeFile(fullPath, operation.content || '');
                case 'delete':
                    return await this.deleteFile(fullPath);
                case 'list':
                    return await this.listDirectory(fullPath, operation.recursive);
                case 'search':
                    return await this.searchFiles(fullPath, operation.content || '');
                default:
                    throw new Error(`Unsupported operation: ${operation.type}`);
            }
        } catch (error) {
            console.error('[FILE-OPS] Operation failed:', error);
            return `❌ File operation failed: ${error}`;
        }
    }

    private resolvePath(filePath: string): string {
        if (path.isAbsolute(filePath)) {
            return filePath;
        }
        return path.join(this.workspaceRoot, filePath);
    }

    private async readFile(filePath: string): Promise<string> {
        if (!fs.existsSync(filePath)) {
            throw new Error(`File not found: ${filePath}`);
        }

        const content = fs.readFileSync(filePath, 'utf-8');
        const relativePath = path.relative(this.workspaceRoot, filePath);
        
        return `📄 **File: ${relativePath}**\n\n\`\`\`\n${content}\n\`\`\``;
    }

    private async writeFile(filePath: string, content: string): Promise<string> {
        // Create directory if it doesn't exist
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        fs.writeFileSync(filePath, content, 'utf-8');
        const relativePath = path.relative(this.workspaceRoot, filePath);
        
        return `✅ **File created/updated:** ${relativePath}\n\nContent written successfully (${content.length} characters)`;
    }

    private async deleteFile(filePath: string): Promise<string> {
        if (!fs.existsSync(filePath)) {
            throw new Error(`File not found: ${filePath}`);
        }

        fs.unlinkSync(filePath);
        const relativePath = path.relative(this.workspaceRoot, filePath);
        
        return `🗑️ **File deleted:** ${relativePath}`;
    }

    private async listDirectory(dirPath: string, recursive: boolean = false): Promise<string> {
        if (!fs.existsSync(dirPath)) {
            throw new Error(`Directory not found: ${dirPath}`);
        }

        const stats = fs.statSync(dirPath);
        if (!stats.isDirectory()) {
            throw new Error(`Not a directory: ${dirPath}`);
        }

        const files = this.getDirectoryContents(dirPath, recursive);
        const relativePath = path.relative(this.workspaceRoot, dirPath);
        const displayPath = relativePath || '.';
        
        return `📁 **Directory: ${displayPath}**\n\n${files.join('\n')}`;
    }

    private getDirectoryContents(dirPath: string, recursive: boolean, prefix: string = ''): string[] {
        const items: string[] = [];
        const entries = fs.readdirSync(dirPath);

        entries.sort().forEach(entry => {
            if (entry.startsWith('.') && entry !== '.gitignore') return; // Skip hidden files

            const fullPath = path.join(dirPath, entry);
            const stats = fs.statSync(fullPath);
            
            if (stats.isDirectory()) {
                items.push(`${prefix}📁 ${entry}/`);
                if (recursive) {
                    const subItems = this.getDirectoryContents(fullPath, true, prefix + '  ');
                    items.push(...subItems);
                }
            } else {
                const size = stats.size;
                const sizeStr = this.formatFileSize(size);
                items.push(`${prefix}📄 ${entry} (${sizeStr})`);
            }
        });

        return items;
    }

    private async searchFiles(searchPath: string, searchTerm: string): Promise<string> {
        const results: string[] = [];
        this.searchInDirectory(searchPath, searchTerm, results);
        
        if (results.length === 0) {
            return `🔍 **Search Results:** No files found containing "${searchTerm}"`;
        }

        return `🔍 **Search Results for "${searchTerm}":**\n\n${results.join('\n')}`;
    }

    private searchInDirectory(dirPath: string, searchTerm: string, results: string[], maxResults: number = 20) {
        if (results.length >= maxResults) return;

        try {
            const entries = fs.readdirSync(dirPath);
            
            entries.forEach(entry => {
                if (results.length >= maxResults) return;
                if (entry.startsWith('.')) return; // Skip hidden files

                const fullPath = path.join(dirPath, entry);
                const stats = fs.statSync(fullPath);
                
                if (stats.isDirectory()) {
                    this.searchInDirectory(fullPath, searchTerm, results, maxResults);
                } else if (stats.isFile()) {
                    // Search in filename
                    if (entry.toLowerCase().includes(searchTerm.toLowerCase())) {
                        const relativePath = path.relative(this.workspaceRoot, fullPath);
                        results.push(`📄 ${relativePath} (filename match)`);
                    }
                    
                    // Search in file content (for text files)
                    if (this.isTextFile(entry) && stats.size < 1024 * 1024) { // Max 1MB
                        try {
                            const content = fs.readFileSync(fullPath, 'utf-8');
                            if (content.toLowerCase().includes(searchTerm.toLowerCase())) {
                                const relativePath = path.relative(this.workspaceRoot, fullPath);
                                results.push(`📄 ${relativePath} (content match)`);
                            }
                        } catch (error) {
                            // Ignore binary files or encoding errors
                        }
                    }
                }
            });
        } catch (error) {
            // Ignore permission errors or invalid directories
        }
    }

    private isTextFile(filename: string): boolean {
        const textExtensions = ['.txt', '.js', '.ts', '.py', '.html', '.css', '.json', '.md', '.yml', '.yaml', '.xml', '.csv'];
        const ext = path.extname(filename).toLowerCase();
        return textExtensions.includes(ext);
    }

    private formatFileSize(bytes: number): string {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    public getCurrentWorkspace(): string {
        return this.workspaceRoot;
    }

    public async getWorkspaceOverview(): Promise<string> {
        try {
            const overview = this.getDirectoryContents(this.workspaceRoot, false);
            return `🏠 **Workspace Overview:**\n\n${overview.join('\n')}`;
        } catch (error) {
            return `❌ Failed to get workspace overview: ${error}`;
        }
    }
}