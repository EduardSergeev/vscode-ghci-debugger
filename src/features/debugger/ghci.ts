import { TextDocument, CancellationToken } from "vscode";

export default interface Ghci {
  startSession(doc: TextDocument): Promise<Session>;   
}

export interface Session {
  loading: Promise<void>;
  ghci: GhciManager;
}

export interface GhciManager {
  sendCommand(cmds: string | string[], config?: CommandConfig): Promise<string[]>;
}

export type CommandConfig = {
  [K in keyof StrictCommandConfig]?: StrictCommandConfig[K]
};

export interface StrictCommandConfig {
  token: CancellationToken;
  info: string;
}
