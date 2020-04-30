import * as vscode from 'vscode';
import * as assert from 'assert';
import * as path from 'path';
import { Position, Selection } from 'vscode';
import Console from '../../console';
import { OpenOutputCommandId, GhciLogMarker } from '../../extension';


suite("Integration", function () {

  test("Simple debug run", async () => {
    const doc = await vscode.workspace.openTextDocument(
      path.join(__dirname, '../../../input/test1.hs')
    );
    await vscode.window.showTextDocument(doc);

    vscode.debug.addBreakpoints([
      new vscode.SourceBreakpoint(new vscode.Location(doc.uri, new Position(2, 0)))
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

    const terminal = vscode.extensions.getExtension<Console>('edka.ghci-debugger').exports;
    assert.ok(terminal);

    const output = new Promise<string>((resolve, _) => {
      let output = '';
      terminal.onDidWrite(data => {
          output = output + data;
          if (output.endsWith('\r\n')) {
            resolve(output);
          }
      }, this);
    });

    const editor = vscode.window.activeTextEditor;

    await didChangeTextEditorSelection();
    assert.deepEqual(editor.selection.start, new Position(2, 2));

    await vscode.commands.executeCommand('workbench.panel.repl.view.focus');
    await vscode.env.clipboard.writeText('2+2');
    await vscode.commands.executeCommand('editor.action.clipboardPasteAction');
    const result = await vscode.commands.executeCommand('repl.action.acceptInput');

    await vscode.commands.executeCommand('workbench.action.debug.stepInto');
    await didChangeTextEditorSelection();
    assert.deepEqual(editor.selection.start, new Position(3, 2));

    await vscode.commands.executeCommand('workbench.action.debug.stepOver');
    await didChangeTextEditorSelection();
    assert.deepEqual(editor.selection.start, new Position(4, 2));

    await vscode.commands.executeCommand('workbench.action.debug.continue');

    assert.equal(await output, 'Hello, tester!\r\n');      

    await vscode.commands.executeCommand(OpenOutputCommandId);
  });


  teardown(async () => {
    if(this.ctx.currentTest.isFailed()) {
      vscode.window.onDidChangeVisibleTextEditors(editors => {
        for (const editor of editors) {
          if (editor.document.fileName.startsWith('extension-output')) {
            const firstLine = editor.document.lineAt(0).text;
            if (!firstLine || firstLine.startsWith(GhciLogMarker)) {
              console.log(`\nGHCi Output:\n\n${editor.document.getText()}`);
            }
          }
        }
      }, this);
      await vscode.commands.executeCommand(OpenOutputCommandId);
    }
  });
});


function didChangeTextEditorSelection() {
  return new Promise<Selection>((resolve, _) => {
    const disposable = vscode.window.onDidChangeTextEditorSelection(event => {
      disposable.dispose();
      resolve(event.selections[0]);
    });
  });
}
