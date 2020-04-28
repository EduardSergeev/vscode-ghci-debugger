import { StatusBarItem } from "vscode";


export default class StatusBar {
  private statusSetter: (status: string) => void;
  constructor(
    private statusBar: StatusBarItem,
    private busyLabel?: string,
    private idleLabel?: string) {
  }
  
  public async withStatus<T>(operation: Thenable<T>, status: string): Promise<T> {
    this.statusBar.text = (this.busyLabel || '') + status;
    this.statusBar.show();
    const result = await operation;
    this.statusBar.text = this.idleLabel || '';
    this.statusBar.show();
    return result;
  }

  public async withStatus1<T>(operation: Thenable<T>, getStatusSetter: (statusSetter: (status: string) => void) => void): Promise<T> {
    getStatusSetter(status => {
      const statusSetter = this.statusSetter;
      if(statusSetter) {
        this.statusSetter(status);
      }
    });
    this.statusSetter = status => {
      this.statusBar.text = (this.busyLabel || '') + status;
      this.statusBar.show();
    };
    const result = await operation;
    this.statusSetter = null;
    this.statusBar.text = this.idleLabel || '';
    this.statusBar.show();
    return result;
  }
}
