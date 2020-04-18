import * as vscode from 'vscode';
import GhciDebugger from './features/debugger';

export function activate(context: vscode.ExtensionContext) {
  const features = {
    debugger: new GhciDebugger()
  };

  for (const feature in features) {
    if (vscode.workspace.getConfiguration('ghci-debugger').feature[feature]) {
      const provider = features[feature];
      provider.activate(context.subscriptions);
    }
  }
}
