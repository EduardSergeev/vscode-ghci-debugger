import { ExtensionContext } from 'vscode';
import Debugger from './debugger';


export function activate(context: ExtensionContext) {
  const provider = new Debugger();
  provider.activate(context);
}
