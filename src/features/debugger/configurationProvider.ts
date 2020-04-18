import * as vscode from 'vscode';
import { DebugConfigurationProvider, WorkspaceFolder, DebugConfiguration, CancellationToken, ProviderResult } from "vscode";

export default class ConfigurationProvider implements DebugConfigurationProvider {

	/**
	 * Massage a debug configuration just before a debug session is being launched,
	 * e.g. add all missing attributes to the debug configuration.
	 */
  resolveDebugConfiguration(folder: WorkspaceFolder | undefined, config: DebugConfiguration, token?: CancellationToken): ProviderResult<DebugConfiguration> {
    // if launch.json is missing or empty
    if (!config.type && !config.request && !config.name) {
      const editor = vscode.window.activeTextEditor;
      if (editor && editor.document.languageId === 'haskell') {
        config.type = 'ghci';
        config.name = 'Launch';
        config.request = 'launch';
        config.module = 'Main';
        config.function = 'main';
        config.stopOnEntry = false;
      }
    }

    if (!config.module) {
      return vscode.window.showInformationMessage("Cannot find a module to debug").then(_ => {
        return undefined;	// abort launch
      });
    }

    return config;
  }
}
