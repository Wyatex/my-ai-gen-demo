import fs from 'fs';

const orig = fs.readFileSync('assets/@ffmpeg/core-mt@0.12.6/dist/esm/ffmpeg-core.js', 'utf8');
const lines = orig.split('\n');

// Line 8 is lines[7]
const line8 = lines[7];
console.log('Total characters in line 8:', line8.length);

// Let's create test-core-copy.js with only a fraction of line 8!
// Let's see: what if line 8 is just:
// async function(createFFmpegCore = {}) { return createFFmpegCore; }
function createTestFile(body) {
  const content = `var createFFmpegCore = (() => {
  var _scriptDir = import.meta.url;
  return (
async function(createFFmpegCore = {}) {
${body}
  return createFFmpegCore.ready;
}
);
})();
export default createFFmpegCore;
`;
  fs.writeFileSync('test-core-copy.js', content);
}

const arg = process.argv[2] || '0';
if (arg === 'empty') {
  createTestFile('return { ready: Promise.resolve() };');
  console.log('Created with empty body');
} else {
  const len = parseInt(arg, 10);
  // Take first len characters from line 8
  // To avoid syntax errors, let's close braces or see
  console.log('Testing length:', len);
}
