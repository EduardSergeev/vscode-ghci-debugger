import * as vscode from 'vscode';
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
