import * as vscode from 'vscode';
import { WorkspaceFolder } from 'vscode';
import * as child_process from 'child_process';
import { Resource, asWorkspaceFolder } from './resource';


export type Project = 'cabal' | 'cabal-new' | 'cabal-v2' | 'stack' | 'bare-stack' | 'bare';

export type ConfiguredProject = Project | undefined;


export async function getWorkspaceType(configuredProjectType: ConfiguredProject, folder: WorkspaceFolder): Promise<Project> {
  return (
    !configuredProjectType ? configuredProjectType :
    (await find(folder, 'stack.yaml')).length ? 'stack' :
    (await find(folder, '*.cabal')).length ? 'cabal-new' :
    await hasStack(folder.uri.fsPath) ? 'bare-stack' :
    'bare'
  );
}

export async function getProjectConfigurations(resource: Resource) {
  const configurations = [];
  const folder = asWorkspaceFolder(resource);
  if(folder) {
    if ((await find(folder, 'stack.yaml')).length) {
      configurations.push('stack');
    }

    if((await find(folder, '*.cabal')).length) {
      configurations.push('cabal-new');
    }

    if(await hasStack(folder.uri.fsPath)) {
      configurations.push('bare-stack');
    }
  } else {
    configurations.push('bare');
  }

  return configurations;
}

function find(folder: WorkspaceFolder, file: string): Thenable<vscode.Uri[]> {
  return vscode.workspace.findFiles(
    new vscode.RelativePattern(folder, file));
}

function hasStack(cwd?: string): Promise<boolean> {
  const cwdOpt = cwd === undefined ? {} : { cwd };
  return new Promise<boolean>((resolve, reject) => {
    child_process.exec(
      'stack --help',
      Object.assign({ timeout: 5000 }, cwdOpt),
      (err) => {
        if (err) { resolve(false); }
        else { resolve(true); }
      }
    );
  });
}

export async function computeFileType(): Promise<Project> {
  if (await hasStack()) {
    return 'bare-stack';
  }
  else {
    return 'bare';
  }
}
