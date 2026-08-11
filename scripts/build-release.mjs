import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

const PKG = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf-8'));
const APP_VERSION = PKG.version || '0.0.0';
const NODE_VERSION = process.version.replace('v', '');

// ─── Platform Definitions ────────────────────────────────────────────
const PLATFORMS = {
  'win-x64': {
    nodeUrl: `https://nodejs.org/dist/v${NODE_VERSION}/win-x64/node.exe`,
    nodeFilename: 'node.exe',
    nodeExtract: false,
    archiveFormat: 'zip',
    launcher: 'bat',
    prebuildPlatform: 'win32',
    prebuildArch: 'x64',
  },
  'darwin-arm64': {
    nodeUrl: `https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-darwin-arm64.tar.gz`,
    nodeFilename: 'node',
    nodeExtract: true,
    nodeExtractBin: `node-v${NODE_VERSION}-darwin-arm64/bin/node`,
    archiveFormat: 'tar.gz',
    launcher: 'sh',
    prebuildPlatform: 'darwin',
    prebuildArch: 'arm64',
  },
  'darwin-x64': {
    nodeUrl: `https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-darwin-x64.tar.gz`,
    nodeFilename: 'node',
    nodeExtract: true,
    nodeExtractBin: `node-v${NODE_VERSION}-darwin-x64/bin/node`,
    archiveFormat: 'tar.gz',
    launcher: 'sh',
    prebuildPlatform: 'darwin',
    prebuildArch: 'x64',
  },
  'linux-x64': {
    nodeUrl: `https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.gz`,
    nodeFilename: 'node',
    nodeExtract: true,
    nodeExtractBin: `node-v${NODE_VERSION}-linux-x64/bin/node`,
    archiveFormat: 'tar.gz',
    launcher: 'sh',
    prebuildPlatform: 'linux',
    prebuildArch: 'x64',
  },
};

// ─── Helpers ─────────────────────────────────────────────────────────
function log(msg) {
  console.log(`\n  ✦ ${msg}`);
}

function run(cmd) {
  console.log(`    > ${cmd}`);
  execSync(cmd, { cwd: PROJECT_ROOT, stdio: 'inherit' });
}

function copyDirSync(src, dst, filter) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dst, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const dstPath = path.join(dst, entry.name);
    if (filter && !filter(srcPath, entry)) continue;
    if (entry.isDirectory()) {
      copyDirSync(srcPath, dstPath, filter);
    } else {
      fs.copyFileSync(srcPath, dstPath);
    }
  }
}

function getDirSize(dir) {
  let total = 0;
  if (!fs.existsSync(dir)) return 0;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      total += getDirSize(fullPath);
    } else {
      total += fs.statSync(fullPath).size;
    }
  }
  return total;
}

async function downloadFile(url, destPath) {
  console.log(`    Downloading: ${url}`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(destPath, buffer);
  const sizeMB = (buffer.length / 1024 / 1024).toFixed(1);
  console.log(`    ✓ Downloaded (${sizeMB} MB)`);
  return destPath;
}

// ─── Prebuild Download ──────────────────────────────────────────────
async function downloadPrebuild(platform, arch, releaseDir, destPath) {
  // better-sqlite3 uses prebuild-install which names files with Node ABI version
  // Format: better-sqlite3-v{ver}-node-v{abi}-{platform}-{arch}.tar.gz
  const bsqlVersion = JSON.parse(
    fs.readFileSync(path.join(PROJECT_ROOT, 'node_modules', 'better-sqlite3', 'package.json'), 'utf-8')
  ).version;

  // Node.js ABI version (process.versions.modules)
  const nodeABI = process.versions.modules;
  const prebuildName = `better-sqlite3-v${bsqlVersion}-node-v${nodeABI}-${platform}-${arch}.tar.gz`;
  const prebuildUrl = `https://github.com/WiseLibs/better-sqlite3/releases/download/v${bsqlVersion}/${prebuildName}`;

  const tempDir = path.join(releaseDir, '_temp_prebuild');
  fs.mkdirSync(tempDir, { recursive: true });
  const tarPath = path.join(tempDir, prebuildName);

  try {
    await downloadFile(prebuildUrl, tarPath);

    // Extract the .node file from the tarball
    // The tar contains: build/Release/better_sqlite3.node
    execSync(`tar -xzf "${tarPath}" -C "${tempDir}"`, { stdio: 'pipe' });

    // Find the .node file
    let nodeFile = path.join(tempDir, 'build', 'Release', 'better_sqlite3.node');
    if (!fs.existsSync(nodeFile)) {
      const altNodeFile = path.join(tempDir, 'Release', 'better_sqlite3.node');
      if (fs.existsSync(altNodeFile)) {
        nodeFile = altNodeFile;
      } else {
        const found = findFile(tempDir, 'better_sqlite3.node');
        if (found) {
          nodeFile = found;
        } else {
          throw new Error('better_sqlite3.node not found in prebuild archive');
        }
      }
    }

    // Copy to destination BEFORE cleanup
    fs.copyFileSync(nodeFile, destPath);
    return true;
  } catch (err) {
    console.log(`    ⚠ Prebuild download failed for ${platform}-${arch}: ${err.message}`);
    // If current platform matches, use the locally compiled one
    if (platform === process.platform && arch === process.arch) {
      const localNode = path.join(PROJECT_ROOT, 'node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node');
      if (fs.existsSync(localNode)) {
        console.log(`    → Using locally compiled native module instead`);
        fs.copyFileSync(localNode, destPath);
        return true;
      }
    }
    return false;
  } finally {
    // Clean up temp
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }
}

function findFile(dir, name) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = findFile(full, name);
      if (found) return found;
    } else if (entry.name === name) {
      return full;
    }
  }
  return null;
}

