import * as vscode from 'vscode';
import { DebugConfigurationProvider, WorkspaceFolder, CancellationToken } from "vscode";
import { getStackIdeTargets, getCabalTargets } from '../../ghci/utils';
import Session from '../../ghci/session';
import SessionManager from '../../ghci/sessionManager';
import { Resource, asWorkspaceFolder } from '../../ghci/resource';
import { ConfiguredProject, getProjectConfigurations, Project } from '../../ghci/project';
import LaunchRequestArguments from './launchRequestArguments';

export default class ConfigurationProvider implements DebugConfigurationProvider {
  public constructor(private sessionManager: SessionManager) {
  }

  async provideDebugConfigurations?(folder: WorkspaceFolder | undefined, token?: CancellationToken): Promise<LaunchRequestArguments[]> {
    let config = {
      type: 'ghci',
      name: 'Launch',
      request: 'launch',
      project: null,
      target: null,
      module: null,
      function: null,
      stopOnEntry: false
    };

    try {
      config.project = await this.getProjectConfiguration(folder);

      config.target = config.project &&
        await this.getTarget(config.project, folder);

      config.module = config.target &&
        await this.getModule(
          await this.sessionManager.getSession(folder, config.project, config.target)
        );

      config.function = config.module &&
        await this.getFunction(
          await this.sessionManager.getSession(folder, config.project, config.target),
          config.module
        );
    } catch { }

    return [config];
  }

	/**
	 * Massage a debug configuration just before a debug session is being launched,
	 * e.g. add all missing attributes to the debug configuration.
	 */
  async resolveDebugConfiguration(folder: WorkspaceFolder | undefined, config: LaunchRequestArguments, token?: CancellationToken): Promise<LaunchRequestArguments> {
    config.type = config.type || 'ghci';
    config.request = config.request || 'launch';
    config.name = config.name || 'Launch';

    const resource = folder || vscode.window.activeTextEditor.document;

    try {
      do {
        config.project = config.project || await this.getProjectConfiguration(folder);
        if(!config.project) {
          const choice = await vscode.window.showErrorMessage(
            "Cannot find a project to debug",
            'Select project',
            'Cancel debug'
          );
          if(choice === 'Cancel debug') {
            return undefined;
          }
        }
      } while (!config.project);

      do {
        config.target = config.target || await this.getTarget(config.project, resource);
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
        config.module = config.module ||
          await this.getModule(
            await this.sessionManager.getSession(resource, config.project, config.target)
          );
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
        config.function = config.function ||
          await this.getFunction(
            await this.sessionManager.getSession(resource, config.project, config.target),
            config.module
          );
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

  private async getProjectConfiguration(resource: Resource): Promise<Project | undefined> {
    const folder = asWorkspaceFolder(resource);
    if(folder) {
      const types = await getProjectConfigurations(folder);

      if (!types.length) {
        throw new Error("Could not find any target to debug");
      }
      return types.length > 1 ?
        await vscode.window.showQuickPick(types, { placeHolder: "Select project type to debug" }) :
        types[0];
      }
  }

  private async getTarget(project: ConfiguredProject, resource: Resource): Promise<string | undefined> {
    const folder = asWorkspaceFolder(resource);
    const targets = folder ? await (async () => {
      const resourceType = resource ? { cwd: resource.uri.fsPath } : {};
      return project === 'stack' ?
        await getStackIdeTargets(resourceType) :
        ['cabal', 'cabal new', 'cabal v2'].includes(project) ?
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

  private async getModule(session: Session): Promise<string | undefined> {
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

  private async getFunction(session: Session, module: string): Promise<string | undefined> {
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
