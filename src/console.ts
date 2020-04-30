import { Pseudoterminal, Event, TerminalDimensions, EventEmitter } from "vscode";

export default class Console implements Pseudoterminal {
  private outputEmitter: EventEmitter<string>;
  private inputEmitter: EventEmitter<string>;

  public constructor() {
    this.outputEmitter = new EventEmitter<string>();
    this.inputEmitter = new EventEmitter<string>();
    this.onDidWrite = this.outputEmitter.event;
    this.onDidInput = this.inputEmitter.event;
  }

  public onDidWrite: Event<string>;

  public onDidInput: Event<string>;


  public open(_initialDimensions: TerminalDimensions): void {
  }

  public close(): void {
  }

  public handleInput?(data: string): void {
    if (!['[B', '[A'].includes(data)) {
      if (data === '\r') {
        data = '\r\n';
      }
      this.inputEmitter.fire(data === '\r' ? '\r\n' : data);
      this.outputEmitter.fire(data === '\r' ? '\n' : data);
    }
  }
  
  public sendData(data: string): void {
    const fixed = data.replace(/(?<!\r)\n/g, '\r\n');
    this.outputEmitter.fire(fixed);
  }
}