// ─── Launcher Generators ────────────────────────────────────────────
function generateStartBat(version) {
  return [
    '@echo off',
    'setlocal enabledelayedexpansion',
    'chcp 65001 >nul',
    'cd /d "%~dp0"',
    '',
    'title LabFlow - Research Schedule Manager',
    '',
    'echo.',
    'echo   ========================================',
    `echo   LabFlow v${version}`,
    'echo   ========================================',
    'echo.',
    '',
    'REM --- Auto-update check ---',
    'echo   Checking for updates...',
    '',
    `powershell -ExecutionPolicy Bypass -File check_update.ps1 -CurrentVersion "${version}" > update_result.tmp 2>nul`,
    '',
    'set "STATUS="',
    'set "NEW_VER="',
    'set "DL_URL="',
    'set LINENUM=0',
    'for /f "usebackq delims=" %%L in ("update_result.tmp") do (',
    '  set /a LINENUM+=1',
    '  if !LINENUM! equ 1 set "STATUS=%%L"',
    '  if !LINENUM! equ 2 set "NEW_VER=%%L"',
    '  if !LINENUM! equ 3 set "DL_URL=%%L"',
    ')',
    'del update_result.tmp >nul 2>nul',
    '',
    'if "!STATUS!"=="UPDATE_AVAILABLE" (',
    '  echo.',
    '  echo   *** New version available: v!NEW_VER! ***',
    '  echo.',
    '  set /p DOUPDATE="  Update now? [y/n]: "',
    '  if /i "!DOUPDATE!"=="y" (',
    '    echo.',
    '    echo   Downloading v!NEW_VER!...',
    "    powershell -Command \"[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri '!DL_URL!' -OutFile 'update.zip'\"",
    '    if errorlevel 1 (',
    '      echo   Download failed. Starting current version...',
    '      del update.zip >nul 2>nul',
    '      goto :start_server',
    '    )',
    '',
    '    echo   Backing up data...',
    '    if exist "data" xcopy /E /I /Y "data" "data_backup" >nul 2>&1',
    '',
    '    echo   Extracting...',
    '    if exist "update_temp" rmdir /S /Q "update_temp" >nul 2>&1',
    "    powershell -Command \"Expand-Archive -Path 'update.zip' -DestinationPath 'update_temp' -Force\"",
    '',
    '    set "UPDATE_SRC=update_temp"',
    '    if not exist "update_temp\\start.bat" (',
    '      if not exist "update_temp\\server.cjs" (',
    '        for /d %%D in (update_temp\\*) do (',
    '          if exist "%%D\\start.bat" set "UPDATE_SRC=%%D"',
    '          if exist "%%D\\server.cjs" set "UPDATE_SRC=%%D"',
    '        )',
    '      )',
    '    )',
    '',
    '    echo   Applying update...',
    '    xcopy /E /Y "!UPDATE_SRC!\\*" "." >nul 2>&1',
    '',
    '    echo   Restoring data...',
    '    if exist "data_backup" (',
    '      xcopy /E /I /Y "data_backup" "data" >nul 2>&1',
    '      rmdir /S /Q "data_backup" >nul 2>&1',
    '    )',
    '',
    '    echo   Cleaning up...',
    '    del update.zip >nul 2>&1',
    '    rmdir /S /Q "update_temp" >nul 2>&1',
    '',
    '    echo.',
    '    echo   Update complete!',
    '    echo.',
    '  ) else (',
    '    echo   Skipping update.',
    '  )',
    ') else if "!STATUS!"=="UP_TO_DATE" (',
    '  echo   Up to date.',
    ') else (',
    '  echo   Could not check for updates. Starting normally...',
    ')',
    '',
    ':start_server',
    'echo.',
    'echo   Starting server...',
    'echo   Close this window to stop LabFlow.',
    'echo   ----------------------------------------',
    'echo.',
    'set LABFLOW_AUTO_OPEN=1',
    'node.exe server.cjs',
  ].join('\r\n') + '\r\n';
}

