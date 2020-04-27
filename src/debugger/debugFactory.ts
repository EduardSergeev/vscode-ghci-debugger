import { DebugAdapterDescriptorFactory, ProviderResult, DebugAdapterDescriptor, DebugAdapterInlineImplementation, DebugSession } from "vscode";
import Debug from "./debug";


export default class DebugFactory implements DebugAdapterDescriptorFactory {
  constructor(private createDebug: () => Debug) {
  }

  createDebugAdapterDescriptor(_session: DebugSession): ProviderResult<DebugAdapterDescriptor> {
    return new DebugAdapterInlineImplementation(this.createDebug());
  }
}
