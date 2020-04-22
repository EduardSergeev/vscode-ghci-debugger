import * as vscode from 'vscode';
import { Session } from './session';
import { GhciOptions } from './ghci';
import { computeWorkspaceType, computeFileType } from './utils';

export type HaskellWorkspaceType = 'custom-workspace' | 'custom-file' | 'cabal' | 'cabal new' | 'cabal v2' | 'stack' | 'bare-stack' | 'bare';

export interface ExtensionState {
  context: vscode.ExtensionContext;
  outputChannel?: vscode.OutputChannel;
  workspaceTypeMap: Map<vscode.WorkspaceFolder, Promise<HaskellWorkspaceType>>;
  documentManagers: Map<vscode.TextDocument, Session>;
  workspaceManagers: Map<vscode.WorkspaceFolder, Session>;
  documentAssignment: WeakMap<vscode.TextDocument, Session>;
}

function getWorkspaceType(ext: ExtensionState, folder: vscode.WorkspaceFolder): Promise<HaskellWorkspaceType> {
  if (!ext.workspaceTypeMap.has(folder)) {
    ext.workspaceTypeMap.set(folder, computeWorkspaceType(folder));
  }
  return ext.workspaceTypeMap.get(folder);
}

export async function startSession(ext: ExtensionState, doc: vscode.TextDocument, ghciOptions: GhciOptions = new GhciOptions): Promise<Session> {
  const folder = vscode.workspace.getWorkspaceFolder(doc.uri);
  const type = folder === undefined
    ? await computeFileType()
    : await getWorkspaceType(ext, folder);

  const session = (() => {
    if (-1 !== [ 'custom-workspace', 'stack', 'cabal', 'cabal new', 'cabal v2' ].indexOf(type)) {
      // stack or cabal

      if (!ext.workspaceManagers.has(folder)) {
        ext.workspaceManagers.set(folder,
          new Session(ext, type, 'workspace', folder.uri, ghciOptions));
      }

      return ext.workspaceManagers.get(folder);
    } else {
      // bare or bare-stack

      if (!ext.documentManagers.has(doc)) {
        ext.documentManagers.set(doc,
          new Session(ext, type, 'file', doc.uri, ghciOptions));
      }

      return ext.documentManagers.get(doc);
    }
  })();

  ext.documentAssignment.set(doc, session);

  session.addFile(doc.uri.fsPath);
  return session;
}

export function stopSession(ext: ExtensionState, doc: vscode.TextDocument) {
  const session = ext.documentAssignment.get(doc);
  if (session.resourceType === 'workspace') {
    const workspace = vscode.workspace.getWorkspaceFolder(session.resource);
    vscode.workspace.getWorkspaceFolder(session.resource);
    if (ext.workspaceManagers.has(workspace)) {
      ext.workspaceManagers.get(workspace).removeFile(doc.uri.fsPath);
    }
  } else {
    if (ext.documentManagers.has(doc)) {
      ext.documentManagers.get(doc).dispose();
      ext.documentManagers.delete(doc);
    }
  }
}
