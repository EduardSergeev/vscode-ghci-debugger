import * as vscode from 'vscode';
import * as Path from 'path';
import { OutputChannel } from 'vscode';
import GhciManager from "./ghci";
import { stackCommand, reportError } from './utils';
import { Resource, asWorkspaceFolder } from './resource';
import { Project } from './project';

export default class Session implements vscode.Disposable {
  ghci: GhciManager;
  starting: Promise<void> | null;
  loading: Promise<void>;
  typeCache: Promise<string[]> | null;
  moduleMap: Map<string, string>;
  cwdOption: { cwd?: string };

  wasDisposed: boolean;

  constructor(
    public outputChannel: OutputChannel,
    public projectType: Project,
    public resource: Resource,
    private target: string,
    private ghciOptions: string[]) {
    this.ghci = null;
    this.starting = null;
    this.loading = null;
    this.typeCache = null;
    this.moduleMap = new Map();
    this.cwdOption = asWorkspaceFolder(resource) ? { cwd: resource.uri.fsPath } : {};
    this.wasDisposed = false;
  }

  checkDisposed() {
    if (this.wasDisposed) {
      throw new Error('session already disposed');
    }
  }

  start() {
    if (this.starting === null) {
      this.starting = this.startP();
      this.starting.catch(err => {
        if (this.wasDisposed) {
          // We are disposed so do not report error
          return;
        }
        reportError(this.outputChannel, err.toString());
        vscode.window.showWarningMessage(
          'Error while starting GHCi.',
          'Open log'
        ).then(
          (item) => {
            if (item === 'Open log') {
              this.outputChannel.show();
            }
          },
          (err) => console.error(err)
        );
      });
    }

    return this.starting;
  }

  async startP() {
    if (this.ghci === null) {
      this.checkDisposed();
      const wst = this.projectType;

      const cmd = await (async () => {
        if (wst === 'stack') {
          return `${stackCommand} repl${this.getStartOptions(' --ghci-options "', '"')} ${this.target}`;
        } else if (wst === 'cabal') {
          return `cabal repl${this.getStartOptions(' --ghc-options "', '"')} ${this.target}`;
        }
        else if (wst === 'cabal new') {
          return `cabal new-repl ${this.getStartOptions(' --ghc-options "', '"')} ${this.target}`;
        }
        else if (wst === 'cabal v2') {
          return `cabal v2-repl ${this.getStartOptions(' --ghc-options "', '"')} ${this.target}`;
        }
        else if (wst === 'bare-stack') {
          return `${stackCommand} exec ghci ${this.target}${this.getStartOptions(' -- ')}`;
        }
        else if (wst === 'bare') {
          return `ghci ${this.target}${this.getStartOptions(' ')}`;
        }
      })();

      this.outputChannel.appendLine(`Starting GHCi with: ${ JSON.stringify(cmd) }`);
      this.outputChannel.appendLine(
        `(Under ${
        this.cwdOption.cwd === undefined
          ? 'default cwd'
          : `cwd ${ this.cwdOption.cwd }` })`);

      this.ghci = new GhciManager(
        cmd,
        this.cwdOption,
        this.outputChannel
      );
    }
  }

  async reload(): Promise<string[]> {
    this.typeCache = null;
    const pr = this.reloadP();
    this.loading = pr.then(() => undefined);
    return pr;
  }

  async reloadP(): Promise<string[]> {
    await this.start();
    const modules = await this.ghci.sendCommand(':show modules');

    this.moduleMap.clear();
    for (const line of modules) {
      const match = /^([^ ]+)\s+\( (.+), .+ \)$/.exec(line);
      if (match) {
        const [, module, path] = match;
        const fullPath = Path.isAbsolute(path) ?
          path :
          Path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, path);
        this.moduleMap.set(fullPath.toLowerCase(), module);
      }
    }
    // await this.ghci.sendCommand(':module');
    return modules;
  }

  getModuleName(filename: string): string {
    return this.moduleMap.get(filename);
  }

  getStartOptions(prefix?: string, postfix?: string): string {
    return this.ghciOptions ?
      `${prefix || ''}${this.ghciOptions}${postfix || ''}` :
      "";
  }

  dispose() {
    this.wasDisposed = true;
    if (this.ghci !== null) {
      this.ghci.dispose();
    }
  }
}
