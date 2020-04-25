import { TextDocument, WorkspaceFolder } from "vscode";

export type Resource = WorkspaceFolder | TextDocument;

export function asWorkspaceFolder(resource: Resource): WorkspaceFolder | undefined {
  const folder = resource as WorkspaceFolder;
  return folder && folder.name ? folder : undefined;
}
