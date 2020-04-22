import { DebugProtocol } from 'vscode-debugprotocol';


export default interface LaunchRequestArguments extends DebugProtocol.LaunchRequestArguments {
  target: string;
  module: string;
  function: string;
  /** Automatically stop target after launch. If not specified, target does not stop. */
  stopOnEntry?: boolean;
  /** enable logging the Debug Adapter Protocol */
  trace?: boolean;
}
