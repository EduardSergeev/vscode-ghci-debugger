import * as vscode from 'vscode';
import { ProviderResult, DebugAdapterInlineImplementation, DebugAdapterDescriptorFactory, DebugAdapterDescriptor, ExtensionContext, StatusBarAlignment, DebugSession } from 'vscode';
import Debug from './debugger/debug';
import ConfigurationProvider from './debugger/configurationProvider';
import Console from './console';
import StatusBar from './statusBar';
import SessionManager from './ghci/sessionManager';
import Output from './output';
import OutputLinkProvider from './outputLinkProvider';

export default class Debugger {
  public static openOutputCommandId = 'ghci-debugger.openOutput';

  private static outputChannelTitle = 'GHCi Debugger';
  private static statusBatTooltip = 'GHCi Debugger\nClick to open log output';
  private static statusBarBusyPrefix = '$(debug-alt) ';
  private static consoleTitle = 'GHCi Debugger Console';

  public activate(context: ExtensionContext) {

    // Until [it is directly supported](https://github.com/Microsoft/vscode/issues/11005)
    // we have to use this hacky approach to set `ghci` language to our `OutputChannel`
    vscode.window.onDidChangeVisibleTextEditors(editors => {
      for (const editor of editors) {
        if (editor.document.fileName.startsWith('extension-output')) {
          const firstLine = editor.document.lineAt(0).text;
          if (!firstLine || firstLine.startsWith('‌Starting GHCi with')) {
            vscode.languages.setTextDocumentLanguage(editor.document, 'ghci');
          }
        } 
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

    const linkProvider = vscode.languages.registerDocumentLinkProvider('ghci', new OutputLinkProvider());

    const openOutputCommand = vscode.commands.registerCommand(
      Debugger.openOutputCommandId,
      () => output.show()
    );

    context.subscriptions.push(
      output,
      sessionManager,
      terminal,
      statusBarItem,
      openOutputCommand,
      linkProvider);

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
