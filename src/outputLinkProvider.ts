import * as vscode from 'vscode';
import * as path from 'path';
import { DocumentLinkProvider, TextDocument, CancellationToken, ProviderResult, DocumentLink, Range, Uri } from "vscode";


export default class OutputLinkProvider implements DocumentLinkProvider {
  provideDocumentLinks(document: TextDocument, token: CancellationToken): ProviderResult<DocumentLink[]> {
    const pattern = /([\w\/]+\.\w+)(?::\(?(\d+)[,:](\d+)\)?(?:-(?:\d+|\(\d+,\d+\)))?)?/g;
    const rootPath = vscode.workspace.workspaceFolders[0]?.uri.fsPath;
    const text = document.getText();
    const links = [];
    for (let match; match = pattern.exec(text);) {
      const [reference, modulePath, line, column] = match;
      const start = document.positionAt(match.index);
      const end = document.positionAt(match.index + reference.length);
      const fullPath = (path.isAbsolute(modulePath) || !rootPath) ? modulePath : path.join(rootPath, modulePath);
      const uri = Uri.parse(`${fullPath}${line ? `#${line}` : ''}${column ? `:${column}` : ''}`);
      const link = new DocumentLink(new Range(start, end), uri);
      links.push(link);
    }
    return links;
  }
}
