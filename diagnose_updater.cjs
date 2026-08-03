// Analyze the compiled server.cjs to understand what the CRLF replacement actually does
const fs = require('fs');
const src = fs.readFileSync('release/server.cjs', 'utf-8');

// Find the batContent.replace line
const idx = src.indexOf('batContent.replace');
const chunk = src.substring(idx, idx + 100);
console.log('=== Raw compiled code around batContent.replace ===');
console.log(chunk);
console.log('');

// Now let's simulate what happens when batContent is evaluated
// The template literal in server.cjs uses \n for line breaks
// and unicode escapes for Japanese chars

// Find where batContent template starts and ends
const batStart = src.indexOf('const batContent = `');
const batEnd = src.indexOf('`;', batStart);
const templateBody = src.substring(batStart + 'const batContent = `'.length, batEnd);

// Count lines 
const lines = templateBody.split('\n');
console.log('=== Template literal has', lines.length, 'lines ===');
console.log('First 3 lines:');
lines.slice(0, 3).forEach((l, i) => console.log(`  ${i}: ${JSON.stringify(l)}`));

// Check for double backslashes in paths
const doubleBackslashLines = lines.filter(l => l.includes('\\\\'));
console.log('\n=== Lines with double backslashes (\\\\) ===');
doubleBackslashLines.forEach(l => console.log('  ', l.trim()));

// Check what the regex actually matches
// The source says: batContent.replace(/\\r?\n/g, '\\r\\n')
// But after esbuild, let's see what it becomes
console.log('\n=== Testing the actual regex behavior ===');
const testStr = 'line1\nline2\nline3\r\nline4';

// What the source code INTENDS: replace \n with \r\n
const intended = testStr.replace(/\r?\n/g, '\r\n');
console.log('Intended result:', JSON.stringify(intended));

// What the compiled code MIGHT do (with extra escaping):
// /\\r?\\n/g would match literal \r and \n characters, not CR/LF
try {
  const compiled = testStr.replace(/\\r?\\n/g, '\\r\\n');
  console.log('Compiled regex result:', JSON.stringify(compiled));
} catch(e) {
  console.log('Error:', e.message);
}

// Check if template literal newlines are \n or \r\n
const firstNewline = templateBody.indexOf('\n');
const charBefore = templateBody.charCodeAt(firstNewline - 1);
console.log('\n=== Newline format in template ===');
console.log('Char before first \\n:', charBefore, charBefore === 13 ? '(\\r - CRLF)' : '(not \\r - LF only)');

// Now simulate writing the bat file
console.log('\n=== Simulating bat file generation ===');
const download_url = 'https://example.com/test.zip';
// Evaluate template with substitution
const evalTemplate = templateBody.replace('${download_url}', download_url);

// Apply the CRLF fix as it exists in server.cjs
// The compiled code has: batContent.replace(/\\r?\\n/g, "\\r\\n")
// This means it's trying to replace literal backslash-r and backslash-n, NOT CR/LF
const fixedWrong = evalTemplate.replace(/\\r?\\n/g, '\\r\\n');
const fixedRight = evalTemplate.replace(/\r?\n/g, '\r\n');

console.log('Wrong fix changes anything?', fixedWrong !== evalTemplate);
console.log('Right fix changes anything?', fixedRight !== evalTemplate);

// Write both versions for comparison
fs.writeFileSync('test_wrong_fix.bat', fixedWrong, 'utf-8');
fs.writeFileSync('test_right_fix.bat', fixedRight, 'utf-8');

// Check file sizes
console.log('Wrong fix file size:', fs.statSync('test_wrong_fix.bat').size);
console.log('Right fix file size:', fs.statSync('test_right_fix.bat').size);

// Check first bytes of each
const wrongBuf = fs.readFileSync('test_wrong_fix.bat');
const rightBuf = fs.readFileSync('test_right_fix.bat');
console.log('\nWrong fix first 50 bytes hex:', wrongBuf.subarray(0, 50).toString('hex'));
console.log('Right fix first 50 bytes hex:', rightBuf.subarray(0, 50).toString('hex'));

// Check if wrong fix has \r\n or just \n
const wrongHasLF = wrongBuf.includes(Buffer.from([0x0a]));
const wrongHasCRLF = wrongBuf.includes(Buffer.from([0x0d, 0x0a]));
const rightHasLF = rightBuf.includes(Buffer.from([0x0a]));
const rightHasCRLF = rightBuf.includes(Buffer.from([0x0d, 0x0a]));
console.log('\nWrong fix: has LF?', wrongHasLF, 'has CRLF?', wrongHasCRLF);
console.log('Right fix: has LF?', rightHasLF, 'has CRLF?', rightHasCRLF);
