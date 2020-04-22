import * as vscode from 'vscode';
import { DebugConfigurationProvider, WorkspaceFolder, DebugConfiguration, CancellationToken, ProviderResult } from "vscode";
import { ExtensionState } from '../../ghci/extension-state';
import { getWorkspaceType, getStackIdeTargets, getCabalTargets } from '../../ghci/utils';
import { GhciApi } from './ghci';
import { Session } from '../../ghci/session';

export default class ConfigurationProvider implements DebugConfigurationProvider {
  private ext: ExtensionState;
  private ghci: GhciApi;

  public constructor(ext: ExtensionState, ghci: GhciApi) {
    this.ext = ext;
    this.ghci = ghci;
  }

  async provideDebugConfigurations?(folder: WorkspaceFolder | undefined, token?: CancellationToken): Promise<DebugConfiguration[]> {
    let config = {
      type: 'ghci',
      name: 'Launch',
      request: 'launch',
      target: null,
      module: null,
      function: null,
      stopOnEntry: false
    };

    try {
      config.target = await this.getTarget(folder);

      const session = config.target && await this.ghci.startSession(
        vscode.window.activeTextEditor.document, {
          target: config.target,
          startOptions: "-w",
        }
      );
      config.module = config.target && await this.getModule(session);

      config.function = config.module && await this.getFunction(session, config.module);
    } catch { }

    return [config];
  }

	/**
	 * Massage a debug configuration just before a debug session is being launched,
	 * e.g. add all missing attributes to the debug configuration.
	 */
  async resolveDebugConfiguration(folder: WorkspaceFolder | undefined, config: DebugConfiguration, token?: CancellationToken): Promise<DebugConfiguration> {
    config.type = config.type || 'ghci';
    config.request = config.request || 'launch';
    config.name = config.name || 'Launch';

    try {
      do {
        config.target = config.target || await this.getTarget(folder);
        if(!config.target) {
          const choice = await vscode.window.showErrorMessage(
            "Cannot find a target to debug",
            'Select target',
            'Cancel debug'
          );
          if(choice === 'Cancel debug') {
            return undefined;
          }
        }
      } while (!config.target);

      const session = await this.ghci.startSession(
        vscode.window.activeTextEditor.document, {
          target: config.target,
          startOptions: "-w",
        }
      );
      do {
        config.module = config.module || await this.getModule(session);
        if(!config.module) {
          const choice = await vscode.window.showErrorMessage(
            'Cannot find a module to debug',
            'Select module',
            'Cancel debug'
          );
          if(choice === 'Cancel debug') {
            return undefined;
          }
        }
      } while (!config.module);

      do {
        config.function = config.function || await this.getFunction(session, config.module);
        if(!config.function) {
          const choice = await vscode.window.showErrorMessage(
            "Cannot find a function to debug",
            'Select function',
            'Cancel debug'
          );
          if(choice === 'Cancel debug') {
            return undefined;
          }
        }
      } while (!config.function);
    } catch (error) {
      await vscode.window.showErrorMessage(
        error.message,
        'Cancel debug'
      );
      return undefined; // abort launch
    }
    return config;
  }

  private async getTarget(folder: WorkspaceFolder) {
    const type = await getWorkspaceType(this.ext, folder);
    const resourceType = folder ? { cwd: folder.uri.fsPath } : {};
    const targets = 
      type === 'stack' ?
      await getStackIdeTargets(resourceType) :
      ['cabal', 'cabal new', 'cabal v2'].includes(type) ?
      await getCabalTargets('configure', resourceType) :
      [''];
    if (!targets.length) {
      throw new Error("Could not find any target to debug");
    }
    return targets.length > 1 ?
      await vscode.window.showQuickPick(targets, { placeHolder: "Select project target to debug" }) :
      targets[0];
  }

  private async getModule(session: Session) {
    await session.reload();
    await session.loading;
    const modules = Array
      .from(session.moduleMap.values())
      .sort((l, r) => l === 'Main' ? -1 : l.localeCompare(r));
    if (!modules.length) {
      throw new Error("Could not find any module to debug");
    }
    return modules.length > 1 ?
      await vscode.window.showQuickPick(modules, { placeHolder: "Select module to debug" }) :
      modules[0];
  }

  private async getFunction(session: Session, module: string) {
    const functions = await session.ghci.sendCommand(
      `:browse ${module}`
    );
    const items = functions
      .map(fun => fun.match(/^(\S+)\s+::\s+(.+)/m))
      .filter(match => match)
      .map(match => ({ label: match[1], description: match[2] }))
      .sort((l, r) => l.label === 'main' || l.description === 'IO ()' ? -1 : l.label.localeCompare(r.label));
    if (!items.length) {
      throw new Error("Could not find any function to debug");
    }
    const item = items.length > 1 ?
      await vscode.window.showQuickPick(items, { placeHolder: "Select function to debug" }) :
      items[0];
    return item ? item.label : null;
  }
}
