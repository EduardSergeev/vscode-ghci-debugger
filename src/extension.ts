import { ExtensionContext } from 'vscode';
import Debugger from './features/debugger';

export function activate(context: ExtensionContext) {
  const provider = new Debugger();
  provider.activate(context);
}
