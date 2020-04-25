import * as vscode from 'vscode';
import { ProviderResult, DebugAdapterInlineImplementation, DebugAdapterDescriptorFactory, DebugAdapterDescriptor, ExtensionContext, StatusBarAlignment } from 'vscode';
import DebugSession from './debugger/debugSession';
import ConfigurationProvider from './debugger/configurationProvider';
import SessionManager from '../ghci/sessionManager';
import ConsoleTerminal from './debugger/console';
import StatusBar from './debugger/statusBar';

export default class Debugger {
  public static openOutputCommandId = 'ghci-debugger.openOutput';

  private static outputChannelTitle = 'GHCi Debugger';
  private static statusBatTooltip = 'Bare GHCi Debugger\nClick to open log output';
  private static statusBarBusyPrefix = '$(debug-alt) ';
  private static terminalTitle = 'GHCi Debug Terminal';

  public activate(context: ExtensionContext) {
    const outputChannel = vscode.window.createOutputChannel(Debugger.outputChannelTitle);

    const statusBarItem = vscode.window.createStatusBarItem(StatusBarAlignment.Left);
    statusBarItem.tooltip = Debugger.statusBatTooltip;
    statusBarItem.command = Debugger.openOutputCommandId;
    const statusBar = new StatusBar(statusBarItem, Debugger.statusBarBusyPrefix);

    const sessionManager = new SessionManager(outputChannel, statusBar);

    const console = new ConsoleTerminal();
    const terminal = vscode.window.createTerminal({
      name: Debugger.terminalTitle,
      pty: console
    });

    const openOutputCommand = vscode.commands.registerCommand(
      Debugger.openOutputCommandId,
      () => outputChannel.show()
    );

    context.subscriptions.push(
      outputChannel,
      sessionManager,
      terminal,
      statusBarItem,
      openOutputCommand);

    class InlineDebugAdapterFactory implements DebugAdapterDescriptorFactory {
      createDebugAdapterDescriptor(_session: vscode.DebugSession): ProviderResult<DebugAdapterDescriptor> {
        return new DebugAdapterInlineImplementation(new DebugSession(sessionManager, console, terminal, statusBar));
      }
    }

    context.subscriptions.push(
      vscode.debug.registerDebugConfigurationProvider('ghci', new ConfigurationProvider(sessionManager)),
      vscode.debug.registerDebugAdapterDescriptorFactory('ghci', new InlineDebugAdapterFactory())
    );
  }
}
