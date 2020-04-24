import * as vscode from 'vscode';
import { WorkspaceConfiguration, ConfigurationScope } from 'vscode';


export default class Configuration {
  public static getHistorySize(scope?: ConfigurationScope) {
    return Configuration.getRoot(scope).historySize;
  }

  private static getRoot(scope?: ConfigurationScope): WorkspaceConfiguration {
    return vscode.workspace.getConfiguration('ghci-debugger', scope);
  }
}
