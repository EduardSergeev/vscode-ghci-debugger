import * as vscode from 'vscode';
import * as Path from 'path';
import { OutputChannel } from 'vscode';
import GhciManager from "./ghci";
import { stackCommand, reportError } from './utils';
import { Resource, asWorkspaceFolder } from './resource';
import { Project } from './project';
import { ChildProcess } from 'child_process';

export default class Session implements vscode.Disposable {
  ghci: GhciManager;
  starting: Promise<ChildProcess> | null;
  loading: Promise<void>;
  typeCache: Promise<string[]> | null;
  moduleMap: Map<string, string>;
  cwdOption: { cwd?: string };

  wasDisposed: boolean;

  constructor(
    public outputChannel: OutputChannel,
    public projectType: Project,
    public resource: Resource,
    private targets: string,
    private ghciOptions: string[]) {
    this.starting = null;
    this.loading = null;
    this.typeCache = null;
    this.moduleMap = new Map();
    this.cwdOption = asWorkspaceFolder(resource) ? { cwd: resource.uri.fsPath } : {};
    this.ghci = new GhciManager(
      this.cwdOption,
      this.outputChannel
    );
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

  startP() {
    const wst = this.projectType;

    const ghciParams = (prefix?: string, postfix?: string) =>
      this.ghciOptions ? `${prefix || ''}${this.ghciOptions}${postfix || ''}` : "";

    const cmd = (() => {
      if (wst === 'stack') {
        return `${stackCommand} repl${ghciParams(' --ghci-options "', '"')} ${this.targets}`;
      } else if (wst === 'cabal') {
        return `cabal repl${ghciParams(' --ghc-options "', '"')} ${this.targets}`;
      }
      else if (wst === 'cabal new') {
        return `cabal new-repl ${ghciParams(' --ghc-options "', '"')} ${this.targets}`;
      }
      else if (wst === 'cabal v2') {
        return `cabal v2-repl ${ghciParams(' --ghc-options "', '"')} ${this.targets}`;
      }
      else if (wst === 'bare-stack') {
        return `${stackCommand} exec ghci ${this.targets}${ghciParams(' -- ')}`;
      }
      else if (wst === 'bare') {
        return `ghci ${this.targets}${ghciParams(' ')}`;
      }
    })();

    this.outputChannel.appendLine(`Starting GHCi with: ${JSON.stringify(cmd)}`);
    this.outputChannel.appendLine(
      `(Under ${
      this.cwdOption.cwd === undefined
        ? 'default cwd'
        : `cwd ${ this.cwdOption.cwd }` })`);

    return this.ghci.start(cmd);
  }

  reload(): Promise<string[]> {
    this.typeCache = null;
    const pr = this.reloadP();
    this.loading = pr.then(() => undefined);
    return pr;
  }

  async reloadP(): Promise<string[]> {
    // await this.start();
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
    return modules;
  }

  getModuleName(filename: string): string {
    return this.moduleMap.get(filename);
  }

  dispose() {
    this.wasDisposed = true;
    if (this.ghci !== null) {
      this.ghci.dispose();
    }
  }
}
