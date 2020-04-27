import * as vscode from 'vscode';
import * as assert from 'assert';
import * as path from 'path';
import { Position } from 'vscode';
import Console from '../console';


suite("All", function () {
  test("Startup", async () => {
    const doc = await vscode.workspace.openTextDocument(
      path.join(__dirname, '../../input/test1.hs')
    );
    await vscode.window.showTextDocument(doc);

    const breakPoint = new Position(2, 2);
    vscode.debug.addBreakpoints([
      new vscode.SourceBreakpoint(
        new vscode.Location(
          doc.uri,
          breakPoint
        )
      )
    ]);

    const started = await vscode.debug.startDebugging(null, {
      type: 'ghci',
      name: 'test',
      request: 'launch',
      stopOnEntry: false,
      project: 'bare-stack',
      module: 'Main',
      expression: 'main'
    });
    assert.ok(started);

    const console = vscode.extensions.getExtension<Console>('edka.ghci-debugger').exports;
    assert.ok(console);

    const output = new Promise<string>((resolve, _) => {
      let output = '';
      console.onDidWrite(data => {
          output = output + data;
          if(output.endsWith('\n\r')) {
            resolve(data);
          }
        },
        this
      );
    });

    await new Promise<void>((resolve, _) => {
        vscode.window.onDidChangeTextEditorSelection(_ => {
            resolve();
          }, this
        );
      }
    );

    const editor = vscode.window.activeTextEditor;
    assert.deepEqual(editor.selection.start, breakPoint);
    
    await vscode.commands.executeCommand('workbench.action.debug.continue');

    assert.equal(await output, 'Hello, tester!\n\r');
  });
});
