import fs from 'fs';
import path from 'path';

function verifyTxtFile(filePath) {
  console.log(`Verifying: ${filePath}\n`);

  if (!fs.existsSync(filePath)) {
    console.error('ERROR: File not found');
    return false;
  }

  const buffer = fs.readFileSync(filePath);
  const content = buffer.toString('utf-8');

  let valid = true;
  const errors = [];

  if (buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    errors.push('BOM detected - Delphi 7 incompatible');
    valid = false;
  }

  if (content.includes('\n') && !content.includes('\r\n')) {
    errors.push('LF without CR - must use CRLF');
    valid = false;
  }

  const lfCount = (content.match(/\n/g) || []).length;
  const crlfCount = (content.match(/\r\n/g) || []).length;
  if (lfCount !== crlfCount) {
    errors.push(`Mixed line endings: ${crlfCount} CRLF vs ${lfCount - crlfCount} lone LF`);
    valid = false;
  }

  if (content.includes('"')) {
    errors.push('Quotes detected - Delphi 7 incompatible');
    valid = false;
  }

  const lines = content.split('\r\n').filter((l) => l.length > 0);

  if (lines[0] !== '[SESSION]') {
    errors.push('Missing [SESSION] header');
    valid = false;
  }

  if (!lines.includes('[DATA]')) {
    errors.push('Missing [DATA] section');
    valid = false;
  }

  if (!lines.includes('[END]')) {
    errors.push('Missing [END] section');
    valid = false;
  }

  const dataStart = lines.indexOf('[DATA]') + 1;
  const dataEnd = lines.indexOf('[END]');

  if (dataStart > 0 && dataEnd > dataStart) {
    const dataLines = lines.slice(dataStart, dataEnd);
    for (let i = 0; i < dataLines.length; i++) {
      const parts = dataLines[i].split(';');
      if (parts.length !== 7) {
        errors.push(`Data line ${i + 1} has ${parts.length} fields (expected 7)`);
        valid = false;
      }
    }
  }

  const hasTotal = lines.some((l) => l.startsWith('TOTAL='));
  const hasErrores = lines.some((l) => l.startsWith('ERRORES='));

  if (!hasTotal) {
    errors.push('Missing TOTAL= field');
    valid = false;
  }

  if (!hasErrores) {
    errors.push('Missing ERRORES= field');
    valid = false;
  }

  if (valid) {
    console.log('VALIDATION PASSED - File is Delphi 7 compatible');
  } else {
    console.log('VALIDATION FAILED:');
    errors.forEach((e) => console.log(`  - ${e}`));
  }

  console.log(`\nFile size: ${buffer.length} bytes`);
  console.log(`Lines: ${lines.length}`);
  console.log(`Encoding: UTF-8 ${buffer[0] === 0xef ? '(with BOM - BAD)' : '(no BOM - GOOD)'}`);

  return valid;
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.log('Usage: node verify-txt.js <file.txt>');
  process.exit(1);
}

const result = verifyTxtFile(args[0]);
process.exit(result ? 0 : 1);
