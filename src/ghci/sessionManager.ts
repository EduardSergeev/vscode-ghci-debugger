import { Disposable } from "vscode";
import Session from "./session";
import { Resource, asWorkspaceFolder } from "./resource";
import { computeFileType, getWorkspaceType, ConfiguredProject } from "./project";
import { equal } from "./utils";
import StatusBar from "../statusBar";
import Output from "../output";

export default class SessionManager implements Disposable {
  private disposables: Disposable[] = [];
  private session?: Session;
  private resource?: Resource;
  private projectType?: ConfiguredProject;
  private targets: string;
  private ghciOptions?: string[];
  private setStatus: (string) => void;

  public constructor(
    private output: Output,
    private statusBar: StatusBar) {
  }

  public async getSession(resource: Resource, projectType: ConfiguredProject, targets: string, ghciOptions: string[] = []): Promise<Session> {
    ghciOptions = ghciOptions.sort();
    if(!this.session ||
      this.resource !== resource ||
      this.projectType !== projectType ||
      this.targets !== targets ||
      !equal(this.ghciOptions, ghciOptions)) {
        // Session does not exist or old session is not compatible with the new request
        this.dispose();
        this.resource = resource;
        this.projectType = projectType;
        this.targets = targets;
        this.ghciOptions = ghciOptions;
        this.session = await
          this.statusBar.withStatus(
            this.startSession(this.output),
            'Loading GHCi...'
          );
        this.session.start();
        const loading = this.statusBar.withStatus1(
          this.session.reload(),
          statusSetter => {
            this.setStatus = statusSetter; 
          }
        );
        this.session.ghci.stdout.on('line', data => {
          this.logStdout(data);
          this.handleData(data);
        });
        this.session.ghci.stderr.on('line', data => {
          this.logStderr(data);
          this.handleData(data);
        });
        await loading;
    } 
    return this.session;
  }

  public dispose() {
    const session = this.session;
    this.session = null;
    session?.dispose();
    Disposable.from(...this.disposables).dispose();
  }

  private async startSession(output: Output): Promise<Session> {
    const folder = asWorkspaceFolder(this.resource);
    const type = folder ?
      await getWorkspaceType(this.projectType, folder) :
      await computeFileType();
    return new Session(
      output,
      type,
      this.resource,
      this.targets,
      ['-w'].concat(this.ghciOptions)
    );
  }

  private handleData(line: string) {
    this.setStatus(`Loading project: ${line}`);
  }

  private logStdout(line: string) {
    this.output.ghciMessage(line);
  }

  private logStderr(line: string) {
    this.output.ghciError(line);
  }
}
