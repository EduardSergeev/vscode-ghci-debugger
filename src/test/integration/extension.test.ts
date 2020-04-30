import * as vscode from 'vscode';
import * as assert from 'assert';
import * as path from 'path';
import { Position, Selection, SourceBreakpoint, Location } from 'vscode';
import Console from '../../console';
import { OpenOutputCommandId, GhciLogMarker } from '../../extension';


suite("Integration", function () {

  test("Simple debug run", async () => {
    const doc = await vscode.workspace.openTextDocument(
      path.join(__dirname, '../../../input/test1.hs')
    );
    await vscode.window.showTextDocument(doc);

    vscode.debug.addBreakpoints([
      new SourceBreakpoint(new Location(doc.uri, new Position(2, 0)))
    ]);

    const started = await didChangeTextEditorSelection1(() =>
      vscode.debug.startDebugging(null, {
        type: 'ghci',
        name: 'test',
        request: 'launch',
        stopOnEntry: true,
        project: 'bare-stack',
        module: 'Main',
        expression: 'main'
      })
    );
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

    await new Promise<void>((resolve, _) => {
      setTimeout(_ => resolve(), 1000);
    });

    const editor = vscode.window.activeTextEditor;

    // Stopped on entry
    assert.deepEqual(editor.selection.start, new Position(1, 7));

    // Continue
    await didChangeTextEditorSelection1(() =>
      vscode.commands.executeCommand('workbench.action.debug.continue')
    );
    assert.deepEqual(editor.selection.active, new Position(2, 2));

    // Evaluate Repl
    await vscode.commands.executeCommand('workbench.panel.repl.view.focus');
    await vscode.env.clipboard.writeText('sum [1..10]');
    await vscode.commands.executeCommand('editor.action.clipboardPasteAction');
    await vscode.commands.executeCommand('repl.action.acceptInput');
    // await vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');

    // Step Into
    await didChangeTextEditorSelection1(() =>
      vscode.commands.executeCommand('workbench.action.debug.stepInto')
    );
    assert.deepEqual(editor.selection.active, new Position(3, 2));
    
    // Step Over
    await didChangeTextEditorSelection1(() =>
      vscode.commands.executeCommand('workbench.action.debug.stepOver')
    );
    assert.deepEqual(editor.selection.start, new Position(4, 2));

    // Continue
    await vscode.commands.executeCommand('workbench.action.debug.continue');

    assert.equal(await output, 'Hello, tester!\r\n');      
    
    // Allow OutputLinkProvider to kick in
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

async function didChangeTextEditorSelection2<T>(action: () => Thenable<T>): Promise<T> {
  return new Promise<T>(async (resolve, _) => {
    let result: T;
    const disposable = vscode.window.onDidChangeTextEditorSelection(event => {
      disposable.dispose();
      resolve(result);
    });
    result = await action();
  });
}

async function didChangeTextEditorSelection1<T>(action: () => Thenable<T>): Promise<T> {
  return didEvent(vscode.window.onDidChangeTextEditorSelection, action);
}


async function didEvent<T>(event: (arg0: (_: any) => void) => any, action: () => Thenable<T>): Promise<T> {
  return new Promise<T>(async (resolve, _) => {
    let result: T;
    const disposable = event(_ => {
      disposable.dispose();
      resolve(result);
    });
    result = await action();
  });
}

function didChangeBreakpoints() {
  return new Promise<readonly vscode.Breakpoint[]>((resolve, _) => {
    const disposable = vscode.debug.onDidChangeBreakpoints(event => {
      disposable.dispose();
      resolve(event.added);
    });
  });
}



    // await vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');
    // console.log(JSON.stringify(editor.selection));
    // vscode.commands.executeCommand('cursorMove', { to: 'left', value: 7, by: 'character'});
    // vscode.commands.executeCommand('cursorMove', { to: 'down', by: 'line'});
    // await didChangeTextEditorSelection();
    // const res = await vscode.commands.executeCommand('editor.debug.action.toggleBreakpoint');
    // const bs = await didChangeBreakpoints();
    // await vscode.commands.executeCommand('workbench.action.debug.continue');