function generateCheckUpdatePs1(version) {
  return `# LabFlow Update Checker
param([string]$CurrentVersion)
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
try {
    $r = Invoke-RestMethod -Uri "https://api.github.com/repos/botsukosei777/LabFlow/releases/latest" -Headers @{"User-Agent"="LabFlow-Updater"} -TimeoutSec 10
    $tag = $r.tag_name -replace "v",""
    $asset = $r.assets | Where-Object { $_.name -like "*.zip" } | Select-Object -First 1
    if ($tag -and ([version]$tag -gt [version]$CurrentVersion) -and $asset) {
        Write-Output "UPDATE_AVAILABLE"
        Write-Output $tag
        Write-Output $asset.browser_download_url
    } else {
        Write-Output "UP_TO_DATE"
    }
} catch {
    Write-Output "CHECK_FAILED"
}
`;
}

function generateStartSh(version, platform) {
  const archiveSuffix = platform.startsWith('darwin') ? 'darwin' : 'linux';
  return `#!/bin/bash
# LabFlow Launcher
set -e
cd "$(dirname "$0")"

echo ""
echo "  ========================================"
echo "  LabFlow v${version}"
echo "  ========================================"
echo ""

# --- Auto-update check ---
echo "  Checking for updates..."
UPDATE_RESULT=$(bash check_update.sh "${version}" 2>/dev/null || echo "CHECK_FAILED")
STATUS=$(echo "$UPDATE_RESULT" | head -1)
NEW_VER=$(echo "$UPDATE_RESULT" | sed -n '2p')
DL_URL=$(echo "$UPDATE_RESULT" | sed -n '3p')

if [ "$STATUS" = "UPDATE_AVAILABLE" ]; then
  echo ""
  echo "  *** New version available: v$NEW_VER ***"
  echo ""
  read -p "  Update now? [y/n]: " DOUPDATE
  if [ "$DOUPDATE" = "y" ] || [ "$DOUPDATE" = "Y" ]; then
    echo ""
    echo "  Downloading v$NEW_VER..."
    curl -L -o update.tar.gz "$DL_URL" 2>/dev/null
    if [ $? -ne 0 ]; then
      echo "  Download failed. Starting current version..."
      rm -f update.tar.gz
    else
      echo "  Backing up data..."
      [ -d "data" ] && cp -r data data_backup

      echo "  Extracting..."
      rm -rf update_temp
      mkdir -p update_temp
      tar -xzf update.tar.gz -C update_temp

      # Find the actual content directory
      UPDATE_SRC="update_temp"
      if [ ! -f "update_temp/start.sh" ] && [ ! -f "update_temp/server.cjs" ]; then
        for d in update_temp/*/; do
          if [ -f "\${d}start.sh" ] || [ -f "\${d}server.cjs" ]; then
            UPDATE_SRC="$d"
            break
          fi
        done
      fi

      echo "  Applying update..."
      cp -rf "$UPDATE_SRC"/* .

      echo "  Restoring data..."
      if [ -d "data_backup" ]; then
        cp -rf data_backup/* data/ 2>/dev/null || true
        rm -rf data_backup
      fi

      echo "  Cleaning up..."
      rm -f update.tar.gz
      rm -rf update_temp
      chmod +x start.sh node 2>/dev/null || true

      echo ""
      echo "  Update complete!"
      echo ""
    fi
  else
    echo "  Skipping update."
  fi
elif [ "$STATUS" = "UP_TO_DATE" ]; then
  echo "  Up to date."
else
  echo "  Could not check for updates. Starting normally..."
fi

echo ""
echo "  Starting server..."
echo "  Press Ctrl+C to stop LabFlow."
echo "  ----------------------------------------"
echo ""

export LABFLOW_AUTO_OPEN=1
./node server.cjs
`;
}

