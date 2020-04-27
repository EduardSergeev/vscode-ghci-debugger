import * as vscode from 'vscode';
import * as path from 'path';
import { Disposable, Terminal } from 'vscode';
import { DebugProtocol } from 'vscode-debugprotocol';
import { StackFrame, InitializedEvent, Source, Breakpoint, Thread, Scope, StoppedEvent, TerminatedEvent, DebugSession } from "vscode-debugadapter";
import Session from '../ghci/session';
import SessionManager from '../ghci/sessionManager';
import Configuration from '../configuration';
import Console from '../console';
import StatusBar from '../statusBar';
import LaunchRequestArguments from './launchRequestArguments';


export default class Debug extends DebugSession implements Disposable {
  private rootDir: string;
  private session: Session;
  private configurationDone: Promise<void>;
  private signalConfigurationDone: () => void;
  private serviceMessage: Boolean;
  private subscriptions = [];

  private breakpoints: DebugProtocol.Breakpoint[] = [];
  private variables: DebugProtocol.Variable[];
  private stoppedAt: DebugProtocol.StackFrame;
  private stackLevel: number;
  private exception: { type: string, lines: string[] };

  public constructor(
    private sessionManager: SessionManager,
    private consoleTerminal: Console,
    private terminal: Terminal,
    private status: StatusBar) {
      super();
      this.rootDir = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0].uri.fsPath || '.';
      this.consoleTerminal.onDidInput(this.didInput, this, this.subscriptions);
  }

	/**
	 * The 'initialize' request is the first request called by the frontend
	 * to interrogate the features the debug adapter provides.
	 */
  protected initializeRequest(response: DebugProtocol.InitializeResponse, args: DebugProtocol.InitializeRequestArguments): void {
    // build and return the capabilities of this debug adapter:
    response.body = response.body || {};

    response.body.supportsConfigurationDoneRequest = true;

    response.body.supportsEvaluateForHovers = true;
    response.body.supportsDelayedStackTraceLoading = true;
    response.body.supportsGotoTargetsRequest = true;

    response.body.supportsExceptionOptions = true;
    response.body.supportsExceptionInfoRequest = true;
    response.body.exceptionBreakpointFilters = [{
      filter: 'exceptions',
      label: 'Exceptions'
    }, {
      filter: 'errors',
      label: 'Errors'
    }];

    response.body.supportsTerminateRequest = true;

    this.configurationDone = new Promise<void>((resolve, _) => {
      this.signalConfigurationDone = resolve;
    });

    this.sendResponse(response);
  }

	/**
	 * Called at the end of the configuration sequence.
	 * Indicates that all breakpoints etc. have been sent to the DA and that the 'launch' can start.
	 */
  protected configurationDoneRequest(response: DebugProtocol.ConfigurationDoneResponse, args: DebugProtocol.ConfigurationDoneArguments): void {
    super.configurationDoneRequest(response, args);

    // notify the launchRequest that configuration has finished
    this.signalConfigurationDone();
  }

  protected async launchRequest(response: DebugProtocol.LaunchResponse, args: LaunchRequestArguments) {
    const resource = vscode.workspace.workspaceFolders ?
      vscode.workspace.workspaceFolders[0] :
      vscode.window.activeTextEditor.document;

    this.session = await this.sessionManager.getSession(resource, args.project, args.targets);
    this.session.ghci.data(this.didOutput, this, this.subscriptions);

    if(this.rootDir !== '.') {
      await this.status.withStatus(
        this.session.ghci.sendCommand(
          `:l ${args.module}`
        ), 'Loading project...'
      );
    } else {
      await this.status.withStatus(
        this.session.ghci.sendCommand(
          `:l ${vscode.window.activeTextEditor.document.uri.fsPath}`
        ), 'Loading file...'
      );
    }

    await this.session.ghci.sendCommand(
      `:set -fghci-hist-size=${Configuration.getHistorySize(resource)}`
    );

    this.sendEvent(new InitializedEvent());

    // wait until configuration has finished (and configurationDoneRequest has been called)
    await this.configurationDone;

    vscode.commands.executeCommand('workbench.action.terminal.clear');

    this.session.ghci.sendCommand(
      args.noDebug ?
        args.expression :
        args.stopOnEntry ?
          `:step ${args.expression}` :
          `:trace ${args.expression}`,
      { captureOutput: true}
    ).then(response => this.didStop(response));

    this.terminal.show();
    this.sendResponse(response);
  }


  protected async setBreakPointsRequest(response: DebugProtocol.SetBreakpointsResponse, args: DebugProtocol.SetBreakpointsArguments): Promise<void> {
    const source = args.source;
    const module = this.session.getModuleName(source.path.toLowerCase());

    // set breakpoint locations
    this.breakpoints = [];
    this.breakpoints = await Promise.all(
      args.breakpoints.map(async bp => {
        const response = await this.session.ghci.sendCommand(
          `:break ${module} ${bp.line} ${bp.column || ''}`
        );
        const [, id, line, column, endLineColumn, endColumn] =
          response[0].match(/Breakpoint\s(\d+).+?:(\d+):(\d+)(?:-(\d+))?/) ||
          response[0].match(/Breakpoint\s(\d+).+?:\((\d+),(\d+)\)-\((\d+),(\d+)\)/);
        const breakpoint = <DebugProtocol.Breakpoint>new Breakpoint(
          true,
          Number(line),
          Number(column),
          new Source(source.name, source.path));
        breakpoint.id = Number(id);
        if(endColumn) {
          breakpoint.endLine = Number(endLineColumn);
        } else if (endLineColumn) {
          breakpoint.endLine = Number(line);
          breakpoint.endColumn = Number(endLineColumn) + 1;
        }
        return breakpoint;
      })
    );
    response.body = {
      breakpoints: this.breakpoints
    };
    this.sendResponse(response);
  }

  protected async setExceptionBreakPointsRequest(response: DebugProtocol.SetExceptionBreakpointsResponse, args: DebugProtocol.SetExceptionBreakpointsArguments, request?: DebugProtocol.Request): Promise<void> {
    if (args.filters.includes('exceptions')) {
      await this.session.ghci.sendCommand(
        ':set -fbreak-on-exception'
      );
    } else {
      await this.session.ghci.sendCommand(
        ':unset -fbreak-on-exception'
      );
    }

    if (args.filters.includes('errors')) {
      await this.session.ghci.sendCommand(
        ':set -fbreak-on-error'
      );
    } else {
      await this.session.ghci.sendCommand(
        ':unset -fbreak-on-error'
      );
    }
    this.sendResponse(response);
  }



  protected threadsRequest(response: DebugProtocol.ThreadsResponse): void {
    response.body = {
      threads: [
        new Thread(1, "default")
      ]
    };
    this.sendResponse(response);
  }

  protected async stackTraceRequest(response: DebugProtocol.StackTraceResponse, args: DebugProtocol.StackTraceArguments): Promise<void> {
    const resp = await this.session.ghci.sendCommand(
      `:history ${Configuration.getHistorySize()}`
    );
    let stackFrames = this.stoppedAt ? [this.stoppedAt] : [];
    let skip = args.startFrame || 0;
    let take = args.levels || Number.MAX_SAFE_INTEGER;
    let total = 0;
    for (const line of resp) {
      const match = line.match(
        /-(\d+)\s+:\s+(?:\[1m)?(.+?)(?:\[0m)?\s+\((.+):(\d+):(\d+)(?:-(\d+))?\)/
      ) || line.match(
        /-(\d+)\s+:\s+(?:\[1m)?(.+?)(?:\[0m)?\s+\((.+):\((\d+),(\d+)\)-\((\d+),(\d+)\)\)/
      );
      if(match) {
        total++;
        if(skip) {
          skip--;
          continue;
        }
        if(take) {
          take--;
          const [, index, name, modulePath, line, column, endLineColumn, endColumn] = match;
          const frame = <DebugProtocol.StackFrame>new StackFrame(
              Number(index),
              name,
              new Source(path.basename(modulePath), path.isAbsolute(modulePath) ? modulePath : path.join(this.rootDir, modulePath)),
              Number(line),
              Number(column),
            );
          if(endColumn) {
            frame.endLine = Number(endLineColumn);
          } else if (endLineColumn) {
            frame.endLine = Number(line);
            frame.endColumn = Number(endLineColumn) + 1;
          }
          stackFrames.push(frame);
        }
      }
    }
    response.body = {
      stackFrames: stackFrames,
      totalFrames: total
    };
    this.sendResponse(response);
  }

  protected scopesRequest(response: DebugProtocol.ScopesResponse, args: DebugProtocol.ScopesArguments): void {
    response.body = {
      scopes: [
        new Scope("Local", args.frameId + 1, false)
      ]
      .concat(
        this.exception && args.frameId === 1 ? [new Scope("Exception", 1, false)] : []
      )
    };
    this.sendResponse(response);
  }

  protected async variablesRequest(response: DebugProtocol.VariablesResponse, args: DebugProtocol.VariablesArguments, request?: DebugProtocol.Request): Promise<void> {
    const updateVariables = async (output: string[]) => {
      this.variables = [];
      for (let match, pattern = /(\S+) :: (\S+)/g; match = pattern.exec(output.join('\n'));) {
        const [ , name, type ] = match;
        if (name === 'it') {
          continue;
        }
        await this.session.ghci.sendCommand(
          `:force ${name}`
        );
        const lines = await this.session.ghci.sendCommand(
          `:sprint ${name}`
        );
        const output = lines.join('\n');
        if(match = output.match(/= ([\s\S]+?)\[/)) {
          const [, value] = match;
          this.variables.push({
            name: name,
            type: type,
            value: value,
            evaluateName: name,
            
            presentationHint: {
              kind: 'data',
              attributes: ['readOnly']
            },
            variablesReference: 0
          });
        }
      }
    };

    const diff = args.variablesReference - 1 - this.stackLevel;
    this.stackLevel = this.stackLevel + diff;
    if (diff > 0) {
      await this.session.ghci.sendCommand(
        `:back ${diff}`
      ).then(updateVariables);
    } else if (diff < 0) {
      await this.session.ghci.sendCommand(
        `:forward ${-diff}`
      ).then(updateVariables);
    } else {
      await this.session.ghci.sendCommand(
        `:show bindings`
      ).then(updateVariables);
    }
    response.body = {
      variables: this.variables
    };
    this.sendResponse(response);
  }

  protected exceptionInfoRequest(response: DebugProtocol.ExceptionInfoResponse, args: DebugProtocol.ExceptionInfoArguments, request?: DebugProtocol.Request): void {
    const message = this.exception.lines[0];
    const content = this.exception.lines.join('\n');
    const patterns = [
      /^\s+(.+), called at (.+):(\d+):(\d+) in (.+)/gm,
      /^\s+(.+)\s+\((.+):(?:(?:(\d+):(\d+)-(\d+))|(?:\((\d+),(\d+)\)-\((\d+),(\d+)\)))\)/gm
    ];
    const callStack = [];
    for (const pattern of patterns) {
      for (let match; match = pattern.exec(content);) {
        callStack.push(match[0]);
      }
    }
    response.body = {
      exceptionId: message,
      description: message,
      breakMode: 'always',
      details: {
        message: message,
        typeName: this.exception.type.split('.').slice(-1)[0],
        fullTypeName: this.exception.type,
        stackTrace: callStack.join('\n'),
        evaluateName: '_exception'
      }
    };
    this.sendResponse(response);
  }

  protected async evaluateRequest(response: DebugProtocol.EvaluateResponse, args: DebugProtocol.EvaluateArguments): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    const text = editor.document.getText(editor.selection);
    const expression = text.includes(args.expression) ? text : args.expression;

    const variable = this.variables.find(variable => variable.name === expression);
    if (variable) {
      response.body = {
        result: variable.value,
        variablesReference: 0
      };
    } else {
      let output = await this.session.ghci.sendCommand(
        expression
      );
      let value = output[0];
      output = await this.session.ghci.sendCommand(
        `:t ${expression}`
      );
      const match = output[0].match(/(.*)\s+::\s+(.*)/);
      const type = match && match[2];
      value = value || match && match[0];
      if(type || value) {
        response.body = {
          result: value,
          type: type, 
          variablesReference: 0
        };
      }
    }
    this.sendResponse(response);
  }


  protected continueRequest(response: DebugProtocol.ContinueResponse, args: DebugProtocol.ContinueArguments): void {
    this.session.ghci.sendCommand(
      ':trace',
      {captureOutput: true}
    ).then(response => this.didStop(response));
    this.terminal.show();
    this.sendResponse(response);
  }

  protected nextRequest(response: DebugProtocol.NextResponse, args: DebugProtocol.NextArguments): void {
    this.session.ghci.sendCommand(
      ':steplocal',
      {captureOutput: true}
    ).then(response => this.didStop(response));
    this.terminal.show();
    this.sendResponse(response);
  }

  protected stepInRequest(response: DebugProtocol.StepInResponse, args: DebugProtocol.StepInArguments, request?: DebugProtocol.Request): void {
    this.session.ghci.sendCommand(
      ':step',
      {captureOutput: true}
    ).then(response => this.didStop(response));
    this.terminal.show();
    this.sendResponse(response);
  }

  protected async gotoTargetsRequest(response: DebugProtocol.GotoTargetsResponse, args: DebugProtocol.GotoTargetsArguments, request?: DebugProtocol.Request): Promise<void> {
    const source = args.source;
    const module = this.session.getModuleName(source.path.toLowerCase());
    const output = await this.session.ghci.sendCommand(
      `:break ${module} ${args.line} ${args.column || ''}`
    );
    const [, id, line, column, endLineColumn, endColumn] =
      output[0].match(/Breakpoint\s(\d+).+?:(\d+):(\d+)(?:-(\d+))?/) ||
      output[0].match(/Breakpoint\s(\d+).+?:\((\d+),(\d+)\)-\((\d+),(\d+)\)/);
    let target = {
      id: Number(id),
      label: id,
      line: Number(line),
      column: Number(column),
      endLine: null,
      endColumn: null
    };
    if(endColumn) {
      target.endLine = Number(endLineColumn);
    } else if (endLineColumn) {
      target.endLine = Number(line);
      target.endColumn = Number(endLineColumn) + 1;
    }
    response.body = {
      targets: [target]
    };
    this.sendResponse(response);
  }


  protected terminateRequest(response: DebugProtocol.TerminateResponse, args: DebugProtocol.TerminateArguments, request?: DebugProtocol.Request): void {
    this.session.ghci.sendCommand(
      ':abandon'
    ).then(response => this.didStop(response));
    this.sendResponse(response);
  }


  private async didStop(response: string[]) {
    this.terminal.show();
    this.stackLevel = 0;
    this.stoppedAt = null;
    this.variables = [];
    this.exception = null;
    const output = response.join('\n');

    let match =
      output.match(/(?:\[.*\] )?([\s\S]*)Stopped in (\S+),\s(.*):(\d+):(\d+)/m) ||
      output.match(/(?:\[.*\] )?([\s\S]*)Stopped in (\S+),\s(.*):\((\d+),(\d+)\)/m);
    if (match) {
      const [ , _output, name, modPath, line, column ] = match;
      const fullPath = path.isAbsolute(modPath) ? modPath : path.join(this.rootDir, modPath);
      const module = this.session.getModuleName(fullPath);
      this.stoppedAt =
        new StackFrame(
          Number(0),
          name.split('.').slice(-1)[0],
          new Source(path.basename(modPath), fullPath),
          Number(line),
          Number(column)
        );

      if (this.breakpoints.find(breakpoint =>
        breakpoint.source.name === module &&
        breakpoint.line === Number(line) &&
        breakpoint.column === Number(column))) {
          this.sendEvent(new StoppedEvent('breakpoint', 1));
      } else {
        this.sendEvent(new StoppedEvent('step', 1));
      }
    } else if (match = output.match(/(?:\[.*\] )?([\s\S]*)(^\*\*\* Exception: [\s\S]*)/m)) {
      const [, _output, exception] = match;
      this.consoleTerminal.sendData(exception);
      this.sendEvent(new TerminatedEvent());
    } else if (match = output.match(/(?:\[.*\] )?([\s\S]*)Stopped in <exception thrown>/m)) {
      const [, out] = match;
      this.consoleTerminal.sendData(out);
      await this.session.ghci.sendCommand(
        ':force _exception'
      );
      const [exception] = await this.session.ghci.sendCommand(
        ':type _exception'
      );
      const [, exceptionType] = exception.match(/::\s+(.+)/);
      const lines = await this.session.ghci.sendCommand(
        'putStrLn $ show _exception'
      );
      this.exception = {
        lines: lines.map(line => line.replace(/\[<unknown>\]\s+/g, '')),
        type: exceptionType
      };
      this.sendEvent(new StoppedEvent('exception', 1));
    } else {
      const [, _output] = output.match(/(?:\[.*\] )?([\s\S]*)/);
      this.sendEvent(new TerminatedEvent());
    }
  }

  private didOutput(data: string) {
    const start = data.indexOf('Stopped in ');
    const end = data.indexOf('λ\n');
    if (start >= 0) {
      this.serviceMessage = true;
      data = data.slice(0, start);
      if(data) {
        this.consoleTerminal.sendData(data);
      }
    } else if (this.serviceMessage && end >= 0) {
      data = data.slice(end + 2);
      if (data) {
        this.consoleTerminal.sendData(data);
      }
      this.serviceMessage = false;
    } else if(!this.serviceMessage) {
      this.consoleTerminal.sendData(data.replace(/λ\n/m, ''));
    }
  }

  private didInput(data: string) {
    this.session.ghci.sendData(data);
  }

  public dispose() {
    Disposable.from(...this.subscriptions).dispose();
  }
}
