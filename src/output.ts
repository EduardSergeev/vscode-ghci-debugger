import { OutputChannel, Disposable } from "vscode";


export default class Output implements Disposable {
  constructor(private outputChannel: OutputChannel) {
  }

  public ghciMessage(text: string): void {
    this.outputChannel.appendLine(text);
  }

  public ghciCommand(text: string): void {
    this.outputChannel.appendLine(`‌λ ${text}`);
  }

  public ghciError(text: string): void {
    this.outputChannel.appendLine(`‌‌${text}`);
  }

  public info(text: string): void {
    this.outputChannel.appendLine(`‌${text}`);
  }

  public warning(text: string): void {
    this.outputChannel.appendLine(`‌${text}`);
  }

  public error(text: string): void {
    this.outputChannel.appendLine(`‌${text}`);
  }


  public show() {
    this.outputChannel.show();
  }

  public dispose() {
    this.outputChannel.dispose();
  }
}