function generateCheckUpdateSh() {
  return `#!/bin/bash
# LabFlow Update Checker
CURRENT_VERSION="$1"
if [ -z "$CURRENT_VERSION" ]; then
  echo "CHECK_FAILED"
  exit 1
fi

# Determine platform for asset matching
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)
if [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then
  ARCH="arm64"
else
  ARCH="x64"
fi

if [ "$OS" = "darwin" ]; then
  ASSET_PATTERN="darwin-$ARCH"
else
  ASSET_PATTERN="linux-$ARCH"
fi

# Fetch latest release info from GitHub
RELEASE_JSON=$(curl -s -H "User-Agent: LabFlow-Updater" \\
  "https://api.github.com/repos/botsukosei777/LabFlow/releases/latest" 2>/dev/null)

if [ $? -ne 0 ] || [ -z "$RELEASE_JSON" ]; then
  echo "CHECK_FAILED"
  exit 1
fi

# Parse tag name (try python3, then python, then grep fallback)
if command -v python3 &>/dev/null; then
  TAG=$(echo "$RELEASE_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin).get('tag_name','').lstrip('v'))" 2>/dev/null)
  DL_URL=$(echo "$RELEASE_JSON" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for a in data.get('assets', []):
    if '$ASSET_PATTERN' in a['name'] and a['name'].endswith('.tar.gz'):
        print(a['browser_download_url'])
        break
" 2>/dev/null)
elif command -v python &>/dev/null; then
  TAG=$(echo "$RELEASE_JSON" | python -c "import sys,json; print(json.load(sys.stdin).get('tag_name','').lstrip('v'))" 2>/dev/null)
  DL_URL=$(echo "$RELEASE_JSON" | python -c "
import sys, json
data = json.load(sys.stdin)
for a in data.get('assets', []):
    if '$ASSET_PATTERN' in a['name'] and a['name'].endswith('.tar.gz'):
        print(a['browser_download_url'])
        break
" 2>/dev/null)
else
  # Minimal grep fallback
  TAG=$(echo "$RELEASE_JSON" | grep -o '"tag_name":"[^"]*"' | head -1 | sed 's/"tag_name":"v\\{0,1\\}//;s/"//')
  DL_URL=$(echo "$RELEASE_JSON" | grep -o '"browser_download_url":"[^"]*'$ASSET_PATTERN'[^"]*\\.tar\\.gz"' | head -1 | sed 's/"browser_download_url":"//;s/"//')
fi

if [ -z "$TAG" ] || [ -z "$DL_URL" ]; then
  echo "UP_TO_DATE"
  exit 0
fi

# Compare versions (simple numeric comparison)
version_gt() {
  [ "$(printf '%s\\n' "$@" | sort -V | head -n1)" != "$1" ]
}

if version_gt "$TAG" "$CURRENT_VERSION"; then
  echo "UPDATE_AVAILABLE"
  echo "$TAG"
  echo "$DL_URL"
else
  echo "UP_TO_DATE"
fi
`;
}

function generateReadme(version, platform) {
  if (platform === 'win-x64') {
    return [
      '# LabFlow - 研究スケジュール管理',
      '',
      `## Version ${version} (Windows x64)`,
      '',
      '## 起動方法',
      '1. `start.bat` をダブルクリックしてください。',
      '2. ブラウザが自動的に開き、LabFlowが使えるようになります。',
      '3. LabFlowを終了するには、黒い画面（コマンドプロンプト）を閉じてください。',
      '',
      '## データについて',
      '- データベース: `data/labflow.db`',
      '- 実験ノート: `data/notebooks/`',
      '- バックアップ: 設定画面からダウンロードできます。',
      '',
      '## 注意事項',
      '- ポート 3001 を使用します。',
      '',
    ].join('\r\n');
  }

  const osName = platform.startsWith('darwin') ? 'macOS' : 'Linux';
  const archName = platform.endsWith('arm64') ? 'Apple Silicon' : 'x64';
  return [
    '# LabFlow - 研究スケジュール管理',
    '',
    `## Version ${version} (${osName} ${archName})`,
    '',
    '## 起動方法',
    '1. ターミナルで以下のコマンドを実行してください:',
    '   ```',
    '   chmod +x start.sh node',
    '   ./start.sh',
    '   ```',
    '2. ブラウザが自動的に開き、LabFlowが使えるようになります。',
    '3. LabFlowを終了するには、ターミナルで `Ctrl+C` を押してください。',
    '',
    '## 初回実行時の注意 (macOS)',
    '- macOSではセキュリティの制限により、ダウンロードしたバイナリの実行がブロックされることがあります。',
    '- その場合、以下のコマンドで制限を解除してください:',
    '  ```',
    '  xattr -cr .',
    '  ```',
    '',
    '## データについて',
    '- データベース: `data/labflow.db`',
    '- 実験ノート: `data/notebooks/`',
    '- バックアップ: 設定画面からダウンロードできます。',
    '',
    '## 注意事項',
    '- ポート 3001 を使用します。',
    '',
  ].join('\n');
}

