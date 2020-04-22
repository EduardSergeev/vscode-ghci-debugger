import * as vscode from 'vscode';
import * as child_process from 'child_process';
import { GhciManager, GhciOptions } from "./ghci";
import { ExtensionState, HaskellWorkspaceType } from "./extension-state";
import { stackCommand, reportError } from './utils';
import Path = require('path');

export class Session implements vscode.Disposable {
  ghci: GhciManager;
  starting: Promise<void> | null;
  loading: Promise<void>;
  files: Set<string>;
  typeCache: Promise<string[]> | null;
  moduleMap: Map<string, string>;
  cwdOption: { cwd?: string };

  wasDisposed: boolean;

  constructor(
    public ext: ExtensionState,
    public workspaceType: HaskellWorkspaceType,
    public resourceType: 'workspace' | 'file',
    public resource: vscode.Uri,
    public ghciOptions: GhciOptions = new GhciOptions) {
    this.ghci = null;
    this.starting = null;
    this.loading = null;
    this.files = new Set();
    this.typeCache = null;
    this.moduleMap = new Map();
    this.cwdOption = resourceType === 'workspace' ? { cwd: this.resource.fsPath } : {};
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
        reportError(this.ext, err.toString());
        vscode.window.showWarningMessage(
          'Error while starting GHCi.',
          'Open log'
        ).then(
          (item) => {
            if (item === 'Open log') {
              this.ext.outputChannel?.show();
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

      const getStackIdeTargets = async () => {
        this.checkDisposed();
        const result = await new Promise<string>((resolve, reject) => {
          child_process.exec(
            `${ stackCommand } ide targets`,
            this.cwdOption,
            (err, stdout, stderr) => {
              if (err) {
                reject('Command stack ide targets failed:\n' + stderr);
              }
              else {
                resolve(stderr);
              }
            }
          );
        });
        return result.match(/^[^\s]+:[^\s]+$/gm);
      };

      const getCabalTargets = async (configure: string) => {
        const result = await new Promise<string>((resolve, reject) => {
          child_process.exec(
            `cabal ${configure} --dry-run`,
            this.cwdOption,
            (err, stdout, stderr) => {
              if (err) {
                reject('Command "cabal new-configure" failed:\n' + stderr);
              }
              else {
                resolve(stdout);
              }
            }
          );
        });
        const targets = [];
        for (let match, pattern = /^\s+-\s+(\S+)-.+?\((.+?)\)/gm; match = pattern.exec(result);) {
          const [, module, type] = match;
          targets.push(
            type.includes(':') ? type : module
          );
        }
        return targets;
      };

      const pickTarget = async (targets: string[]) =>
        targets.length > 1 ? await vscode.window.showQuickPick(targets) : targets[0];

      this.checkDisposed();
      const cmd = await (async () => {
        if (wst === 'custom-workspace' || wst === 'custom-file') {
          let cmd = vscode.workspace.getConfiguration('ghci-debugger', this.resource).replCommand;
          if (cmd.indexOf('$stack_ide_targets') !== -1) {
            const sit = await getStackIdeTargets();
            cmd.replace(/\$stack_ide_targets/g, sit.join(' '));
          }
          return cmd;
        } else if (wst === 'stack') {
          let target = this.ghciOptions.target || await pickTarget(await getStackIdeTargets());
          return `${stackCommand} repl${this.getStartOptions(' --ghci-options "', '"')} ${target}`;
        } else if (wst === 'cabal') {
          let target = this.ghciOptions.target || await pickTarget(await getCabalTargets('configure'));
          return `cabal repl${this.getStartOptions(' --ghc-options "', '"')} ${target}`;
        }
        else if (wst === 'cabal new') {
          let target = this.ghciOptions.target || await pickTarget(await getCabalTargets('new-configure'));
          return `cabal new-repl ${this.getStartOptions(' --ghc-options "', '"')} ${target}`;
        }
        else if (wst === 'cabal v2') {
          let target = this.ghciOptions.target || await pickTarget(await getCabalTargets('v2-configure'));
          return `cabal v2-repl ${this.getStartOptions(' --ghc-options "', '"')} ${target}`;
        }
        else if (wst === 'bare-stack') {
          return `${stackCommand} exec ghci${this.getStartOptions(' -- ')}`;
        }
        else if (wst === 'bare') {
          return `ghci${this.getStartOptions(' ')}`;
        }
      })();

      this.ext.outputChannel?.appendLine(`Starting GHCi with: ${ JSON.stringify(cmd) }`);
      this.ext.outputChannel?.appendLine(
        `(Under ${
        this.cwdOption.cwd === undefined
          ? 'default cwd'
          : `cwd ${ this.cwdOption.cwd }` })`);

      this.checkDisposed();
      this.ghci = new GhciManager(
        cmd,
        this.cwdOption,
        this.ext);
      const cmds = vscode.workspace.getConfiguration('ghci-debugger', this.resource).startupCommands;
      const configureCommands = [].concat(
        this.ghciOptions.startupCommands?.all || cmds.all,
        wst === 'bare-stack' || wst === 'bare' ? this.ghciOptions.startupCommands?.bare || cmds.bare : [],
        this.ghciOptions.startupCommands?.custom || cmds.custom
      );
      configureCommands.forEach(c => this.ghci.sendCommand(c));
    }
  }

  addFile(s: string) {
    this.files.add(s);
  }

  removeFile(s: string) {
    this.files.delete(s);
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
    await this.ghci.sendCommand(':module');
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
