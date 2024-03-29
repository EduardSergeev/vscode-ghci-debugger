import * as path from 'path';
import { env } from 'process';

import {
  runTests,
  downloadAndUnzipVSCode,
  resolveCliPathFromVSCodeExecutablePath
} from '@vscode/test-electron';

async function main() {
  try {
    // The folder containing the Extension Manifest package.json
    // Passed to `--extensionDevelopmentPath`
    const extensionDevelopmentPath = path.resolve(__dirname, '../../');

    // The path to the extension test runner script
    // Passed to --extensionTestsPath
    const extensionTestsPath = __dirname;
    const vscodeVersion = env['CODE_VERSION'];
    const vscodeExecutablePath = await downloadAndUnzipVSCode(vscodeVersion);
    const cliPath = resolveCliPathFromVSCodeExecutablePath(vscodeExecutablePath);

    const extensionsDir = path.resolve(path.dirname(cliPath), '..', 'extensions');
    const userDataDir = path.resolve(extensionsDir, '..', '..', 'udd');

    // Download VS Code, unzip it and run the integration test
    await runTests({
      vscodeExecutablePath,
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: [
        '--user-data-dir', userDataDir,
        '--extensions-dir', extensionsDir,
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
    return 1;
  }
}

main();
