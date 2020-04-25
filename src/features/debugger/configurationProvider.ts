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
    let config: LaunchRequestArguments = {
      type: 'ghci',
      name: 'Launch',
      request: 'launch',
      project: null,
      targets: null,
      module: null,
      expression: null,
      stopOnEntry: false
    };

    try {
      config.project = await this.getProject(folder);

      config.targets = config.project &&
        await this.getTargets(config.project, folder);

      config.module = config.targets &&
        await this.getModule(
          await this.sessionManager.getSession(folder, config.project, config.targets)
        );

      config.expression = config.module &&
        await this.getFunction(
          await this.sessionManager.getSession(folder, config.project, config.targets),
          config.module
        );

      config.name = [
        config.project,
        config.module,
        config.expression
      ].filter(x => x).join(' ');
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
        config.project = config.project || await this.getProject(folder);
        if(!config.project) {
          const choice = await vscode.window.showErrorMessage(
            "Please select Haskell project type to start debugger with",
            'Select project',
            'Cancel debug'
          );
          if(choice === 'Cancel debug') {
            return undefined;
          }
        }
      } while (!config.project);

      do {
        config.targets = config.targets || await this.getTargets(config.project, resource);
        if(!config.targets) {
          const choice = await vscode.window.showErrorMessage(
            "Please select at least one target to debug",
            'Select target(s)',
            'Cancel debug'
          );
          if(choice === 'Cancel debug') {
            return undefined;
          }
        }
      } while (!config.targets);

      do {
        config.module = config.module ||
          await this.getModule(
            await this.sessionManager.getSession(resource, config.project, config.targets)
          );
        if(!config.module) {
          const choice = await vscode.window.showErrorMessage(
            'Please select a module to debug',
            'Select module',
            'Cancel debug'
          );
          if(choice === 'Cancel debug') {
            return undefined;
          }
        }
      } while (!config.module);

      do {
        config.expression = config.expression ||
          await this.getFunction(
            await this.sessionManager.getSession(resource, config.project, config.targets),
            config.module
          );
        if(!config.expression) {
          const choice = await vscode.window.showErrorMessage(
            "Please select expression to debug",
            'Select expression',
            'Cancel debug'
          );
          if(choice === 'Cancel debug') {
            return undefined;
          }
        }
      } while (!config.expression);
    } catch (error) {
      await vscode.window.showErrorMessage(
        `Error starting GHCi:\n${error}`,
        'Cancel debug'
      );
      config = undefined;
    }
    return config;
  }

  private async getProject(resource: Resource): Promise<Project | undefined> {
    const types = await getProjectConfigurations(resource);
    if (!types.length) {
      throw new Error("Could not find any Haskell to debug");
    }
    return types.length > 1 ?
      await vscode.window.showQuickPick(types, { placeHolder: "Select Haskell project type to debug" }) :
      types[0];
  }

  private async getTargets(project: ConfiguredProject, resource: Resource): Promise<string> {
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
      await vscode.window.showQuickPick(targets, {
        placeHolder: "Select project target(s) to debug",
        canPickMany: true
      }).then(ts => (ts || []).join(' ')) :
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
    const customLabel = 'λ>';
    const custom = {
      label: customLabel,
      description: "Custom expression",
      detail: 'Arbitrary Haskell expression to debug'
    };
    const item = await vscode.window.showQuickPick(items.concat([custom]), { placeHolder: "Select function to debug" });
    if (item && item.label === customLabel) { 
      const expression = await vscode.window.showInputBox({ value: 'putStrLn "Hello, world!"', prompt: 'Enter Haskell expression to debug', ignoreFocusOut: true });
      item.label = expression;
    }
    return item ? item.label : null;
  }
}
