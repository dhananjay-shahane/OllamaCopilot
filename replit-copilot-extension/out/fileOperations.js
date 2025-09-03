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
                : workspaceFolders[0].uri;
            const entries = await vscode.workspace.fs.readDirectory(rootUri);
            return entries
                .filter(([name, type]) => type === vscode.FileType.File)
                .map(([name]) => name);
        }
        catch (error) {
            throw new Error(`Failed to list files: ${error}`);
        }
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
        if (!workspaceFolders) {
            throw new Error('No workspace folder open');
        }
        return vscode.Uri.joinPath(workspaceFolders[0].uri, filePath);
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