import fs from 'fs';
import { execSync } from 'child_process';

const orig = fs.readFileSync('assets/@ffmpeg/core-mt@0.12.6/dist/esm/ffmpeg-core.js', 'utf8');

// Let's test binary search:
// How many characters of orig can be included?
// If we include all code except some specific function, which one?
// Let's first test: What if orig has NO await import("module")?
let modified = orig.replace('await import("module")', 'null');

fs.writeFileSync('test-core-copy.js', modified);
console.log('Replaced await import("module") with null.');
