import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

const RELEASE_DIR = path.join(PROJECT_ROOT, 'release');
// Auto-detect Node.js version to match the native module (better-sqlite3)
const NODE_VERSION = process.version.replace('v', '');
const NODE_URL = `https://nodejs.org/dist/v${NODE_VERSION}/win-x64/node.exe`;

function log(msg) {
  console.log(`\n  ✦ ${msg}`);
}

function run(cmd) {
  console.log(`    > ${cmd}`);
  execSync(cmd, { cwd: PROJECT_ROOT, stdio: 'inherit' });
}

async function main() {
  console.log('\n  ┌───────────────────────────────────────┐');
  console.log('  │  🧪 LabFlow Release Builder            │');
  console.log('  └───────────────────────────────────────┘\n');

  // 1. Clean release directory
  log('Cleaning release directory...');
  if (fs.existsSync(RELEASE_DIR)) {
    fs.rmSync(RELEASE_DIR, { recursive: true });
  }
  fs.mkdirSync(RELEASE_DIR, { recursive: true });

  // 2. Build frontend with Vite
  log('Building frontend (Vite)...');
  run('npx vite build');

  // 3. Bundle server with esbuild (mark problematic modules as external)
  log('Bundling server (esbuild)...');
  run([
    'npx esbuild server/index.ts',
    '--bundle',
    '--platform=node',
    '--target=node20',
    '--format=cjs',
    `--outfile=${path.join(RELEASE_DIR, 'server.cjs')}`,
    '--external:better-sqlite3',
    '--external:node-cron',     // uses import.meta.url internally
  ].join(' '));

  // 4. Copy dist/ (frontend build output)
  log('Copying frontend build...');
  copyDirSync(path.join(PROJECT_ROOT, 'dist'), path.join(RELEASE_DIR, 'dist'));

  // 5. Copy schema.sql
  log('Copying schema.sql...');
  fs.copyFileSync(
    path.join(PROJECT_ROOT, 'server', 'db', 'schema.sql'),
    path.join(RELEASE_DIR, 'schema.sql')
  );

  // 6. Copy external native/problematic modules to node_modules
  log('Copying external modules (better-sqlite3, node-cron)...');
  const nodeModulesDir = path.join(RELEASE_DIR, 'node_modules');

  // better-sqlite3 (native C++ addon)
  const betterSqliteSrc = path.join(PROJECT_ROOT, 'node_modules', 'better-sqlite3');
  copyDirSync(betterSqliteSrc, path.join(nodeModulesDir, 'better-sqlite3'));

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

  // node-cron (uses import.meta.url for daemon.js resolution)
  const nodeCronSrc = path.join(PROJECT_ROOT, 'node_modules', 'node-cron');
  copyDirSync(nodeCronSrc, path.join(nodeModulesDir, 'node-cron'));

  // 7. Create empty data/ directory (user data should NOT be included in release)
  const dataDst = path.join(RELEASE_DIR, 'data');
  fs.mkdirSync(dataDst, { recursive: true });
  fs.writeFileSync(path.join(dataDst, '.gitkeep'), '', 'utf-8');

  // 8. Create start.bat
  log('Creating launcher (start.bat)...');
  const batContent = [
    '@echo off',
    'cd /d "%~dp0"',
    'echo.',
    'echo   =================================',
    'echo   🧪 LabFlow v1.0.0',
    'echo   =================================',
    'echo.',
    'echo   サーバーを起動しています...',
    'echo   ブラウザが自動的に開きます。',
    'echo.',
    'echo   このウィンドウを閉じるとLabFlowが停止します。',
    'echo   ─────────────────────────────────',
    'echo.',
    'set LABFLOW_AUTO_OPEN=1',
    'node.exe server.cjs',
    '',
  ].join('\r\n');
  fs.writeFileSync(path.join(RELEASE_DIR, 'start.bat'), batContent, 'utf-8');

  // 9. Create README
  log('Creating README...');
  const readmeContent = [
    '# LabFlow - 研究スケジュール管理',
    '',
    '## 起動方法',
    '1. `start.bat` をダブルクリックしてください。',
    '2. ブラウザが自動的に開き、LabFlowが使えるようになります。',
    '3. LabFlowを終了するには、黒い画面（コマンドプロンプト）を閉じてください。',
    '',
    '## 初回セットアップ',
    '- デフォルトのログイン: ユーザー名 `admin` / パスワード `password`',
    '- ログイン後、設定画面からパスワードを変更してください。',
    '',
    '## データについて',
    '- データベース: `data/labflow.db`',
    '- 実験ノート: `data/notebooks/`',
    '- バックアップ: 設定画面からダウンロードできます。',
    '',
    '## 注意事項',
    '- `node.exe` が同じフォルダ内に必要です。',
    '- ポート 3001 を使用します（変更はstart.batの `set PORT=番号` で可能）。',
    '',
  ].join('\r\n');
  fs.writeFileSync(path.join(RELEASE_DIR, 'README.md'), readmeContent, 'utf-8');

  // 10. Download node.exe
  log('Downloading Node.js portable runtime...');
  const nodeExePath = path.join(RELEASE_DIR, 'node.exe');
  if (!fs.existsSync(nodeExePath)) {
    console.log(`    Downloading from ${NODE_URL}`);
    try {
      const response = await fetch(NODE_URL);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const buffer = Buffer.from(await response.arrayBuffer());
      fs.writeFileSync(nodeExePath, buffer);
      console.log(`    ✓ node.exe downloaded (${(buffer.length / 1024 / 1024).toFixed(1)} MB)`);
    } catch (err) {
      console.log(`    ⚠ ダウンロードに失敗しました: ${err.message}`);
      console.log(`    手動でダウンロードしてください: ${NODE_URL}`);
      console.log(`    ダウンロードしたファイルを ${nodeExePath} に配置してください。`);
    }
  } else {
    console.log('    ✓ node.exe already exists, skipping download');
  }

  // Done!
  console.log('\n  ┌───────────────────────────────────────┐');
  console.log('  │  ✅ ビルド完了！                        │');
  console.log('  └───────────────────────────────────────┘');
  console.log(`\n  配布用フォルダ: ${RELEASE_DIR}`);
  console.log('  このフォルダをZIP圧縮してGitHub Releasesにアップロードしてください。\n');

  // Print size info
  const totalSize = getDirSize(RELEASE_DIR);
  console.log(`  合計サイズ: ${(totalSize / 1024 / 1024).toFixed(1)} MB\n`);

  // 11. Create ZIP
  log('Creating labflow-release.zip...');
  const zipPath = path.join(PROJECT_ROOT, 'labflow-release.zip');
  // Remove old zip if exists
  if (fs.existsSync(zipPath)) {
    fs.unlinkSync(zipPath);
  }
  try {
    execSync(
      `powershell -Command "Compress-Archive -Path '${RELEASE_DIR}\\*' -DestinationPath '${zipPath}' -Force"`,
      { cwd: PROJECT_ROOT, stdio: 'inherit' }
    );
    const zipSize = fs.statSync(zipPath).size;
    console.log(`    ✓ labflow-release.zip (${(zipSize / 1024 / 1024).toFixed(1)} MB)`);
  } catch (err) {
    console.log(`    ⚠ ZIP作成に失敗しました: ${err.message}`);
    console.log(`    手動で release/ フォルダをZIP圧縮してください。`);
  }

  console.log('\n  ┌───────────────────────────────────────┐');
  console.log('  │  🎉 配布パッケージの準備完了！          │');
  console.log('  └───────────────────────────────────────┘');
  console.log(`\n  ZIP: ${zipPath}`);
  console.log('  このZIPをGitHub Releasesにアップロードしてください。\n');
}

// Utility: recursive directory copy
function copyDirSync(src, dst) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dst, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const dstPath = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, dstPath);
    } else {
      fs.copyFileSync(srcPath, dstPath);
    }
  }
}

// Utility: get total directory size
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

main().catch(err => {
  console.error('\n  ❌ ビルドに失敗しました:', err.message);
  process.exit(1);
});
