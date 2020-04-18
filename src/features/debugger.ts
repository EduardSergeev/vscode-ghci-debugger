import * as vscode from 'vscode';
import { ProviderResult, Disposable, DebugAdapterInlineImplementation, DebugAdapterDescriptorFactory, DebugAdapterDescriptor } from 'vscode';
import Ghci from './debugger/ghci';
import DebugSession from './debugger/debugSession';
import ConfigurationProvider from './debugger/configurationProvider';

export default class Debugger {

  public activate(subscriptions: Disposable[]) {

    const ghci = vscode.extensions.getExtension<Ghci>('dramforever.vscode-ghc-simple');

    class InlineDebugAdapterFactory implements DebugAdapterDescriptorFactory {
      createDebugAdapterDescriptor(_session: vscode.DebugSession): ProviderResult<DebugAdapterDescriptor> {
        return new DebugAdapterInlineImplementation(new DebugSession(ghci.exports));
      }
    }

    subscriptions.push(
      vscode.debug.registerDebugConfigurationProvider('ghci', new ConfigurationProvider()),
      vscode.debug.registerDebugAdapterDescriptorFactory('ghci', new InlineDebugAdapterFactory()));
  }
}
