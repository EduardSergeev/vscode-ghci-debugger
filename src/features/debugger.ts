import * as vscode from 'vscode';
import { ProviderResult, DebugAdapterInlineImplementation, DebugAdapterDescriptorFactory, DebugAdapterDescriptor, ExtensionContext } from 'vscode';
import DebugSession from './debugger/debugSession';
import ConfigurationProvider from './debugger/configurationProvider';
import SessionManager from '../ghci/sessionManager';
import ConsoleTerminal from './debugger/console';

export default class Debugger {

  public activate(context: ExtensionContext) {
    const outputChannel = vscode.window.createOutputChannel('GHCi Debugger');

    const sessionManager = new SessionManager(outputChannel);

    const console = new ConsoleTerminal();
    const terminal = vscode.window.createTerminal({
      name: 'GHCi Debug Console',
      pty: console
    });
    context.subscriptions.push(outputChannel, sessionManager, terminal);

    class InlineDebugAdapterFactory implements DebugAdapterDescriptorFactory {
      createDebugAdapterDescriptor(_session: vscode.DebugSession): ProviderResult<DebugAdapterDescriptor> {
        return new DebugAdapterInlineImplementation(new DebugSession(sessionManager, console, terminal));
      }
    }

    context.subscriptions.push(
      vscode.debug.registerDebugConfigurationProvider('ghci', new ConfigurationProvider(sessionManager)),
      vscode.debug.registerDebugAdapterDescriptorFactory('ghci', new InlineDebugAdapterFactory())
    );
  }
}
