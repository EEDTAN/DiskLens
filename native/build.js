// Compiles native/fastscan.cs with the C# compiler that ships with Windows (.NET Framework 4).
// Run before electron-builder. On other systems it does nothing and DiskLens uses scanner.js.
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
if (process.platform !== 'win32') process.exit(0);
const csc = path.join(process.env.WINDIR || 'C:\\Windows', 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe');
if (!fs.existsSync(csc)) { console.error('csc.exe not found: DiskLens will use the slower scanner.js'); process.exit(0); }
execFileSync(csc, ['-nologo', '-optimize', '-platform:x64', '-out:' + path.join(__dirname, 'fastscan.exe'), path.join(__dirname, 'fastscan.cs')], { stdio: 'inherit' });
console.log('built native/fastscan.exe');
