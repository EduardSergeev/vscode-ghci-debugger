import * as vscode from 'vscode';
import { ProviderResult, DebugAdapterInlineImplementation, DebugAdapterDescriptorFactory, DebugAdapterDescriptor, ExtensionContext } from 'vscode';
import Ghci from './debugger/ghci';
import DebugSession from './debugger/debugSession';
import ConfigurationProvider from './debugger/configurationProvider';

export default class Debugger {

  public activate(context: ExtensionContext) {

    const outputChannel = vscode.window.createOutputChannel('GHCi Debugger');
    context.subscriptions.push(outputChannel);

    const ghci = vscode.extensions.getExtension<Ghci>('dramforever.vscode-ghc-simple');
    const ghciApi = ghci.exports.startApi(context, outputChannel);

    class InlineDebugAdapterFactory implements DebugAdapterDescriptorFactory {
      createDebugAdapterDescriptor(_session: vscode.DebugSession): ProviderResult<DebugAdapterDescriptor> {
        return new DebugAdapterInlineImplementation(new DebugSession(ghciApi));
      }
    }

    context.subscriptions.push(
      vscode.debug.registerDebugConfigurationProvider('ghci', new ConfigurationProvider()),
      vscode.debug.registerDebugAdapterDescriptorFactory('ghci', new InlineDebugAdapterFactory())
    );
  }
}
