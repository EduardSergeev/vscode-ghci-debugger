import * as vscode from 'vscode';
import { ProviderResult, DebugAdapterInlineImplementation, DebugAdapterDescriptorFactory, DebugAdapterDescriptor, ExtensionContext } from 'vscode';
import DebugSession from './debugger/debugSession';
import ConfigurationProvider from './debugger/configurationProvider';
import SessionManager from '../ghci/sessionManager';

export default class Debugger {

  public activate(context: ExtensionContext) {

    const outputChannel = vscode.window.createOutputChannel('GHCi Debugger');
    const sessionManager = new SessionManager(outputChannel);
    context.subscriptions.push(outputChannel, sessionManager);

    class InlineDebugAdapterFactory implements DebugAdapterDescriptorFactory {
      createDebugAdapterDescriptor(_session: vscode.DebugSession): ProviderResult<DebugAdapterDescriptor> {
        return new DebugAdapterInlineImplementation(new DebugSession(sessionManager));
      }
    }

    context.subscriptions.push(
      vscode.debug.registerDebugConfigurationProvider('ghci', new ConfigurationProvider(sessionManager)),
      vscode.debug.registerDebugAdapterDescriptorFactory('ghci', new InlineDebugAdapterFactory())
    );
  }
}
