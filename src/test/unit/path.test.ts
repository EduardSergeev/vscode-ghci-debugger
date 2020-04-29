import * as assert from 'assert';
import * as path from '../../path';


suite("path", () => {
  suite("normalizePath", () => {
    test("Proper linux path", () => {
      assert.strictEqual(
        path.normalizePath('/foo/', './bar/test.txt'),
        '/foo/bar/test.txt'
      );
    });

    if(process.platform === 'win32') {
      test("Proper Windows path", () => {
        if(process.platform === 'win32') {}
        assert.strictEqual(
          path.normalizePath('C:\\\\foo\\', 'bar\\test.txt'),
          'C:\\foo\\bar\\test.txt'
        );
      });
    }

    test("Undefined args", () => {
      assert.strictEqual(
        path.normalizePath(undefined, undefined),
        undefined
      );
      assert.strictEqual(
        path.normalizePath(undefined, './test.txt'),
        './test.txt'
      );
      assert.strictEqual(
        path.normalizePath('/', undefined),
        undefined
      );
    });
  });
});
