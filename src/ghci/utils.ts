import * as vscode from 'vscode';
import * as child_process from 'child_process';
import { ExtensionState } from './extension-state';

export const haskellSymbolRegex = /([A-Z][A-Za-z0-9_']*\.)*([!#$%&*+./<=>?@\^|\-~:]+|[A-Za-z_][A-Za-z0-9_']*)/;
export const haskellReplLine = /^(\s*-{2,}\s+)?>>>(.*)$/;
export const stackCommand = 'stack --no-terminal --color never';

export const haskellSelector: vscode.DocumentSelector = [
  { language: 'haskell', scheme: 'file' },
  { language: 'literate haskell', scheme: 'file' }
];

export function reportError(ext: ExtensionState, msg: string) {
  return (err) => {
    console.error(`${ msg }: ${ err }`);
    ext.outputChannel?.appendLine(`${ msg }: ${ err }`);
  };
}

export async function getStackIdeTargets(cwdOption: { cwd?: string }) {
  const result = await new Promise<string>((resolve, reject) => {
    child_process.exec(
      `${ stackCommand } ide targets`,
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

export async function getCabalTargets(configure: string, cwdOption: { cwd?: string }) {
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

export async function pickTarget(targets: string[]) {
  return targets.length > 1 ?
    await vscode.window.showQuickPick(targets, { placeHolder: "Select target to debug" }) :
    targets[0];
}

export function getWorkspaceType(ext: ExtensionState, folder: vscode.WorkspaceFolder): Promise<HaskellWorkspaceType> {
  if (!ext.workspaceTypeMap.has(folder)) {
    ext.workspaceTypeMap.set(folder, computeWorkspaceType(folder));
  }
  return ext.workspaceTypeMap.get(folder);
}


export type HaskellWorkspaceType = 'custom-workspace' | 'custom-file' | 'cabal' | 'cabal new' | 'cabal v2' | 'stack' | 'bare-stack' | 'bare';


export async function computeWorkspaceType(folder: vscode.WorkspaceFolder): Promise<HaskellWorkspaceType> {
  const customCommand =
    vscode.workspace.getConfiguration('ghci-debugger', folder.uri).replCommand;

  if (customCommand !== "") {
    const customScope =
      vscode.workspace.getConfiguration('ghci-debugger', folder.uri).replScope;

    if (customScope === "workspace") {
      return 'custom-workspace';
    }
    else {
      return 'custom-file';
    }
  }

  const oldConfigType =
    vscode.workspace.getConfiguration('ghci-debugger', folder.uri).workspaceType as
    HaskellWorkspaceType | 'detect';

  if (oldConfigType !== 'detect') { return oldConfigType; }

  const find: (file: string) => Thenable<vscode.Uri[]> =
    (file) => vscode.workspace.findFiles(
      new vscode.RelativePattern(folder, file));

  const isStack = await find('stack.yaml');
  if (isStack.length > 0) {
    return 'stack';
  }

  const isCabal = await find('*.cabal');
  if (isCabal.length > 0) {
    return 'cabal new';
  }

  if (await hasStack(folder.uri.fsPath)) {
    return 'bare-stack';
  }
  else {
    return 'bare';
  }
}

function hasStack(cwd?: string): Promise<boolean> {
  const cwdOpt = cwd === undefined ? {} : { cwd };
  return new Promise<boolean>((resolve, reject) => {
    const cp = child_process.exec(
      'stack --help',
      Object.assign({ timeout: 5000 }, cwdOpt),
      (err, stdout, stderr) => {
        if (err) { resolve(false); }
        else { resolve(true); }
      }
    );
  });
}

export async function computeFileType(): Promise<HaskellWorkspaceType> {
  if (await hasStack()) {
    return 'bare-stack';
  }
  else {
    return 'bare';
  }
}
