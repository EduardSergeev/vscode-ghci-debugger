import * as child_process from 'child_process';
import * as readline from 'readline';
import * as process from 'process';
import { Disposable, CancellationToken, Event, EventEmitter } from "vscode";
import Output from '../features/output';

interface StrictCommandConfig {
  token: CancellationToken;
  info: string;
  captureOutput: Boolean;
}

type CommandConfig = {
  [ K in keyof StrictCommandConfig ]?: StrictCommandConfig[ K ]
};

interface PendingCommand extends StrictCommandConfig {
  command: string;
  captureOutput: Boolean;
  resolve: (result: string[]) => void;
  reject: (reason: any) => void;
}

export default class GhciManager implements Disposable {
  private proc: child_process.ChildProcess | null;
  private dataEmitter: EventEmitter<string>;
  private rawDataEmitter: EventEmitter<string>;

  public stdout: readline.ReadLine;
  public stderr: readline.ReadLine;
  public data: Event<string>;
  public rawData: Event<string>;

  constructor(
    private options: any,
    private output: Output) {
      this.proc = null;
      this.options = options;
      this.dataEmitter = new EventEmitter<string>();
      this.data = this.dataEmitter.event;
      this.rawDataEmitter = new EventEmitter<string>();
      this.rawData = this.rawDataEmitter.event;
  }

  makeReadline(stream): readline.ReadLine {
    const res = readline.createInterface({
      input: stream
    });
    res.on('line', this.handleLine.bind(this));
    return res;
  }

  async start(command: string): Promise<child_process.ChildProcess> {
    // Otherwise Windows' cmd cannot display Unicode
    const unicodeFix = process.platform === 'win32' ? 'cmd /c chcp 65001>nul && ' : '';
    this.proc = child_process.spawn(unicodeFix + command, {
      ... this.options,
      stdio: 'pipe',
      shell: true,
      windowsVerbatimArguments: true
    });
    this.proc.on('exit', () => { this.proc = null; });
    this.proc.on('error', () => { this.proc = null; });

    this.proc.stdout.on('data', (data) => {
      this.rawDataEmitter.fire(data);
      if(this.currentCommand && this.currentCommand.captureOutput) {
        this.dataEmitter.fire(data);
      } else {

      }
    });
    this.stdout = this.makeReadline(this.proc.stdout);
    this.stderr = this.makeReadline(this.proc.stderr);
    
    this.proc.stdin.on('close', this.handleClose.bind(this));
    this.sendCommand(':set prompt "λ\\n"');
    return this.proc;
  }

  async stop(): Promise<void> {
    try {
      await this.sendCommand(':quit');
      throw new Error('Quitting ghci should not have succeeded');
    } catch (_reason) {
      return;
    }
  }

  kill() {
    if (this.proc !== null) {
      this.proc.kill();
      this.proc = null;
    }
  }

  currentCommand: {
    resolve: (result: string[]) => void,
    reject: (reason: any) => void,
    lines: string[],
    captureOutput: Boolean
  } | null = null;

  pendingCommands: PendingCommand[] = [];

  sendData(data: string) {
    this.proc.stdin.write(data);
  }

  sendCommand(command: string, config: CommandConfig = {}): Promise<string[]> {
    if (config.token) {
      config.token.onCancellationRequested(
        this.handleCancellation.bind(this)
      );
    }
    return new Promise((resolve, reject) => {
      const nullConfig: StrictCommandConfig = {
        token: null,
        info: null,
        captureOutput: false
      };

      const pending: PendingCommand = {
        ...nullConfig,
        ...config,
        command: command, resolve, reject
      };
      if (this.currentCommand === null) {
        this.launchCommand(pending);
      } else {
        this.pendingCommands.push(pending);
      }
    });
  }

  handleLine(line: string): void {
    if (this.currentCommand === null) {
      this.output.warning(`Orphant line received (no command running), ignoring: '${line}'`);
    } else {
      if (line.slice(-1) === 'λ') {
        if(line.length > 1) {
          this.currentCommand.lines.push(line.slice(0, line.length - 1));
        }
        this.currentCommand.resolve(this.currentCommand.lines);
        this.currentCommand = null;
        this.handleCancellation();

        if (this.pendingCommands.length > 0) {
          this.launchCommand(this.pendingCommands.shift());
        }
      } else {
        this.currentCommand.lines.push(line);
      }
    }
  }

  handleCancellation(): void {
    while (this.pendingCommands.length > 0
      && this.pendingCommands[0].token
      && this.pendingCommands[0].token.isCancellationRequested) {
        this.output.info(`Cancel ${this.pendingCommands[0].command}`);
        this.pendingCommands[0].reject('cancelled');
        this.pendingCommands.shift();
    }
  }

  launchCommand({ command, captureOutput, resolve, reject }: PendingCommand) {
    this.currentCommand = { resolve, reject, lines: [], captureOutput };
    this.proc.stdin.write(`${command}\n`);
    this.output.ghciCommand(command);
  }

  handleClose() {
    if (this.currentCommand !== null) {
      this.currentCommand.reject('stream closed');
      this.currentCommand = null;
    }

    for (const cmd of this.pendingCommands) {
      cmd.reject('stream closed');
    }

    this.pendingCommands.length = 0; // Clear pendingCommands
    this.dispose();
  }

  dispose() {
    if (this.proc !== null) {
      this.proc.kill();
      this.proc = null;
    }
    this.stdout = null;
    this.stderr = null;
  }
}
