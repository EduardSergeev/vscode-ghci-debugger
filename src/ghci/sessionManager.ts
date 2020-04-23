import { OutputChannel, Disposable } from "vscode";
import Session from "./session";
import { Resource, asWorkspaceFolder } from "./resource";
import { computeFileType, getWorkspaceType, ConfiguredProject } from "./project";

export default class SessionManager implements Disposable {
  private session?: Session;
  private resource?: Resource;
  private projectType?: ConfiguredProject;
  private target?: string;
  private ghciOptions?: string[];

  public constructor(
    private outputChannel: OutputChannel) {
  }

  public async getSession(resource: Resource, projectType: ConfiguredProject ,target: string, ghciOptions: string[] = []): Promise<Session> {
    ghciOptions = ghciOptions.sort();
    if(!this.session ||
      this.resource !== resource ||
      this.projectType !== projectType ||
      this.target !== target ||
      !this.compatibleOptions(ghciOptions)) {
        // Session does not exist or old session is not compatible with the new request
        this.dispose();
        this.resource = resource;
        this.projectType = projectType;
        this.target = target;
        this.ghciOptions = ghciOptions;
        this.session = await this.startSession(this.outputChannel);
    } 
    return this.session;
  }

  public dispose() {
    const session = this.session;
    this.session = null;
    session?.dispose();
  }

  private async startSession(outputChannel: OutputChannel): Promise<Session> {
    const folder = asWorkspaceFolder(this.resource);
    const type = folder ?
      await getWorkspaceType(this.projectType, folder) :
      await computeFileType();
    return new Session(outputChannel, type, this.resource, this.target, ['-w'].concat(this.ghciOptions));
  }

  private compatibleOptions(ghciOptions?: string[]): Boolean {
    return (
      this.ghciOptions.every(ghciOptions.includes) &&
      ghciOptions.every(this.ghciOptions.includes)
    );
  }
}
