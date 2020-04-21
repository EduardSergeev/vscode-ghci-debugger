import { TextDocument, CancellationToken, Uri, ExtensionContext, OutputChannel } from "vscode";


export default interface Ghci {
  startApi(context: ExtensionContext, outputChannel?: OutputChannel): GhciApi;
}

export interface GhciApi {
  startSession(doc: TextDocument, ghciOptions?: GhciOptions): Promise<Session>;
}

export interface GhciOptions {
  startOptions?: string;
  reloadCommands?: string[];
  startupCommands?: {
      all?: string[];
      bare?: string[];
      custom?: string[];
  };
}

export interface Session {
  loading: Promise<void>;
  ghci: GhciManager;
  reload(): Promise<string[]>;
  loadInterpreted(uri: Uri, token?: CancellationToken): Promise<string[]>;
}

export interface GhciManager {
  sendCommand(cmds: string | string[], config?: CommandConfig): Promise<string[]>;
}

export type CommandConfig = {
  [ K in keyof StrictCommandConfig ]?: StrictCommandConfig[ K ]
};

export interface StrictCommandConfig {
  token: CancellationToken;
  info: string;
}
