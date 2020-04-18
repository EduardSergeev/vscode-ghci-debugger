import * as vscode from 'vscode';
import { DebugProtocol } from 'vscode-debugprotocol';
import { LoggingDebugSession, StackFrame, InitializedEvent, Logger, Source, Breakpoint, Thread, Scope, StoppedEvent, TerminatedEvent, logger } from "vscode-debugadapter";
import LaunchRequestArguments from './launchRequestArguments';
import { basename } from 'path';
import Ghci, { Session } from './ghci';
const { Subject } = require('await-notify');


export default class DebugSession extends LoggingDebugSession {
  private ghci: Ghci;
	private session: Session;
	private configurationDone = new Subject();

  private breakpoints: DebugProtocol.Breakpoint[] = [];
  private stoppedAt: { name: string, path: string, line: number, column: number };
  private variables: DebugProtocol.Variable[];
  private stack: StackFrame[] = [];
  private exception;

	public constructor(ghci: Ghci) {
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
    // response.body.supportsExceptionInfoRequest = true;
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

    this.session = await this.ghci.startSession(vscode.window.activeTextEditor.document);
    await this.session.loading;
    await this.session.ghci.sendCommand(
      `:set -fbyte-code`
    );
    await this.session.ghci.sendCommand(
        `:load ${args.module}`
    );
    // await this._session.ghci.sendCommand(
    //     `:set -fbreak-on-exception`
    // );

    this.sendEvent(new InitializedEvent());

		// wait until configuration has finished (and configurationDoneRequest has been called)
		await this.configurationDone.wait(10000);

        this.session.ghci.sendCommand(
            args.stopOnEntry ? `:step ${args.function}` : `:trace ${args.function}`
        ).then(response => this.didStop(response));

		this.sendResponse(response);
	}

