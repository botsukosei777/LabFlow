// Verify the fix: check that the compiled server.cjs will generate update.bat with CRLF
const fs = require('fs');

console.log('=== 1. Verify start.bat line endings ===');
const startBat = fs.readFileSync('release/start.bat');
const startHasCRLF = startBat.includes(Buffer.from([0x0d, 0x0a]));
const startHasLonelyLF = (() => {
  for (let i = 0; i < startBat.length; i++) {
    if (startBat[i] === 0x0a && (i === 0 || startBat[i-1] !== 0x0d)) return true;
  }
  return false;
})();
console.log('  Has CRLF:', startHasCRLF);
console.log('  Has lonely LF (bad):', startHasLonelyLF);
console.log('  Result:', startHasCRLF && !startHasLonelyLF ? 'PASS ✓' : 'FAIL ✗');

// Check for double backslashes in start.bat
const startContent = startBat.toString('utf-8');
const doubleBS = startContent.match(/\\\\/g);
console.log('  Double backslashes in start.bat:', doubleBS ? doubleBS.length + ' found (BAD)' : 'none (GOOD)');

console.log('\n=== 2. Verify server.cjs update.bat generation ===');
const src = fs.readFileSync('release/server.cjs', 'utf-8');

// Find the batLines array in server.cjs
const hasBatLines = src.includes('batLines');
const hasJoinCRLF = src.includes(".join('\\r\\n')") || src.includes('.join("\\r\\n")');
const hasBufferFrom = src.includes('Buffer.from(batContent');
console.log('  Uses batLines array:', hasBatLines ? 'YES ✓' : 'NO ✗');
console.log('  Uses join(\\r\\n):', hasJoinCRLF ? 'YES ✓' : 'NO ✗');
console.log('  Uses Buffer.from:', hasBufferFrom ? 'YES ✓' : 'NO ✗');

// Check the join call details
const joinIdx = src.indexOf('.join(');
if (joinIdx > -1) {
  const joinContext = src.substring(joinIdx, joinIdx + 30);
  console.log('  Join call:', JSON.stringify(joinContext));
}

// Simulate what batContent would look like
const batLinesIdx = src.indexOf('const batLines');
if (batLinesIdx > -1) {
  const chunk = src.substring(batLinesIdx, batLinesIdx + 500);
  // Check first few lines
  const lines = chunk.split('\n').slice(0, 5);
  console.log('  First lines of batLines:');
  lines.forEach(l => console.log('    ', l.substring(0, 80)));
}

// Check for double backslash in the batLines strings
const batSection = src.substring(src.indexOf('const batLines'), src.indexOf('const batContent = batLines'));
const doubleBS2 = batSection.match(/\\\\\\\\/g);
console.log('  Double backslashes in batLines:', doubleBS2 ? doubleBS2.length + ' found' : 'none');

// Actually extract and check the paths used in the batch file
const pathMatches = batSection.match(/update_temp\\\\[a-z.]+/g);
console.log('  Path patterns in batLines:', pathMatches ? pathMatches : 'none found');

// Check for Japanese characters (which cause the byte-offset issue)
const japaneseInBat = batSection.match(/[\u3000-\u9fff\uff00-\uffef]/g);
console.log('  Japanese chars in batLines:', japaneseInBat ? japaneseInBat.length + ' found (RISKY)' : 'none (SAFE ✓)');

console.log('\n=== 3. Simulate update.bat generation ===');
// Create a mock download_url and build the bat content exactly as server.cjs would
const download_url = 'https://github.com/test/test/releases/download/v1.0.2/labflow-release.zip';

// Extract the batLines array definition from server.cjs and evaluate it
// Instead of eval, let's just check the output format
const batLinesStart = src.indexOf('const batLines = [');
const batLinesEnd = src.indexOf('];', batLinesStart);
const batContentDef = src.indexOf('const batContent = batLines.join');
const batContentEnd = src.indexOf(';', batContentDef);

if (batLinesStart > -1 && batLinesEnd > -1) {
  const batLinesCode = src.substring(batLinesStart, batContentEnd + 1);
  // Write a test script that will actually generate the bat file
  const testScript = `
    const download_url = '${download_url}';
    ${batLinesCode}
    require('fs').writeFileSync('test_update.bat', Buffer.from(batContent, 'utf-8'));
    console.log('Generated test_update.bat');
  `;
  fs.writeFileSync('test_gen.cjs', testScript);
}

console.log('\n=== 4. Version check ===');
const version = fs.readFileSync('release/VERSION', 'utf-8').trim();
console.log('  VERSION file:', version);
