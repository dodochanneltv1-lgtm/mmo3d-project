const worker = typeof Worker !== 'undefined'
  ? new Worker(new URL('./worldgen-worker.js', import.meta.url), { type: 'module' })
  : null;
const pendingRequests = new Map();
let nextRequestId = 1;

if (worker) {
  worker.addEventListener('message', (event) => {
    const { id, heights, colors, error } = event.data;
    const request = pendingRequests.get(id);
    if (!request) return;
    pendingRequests.delete(id);
    if (error) {
      request.reject(new Error(error));
      return;
    }
    request.resolve({ heights, colors });
  });

  worker.addEventListener('error', (event) => {
    const error = new Error(`Map generation worker failed: ${event.message || 'unknown worker error'}`);
    console.error(error);
    pendingRequests.forEach(({ reject }) => reject(error));
    pendingRequests.clear();
    worker.terminate();
  });
}

export function generateTerrainBlueprint(options) {
  if (!worker) {
    return Promise.reject(new Error('Web Workers are unavailable; terrain generation cannot run off the main thread.'));
  }

  const id = nextRequestId++;
  return new Promise((resolve, reject) => {
    pendingRequests.set(id, { resolve, reject });
    try {
      worker.postMessage({ id, ...options }, [options.localCoordinates.buffer]);
    } catch (error) {
      pendingRequests.delete(id);
      reject(error);
    }
  });
}
