import * as vscode from 'vscode';
import { OutputChannel } from 'vscode';
import { GhciManager, GhciOptions } from "./ghci";
import { stackCommand, reportError, getStackIdeTargets, pickTarget, getCabalTargets, HaskellWorkspaceType, computeFileType, computeWorkspaceType } from './utils';
import { Resource, asWorkspaceFolder } from './resource';
import Path = require('path');

export class Session implements vscode.Disposable {
  ghci: GhciManager;
  starting: Promise<void> | null;
  loading: Promise<void>;
  typeCache: Promise<string[]> | null;
  moduleMap: Map<string, string>;
  cwdOption: { cwd?: string };

  wasDisposed: boolean;

  constructor(
    public outputChannel: OutputChannel,
    public workspaceType: HaskellWorkspaceType,
    public resource: Resource,
    private target: string,
    private ghciOptions: GhciOptions = new GhciOptions) {
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
      const wst = this.workspaceType;
      
      this.checkDisposed();
      const cmd = await (async () => {
        if (wst === 'custom-workspace' || wst === 'custom-file') {
          let cmd = vscode.workspace.getConfiguration('ghci-debugger', this.resource).replCommand;
          if (cmd.indexOf('$stack_ide_targets') !== -1) {
            const sit = await getStackIdeTargets(this.cwdOption);
            cmd.replace(/\$stack_ide_targets/g, sit.join(' '));
          }
          return cmd;
        } else if (wst === 'stack') {
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

      this.checkDisposed();
      this.ghci = new GhciManager(
        cmd,
        this.cwdOption,
        this.outputChannel);
      const cmds = vscode.workspace.getConfiguration('ghci-debugger', this.resource).startupCommands;
      const configureCommands = [].concat(
        this.ghciOptions.startupCommands?.all || cmds.all,
        wst === 'bare-stack' || wst === 'bare' ? this.ghciOptions.startupCommands?.bare || cmds.bare : [],
        this.ghciOptions.startupCommands?.custom || cmds.custom
      );
      configureCommands.forEach(c => this.ghci.sendCommand(c));
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
    return this.ghciOptions.startOptions ?
      `${ prefix || '' }${ this.ghciOptions.startOptions }${ postfix || '' }` :
      "";
  }

  dispose() {
    this.wasDisposed = true;
    if (this.ghci !== null) {
      this.ghci.dispose();
    }
  }
}
