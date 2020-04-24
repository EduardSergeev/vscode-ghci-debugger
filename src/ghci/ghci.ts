'use strict';

import * as child_process from 'child_process';
import * as readline from 'readline';
import * as process from 'process';
import { Disposable, CancellationToken, OutputChannel, Event, EventEmitter } from "vscode";

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
  proc: child_process.ChildProcess | null;
  command: string;
  options: any;
  stdout: readline.ReadLine;
  stderr: readline.ReadLine;
  dataEmitter: EventEmitter<string>;
  data: Event<string>;
  outputChannel: OutputChannel;

  wasDisposed: boolean;

  constructor(command: string, options: any, outputChannel: OutputChannel) {
    this.proc = null;
    this.command = command;
    this.options = options;
    this.outputChannel = outputChannel;
    this.wasDisposed = false;
    this.dataEmitter = new EventEmitter<string>();
    this.data = this.dataEmitter.event;
  }

  makeReadline(stream): readline.ReadLine {
    const res = readline.createInterface({
      input: stream
    });
    res.on('line', this.handleLine.bind(this));
    return res;
  }

  checkDisposed() {
    if (this.wasDisposed) {
      throw new Error('ghci already disposed');
    }
  }

  outputLine(line: string) {
    this.outputChannel.appendLine(line);
  }

  async start(): Promise<child_process.ChildProcess> {
    this.checkDisposed();
    // Otherwise Windows' cmd cannot display Unicode
    const unicodeFix = process.platform === 'win32' ? 'cmd /c chcp 65001>nul && ' : '';
    this.proc = child_process.spawn(unicodeFix + this.command, {
      ... this.options,
      stdio: 'pipe',
      shell: true,
      windowsVerbatimArguments: true
    });
    this.proc.on('exit', () => { this.proc = null; });
    this.proc.on('error', () => { this.proc = null; });

    this.proc.stdout.on('data', (data) => {
      if(this.currentCommand && this.currentCommand.captureOutput) {
        this.outputChannel.appendLine(`data+ | ${data}`);
        this.dataEmitter.fire(`${data}`);
      } else {
        this.outputChannel.appendLine(`data- | ${data}`);
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

  async sendCommand(
    command: string,
    config: CommandConfig = {}):
    Promise<string[]> {
    if (config.token) {
      config.token.onCancellationRequested(
        this.handleCancellation.bind(this)
      );
    }
    if (this.proc === null) {
      await this.start();
    }
    return this._sendCommand(command, config);
  }

  sendData(data: string) {
    this.proc.stdin.write(data);
  }


  _sendCommand(command: string, config: CommandConfig = {}):
    Promise<string[]> {
    return new Promise((resolve, reject) => {
      this.checkDisposed();

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

  handleLine(line: string) {
    this.outputLine(`ghci | ${line}`);
    if (this.currentCommand === null) {
      // Ignore stray line
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

  handleCancellation() {
    while (this.pendingCommands.length > 0
      && this.pendingCommands[0].token
      && this.pendingCommands[0].token.isCancellationRequested) {
      this.outputLine(`Cancel ${this.pendingCommands[0].command}`);
      this.pendingCommands[0].reject('cancelled');
      this.pendingCommands.shift();
    }
  }

  launchCommand({ command, captureOutput, resolve, reject }: PendingCommand) {
    this.currentCommand = { resolve, reject, lines: [], captureOutput };
    this.outputLine(`    -> ${command}`);
    this.proc.stdin.write(`${command}\n`);
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
    this.wasDisposed = true;

    if (this.proc !== null) {
      this.proc.kill();
      this.proc = null;
    }
    this.stdout = null;
    this.stderr = null;
  }
}
