import { spawn, spawnSync } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const rootDir = fileURLToPath(new URL('..', import.meta.url));
const isWindows = process.platform === 'win32';
const children = new Set();

let shuttingDown = false;
let exitCode = 0;

const backendHost = process.env.HOST || '127.0.0.1';
const backendPort = process.env.PORT || '8000';
const viteOrigin = 'http://localhost:5173';
const stockfishDir = join(rootDir, '.dev-tools', 'stockfish');
const stockfishZip = join(stockfishDir, 'stockfish.zip');
const stockfishReleaseApi =
  'https://api.github.com/repos/official-stockfish/Stockfish/releases/latest';

async function requestOk(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 750);

  try {
    const response = await fetch(url, { signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function existingViteServerIsUsable() {
  return (
    (await requestOk(`${viteOrigin}/@vite/client`)) &&
    (await requestOk(`${viteOrigin}/src/trainer/index.tsx`))
  );
}

function commandFor(command) {
  if (!isWindows) {
    return command;
  }

  if (command === 'uv') {
    return 'uv.exe';
  }

  return command;
}

function processCommand(command, args) {
  if (isWindows && command === 'npm') {
    return {
      command: process.env.ComSpec || 'cmd.exe',
      args: ['/d', '/s', '/c', command, ...args],
    };
  }

  return { command: commandFor(command), args };
}

function startProcess(label, command, args, env = {}) {
  const processSpec = processCommand(command, args);
  const child = spawn(processSpec.command, processSpec.args, {
    cwd: rootDir,
    env: { ...process.env, ...env },
    stdio: 'inherit',
    shell: false,
    detached: !isWindows,
  });

  children.add(child);

  child.on('exit', (code, signal) => {
    children.delete(child);

    if (shuttingDown) {
      return;
    }

    const reason = signal ? `signal ${signal}` : `code ${code}`;
    console.error(`${label} exited with ${reason}. Stopping dev server.`);
    shutdown(code ?? 1);
  });

  child.on('error', (error) => {
    console.error(`Failed to start ${label}: ${error.message}`);
    shutdown(1);
  });

  return child;
}

function findOnPath(command) {
  const lookupCommand = isWindows ? 'where.exe' : 'which';
  const result = spawnSync(lookupCommand, [command], {
    encoding: 'utf8',
    windowsHide: true,
  });

  if (result.status !== 0) {
    return null;
  }

  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
}

async function findStockfishExecutable(directory) {
  let entries;

  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return null;
  }

  for (const entry of entries) {
    const fullPath = join(directory, entry.name);

    if (entry.isDirectory()) {
      const nested = await findStockfishExecutable(fullPath);
      if (nested) {
        return nested;
      }
    }

    if (entry.isFile() && /^stockfish.*\.exe$/i.test(entry.name)) {
      return fullPath;
    }
  }

  return null;
}

async function downloadFile(url, destination) {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'blunder-tutor-dev-launcher' },
  });

  if (!response.ok || response.body === null) {
    throw new Error(`download failed with HTTP ${response.status}`);
  }

  await pipeline(response.body, createWriteStream(destination));
}

function runChecked(command, args) {
  const result = spawnSync(commandFor(command), args, {
    cwd: rootDir,
    stdio: 'inherit',
    windowsHide: true,
  });

  if (result.status !== 0) {
    throw new Error(`${command} exited with code ${result.status}`);
  }
}

function quotePowerShellString(value) {
  return `'${value.replace(/'/g, "''")}'`;
}

async function downloadWindowsStockfish() {
  await mkdir(stockfishDir, { recursive: true });

  const releaseResponse = await fetch(stockfishReleaseApi, {
    headers: { 'User-Agent': 'blunder-tutor-dev-launcher' },
  });

  if (!releaseResponse.ok) {
    throw new Error(`GitHub API returned HTTP ${releaseResponse.status}`);
  }

  const release = await releaseResponse.json();
  const wantedAsset =
    process.arch === 'arm64'
      ? 'stockfish-windows-armv8.zip'
      : 'stockfish-windows-x86-64.zip';
  const asset = release.assets?.find((item) => item.name === wantedAsset);

  if (!asset?.browser_download_url) {
    throw new Error(`could not find ${wantedAsset} in the latest Stockfish release`);
  }

  console.log(`Downloading ${asset.name} from official Stockfish releases`);
  await downloadFile(asset.browser_download_url, stockfishZip);

  runChecked('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    `Expand-Archive -LiteralPath ${quotePowerShellString(stockfishZip)} -DestinationPath ${quotePowerShellString(stockfishDir)} -Force`,
  ]);

  await rm(stockfishZip, { force: true });

  const executable = await findStockfishExecutable(stockfishDir);
  if (!executable) {
    throw new Error('downloaded Stockfish archive did not contain an executable');
  }

  return executable;
}

async function resolveStockfishPath() {
  if (process.env.STOCKFISH_BINARY) {
    return process.env.STOCKFISH_BINARY;
  }

  const pathEngine = findOnPath(isWindows ? 'stockfish.exe' : 'stockfish');
  if (pathEngine) {
    return pathEngine;
  }

  const localEngine = await findStockfishExecutable(stockfishDir);
  if (localEngine) {
    return localEngine;
  }

  if (!isWindows) {
    return null;
  }

  try {
    return await downloadWindowsStockfish();
  } catch (error) {
    console.error(`Unable to download Stockfish automatically: ${error.message}`);
    return null;
  }
}

function stopProcess(child) {
  if (child.exitCode !== null || child.signalCode !== null || child.killed) {
    return;
  }

  if (!child.pid) {
    return;
  }

  if (isWindows) {
    spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
      stdio: 'ignore',
    });
    return;
  }

  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    child.kill('SIGTERM');
  }
}

function shutdown(code) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  exitCode = code;

  for (const child of children) {
    stopProcess(child);
  }

  setTimeout(() => process.exit(exitCode), 1500).unref();
}

process.on('SIGINT', () => shutdown(130));
process.on('SIGTERM', () => shutdown(143));
process.on('exit', () => {
  for (const child of children) {
    stopProcess(child);
  }
});

const stockfishPath = await resolveStockfishPath();

if (!stockfishPath) {
  console.error(
    'Stockfish was not found. Install Stockfish on PATH or set STOCKFISH_BINARY to the engine executable.',
  );
  process.exit(1);
}

if (await existingViteServerIsUsable()) {
  console.log(`Using existing Vite server on ${viteOrigin}`);
} else {
  console.log(`Starting Vite on ${viteOrigin}`);
  startProcess('Vite', 'npm', ['run', 'dev:vite']);
}

console.log(`Starting Blunder Tutor on http://${backendHost}:${backendPort}`);
startProcess(
  'Blunder Tutor',
  'uv',
  [
    'run',
    'python',
    '-m',
    'blunder_tutor',
    'train-ui',
    '--host',
    backendHost,
    '--port',
    backendPort,
  ],
  { STOCKFISH_BINARY: stockfishPath, VITE_DEV: '1' },
);
