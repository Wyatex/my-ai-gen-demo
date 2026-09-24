"use strict";
var Module = {};
function wdbg(text) {
  postMessage({ cmd: "printErr", threadId: "WORKER_DBG", text: String(text) });
}
self.onerror = function(e) {
  wdbg("WORKER ONERROR: " + e.message + " at " + e.filename + ":" + e.lineno);
};
self.onunhandledrejection = function(e) {
  wdbg("WORKER UNHANDLED: " + (e.reason?.message || e.reason));
};

var initializedJS = false;
function threadPrintErr() {
  var text = Array.prototype.slice.call(arguments).join(" ");
  wdbg("THREAD_ERR: " + text);
}
function threadAlert() {
  var text = Array.prototype.slice.call(arguments).join(" ");
  postMessage({ cmd: "alert", text: text, threadId: Module["_pthread_self"]() });
}
var err = threadPrintErr;
self.alert = threadAlert;

Module["instantiateWasm"] = (info, receiveInstance) => {
  wdbg("Worker instantiateWasm called");
  var module = Module["wasmModule"];
  Module["wasmModule"] = null;
  var instance = new WebAssembly.Instance(module, info);
  wdbg("Worker WebAssembly.Instance created successfully");
  return receiveInstance(instance);
};

function handleMessage(e) {
  try {
    if (e.data.cmd === "load") {
      wdbg("Worker received cmd:load");
      let messageQueue = [];
      self.onmessage = e => messageQueue.push(e);
      self.startWorker = instance => {
        Module = instance;
        wdbg("Worker startWorker called! Posting cmd:loaded");
        postMessage({ "cmd": "loaded" });
        for (let msg of messageQueue) {
          handleMessage(msg);
        }
        self.onmessage = function(e) { postMessage({ cmd: "printErr", threadId: "ECHO", text: "WORKER_GOT_MSG: " + JSON.stringify(e.data ? e.data.cmd : null) }); handleMessage(e); };
      };
      Module["wasmModule"] = e.data.wasmModule;
      for (const handler of e.data.handlers) {
        Module[handler] = function() {
          postMessage({ cmd: "callHandler", handler: handler, args: [...arguments] });
        };
      }
      Module["wasmMemory"] = e.data.wasmMemory;
      Module["buffer"] = Module["wasmMemory"].buffer;
      Module["ENVIRONMENT_IS_PTHREAD"] = true;
      if (e.data.urlOrBlob) Module["mainScriptUrlOrBlob"] = e.data.urlOrBlob;

      var coreUrl = e.data.urlOrBlob ? e.data.urlOrBlob.split("#")[0] : "./ffmpeg-core.js";
      wdbg("Worker importing coreUrl: " + coreUrl);
      import(coreUrl).then(exports => {
        wdbg("Worker imported coreUrl! Calling exports.default(Module)...");
        exports.default(Module);
        wdbg("Worker exports.default(Module) returned!");
      }).catch(err => {
        wdbg("Worker catch on import: " + (err.message || err));
      });
    } else if (e.data.cmd === "run") {
      Module["__emscripten_thread_init"](e.data.pthread_ptr, 0, 0, 1);
      Module["__emscripten_thread_mailbox_await"](e.data.pthread_ptr);
      Module["establishStackSpace"]();
      Module["PThread"].receiveObjectTransfer(e.data);
      Module["PThread"].threadInitTLS();
      if (!initializedJS) {
        initializedJS = true;
      }
      try {
        Module["invokeEntryPoint"](e.data.start_routine, e.data.arg);
      } catch (ex) {
        if (ex != "unwind") {
          throw ex;
        }
      }
    } else if (e.data.cmd === "cancel") {
      if (Module["_pthread_self"]()) {
        Module["__emscripten_thread_exit"](-1);
      }
    } else if (e.data.target === "setimmediate") {
    } else if (e.data.cmd === "checkMailbox") {
      if (initializedJS) {
        Module["checkMailbox"]();
      }
    } else if (e.data.cmd) {
      err("worker.js received unknown command " + e.data.cmd);
      err(e.data);
    }
  } catch (ex) {
    wdbg("Worker catch in handleMessage: " + (ex.message || ex));
    if (Module["__emscripten_thread_crashed"]) {
      Module["__emscripten_thread_crashed"]();
    }
    throw ex;
  }
}
self.onmessage = handleMessage;
wdbg("Worker script body executed and ready for messages");
