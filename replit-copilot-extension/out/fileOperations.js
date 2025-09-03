"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileOperationsManager = void 0;
const vscode = require("vscode");
const path = require("path");
class FileOperationsManager {
    constructor() {
        this.outputChannel = vscode.window.createOutputChannel('Replit Copilot');
    }
    async readFile(filePath) {
        try {
            const uri = this.resolveUri(filePath);
            const document = await vscode.workspace.openTextDocument(uri);
            return document.getText();
        }
        catch (error) {
            throw new Error(`Failed to read file ${filePath}: ${error}`);
        }
    }
    async writeFile(filePath, content) {
        try {
            const uri = this.resolveUri(filePath);
            const encoder = new TextEncoder();
            await vscode.workspace.fs.writeFile(uri, encoder.encode(content));
            this.log(`Created/Updated file: ${filePath}`);
        }
        catch (error) {
            throw new Error(`Failed to write file ${filePath}: ${error}`);
        }
    }
    async deleteFile(filePath) {
        try {
            const uri = this.resolveUri(filePath);
            await vscode.workspace.fs.delete(uri);
            this.log(`Deleted file: ${filePath}`);
        }
        catch (error) {
            throw new Error(`Failed to delete file ${filePath}: ${error}`);
        }
    }
    async renameFile(oldPath, newPath) {
        try {
            const oldUri = this.resolveUri(oldPath);
            const newUri = this.resolveUri(newPath);
            await vscode.workspace.fs.rename(oldUri, newUri);
            this.log(`Renamed file: ${oldPath} -> ${newPath}`);
        }
        catch (error) {
            throw new Error(`Failed to rename file ${oldPath} to ${newPath}: ${error}`);
        }
    }
    async applyEdit(edit) {
        try {
            switch (edit.operation) {
                case 'create':
                    if (!edit.content) {
                        throw new Error('Content required for create operation');
                    }
                    await this.writeFile(edit.filePath, edit.content);
                    break;
                case 'update':
                    if (edit.range && edit.content !== undefined) {
                        await this.updateFileRange(edit.filePath, edit.range, edit.content);
                    }
                    else if (edit.content !== undefined) {
                        await this.writeFile(edit.filePath, edit.content);
                    }
                    else {
                        throw new Error('Content required for update operation');
                    }
                    break;
                case 'delete':
                    await this.deleteFile(edit.filePath);
                    break;
                case 'rename':
                    if (!edit.newPath) {
                        throw new Error('New path required for rename operation');
                    }
                    await this.renameFile(edit.filePath, edit.newPath);
                    break;
                default:
                    throw new Error(`Unknown operation: ${edit.operation}`);
            }
        }
        catch (error) {
            throw new Error(`Failed to apply edit: ${error}`);
        }
    }
    async updateFileRange(filePath, range, newContent) {
        try {
            const uri = this.resolveUri(filePath);
            const document = await vscode.workspace.openTextDocument(uri);
            const edit = new vscode.WorkspaceEdit();
            edit.replace(uri, range, newContent);
            const success = await vscode.workspace.applyEdit(edit);
            if (!success) {
                throw new Error('Failed to apply workspace edit');
            }
            this.log(`Updated range in file: ${filePath}`);
        }
        catch (error) {
            throw new Error(`Failed to update file range ${filePath}: ${error}`);
        }
    }
    async listFiles(directoryPath) {
        try {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders) {
                throw new Error('No workspace folder open');
            }
            const rootUri = directoryPath
                ? this.resolveUri(directoryPath)
                : workspaceFolders[0]?.uri;
            if (!rootUri) {
                throw new Error('No workspace folder available');
            }
            const entries = await vscode.workspace.fs.readDirectory(rootUri);
            return entries
                .filter(([name, type]) => type === vscode.FileType.File)
                .map(([name]) => name);
        }
        catch (error) {
            throw new Error(`Failed to list files: ${error}`);
        }
    }
    // Enhanced VS Code workflow operations
    async readCurrentlyOpenFile() {
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) {
            return null;
        }
        return {
            path: activeEditor.document.fileName,
            content: activeEditor.document.getText()
        };
    }
    async runTerminalCommand(command, workingDirectory) {
        return new Promise((resolve) => {
            const terminal = vscode.window.createTerminal({
                name: 'Ollama Chat Command',
                cwd: workingDirectory
            });
            // For now, show the command in terminal and return a placeholder
            terminal.show();
            terminal.sendText(command);
            // Note: VS Code doesn't provide direct access to terminal output
            // This would need a more sophisticated implementation for real output capture
            resolve({
                stdout: `Command executed: ${command}`,
                stderr: '',
                exitCode: 0
            });
        });
    }
    async fileGlobSearch(pattern) {
        try {
            const files = await vscode.workspace.findFiles(pattern);
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders) {
                return files.map(file => file.fsPath);
            }
            const firstWorkspace = workspaceFolders[0];
            if (!firstWorkspace) {
                return files.map(file => file.fsPath);
            }
            const workspaceRoot = firstWorkspace.uri.fsPath;
            return files.map(file => {
                const relativePath = vscode.workspace.asRelativePath(file);
                return relativePath;
            });
        }
        catch (error) {
            throw new Error(`Failed to search files with pattern ${pattern}: ${error}`);
        }
    }
    async grepSearch(searchTerm, filePattern = '**/*') {
        try {
            const files = await vscode.workspace.findFiles(filePattern);
            const results = [];
            for (const file of files) {
                try {
                    const document = await vscode.workspace.openTextDocument(file);
                    const text = document.getText();
                    const lines = text.split('\n');
                    lines.forEach((line, index) => {
                        if (line.toLowerCase().includes(searchTerm.toLowerCase())) {
                            results.push({
                                file: vscode.workspace.asRelativePath(file),
                                line: index + 1,
                                content: line.trim()
                            });
                        }
                    });
                }
                catch (e) {
                    // Skip files that can't be read
                }
            }
            return results;
        }
        catch (error) {
            throw new Error(`Failed to grep search for term ${searchTerm}: ${error}`);
        }
    }
    async searchAndReplaceInFile(filePath, searchPattern, replacement) {
        try {
            const uri = this.resolveUri(filePath);
            const document = await vscode.workspace.openTextDocument(uri);
            const text = document.getText();
            if (!text.includes(searchPattern)) {
                return false;
            }
            const newText = text.replace(new RegExp(searchPattern, 'g'), replacement);
            const edit = new vscode.WorkspaceEdit();
            const fullRange = new vscode.Range(document.positionAt(0), document.positionAt(text.length));
            edit.replace(uri, fullRange, newText);
            const success = await vscode.workspace.applyEdit(edit);
            if (success) {
                this.log(`Search and replace completed in: ${filePath}`);
            }
            return success;
        }
        catch (error) {
            throw new Error(`Failed to search and replace in file ${filePath}: ${error}`);
        }
    }
    async viewDiff(file1Path, file2Path) {
        try {
            const uri1 = this.resolveUri(file1Path);
            const uri2 = this.resolveUri(file2Path);
            // Use VS Code's diff command
            await vscode.commands.executeCommand('vscode.diff', uri1, uri2, `${file1Path} ↔ ${file2Path}`);
            // Return a simple text representation
            const content1 = await this.readFile(file1Path);
            const content2 = await this.readFile(file2Path);
            return `Diff opened in VS Code editor.\n\nFile 1 (${file1Path}):\n${content1.slice(0, 200)}...\n\nFile 2 (${file2Path}):\n${content2.slice(0, 200)}...`;
        }
        catch (error) {
            throw new Error(`Failed to view diff: ${error}`);
        }
    }
    async viewRepoMap() {
        try {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders) {
                throw new Error('No workspace folder open');
            }
            const rootPath = workspaceFolders[0].uri.fsPath;
            const files = await vscode.workspace.findFiles('**/*', '**/node_modules/**');
            const structure = {};
            const languages = new Set();
            for (const file of files) {
                const relativePath = vscode.workspace.asRelativePath(file);
                const dir = vscode.workspace.asRelativePath(vscode.Uri.file(file.fsPath.split('/').slice(0, -1).join('/')));
                const ext = file.fsPath.split('.').pop() || 'no-ext';
                if (!structure[dir]) {
                    structure[dir] = [];
                }
                structure[dir].push(relativePath);
                languages.add(ext);
            }
            let map = `Repository Map (${files.length} files)\n`;
            map += `Languages: ${Array.from(languages).join(', ')}\n\n`;
            for (const [dir, fileList] of Object.entries(structure)) {
                map += `📁 ${dir}/\n`;
                fileList.slice(0, 5).forEach(file => {
                    map += `  📄 ${file.split('/').pop()}\n`;
                });
                if (fileList.length > 5) {
                    map += `  ... and ${fileList.length - 5} more files\n`;
                }
                map += '\n';
            }
            return map;
        }
        catch (error) {
            throw new Error(`Failed to generate repository map: ${error}`);
        }
    }
    async viewSubdirectory(dirPath) {
        try {
            const uri = this.resolveUri(dirPath);
            const entries = await vscode.workspace.fs.readDirectory(uri);
            let result = `📁 ${dirPath}/\n`;
            for (const [name, type] of entries) {
                const icon = type === vscode.FileType.Directory ? '📁' : '📄';
                result += `  ${icon} ${name}\n`;
            }
            return result;
        }
        catch (error) {
            throw new Error(`Failed to view subdirectory ${dirPath}: ${error}`);
        }
    }
    async fetchUrlContent(url) {
        try {
            // For VS Code extension, we can use node's fetch or axios
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            return await response.text();
        }
        catch (error) {
            throw new Error(`Failed to fetch content from ${url}: ${error}`);
        }
    }
    async createRuleBlock(ruleType, content) {
        // Create a formatted rule block for code organization
        const timestamp = new Date().toISOString();
        const rule = `// === ${ruleType.toUpperCase()} RULE - ${timestamp} ===\n${content}\n// === END ${ruleType.toUpperCase()} RULE ===\n`;
        this.log(`Created rule block: ${ruleType}`);
        return rule;
    }
    async createDirectory(directoryPath) {
        try {
            const uri = this.resolveUri(directoryPath);
            await vscode.workspace.fs.createDirectory(uri);
            this.log(`Created directory: ${directoryPath}`);
        }
        catch (error) {
            throw new Error(`Failed to create directory ${directoryPath}: ${error}`);
        }
    }
    async fileExists(filePath) {
        try {
            const uri = this.resolveUri(filePath);
            await vscode.workspace.fs.stat(uri);
            return true;
        }
        catch {
            return false;
        }
    }
    async getFileInfo(filePath) {
        const uri = this.resolveUri(filePath);
        return await vscode.workspace.fs.stat(uri);
    }
    async openFileInEditor(filePath, range) {
        try {
            const uri = this.resolveUri(filePath);
            const document = await vscode.workspace.openTextDocument(uri);
            const editor = await vscode.window.showTextDocument(document);
            if (range) {
                editor.selection = new vscode.Selection(range.start, range.end);
                editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
            }
        }
        catch (error) {
            throw new Error(`Failed to open file in editor ${filePath}: ${error}`);
        }
    }
    resolveUri(filePath) {
        if (path.isAbsolute(filePath)) {
            return vscode.Uri.file(filePath);
        }
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            throw new Error('No workspace folder open');
        }
        const firstWorkspace = workspaceFolders[0];
        if (!firstWorkspace) {
            throw new Error('No workspace folder available');
        }
        return vscode.Uri.joinPath(firstWorkspace.uri, filePath);
    }
    log(message) {
        this.outputChannel.appendLine(`[${new Date().toISOString()}] ${message}`);
    }
    dispose() {
        this.outputChannel.dispose();
    }
}
exports.FileOperationsManager = FileOperationsManager;
//# sourceMappingURL=fileOperations.js.map