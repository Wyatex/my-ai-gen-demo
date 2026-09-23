const fs = require('fs');
let s = fs.readFileSync('assets/@ffmpeg/core-mt@0.12.6/dist/esm/ffmpeg-core.js', 'utf8');

// Replace print and printErr
const origPrint = 'function print(message){Module["logger"]({type:"stdout",message:message})}function printErr(message){if(!message.startsWith("Aborted(native code called abort())"))Module["logger"]({type:"stderr",message:message})}';
const newPrint = 'function print(message){console.log("[CORE-OUT]",message);if(Module["logger"])Module["logger"]({type:"stdout",message:message})}function printErr(message){console.error("[CORE-ERR]",message);if(!message.startsWith("Aborted(native code called abort())")){if(Module["logger"])Module["logger"]({type:"stderr",message:message})}}';

if (!s.includes(origPrint)) {
  console.error('origPrint not found in ffmpeg-core.js!');
  process.exit(1);
}

s = s.replace(origPrint, newPrint);

// Also in loadWasmModuleToWorker:
const origWorkerPrint = 'else if(cmd==="print"){out("Thread "+d["threadId"]+": "+d["text"])}else if(cmd==="printErr"){err("Thread "+d["threadId"]+": "+d["text"])}';
const newWorkerPrint = 'else if(cmd==="print"){console.log("[WORKER-LOG]",d["threadId"],d["text"]);out("Thread "+d["threadId"]+": "+d["text"])}else if(cmd==="printErr"){console.error("[WORKER-ERR]",d["threadId"],d["text"]);err("Thread "+d["threadId"]+": "+d["text"])}';

if (!s.includes(origWorkerPrint)) {
  console.error('origWorkerPrint not found in ffmpeg-core.js!');
  process.exit(1);
}

s = s.replace(origWorkerPrint, newWorkerPrint);

fs.writeFileSync('assets/@ffmpeg/core-mt@0.12.6/dist/esm/ffmpeg-core.js', s);
console.log('Successfully enabled un-silenced logging in ffmpeg-core.js!');
