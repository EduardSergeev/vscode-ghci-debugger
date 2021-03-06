import * as path from 'path';

import { runTests } from 'vscode-test';

async function main() {
  try {
    // The folder containing the Extension Manifest package.json
    // Passed to `--extensionDevelopmentPath`
    const extensionDevelopmentPath = path.resolve(__dirname, '../../');

    // The path to the extension test runner script
    // Passed to --extensionTestsPath
    const extensionTestsPath = __dirname;

    // Download VS Code, unzip it and run the integration test
    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: [
        '--new-window',
        '--disable-extensions',
        '--disable-gpu',
        '--disable-updates',
        '--logExtensionHostCommunication',
        '--skip-getting-started',
        '--skip-release-notes',
        '--disable-restore-windows',
        '--disable-telemetry'
      ]
    });
  } catch (err) {
    console.error(err);
    console.error('Failed to run tests');
    process.exit(1);
  }
}

main();
