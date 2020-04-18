import * as vscode from 'vscode';
import Debugger from './features/debugger';

export function activate(context: vscode.ExtensionContext) {
  const features = {
    debugger: new Debugger()
  };

  for (const feature in features) {
    if (vscode.workspace.getConfiguration('ghci-debugger').feature[ feature ]) {
      const provider = features[ feature ];
      provider.activate(context.subscriptions);
    }
  }
}
