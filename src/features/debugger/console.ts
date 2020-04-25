import { Pseudoterminal, Event, TerminalDimensions, EventEmitter, Disposable } from "vscode";

export default class ConsoleTerminal implements Pseudoterminal {
  private writeEmitter: EventEmitter<string>;
  private readEmitter: EventEmitter<string>;

  public constructor() {
    this.writeEmitter = new EventEmitter<string>();
    this.readEmitter = new EventEmitter<string>();
    this.onDidWrite = this.writeEmitter.event;
    this.onDidInput = this.readEmitter.event;
  }

  public onDidWrite: Event<string>;

  public onDidInput: Event<string>;


  public open(initialDimensions: TerminalDimensions): void {
  }

  public close(): void {
  }

  public handleInput?(data: string): void {
    if (!['[B', '[A'].includes(data)) {
      if (data === '\r') {
        data = '\n\r';
      }
      this.readEmitter.fire(data);
      this.writeEmitter.fire(data);
    }
  }
  
  public sendData(data: string): void {
    const fixed = data.replace(/\n/g, '\n\r');
    this.writeEmitter.fire(fixed);
  }
}
