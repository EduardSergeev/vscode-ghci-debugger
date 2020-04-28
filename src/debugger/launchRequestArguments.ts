import * as vscode from 'vscode';
import { DebugProtocol } from 'vscode-debugprotocol';
import { Project } from '../ghci/project';


export default interface LaunchRequestArguments extends DebugProtocol.LaunchRequestArguments, vscode.DebugConfiguration {
  /** Haskell project type. One of: `cabal`, `cabal-new`, `cabal-v2`, `stack`, `bare-stack`, `bare` */
  project?: Project;
  /** Cabal/stack target(s) to load for debugging. */
  targets?: string;
  /** Haskell module */
  module?: string;
  /** Haskell expression to debug. Must something that can be evaluated by REPL. */
  expression?: string;
  /** Automatically stop target after launch. If not specified, target does not stop. */
  stopOnEntry: boolean;
}
