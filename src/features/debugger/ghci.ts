import { TextDocument, ExtensionContext, OutputChannel } from "vscode";
import { GhciOptions } from "../../ghci/ghci";
import { Session } from "../../ghci/session";


export default interface Ghci {
  startApi(context: ExtensionContext, outputChannel?: OutputChannel): GhciApi;
}

export interface GhciApi {
  startSession(doc: TextDocument, ghciOptions?: GhciOptions): Promise<Session>;
}
