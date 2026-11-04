// The voice engine asks the device to set aside 4 GB at the start. Browsers in
// 32-bit mode (Chrome on phones with less than 8 GB of memory), and some
// iPads, refuse; the voices need well under 500 MB, so less is asked for instead.
export const MEMORY_STEPS = [16384, 12288, 8192];
export function smallerMemory(scope = globalThis) {
  const Real = scope.WebAssembly?.Memory;
  if (!Real || Real.cloudpanels) return;
  function Memory(descriptor) {
    if (descriptor && descriptor.shared && !(descriptor.maximum <= MEMORY_STEPS[0])) {
      let last;
      for (const maximum of MEMORY_STEPS) {
        try { return new Real({ ...descriptor, maximum }); } catch (error) { last = error; }
      }
      throw last;
    }
    return new Real(descriptor);
  }
  Memory.prototype = Real.prototype; Memory.cloudpanels = true;
  scope.WebAssembly.Memory = Memory;
}
