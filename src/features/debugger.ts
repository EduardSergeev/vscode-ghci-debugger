import * as vscode from 'vscode';
import { ProviderResult, DebugAdapterInlineImplementation, DebugAdapterDescriptorFactory, DebugAdapterDescriptor, ExtensionContext } from 'vscode';
import DebugSession from './debugger/debugSession';
import ConfigurationProvider from './debugger/configurationProvider';
import { startSession } from '../ghci/extension-state';

export default class Debugger {

  public activate(context: ExtensionContext) {

    const outputChannel = vscode.window.createOutputChannel('GHCi Debugger');
    context.subscriptions.push(outputChannel);

    const ext = {
      context,
      outputChannel: outputChannel,
      documentManagers: new Map(),
      workspaceManagers: new Map(),
      workspaceTypeMap: new Map(),
      documentAssignment: new WeakMap()
    };
    const ghci = {
      startSession: (doc, ghciOptions?) =>
        startSession(ext, doc, ghciOptions)
    };

    class InlineDebugAdapterFactory implements DebugAdapterDescriptorFactory {
      createDebugAdapterDescriptor(_session: vscode.DebugSession): ProviderResult<DebugAdapterDescriptor> {
        return new DebugAdapterInlineImplementation(new DebugSession(ghci));
      }
    }

    context.subscriptions.push(
      vscode.debug.registerDebugConfigurationProvider('ghci', new ConfigurationProvider()),
      vscode.debug.registerDebugAdapterDescriptorFactory('ghci', new InlineDebugAdapterFactory())
    );
  }
}
