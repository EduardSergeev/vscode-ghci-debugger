import * as vscode from 'vscode';
import { ProviderResult, DebugAdapterInlineImplementation, DebugAdapterDescriptorFactory, DebugAdapterDescriptor, ExtensionContext, StatusBarAlignment, DebugSession } from 'vscode';
import Debug from './debugger/debug';
import ConfigurationProvider from './debugger/configurationProvider';
import Console from './debugger/console';
import StatusBar from './debugger/statusBar';
import SessionManager from '../ghci/sessionManager';
import Output from './output';

export default class Debugger {
  public static openOutputCommandId = 'ghci-debugger.openOutput';

  private static outputChannelTitle = 'GHCi Debugger';
  private static statusBatTooltip = 'GHCi Debugger\nClick to open log output';
  private static statusBarBusyPrefix = '$(debug-alt) ';
  private static consoleTitle = 'GHCi Debugger Console';

  public activate(context: ExtensionContext) {

    vscode.window.onDidChangeActiveTextEditor(editor => {
      if (editor.document.fileName.startsWith('extension-output')) {
        const firstLine = editor.document.lineAt(0).text;
        if (!firstLine || firstLine.startsWith('‌Starting GHCi with')) {
          vscode.languages.setTextDocumentLanguage(editor.document, 'ghci');
        }
      } else {
        vscode.languages.setTextDocumentLanguage(editor.document, editor.document.languageId);
      } 
    }, this, context.subscriptions);

    const output = new Output(vscode.window.createOutputChannel(Debugger.outputChannelTitle));

    const statusBarItem = vscode.window.createStatusBarItem(StatusBarAlignment.Left);
    statusBarItem.tooltip = Debugger.statusBatTooltip;
    statusBarItem.command = Debugger.openOutputCommandId;
    const statusBar = new StatusBar(statusBarItem, Debugger.statusBarBusyPrefix);

    const sessionManager = new SessionManager(output, statusBar);

    const console = new Console();
    const terminal = vscode.window.createTerminal({
      name: Debugger.consoleTitle,
      pty: console
    });

    const openOutputCommand = vscode.commands.registerCommand(
      Debugger.openOutputCommandId,
      () => output.show()
    );

    context.subscriptions.push(
      output,
      sessionManager,
      terminal,
      statusBarItem,
      openOutputCommand);

    class InlineDebugAdapterFactory implements DebugAdapterDescriptorFactory {
      createDebugAdapterDescriptor(_session: DebugSession): ProviderResult<DebugAdapterDescriptor> {
        return new DebugAdapterInlineImplementation(new Debug(sessionManager, console, terminal, statusBar));
      }
    }

    context.subscriptions.push(
      vscode.debug.registerDebugConfigurationProvider('ghci', new ConfigurationProvider(sessionManager)),
      vscode.debug.registerDebugAdapterDescriptorFactory('ghci', new InlineDebugAdapterFactory())
    );
  }
}
