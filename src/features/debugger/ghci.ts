import { TextDocument, CancellationToken, Uri, ExtensionContext } from "vscode";

export default interface Ghci {
  create(context: ExtensionContext, channelName: string): GhciApi;
  createExtensionState(context: ExtensionContext, channelName: string): ExtensionState;
  startSession(doc: TextDocument): Promise<Session>;
  startNewSession(channelName: string, doc: TextDocument): Promise<Session>;
}

export interface GhciApi {
  startSession(doc: TextDocument): Promise<Session>;
}

export interface ExtensionState {
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
