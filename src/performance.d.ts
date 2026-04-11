interface MemoryInfo {
  readonly jsHeapSizeLimit: number
  readonly totalJSHeapSize: number
  readonly usedJSHeapSize: number
}

interface Performance {
  readonly memory?: MemoryInfo
}

// These extensions are non-standard and browser-specific (Chrome/Edge).
// This declaration merges with the existing global Performance interface.
