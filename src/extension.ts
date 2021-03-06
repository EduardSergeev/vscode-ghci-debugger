import * as vscode from 'vscode';
import { ExtensionContext, StatusBarAlignment } from 'vscode';
import SessionManager from './ghci/sessionManager';
import DebugFactory from './debugger/debugFactory';
import Debug from './debugger/debug';
import ConfigurationProvider from './debugger/configurationProvider';
import Console from './console';
import Output from './output';
import OutputLinkProvider from './outputLinkProvider';
import StatusBar from './statusBar';


export const ConsoleTitle = 'GHCi Debugger Console';
export const OpenOutputCommandId = 'ghci-debugger.openOutput';
export const GhciLogMarker = '‌Starting GHCi with';

export function activate(context: ExtensionContext) {
  const outputChannelTitle = 'GHCi Debugger';
  const ghciLogMarker = '‌Starting GHCi with';
  const statusBatTooltip = 'GHCi Debugger\nClick to open log output';
  const statusBarBusyPrefix = '$(debug-alt) ';
  const ghciLogLanguageId = 'ghci-log';

  // Until [it is directly supported](https://github.com/Microsoft/vscode/issues/11005)
  // we have to use this hacky approach to set `ghci` language to our `OutputChannel`
  vscode.window.onDidChangeVisibleTextEditors(editors => {
    for (const editor of editors) {
      if (editor.document.fileName.startsWith('extension-output')) {
        const firstLine = editor.document.lineAt(0).text;
        if (!firstLine || firstLine.startsWith(ghciLogMarker)) {
          vscode.languages.setTextDocumentLanguage(editor.document, ghciLogLanguageId);
        }
      } 
    } 
    },
    this,
    context.subscriptions
  );

  const output = new Output(vscode.window.createOutputChannel(outputChannelTitle));

  const statusBarItem = vscode.window.createStatusBarItem(StatusBarAlignment.Left);
  statusBarItem.tooltip = statusBatTooltip;
  statusBarItem.command = OpenOutputCommandId;
  const statusBar = new StatusBar(statusBarItem, statusBarBusyPrefix);

  const sessionManager = new SessionManager(output, statusBar);

  const console = new Console();
  const terminal = vscode.window.createTerminal({
    name: ConsoleTitle,
    pty: console
  });

  const linkProvider = vscode.languages.registerDocumentLinkProvider(
    ghciLogLanguageId,
    new OutputLinkProvider()
  );

  const openOutputCommand = vscode.commands.registerCommand(
    OpenOutputCommandId,
    () => output.show()
  );

  const configurationProvider = vscode.debug.registerDebugConfigurationProvider(
    ConfigurationProvider.DebuggerType,
    new ConfigurationProvider(sessionManager, output)
  );
  const descriptorFactory = vscode.debug.registerDebugAdapterDescriptorFactory(
    ConfigurationProvider.DebuggerType,
    new DebugFactory(() => new Debug(sessionManager, console, terminal, statusBar, output))
  );

  context.subscriptions.push(
    output,
    sessionManager,
    terminal,
    statusBarItem,
    openOutputCommand,
    linkProvider,
    configurationProvider,
    descriptorFactory);

  return console;
}
