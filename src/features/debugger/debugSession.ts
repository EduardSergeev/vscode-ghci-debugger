import * as vscode from 'vscode';
import { DebugProtocol } from 'vscode-debugprotocol';
import { LoggingDebugSession, StackFrame, InitializedEvent, Logger, Source, Breakpoint, Thread, Scope, StoppedEvent, TerminatedEvent, logger, OutputEvent } from "vscode-debugadapter";
import LaunchRequestArguments from './launchRequestArguments';
import { basename } from 'path';
import { GhciApi, Session } from './ghci';
const { Subject } = require('await-notify');


export default class DebugSession extends LoggingDebugSession {
  private ghci: GhciApi;
  private session: Session;
  private configurationDone = new Subject();

  private breakpoints: DebugProtocol.Breakpoint[] = [];
  private variables: DebugProtocol.Variable[];
  private stackFrames: DebugProtocol.StackFrame[] = [];
  private stackLevel: number;
  private exception: { type: string, lines: string[] };

  public constructor(ghci: GhciApi) {
    super("ghci-debug.txt");
    this.ghci = ghci;
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

    this.sendResponse(response);
  }

	/**
	 * Called at the end of the configuration sequence.
	 * Indicates that all breakpoints etc. have been sent to the DA and that the 'launch' can start.
	 */
  protected configurationDoneRequest(response: DebugProtocol.ConfigurationDoneResponse, args: DebugProtocol.ConfigurationDoneArguments): void {
    super.configurationDoneRequest(response, args);

    // notify the launchRequest that configuration has finished
    this.configurationDone.notify();
  }

  protected async launchRequest(response: DebugProtocol.LaunchResponse, args: LaunchRequestArguments) {

    // make sure to 'Stop' the buffered logging if 'trace' is not set
    logger.setup(args.trace ? Logger.LogLevel.Verbose : Logger.LogLevel.Stop, false);

    this.session = await this.ghci.startSession(
      vscode.window.activeTextEditor.document, {
        // startOptions: "-fexternal-interpreter -prof",
        // reloadCommands: [
        //   ":set -fbyte-code"
        // ],
      }
    );
    this.session.reload();
    await this.session.loading;
    await this.session.loadInterpreted(vscode.window.activeTextEditor.document.uri);

    this.sendEvent(new InitializedEvent());
    // wait until configuration has finished (and configurationDoneRequest has been called)
    await this.configurationDone.wait(100000);

    await this.session.ghci.sendCommand(
      `:module ${args.module}`
    );

    this.session.ghci.sendCommand(
      args.stopOnEntry ? `:step ${ args.function }` : `:trace ${ args.function }`,
      { info: "Starting"}
    ).then(response => this.didStop(response));

    this.sendResponse(response);
  }


