import * as vscode from 'vscode';
import { OutputChannel } from 'vscode';
import * as child_process from 'child_process';

export const haskellSymbolRegex = /([A-Z][A-Za-z0-9_']*\.)*([!#$%&*+./<=>?@\^|\-~:]+|[A-Za-z_][A-Za-z0-9_']*)/;
export const haskellReplLine = /^(\s*-{2,}\s+)?>>>(.*)$/;
export const stackCommand = 'stack --no-terminal --color never';


export const haskellSelector: vscode.DocumentSelector = [
  { language: 'haskell', scheme: 'file' },
  { language: 'literate haskell', scheme: 'file' }
];

export function reportError(outputChannel: OutputChannel, msg: string) {
  return (err) => {
    console.error(`${ msg }: ${ err }`);
    outputChannel.appendLine(`${ msg }: ${ err }`);
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

export function equal(left: string[], right: string[]): Boolean {
  return left.every(right.includes) && right.every(left.includes);
}
