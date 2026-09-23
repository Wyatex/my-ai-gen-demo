self.onmessage = async (e) => {
  postMessage({ status: 'attempting_import', url: e.data.url });
  try {
    const mod = await import(e.data.url);
    postMessage({ status: 'import_success', type: typeof mod.default });
  } catch (err) {
    postMessage({ status: 'import_error', err: err.message, stack: err.stack });
  }
};