  protected async setBreakPointsRequest(response: DebugProtocol.SetBreakpointsResponse, args: DebugProtocol.SetBreakpointsArguments): Promise<void> {
    const source = args.source;
    await this.session.ghci.sendCommand(
      `:add *${source.path}`
    );
    const modules = (await this.session.ghci.sendCommand(
      `:show modules`
    )).join('\n');

    let module;
    for(let match, pattern = /^([^ ]+)\s+\( (.+), .+ \)$/gm; match = pattern.exec(modules);) {
      if(match[2].toLowerCase() === source.path.toLowerCase()) {
        module = match[1];
        break;
      }
    }

    // set breakpoint locations
    this.breakpoints = [];
    this.breakpoints = await Promise.all(
      args.breakpoints.map(async bp => {
        const response = await this.session.ghci.sendCommand(
          `:break ${module} ${bp.line} ${bp.column || ''}`
        );
        const [, id, line, column, endLineColumn, endColumn] =
          response[ 0 ].match(/Breakpoint\s(\d+).+?:(\d+):(\d+)(?:-(\d+))/) ||
          response[ 0 ].match(/Breakpoint\s(\d+).+?:\((\d+),(\d+)\)-\((\d+),(\d+)\)/);
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
          breakpoint.endColumn = Number(endLineColumn);
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
      ':history'
    );
    const history = resp.join('\n');
    const patterns = [
      /-(\d+)\s+:\s+(?:\[1m)?(.+?)(?:\[0m)?\s+\((.+):(\d+):(\d+)(?:-(\d+))?\)/g,
      /-(\d+)\s+:\s+(?:\[1m)?(.+?)(?:\[0m)?\s+\((.+):\((\d+),(\d+)\)-\((\d+),(\d+)\)\)/g
    ];
    for (const pattern of patterns) {
      for (let match, i = 0; (match = pattern.exec(history)) && (!args.levels || i < args.levels); i++) {
        const [, index, name, path, line, column, endLineColumn, endColumn] = match;
        const frame = <DebugProtocol.StackFrame>new StackFrame(
            Number(index),
            name,
            new Source(basename(path), path),
            Number(line),
            Number(column),
          );
        if(endColumn) {
          frame.endLine = Number(endLineColumn);
        } else if (endLineColumn) {
          frame.endLine = Number(line);
          frame.endColumn = Number(endLineColumn);
        }
        this.stackFrames.push(frame);
      }
    }
    response.body = {
      stackFrames: this.stackFrames,
      totalFrames: this.stackFrames.length
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
          `:print ${name}`
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
    const variable = this.variables.find(variable =>
      variable.name === args.expression);
    if (variable) {
      response.body = {
        result: variable.value,
        variablesReference: 0
      };
    } else {
      const output = await this.session.ghci.sendCommand(
        args.expression
      );
      if (output[ 0 ].length) {
        const match = output[ 0 ].match(/\[.+\]\s+(.+)/);
        if (match) {
          response.body = {
            result: match[ 1 ],
            variablesReference: 0
          };
        }
      }
    }
    this.sendResponse(response);
  }


  protected continueRequest(response: DebugProtocol.ContinueResponse, args: DebugProtocol.ContinueArguments): void {
    this.session.ghci.sendCommand(
      ':trace'
    ).then(response => this.didStop(response));
    this.sendResponse(response);
  }

  protected nextRequest(response: DebugProtocol.NextResponse, args: DebugProtocol.NextArguments): void {
    this.session.ghci.sendCommand(
      ':step'
    ).then(response => this.didStop(response));
    this.sendResponse(response);
  }

  protected terminateRequest(response: DebugProtocol.TerminateResponse, args: DebugProtocol.TerminateArguments, request?: DebugProtocol.Request): void {
    this.session.ghci.sendCommand(
      ':abandon'
    ).then(response => this.didStop(response));
    this.sendResponse(response);
  }


  private async didStop(response: string[]) {
    this.stackLevel = 0;
    this.stackFrames = [];
    this.variables = [];
    this.exception = null;
    const output = response.join('\n');

    let match =
      output.match(/(?:\[.*\] )?([\s\S]*)Stopped in (\S+),\s(.*):(\d+):(\d+)/m) ||
      output.match(/(?:\[.*\] )?([\s\S]*)Stopped in (\S+),\s(.*):\((\d+),(\d+)\)/m);
    if (match) {
      const [ , out, name, path, line, column ] = match;
      if(out) {
        this.sendEvent(new OutputEvent(out));
      }
      this.stackFrames = [
        new StackFrame(
          Number(0),
          name.split('.').slice(-1)[0],
          new Source(basename(path), path),
          Number(line),
          Number(column)
        )
      ];

      if (this.breakpoints.find(breakpoint =>
        breakpoint.line === Number(line) && breakpoint.column === Number(column))) {
          this.sendEvent(new StoppedEvent('breakpoint', 1));
      } else {
        this.sendEvent(new StoppedEvent('step', 1));
      }
    } else if (match = output.match(/(?:\[.*\] )?([\s\S]*)(^\*\*\* Exception: [\s\S]*)/m)) {
      const [, out, exception] = match;
      this.sendEvent(new OutputEvent(out));
      this.sendEvent(new OutputEvent(exception));
      this.sendEvent(new TerminatedEvent());
    } else if (match = output.match(/(?:\[.*\] )?([\s\S]*)Stopped in <exception thrown>/m)) {
      const [, out] = match;
      this.sendEvent(new OutputEvent(out));
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
      this.sendEvent(new TerminatedEvent());
    }
  }
}
