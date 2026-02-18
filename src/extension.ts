import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execFile } from 'child_process';
import { SpritesClient } from '@fly/sprites';
import { SpriteFileSystemProvider } from './spriteFileSystem';

let globalClient: SpritesClient | null = null;
const spriteFs = new SpriteFileSystemProvider();
let initPromise: Promise<void> | null = null;

function createSpritePty(spriteName: string): vscode.Pseudoterminal {
    const sprite = globalClient!.sprite(spriteName);
    const writeEmitter = new vscode.EventEmitter<string>();
    let shellCmd: any;

    return {
        onDidWrite: writeEmitter.event,
        open: async (initialDimensions) => {
            writeEmitter.fire(`Connecting to sprite: ${spriteName}\r\n`);
            try {
                shellCmd = sprite.spawn('bash', ['-l'], {
                    tty: true,
                    rows: initialDimensions?.rows || 24,
                    cols: initialDimensions?.columns || 80
                });

                shellCmd.stdout?.on('data', (data: Buffer) => {
                    writeEmitter.fire(data.toString());
                });

                shellCmd.stderr?.on('data', (data: Buffer) => {
                    writeEmitter.fire(data.toString());
                });

                shellCmd.on('exit', () => {
                    writeEmitter.fire('\r\n[Disconnected]\r\n');
                });
            } catch (error: any) {
                writeEmitter.fire(`\r\nError: ${error.message}\r\n`);
            }
        },
        close: () => {
            if (shellCmd) {
                shellCmd.kill();
            }
        },
        handleInput: (data: string) => {
            if (shellCmd?.stdin) {
                shellCmd.stdin.write(data);
            }
        },
        setDimensions: (dimensions: vscode.TerminalDimensions) => {
            if (shellCmd) {
                shellCmd.resize(dimensions.columns, dimensions.rows);
            }
        }
    };
}

function getSpriteName(): string | undefined {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders?.length === 1 && workspaceFolders[0].uri.scheme === 'sprite') {
        return workspaceFolders[0].uri.authority;
    }

    const activeUri = vscode.window.activeTextEditor?.document.uri;
    if (activeUri?.scheme === 'sprite') {
        return activeUri.authority;
    }

    return undefined;
}

/**
 * Try to extract the API token from the Sprites CLI by running
 * `sprite api /v1/sprites -v` and parsing the Authorization header from
 * curl's verbose output. Returns null if CLI isn't installed or not authenticated.
 */
async function tryReadCliToken(): Promise<string | null> {
    return new Promise((resolve) => {
        execFile('sprite', ['api', '/v1/sprites', '-v'], {
            timeout: 15000,
            env: { ...process.env },
        }, (error, stdout, stderr) => {
            // The token appears in stderr (curl verbose output) as:
            // > Authorization: Bearer <token>
            const combined = (stderr || '') + (stdout || '');
            const match = combined.match(/Authorization:\s*Bearer\s+(\S+)/i);
            if (match && match[1]) {
                resolve(match[1]);
            } else {
                resolve(null);
            }
        });
    });
}

/**
 * Initialize the client with a token. Validates by calling listAllSprites().
 * Returns true if successful, false if the token is invalid.
 */
async function initClient(token: string): Promise<boolean> {
    try {
        const client = new SpritesClient(token);
        await client.listAllSprites();
        globalClient = client;
        spriteFs.setClient(client);
        return true;
    } catch {
        return false;
    }
}

/**
 * Ensure the client is initialized. Awaits the startup init, then returns
 * whether globalClient is available. Commands should call this before proceeding.
 */
async function ensureClient(): Promise<boolean> {
    if (globalClient) { return true; }
    if (initPromise) { await initPromise; }
    return globalClient !== null;
}

