import * as vscode from 'vscode';
import { DebugProtocol } from 'vscode-debugprotocol';
import { Project } from '../../ghci/project';


export default interface LaunchRequestArguments extends DebugProtocol.LaunchRequestArguments, vscode.DebugConfiguration {
  project?: Project;
  targets?: string;
  module?: string;
  expression?: string;
  /** Automatically stop target after launch. If not specified, target does not stop. */
  stopOnEntry?: boolean;
  /** enable logging the Debug Adapter Protocol */
  trace?: boolean;
}