// ─── Main Build ─────────────────────────────────────────────────────
async function main() {
  // Parse --platform argument
  const args = process.argv.slice(2);
  let targetPlatforms = Object.keys(PLATFORMS);
  const platformArg = args.find(a => a.startsWith('--platform='));
  if (platformArg) {
    const val = platformArg.split('=')[1];
    if (val !== 'all') {
      const requested = val.split(',');
      targetPlatforms = requested.filter(p => PLATFORMS[p]);
      if (targetPlatforms.length === 0) {
        console.error(`  ❌ Unknown platform(s): ${val}`);
        console.error(`  Available: ${Object.keys(PLATFORMS).join(', ')}`);
        process.exit(1);
      }
    }
  }

  console.log('\n  ┌────────────────────────────────────────────┐');
  console.log('  │  🧪 LabFlow Multi-Platform Release Builder  │');
  console.log('  └────────────────────────────────────────────┘\n');
  console.log(`  Version:   ${APP_VERSION}`);
  console.log(`  Node.js:   v${NODE_VERSION}`);
  console.log(`  Platforms: ${targetPlatforms.join(', ')}\n`);

  // ── Step 1: Build frontend (shared) ──
  log('Building frontend (Vite)...');
  run('npx vite build');

  // ── Step 2: Bundle server (shared) ──
  log('Bundling server (esbuild)...');
  const serverOutDir = path.join(PROJECT_ROOT, 'release', '_shared');
  fs.mkdirSync(serverOutDir, { recursive: true });
  run([
    'npx esbuild server/index.ts',
    '--bundle',
    '--platform=node',
    '--target=node20',
    '--format=cjs',
    `--outfile=${path.join(serverOutDir, 'server.cjs')}`,
    '--external:better-sqlite3',
    '--external:node-cron',
  ].join(' '));

  // ── Step 3: Build each platform ──
  const outputs = [];

  for (const platformId of targetPlatforms) {
    const plat = PLATFORMS[platformId];
    log(`──── Building for ${platformId} ────`);

    const releaseDir = path.join(PROJECT_ROOT, 'release', `labflow-v${APP_VERSION}-${platformId}`);
    if (fs.existsSync(releaseDir)) {
      fs.rmSync(releaseDir, { recursive: true });
    }
    fs.mkdirSync(releaseDir, { recursive: true });

    // 3a. Copy shared build artifacts
    log(`[${platformId}] Copying server bundle & frontend...`);
    fs.copyFileSync(path.join(serverOutDir, 'server.cjs'), path.join(releaseDir, 'server.cjs'));
    copyDirSync(path.join(PROJECT_ROOT, 'dist'), path.join(releaseDir, 'dist'));
    fs.copyFileSync(
      path.join(PROJECT_ROOT, 'server', 'db', 'schema.sql'),
      path.join(releaseDir, 'schema.sql')
    );

    // 3b. Copy external modules
    log(`[${platformId}] Copying external modules...`);
    const nodeModulesDir = path.join(releaseDir, 'node_modules');

    // better-sqlite3 — copy JS files but NOT build/ (we'll add platform-specific native module)
    const bsqlSrc = path.join(PROJECT_ROOT, 'node_modules', 'better-sqlite3');
    copyDirSync(bsqlSrc, path.join(nodeModulesDir, 'better-sqlite3'), (filePath, entry) => {
      // Skip build/Release directory — we'll add the correct one
      const rel = path.relative(bsqlSrc, filePath);
      if (rel.startsWith('build') && !rel.endsWith('.js')) return false;
      if (rel.startsWith('prebuilds')) return false;
      if (rel === 'binding.gyp') return false;
      if (rel === 'deps' || rel.startsWith('deps')) return false;
      return true;
    });

    // Download or copy the correct native module for this platform
    log(`[${platformId}] Setting up native module (better-sqlite3)...`);
    const buildReleaseDir = path.join(nodeModulesDir, 'better-sqlite3', 'build', 'Release');
    fs.mkdirSync(buildReleaseDir, { recursive: true });

    if (plat.prebuildPlatform === process.platform.replace('win32', 'win32') && plat.prebuildArch === process.arch) {
      // Same platform — just copy the locally compiled one
      const localNode = path.join(bsqlSrc, 'build', 'Release', 'better_sqlite3.node');
      if (fs.existsSync(localNode)) {
        fs.copyFileSync(localNode, path.join(buildReleaseDir, 'better_sqlite3.node'));
        console.log(`    ✓ Using local native module`);
      }
    } else {
      // Cross-platform — download prebuild
      const destFile = path.join(buildReleaseDir, 'better_sqlite3.node');
      const success = await downloadPrebuild(plat.prebuildPlatform, plat.prebuildArch, releaseDir, destFile);
      if (success) {
        console.log(`    ✓ Prebuild native module installed`);
      } else {
        console.log(`    ⚠ Native module not available — users will need to run 'npm install better-sqlite3' on target`);
      }
    }

    // bindings (runtime dep of better-sqlite3)
    const bindingsSrc = path.join(PROJECT_ROOT, 'node_modules', 'bindings');
    if (fs.existsSync(bindingsSrc)) {
      copyDirSync(bindingsSrc, path.join(nodeModulesDir, 'bindings'));
    }

    // file-uri-to-path (runtime dep of bindings)
    const fileUriSrc = path.join(PROJECT_ROOT, 'node_modules', 'file-uri-to-path');
    if (fs.existsSync(fileUriSrc)) {
      copyDirSync(fileUriSrc, path.join(nodeModulesDir, 'file-uri-to-path'));
    }

    // node-cron
    const nodeCronSrc = path.join(PROJECT_ROOT, 'node_modules', 'node-cron');
    copyDirSync(nodeCronSrc, path.join(nodeModulesDir, 'node-cron'));

    // 3c. Create data directory
    const dataDst = path.join(releaseDir, 'data');
    fs.mkdirSync(dataDst, { recursive: true });
    fs.writeFileSync(path.join(dataDst, '.gitkeep'), '', 'utf-8');

    // 3d. Write VERSION file
    fs.writeFileSync(path.join(releaseDir, 'VERSION'), APP_VERSION, 'utf-8');

    // 3e. Generate platform-specific launcher
    log(`[${platformId}] Generating launcher...`);
    if (plat.launcher === 'bat') {
      fs.writeFileSync(path.join(releaseDir, 'start.bat'), generateStartBat(APP_VERSION));
      fs.writeFileSync(path.join(releaseDir, 'check_update.ps1'), generateCheckUpdatePs1(APP_VERSION));
    } else {
      fs.writeFileSync(path.join(releaseDir, 'start.sh'), generateStartSh(APP_VERSION, platformId));
      fs.writeFileSync(path.join(releaseDir, 'check_update.sh'), generateCheckUpdateSh());
    }

    // 3f. Generate README
    fs.writeFileSync(path.join(releaseDir, 'README.md'), generateReadme(APP_VERSION, platformId));

    // 3g. Download Node.js runtime
    log(`[${platformId}] Downloading Node.js runtime...`);
    const nodeDestPath = path.join(releaseDir, plat.nodeFilename);

    if (!plat.nodeExtract) {
      // Direct download (Windows: node.exe)
      try {
        await downloadFile(plat.nodeUrl, nodeDestPath);
      } catch (err) {
        console.log(`    ⚠ Node.js download failed: ${err.message}`);
        console.log(`    Manual download: ${plat.nodeUrl}`);
      }
    } else {
      // Download tar.gz and extract ONLY the node binary (skip symlinks that fail on Windows)
      const tempTar = path.join(releaseDir, '_node_temp.tar.gz');
      try {
        await downloadFile(plat.nodeUrl, tempTar);
        // Extract only the 'node' binary using specific path to avoid symlink errors
        const tempExtractDir = path.join(releaseDir, '_node_extract');
        fs.mkdirSync(tempExtractDir, { recursive: true });
        // Extract only bin/node — the symlinks (npm, npx, corepack) will be skipped
        try {
          execSync(`tar -xzf "${tempTar}" -C "${tempExtractDir}" "${plat.nodeExtractBin}"`, { stdio: 'pipe' });
        } catch (tarErr) {
          // Some tar versions exit non-zero even when our target file was extracted. Check if it exists.
          const extractedBin = path.join(tempExtractDir, plat.nodeExtractBin);
          if (!fs.existsSync(extractedBin)) throw tarErr;
        }

        // Find and copy the node binary
        const extractedBin = path.join(tempExtractDir, plat.nodeExtractBin);
        if (fs.existsSync(extractedBin)) {
          fs.copyFileSync(extractedBin, nodeDestPath);
          console.log(`    ✓ Node.js binary extracted`);
        } else {
          throw new Error(`Binary not found at ${extractedBin}`);
        }
      } catch (err) {
        console.log(`    ⚠ Node.js download/extract failed: ${err.message}`);
        console.log(`    Manual download: ${plat.nodeUrl}`);
      } finally {
        // Clean up temp files
        if (fs.existsSync(tempTar)) fs.unlinkSync(tempTar);
        const tempExtractDir = path.join(releaseDir, '_node_extract');
        if (fs.existsSync(tempExtractDir)) fs.rmSync(tempExtractDir, { recursive: true, force: true });
      }
    }

    // 3h. Create archive
    const archiveName = `labflow-v${APP_VERSION}-${platformId}`;
    log(`[${platformId}] Creating archive...`);

    if (plat.archiveFormat === 'zip') {
      const zipPath = path.join(PROJECT_ROOT, `${archiveName}.zip`);
      if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
      try {
        execSync(
          `powershell -Command "Compress-Archive -Path '${releaseDir}\\*' -DestinationPath '${zipPath}' -Force"`,
          { cwd: PROJECT_ROOT, stdio: 'inherit' }
        );
        const zipSize = fs.statSync(zipPath).size;
        console.log(`    ✓ ${archiveName}.zip (${(zipSize / 1024 / 1024).toFixed(1)} MB)`);
        outputs.push({ platform: platformId, file: `${archiveName}.zip`, size: zipSize });
      } catch (err) {
        console.log(`    ⚠ ZIP creation failed: ${err.message}`);
      }
    } else {
      const tarPath = path.join(PROJECT_ROOT, `${archiveName}.tar.gz`);
      if (fs.existsSync(tarPath)) fs.unlinkSync(tarPath);
      try {
        // Use tar command (available on Windows 10+)
        const releaseDirName = path.basename(releaseDir);
        execSync(
          `tar -czf "${tarPath}" -C "${path.join(PROJECT_ROOT, 'release')}" "${releaseDirName}"`,
          { cwd: PROJECT_ROOT, stdio: 'inherit' }
        );
        const tarSize = fs.statSync(tarPath).size;
        console.log(`    ✓ ${archiveName}.tar.gz (${(tarSize / 1024 / 1024).toFixed(1)} MB)`);
        outputs.push({ platform: platformId, file: `${archiveName}.tar.gz`, size: tarSize });
      } catch (err) {
        console.log(`    ⚠ tar.gz creation failed: ${err.message}`);
      }
    }

    // Print platform size
    const platformSize = getDirSize(releaseDir);
    console.log(`    Total: ${(platformSize / 1024 / 1024).toFixed(1)} MB (uncompressed)`);
  }

  // Clean up shared build dir
  if (fs.existsSync(serverOutDir)) {
    fs.rmSync(serverOutDir, { recursive: true, force: true });
  }

  // ── Summary ──
  console.log('\n  ┌────────────────────────────────────────────┐');
  console.log('  │  🎉 Multi-Platform Build Complete!          │');
  console.log('  └────────────────────────────────────────────┘\n');
  console.log('  Output files:');
  for (const o of outputs) {
    const sizeMB = (o.size / 1024 / 1024).toFixed(1);
    console.log(`    📦 ${o.file} (${sizeMB} MB)`);
  }
  console.log('\n  Upload these files to GitHub Releases as v' + APP_VERSION + '\n');
}

main().catch(err => {
  console.error('\n  ❌ Build failed:', err.message);
  console.error(err.stack);
  process.exit(1);
});
