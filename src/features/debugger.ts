import * as vscode from 'vscode';
import { ProviderResult, WorkspaceFolder, Disposable, DebugAdapterInlineImplementation, DebugAdapterDescriptorFactory } from 'vscode';
import Ghci from './debugger/ghci';
import DebugSession from './debugger/debugSession';
import ConfigurationProvider from './debugger/configurationProvider';

export default class GhciDebugger {
  
  public activate(subscriptions: Disposable[]) {
      
    const ghci = vscode.extensions.getExtension<Ghci>('dramforever.vscode-ghc-simple');

    class InlineDebugAdapterFactory implements DebugAdapterDescriptorFactory {

        createDebugAdapterDescriptor(_session: vscode.DebugSession): ProviderResult<vscode.DebugAdapterDescriptor> {
            return new DebugAdapterInlineImplementation(new DebugSession(ghci.exports));
        }
    }

	subscriptions.push(
        vscode.debug.registerDebugConfigurationProvider(
            'ghci',
            new ConfigurationProvider()));

	subscriptions.push(
        vscode.debug.registerDebugAdapterDescriptorFactory(
            'ghci',
            new InlineDebugAdapterFactory()));
  }
}
