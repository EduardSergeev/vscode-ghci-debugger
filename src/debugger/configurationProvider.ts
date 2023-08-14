import * as vscode from 'vscode';
import * as child_process from 'child_process';
import { DebugConfigurationProvider, WorkspaceFolder, CancellationToken } from "vscode";
import Session from '../ghci/session';
import SessionManager from '../ghci/sessionManager';
import { Resource, asWorkspaceFolder } from '../ghci/resource';
import getProjectConfigurations, { Project } from '../ghci/project';
import LaunchRequestArguments from './launchRequestArguments';
import Output from '../output';


export default class ConfigurationProvider implements DebugConfigurationProvider {
  public static DebuggerType = 'ghci';
  private static DebuggerRequest = 'launch';

  public constructor(
    private sessionManager: SessionManager,
    private output: Output) {
  }

  async provideDebugConfigurations?(folder: WorkspaceFolder | undefined, token?: CancellationToken): Promise<LaunchRequestArguments[]> {
    let config: LaunchRequestArguments = {
      type: ConfigurationProvider.DebuggerType,
      request: ConfigurationProvider.DebuggerRequest,
      name: null,
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
        await this.getExpression(
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
    config.type = ConfigurationProvider.DebuggerType;
    config.request = ConfigurationProvider.DebuggerRequest;

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
          await this.getExpression(
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

      config.name = config.name || [
        config.project,
        config.module,
        config.expression
      ].filter(x => x).join(' ');

    } catch (error) {
      const message = `Error starting GHCi:\n${error}`;
      this.output.error(message);
      await vscode.window.showErrorMessage(
        message,
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
      await vscode.window.showQuickPick(
        types,
        { placeHolder: "Select Haskell project type to debug" }
      ) :
      types[0];
  }

  private async getTargets(project: Project, resource: Resource): Promise<string> {
    const folder = asWorkspaceFolder(resource);
    const targets = folder ? await (async () => {
      const resourceType = resource ? { cwd: resource.uri.fsPath } : {};
      return project === 'stack' ?
        await this.getStackIdeTargets(resourceType) :
        project === 'bare-stack' ?
        await this.getBareStackTargets(folder) :
        ['cabal', 'cabal-new', 'cabal-v2'].includes(project) ?
        await this.getCabalTargets('configure', resourceType) :
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
    const modules = Array
      .from(session.moduleMap.values())
      .sort((l, r) => l === 'Main' ? -1 : l.localeCompare(r));
    if (!modules.length) {
      throw new Error("Could not find any module to debug");
    }
    return modules.length > 1 ?
      await vscode.window.showQuickPick(
        modules,
        { placeHolder: "Select module to debug" }
      ) :
      modules[0];
  }

  private async getExpression(session: Session, module: string): Promise<string | undefined> {
    const functions = await session.ghci.sendCommand(
      `:browse ${module}`
    );
    const items = functions
      .map(fun => fun.match(/^(\S+)\s+::\s+(.+)/m))
      .filter(match => match && !match[2].match(/->/))
      .map(match => ({ label: match[1], description: `:: ${match[2]}` }))
      .sort((l, r) => l.label === 'main' || l.description === 'IO ()' ? -1 : l.label.localeCompare(r.label));
    const customLabel = 'λ⋙';
    const custom = {
      label: customLabel,
      description: "Custom expression",
      detail: 'Arbitrary Haskell expression to debug'
    };
    const item = await vscode.window.showQuickPick(
      items.concat([custom]),
      { placeHolder: "Select function to debug" }
    );
    const expression = item?.label === customLabel ? 
      await vscode.window.showInputBox({
        value: 'putStrLn "Hello, world!"',
        prompt: 'Enter Haskell expression to debug',
        ignoreFocusOut: true
      }) : null;
    return expression || item?.label;
  }

  private async getStackIdeTargets(cwdOption: { cwd?: string }) {
    const result = await new Promise<string>((resolve, reject) => {
      child_process.exec(
        `stack ide targets`,
        cwdOption,
        (err, _, stderr) => {
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
  }

  private async getBareStackTargets(folder: WorkspaceFolder) {
    // const files = await vscode.workspace.findFiles('*.hs');
    // return files.length > 1 ?
    //   await vscode.window.showQuickPick(files.map(f => f.fsPath), {
    //   placeHolder: "Select file(s) to debug",
    //   canPickMany: true
    // }) :
    // files;
    return [vscode.window.activeTextEditor.document.uri.path];
  }

  private async getCabalTargets(configure: string, cwdOption: { cwd?: string }) {
    const result = await new Promise<string>((resolve, reject) => {
      child_process.exec(
        `cabal ${configure} --dry-run`,
        cwdOption,
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
  }
}
