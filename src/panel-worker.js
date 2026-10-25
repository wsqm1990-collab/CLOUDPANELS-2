import { detectPanelRegions } from './panel-detection.js';

// Page pixels stay on this device. The worker has no network requests.
self.onmessage = event => {
  try { self.postMessage({ result: detectPanelRegions(event.data) }); }
  catch { self.postMessage({ error: true }); }
};
