import * as vscode from 'vscode';
import { DebugConfigurationProvider, WorkspaceFolder, DebugConfiguration, CancellationToken } from "vscode";
import { getWorkspaceType, getStackIdeTargets, getCabalTargets } from '../../ghci/utils';
import { Session } from '../../ghci/session';
import SessionManager from '../../ghci/sessionManager';
import { Resource, asWorkspaceFolder } from '../../ghci/resource';

export default class ConfigurationProvider implements DebugConfigurationProvider {
  public constructor(private sessionManager: SessionManager) {
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
      config.module = config.target && await this.getModule(await this.sessionManager.getSession(folder, config.target));

      config.function = config.module && await this.getFunction(await this.sessionManager.getSession(folder, config.target), config.module);
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

    const resource = folder || vscode.window.activeTextEditor.document;

    try {
      do {
        config.target = config.target || await this.getTarget(resource);
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

      do {
        config.module = config.module || await this.getModule(await this.sessionManager.getSession(resource, config.target));
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
        config.function = config.function || await this.getFunction(await this.sessionManager.getSession(resource, config.target), config.module);
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

  private async getTarget(resource: Resource) {
    const folder = asWorkspaceFolder(resource);
    const targets = folder ? await (async () => {
      const type = await getWorkspaceType(folder);
      const resourceType = resource ? { cwd: resource.uri.fsPath } : {};
      return type === 'stack' ?
        await getStackIdeTargets(resourceType) :
        ['cabal', 'cabal new', 'cabal v2'].includes(type) ?
        await getCabalTargets('configure', resourceType) :
        [];
    })() :
    [resource.uri.fsPath];
  
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