	protected async setBreakPointsRequest(response: DebugProtocol.SetBreakpointsResponse, args: DebugProtocol.SetBreakpointsArguments): Promise<void> {
        const source = args.source;
		// clear all breakpoints for this file
        this.breakpoints = [];
        await this.session.ghci.sendCommand(
            ':delete *'
        );

		// set breakpoint locations
		this.breakpoints = await Promise.all(
            args.breakpoints.map(async breakpoint => {
                const response = await this.session.ghci.sendCommand(
                    `:break ${args.source.name.split(".")[0]} ${breakpoint.line}`
                );
                const [, id, line, column] =
                    response[0].match(/Breakpoint\s(\d+).+?:(\d+):(\d+)-(\d+)/) ||
                    response[0].match(/Breakpoint\s(\d+).+?:\((\d+),(\d+)\)-\((\d+),(\d+)\)/);
                const bp = <DebugProtocol.Breakpoint> new Breakpoint(
                    true,
                    Number(line),
                    Number(column),
                    new Source(source.name, source.path));
                bp.id= Number(id);
                return bp;
            })
        );
		response.body = {
			breakpoints: this.breakpoints
		};
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

	protected stackTraceRequest(response: DebugProtocol.StackTraceResponse, args: DebugProtocol.StackTraceArguments): void {
		response.body = {
			stackFrames: (this.stack.length ? this.stack : [
                new StackFrame(
                    0,
                    this.stoppedAt.name.split(".").slice(-1)[0],
                    new Source(basename(this.stoppedAt.path), this.stoppedAt.path),
                    this.stoppedAt.line,
                    this.stoppedAt.column)]),
			totalFrames: 1
		};
		this.sendResponse(response);
	}

	protected scopesRequest(response: DebugProtocol.ScopesResponse, args: DebugProtocol.ScopesArguments): void {
		response.body = {
			scopes: [
				new Scope("Local", 1, false)
			]
		};
		this.sendResponse(response);
	}

	protected variablesRequest(response: DebugProtocol.VariablesResponse, args: DebugProtocol.VariablesArguments, request?: DebugProtocol.Request): void {
		response.body = {
			variables: this.variables
		};
		this.sendResponse(response);
	}

    protected exceptionInfoRequest(response: DebugProtocol.ExceptionInfoResponse, args: DebugProtocol.ExceptionInfoArguments, request?: DebugProtocol.Request): void {
        response.body = {
            exceptionId: "exception",
            description: this.exception,
            breakMode: 'unhandled',
            details: this.exception
        };
    }

    protected async evaluateRequest(response: DebugProtocol.EvaluateResponse, args: DebugProtocol.EvaluateArguments): Promise<void> {
        const variable = this.variables.find(variable =>
            variable.name === args.expression);
        if(variable) {
            response.body = {
                result: variable.value,
                variablesReference: 0
            };
        } else {
            const output = await this.session.ghci.sendCommand(
                args.expression
            );
            if(output[0].length) {
                const match = output[0].match(/\[.+\]\s+(.+)/);
                if(match) {
                    response.body = {
                        result: match[1],
                        variablesReference: 0
                    };
                }
            }
        }
        this.sendResponse(response);
    }


	protected continueRequest(response: DebugProtocol.ContinueResponse, args: DebugProtocol.ContinueArguments): void {
        this.stack = [];
        this.session.ghci.sendCommand(
            ':continue'
        ).then(response => this.didStop(response));
		this.sendResponse(response);
	}

	protected nextRequest(response: DebugProtocol.NextResponse, args: DebugProtocol.NextArguments): void {
        this.stack = [];
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


    private didStop(response: string[]) {
        const output = response.join('\n');
        let match =
            output.match(/Stopped in (\S+),\s(.*):(\d+):(\d+)/) ||
            output.match(/Stopped in (\S+),\s(.*):\((\d+),(\d+)\)/);
        if(match) {
            const [, name, path, line, column] = match;
            this.stoppedAt = {
                name: name,
                path: path,
                line: Number(line),
                column: Number(column)
            };

            this.variables = [];
            for (let match, pattern = /(.+?) :: (.+?) = (.+)/g; match = pattern.exec(output);) {
                const [, name, type, value] = match;
                this.variables.push({
                    name: name,
                    type: type,
                    value: value,
                    variablesReference: 0
                });
            }
            if(this.breakpoints.find(breakpoint =>
                breakpoint.line === this.stoppedAt.line && breakpoint.column === this.stoppedAt.column)) {
                this.sendEvent(new StoppedEvent('breakpoint', 1));
            } else {
                this.sendEvent(new StoppedEvent('step', 1));
            }
        } else if (match = output.match(/\*\*\* Exception: ([\s\S]+?)(CallStack|$)/m)) {
            this.exception = match[1];
            const pattern =
                output.match(/CallStack \(from -prof\):/) ?
                    /^\s+(.+)\s+\((.+):(?:(?:(\d+):(\d+)-(\d+))|(?:\((\d+),(\d+)\)-\((\d+),(\d+)\)))\)/gm :
                    (output.match(/CallStack \(from HasCallStack\):/)) ?
                        /^\s+(.+), called at (.+):(\d+):(\d+) in (.+)/gm :
                        /$ ^/gm;
            for (let match, i = 0; match = pattern.exec(output); i++) {
                const [, name, path, line1, column1, , line2, column2] = match;
                this.stack.push(
                    new StackFrame(
                        i,
                        name,
                        new Source(
                            basename(path), path),
                            Number(line1 || line2),
                            Number(column1 || column2)));
            }
            this.sendEvent(new StoppedEvent('exception', 1, this.exception));
        } else if (match = output.match(/Stopped in <exception thrown>/)) {
            this.session.ghci.sendCommand(
                ':hist 1'
            ).then(response => this.didStop(response));
        } else if (match = output.match(/   /)) {
            const [, name, path, line, column] = match;
            this.stoppedAt = {
                name: name,
                path: path,
                line: Number(line),
                column: Number(column)
            };
            this.sendEvent(new StoppedEvent('exception', 1));
        } else {
            this.sendEvent(new TerminatedEvent());
        }
    }
}
