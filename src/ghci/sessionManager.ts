import { OutputChannel, Disposable, WorkspaceFolder } from "vscode";
import { Session } from "./session";
import { GhciOptions } from "./ghci";
import { computeFileType, computeWorkspaceType } from './utils';
import { Resource, asWorkspaceFolder } from "./resource";

export default class SessionManager implements Disposable {
  private session?: Session;
  private resource?: Resource;
  private target?: string;

  public constructor(
    private outputChannel: OutputChannel) {
  }

  public async getSession(resource: Resource, target: string): Promise<Session> {
    if(!this.session || this.resource !== resource || this.target !== target) {
      // Session does not exist or old session is not compatible with the new request
      this.dispose();
      this.resource = resource;
      this.target = target;
      this.session = await this.startSession(this.outputChannel, resource, target);
    } 
    return this.session;
  }

  private async startSession(outputChannel: OutputChannel, resource: Resource, target: string, ghciOptions: GhciOptions = new GhciOptions): Promise<Session> {
    const folder = asWorkspaceFolder(resource);
    const type = folder ?
      await computeWorkspaceType(folder) :
      await computeFileType();
    return new Session(outputChannel, type, resource, target, ghciOptions);
  }

  public dispose() {
    const session = this.session;
    this.session = null;
    session?.dispose();
  }
}
