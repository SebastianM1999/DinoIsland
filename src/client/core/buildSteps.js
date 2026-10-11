// Cooperative construction: each generator step must itself be small. The
// budget bounds work between paints; it cannot interrupt a synchronous builder.
export function checkBuildSignal(signal) {
  if (signal?.aborted) throw signal.reason ?? new DOMException('Loading cancelled', 'AbortError');
}

export const nextBuildTask = () => new Promise(resolve => setTimeout(resolve, 0));

export async function runBuildSteps(steps, { signal, budgetMs = 4, now = () => performance.now(), pause = nextBuildTask } = {}) {
  try {
    while (true) {
      checkBuildSignal(signal);
      const start = now();
      do {
        const step = steps.next();
        checkBuildSignal(signal);
        if (step.done) return step.value;
      } while (now() - start < budgetMs);
      await pause();
    }
  } catch (error) {
    steps.return?.();
    throw error;
  }
}
