import * as vscode from 'vscode';
import * as path from 'path';

export interface FileEdit {
    filePath: string;
    operation: 'create' | 'update' | 'delete' | 'rename';
    content?: string;
    newPath?: string; // for rename operations
    range?: vscode.Range; // for partial updates
}

export class FileOperationsManager {
    private outputChannel: vscode.OutputChannel;

    constructor() {
        this.outputChannel = vscode.window.createOutputChannel('Replit Copilot');
    }

    public async readFile(filePath: string): Promise<string> {
        try {
            const uri = this.resolveUri(filePath);
            const document = await vscode.workspace.openTextDocument(uri);
            return document.getText();
        } catch (error) {
            throw new Error(`Failed to read file ${filePath}: ${error}`);
        }
    }

    public async writeFile(filePath: string, content: string): Promise<void> {
        try {
            const uri = this.resolveUri(filePath);
            const encoder = new TextEncoder();
            await vscode.workspace.fs.writeFile(uri, encoder.encode(content));
            this.log(`Created/Updated file: ${filePath}`);
        } catch (error) {
            throw new Error(`Failed to write file ${filePath}: ${error}`);
        }
    }

    public async deleteFile(filePath: string): Promise<void> {
        try {
            const uri = this.resolveUri(filePath);
            await vscode.workspace.fs.delete(uri);
            this.log(`Deleted file: ${filePath}`);
        } catch (error) {
            throw new Error(`Failed to delete file ${filePath}: ${error}`);
        }
    }

    public async renameFile(oldPath: string, newPath: string): Promise<void> {
        try {
            const oldUri = this.resolveUri(oldPath);
            const newUri = this.resolveUri(newPath);
            await vscode.workspace.fs.rename(oldUri, newUri);
            this.log(`Renamed file: ${oldPath} -> ${newPath}`);
        } catch (error) {
            throw new Error(`Failed to rename file ${oldPath} to ${newPath}: ${error}`);
        }
    }

    public async applyEdit(edit: FileEdit): Promise<void> {
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
                    } else if (edit.content !== undefined) {
                        await this.writeFile(edit.filePath, edit.content);
                    } else {
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
        } catch (error) {
            throw new Error(`Failed to apply edit: ${error}`);
        }
    }

    public async updateFileRange(filePath: string, range: vscode.Range, newContent: string): Promise<void> {
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
        } catch (error) {
            throw new Error(`Failed to update file range ${filePath}: ${error}`);
        }
    }

    public async listFiles(directoryPath?: string): Promise<string[]> {
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
                .filter(([name, type]: [string, vscode.FileType]) => type === vscode.FileType.File)
                .map(([name]: [string, vscode.FileType]) => name);
        } catch (error) {
            throw new Error(`Failed to list files: ${error}`);
        }
    }

    public async createDirectory(directoryPath: string): Promise<void> {
        try {
            const uri = this.resolveUri(directoryPath);
            await vscode.workspace.fs.createDirectory(uri);
            this.log(`Created directory: ${directoryPath}`);
        } catch (error) {
            throw new Error(`Failed to create directory ${directoryPath}: ${error}`);
        }
    }

    public async fileExists(filePath: string): Promise<boolean> {
        try {
            const uri = this.resolveUri(filePath);
            await vscode.workspace.fs.stat(uri);
            return true;
        } catch {
            return false;
        }
    }

    public async getFileInfo(filePath: string): Promise<vscode.FileStat> {
        const uri = this.resolveUri(filePath);
        return await vscode.workspace.fs.stat(uri);
    }

    public async openFileInEditor(filePath: string, range?: vscode.Range): Promise<void> {
        try {
            const uri = this.resolveUri(filePath);
            const document = await vscode.workspace.openTextDocument(uri);
            const editor = await vscode.window.showTextDocument(document);
            
            if (range) {
                editor.selection = new vscode.Selection(range.start, range.end);
                editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
            }
        } catch (error) {
            throw new Error(`Failed to open file in editor ${filePath}: ${error}`);
        }
    }

    private resolveUri(filePath: string): vscode.Uri {
        if (path.isAbsolute(filePath)) {
            return vscode.Uri.file(filePath);
        }

        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            throw new Error('No workspace folder open');
        }

        return vscode.Uri.joinPath(workspaceFolders[0].uri, filePath);
    }

    private log(message: string): void {
        this.outputChannel.appendLine(`[${new Date().toISOString()}] ${message}`);
    }

    public dispose(): void {
        this.outputChannel.dispose();
    }
}