export function activate(context: vscode.ExtensionContext) {
    console.log('Sprite extension is now active');

    // Register filesystem provider IMMEDIATELY on activation
    context.subscriptions.push(
        vscode.workspace.registerFileSystemProvider('sprite', spriteFs, {
            isCaseSensitive: true,
            isReadonly: false
        })
    );

    // Restore token on startup with proper error handling
    initPromise = (async () => {
        // 1. Try VS Code secrets first
        const savedToken = await context.secrets.get('spriteToken');
        if (savedToken) {
            const valid = await initClient(savedToken);
            if (valid) {
                console.log('Sprite: Token restored from secrets');
                return;
            }
            console.warn('Sprite: Saved token is invalid or expired');
        }

        // 2. Try the CLI as fallback
        if (!globalClient) {
            const cliToken = await tryReadCliToken();
            if (cliToken) {
                const valid = await initClient(cliToken);
                if (valid) {
                    await context.secrets.store('spriteToken', cliToken);
                    console.log('Sprite: Token restored from CLI');
                    return;
                }
            }
        }

        // 3. If we had a saved token that failed, notify the user
        if (savedToken && !globalClient) {
            const action = await vscode.window.showWarningMessage(
                'Sprite: Saved API token is invalid or expired',
                'Set New Token'
            );
            if (action === 'Set New Token') {
                vscode.commands.executeCommand('sprite.setToken');
            }
        }
    })();

    // Auto-open terminal if we're in a sprite:// virtual workspace
    const folders = vscode.workspace.workspaceFolders;
    if (folders?.length === 1 && folders[0].uri.scheme === 'sprite') {
        initPromise.then(() => {
            if (globalClient) {
                vscode.commands.executeCommand('sprite.openTerminal');
            }
        });
    }

    // Register terminal profile provider so "Sprite" appears in the terminal dropdown
    context.subscriptions.push(
        vscode.window.registerTerminalProfileProvider('sprite.terminal', {
            async provideTerminalProfile(token: vscode.CancellationToken): Promise<vscode.TerminalProfile | undefined> {
                if (initPromise) { await initPromise; }
                const spriteName = getSpriteName();
                if (!spriteName || !globalClient) {
                    return undefined;
                }
                return new vscode.TerminalProfile({
                    name: `Sprite: ${spriteName}`,
                    pty: createSpritePty(spriteName)
                });
            }
        })
    );

    // Set Sprite as the default terminal profile when in a sprite workspace
    if (folders?.length === 1 && folders[0].uri.scheme === 'sprite') {
        const platformMap: Record<string, string> = {
            'darwin': 'osx',
            'linux': 'linux',
            'win32': 'windows'
        };
        const platform = platformMap[process.platform] || 'linux';
        const config = vscode.workspace.getConfiguration('terminal.integrated');
        config.update(`defaultProfile.${platform}`, 'Sprite', vscode.ConfigurationTarget.Workspace);
    }

    // Command: Set API Token
    const setToken = vscode.commands.registerCommand('sprite.setToken', async () => {
        const token = await vscode.window.showInputBox({
            prompt: 'Enter your Sprites.dev API token',
            password: true,
            ignoreFocusOut: true
        });

        if (token) {
            await context.secrets.store('spriteToken', token);
            const valid = await initClient(token);
            if (valid) {
                vscode.window.showInformationMessage('Sprite API token saved');
            } else {
                vscode.window.showErrorMessage('Sprite: Token is invalid. Please check your token and try again.');
            }
        }
    });

    // Command: Open Sprite
    const openSprite = vscode.commands.registerCommand('sprite.openSprite', async () => {
        const ready = await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Sprite: Connecting...',
        }, () => ensureClient());

        if (!ready) {
            const setNow = await vscode.window.showErrorMessage(
                'Sprite: No API token found. Set one or authenticate with the Sprite CLI.',
                'Set Token'
            );
            if (setNow === 'Set Token') {
                vscode.commands.executeCommand('sprite.setToken');
            }
            return;
        }

        try {
            const sprites = await globalClient!.listAllSprites();

            if (sprites.length === 0) {
                const create = await vscode.window.showInformationMessage(
                    'No sprites found. Create one?',
                    'Create Sprite'
                );
                if (create === 'Create Sprite') {
                    vscode.commands.executeCommand('sprite.createSprite');
                }
                return;
            }

            const items: Array<{label: string; description: string; sprite: any}> = sprites.map((s: any) => ({
                label: s.name,
                description: s.status || '',
                sprite: s
            }));

            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: 'Select a Sprite to open'
            });

            if (!selected) {
                return;
            }

            const pathInput = await vscode.window.showInputBox({
                prompt: 'Enter path to open',
                value: '/home/sprite',
                ignoreFocusOut: true
            });

            if (!pathInput) {
                return;
            }

            const uri = vscode.Uri.parse(`sprite://${selected.sprite.name}${pathInput}`);
            await vscode.commands.executeCommand('vscode.openFolder', uri, { forceNewWindow: true });
        } catch (error: any) {
            vscode.window.showErrorMessage(`Error: ${error.message}`);
        }
    });

    // Command: Create Sprite
    const createSprite = vscode.commands.registerCommand('sprite.createSprite', async () => {
        const ready = await ensureClient();
        if (!ready) {
            vscode.window.showErrorMessage('Sprite: No API token. Use "Sprites: Set API Token" first.');
            return;
        }

        const name = await vscode.window.showInputBox({
            prompt: 'Enter sprite name',
            placeHolder: 'my-sprite'
        });

        if (!name) {
            return;
        }

        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `Creating sprite: ${name}`,
                cancellable: false
            }, async () => {
                await globalClient!.createSprite(name);
            });

            const open = await vscode.window.showInformationMessage(
                `Sprite '${name}' created successfully`,
                'Open Sprite'
            );

            if (open === 'Open Sprite') {
                const uri = vscode.Uri.parse(`sprite://${name}/home/sprite`);
                await vscode.commands.executeCommand('vscode.openFolder', uri, { forceNewWindow: true });
            }
        } catch (error: any) {
            vscode.window.showErrorMessage(`Error creating sprite: ${error.message}`);
        }
    });

    // Command: Open Terminal
    const openTerminal = vscode.commands.registerCommand('sprite.openTerminal', async () => {
        const ready = await ensureClient();
        if (!ready) {
            vscode.window.showErrorMessage('Sprite: No API token. Use "Sprites: Set API Token" first.');
            return;
        }

        let spriteName = getSpriteName();

        if (!spriteName) {
            const sprites = await globalClient!.listAllSprites();
            if (sprites.length === 0) {
                vscode.window.showInformationMessage('No sprites found');
                return;
            }

            const items: Array<{label: string; sprite: any}> = sprites.map((s: any) => ({ label: s.name, sprite: s }));
            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: 'Select sprite for terminal'
            });

            if (!selected) {
                return;
            }
            spriteName = selected.sprite.name;
        }

        const terminal = vscode.window.createTerminal({
            name: `Sprite: ${spriteName}`,
            pty: createSpritePty(spriteName!)
        });
        terminal.show();
    });

    // Command: Delete Sprite
    const deleteSprite = vscode.commands.registerCommand('sprite.deleteSprite', async () => {
        const ready = await ensureClient();
        if (!ready) {
            vscode.window.showErrorMessage('Sprite: No API token. Use "Sprites: Set API Token" first.');
            return;
        }

        try {
            const sprites = await globalClient!.listAllSprites();
            if (sprites.length === 0) {
                vscode.window.showInformationMessage('No sprites found');
                return;
            }

            const items: Array<{label: string; sprite: any}> = sprites.map((s: any) => ({ label: s.name, sprite: s }));
            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: 'Select sprite to delete'
            });

            if (!selected) {
                return;
            }

            const confirm = await vscode.window.showWarningMessage(
                `Delete sprite '${selected.sprite.name}'? This cannot be undone.`,
                { modal: true },
                'Delete'
            );

            if (confirm === 'Delete') {
                await globalClient!.deleteSprite(selected.sprite.name);

                vscode.window.showInformationMessage(`Sprite '${selected.sprite.name}' deleted`);

                const currentFolders = vscode.workspace.workspaceFolders;
                if (currentFolders?.length === 1 &&
                    currentFolders[0].uri.scheme === 'sprite' &&
                    currentFolders[0].uri.authority === selected.sprite.name) {
                    vscode.commands.executeCommand('workbench.action.closeWindow');
                }
            }
        } catch (error: any) {
            vscode.window.showErrorMessage(`Error: ${error.message}`);
        }
    });

    // Command: Refresh
    const refreshSprite = vscode.commands.registerCommand('sprite.refresh', async () => {
        vscode.commands.executeCommand('workbench.files.action.refreshFilesExplorer');
    });

    // Command: Download to Local
    const downloadToLocal = vscode.commands.registerCommand('sprite.downloadToLocal', async (uri?: vscode.Uri) => {
        if (!uri) {
            uri = vscode.window.activeTextEditor?.document.uri;
        }

        if (!uri || uri.scheme !== 'sprite') {
            vscode.window.showErrorMessage('Please select a file or folder from a Sprite');
            return;
        }

        const isDirectory = (await vscode.workspace.fs.stat(uri)).type === vscode.FileType.Directory;

        let targetPath: vscode.Uri | undefined;
        if (isDirectory) {
            const folders = await vscode.window.showOpenDialog({
                canSelectFiles: false,
                canSelectFolders: true,
                canSelectMany: false,
                openLabel: 'Select Download Location'
            });
            if (folders && folders.length > 0) {
                const folderName = path.basename(uri.path);
                targetPath = vscode.Uri.joinPath(folders[0], folderName);
            }
        } else {
            const fileName = path.basename(uri.path);
            targetPath = await vscode.window.showSaveDialog({
                defaultUri: vscode.Uri.file(path.join(os.homedir(), 'Downloads', fileName)),
                saveLabel: 'Download'
            });
        }

        if (!targetPath) {
            return;
        }

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Downloading ${path.basename(uri.path)}`,
            cancellable: false
        }, async (progress) => {
            try {
                if (isDirectory) {
                    await downloadDirectory(uri!, targetPath!);
                } else {
                    const content = await vscode.workspace.fs.readFile(uri!);
                    await fs.promises.mkdir(path.dirname(targetPath!.fsPath), { recursive: true });
                    await fs.promises.writeFile(targetPath!.fsPath, content);
                }
                vscode.window.showInformationMessage(`Downloaded to ${targetPath!.fsPath}`);
            } catch (error: any) {
                vscode.window.showErrorMessage(`Download failed: ${error.message}`);
            }
        });
    });

    async function downloadDirectory(sourceUri: vscode.Uri, targetUri: vscode.Uri): Promise<void> {
        await fs.promises.mkdir(targetUri.fsPath, { recursive: true });

        const entries = await vscode.workspace.fs.readDirectory(sourceUri);
        for (const [name, type] of entries) {
            const sourceChild = vscode.Uri.joinPath(sourceUri, name);
            const targetChild = vscode.Uri.joinPath(targetUri, name);

            if (type === vscode.FileType.Directory) {
                await downloadDirectory(sourceChild, targetChild);
            } else {
                const content = await vscode.workspace.fs.readFile(sourceChild);
                await fs.promises.writeFile(targetChild.fsPath, content);
            }
        }
    }

    context.subscriptions.push(
        setToken,
        openSprite,
        createSprite,
        openTerminal,
        deleteSprite,
        refreshSprite,
        downloadToLocal
    );
}

export function deactivate() {}
