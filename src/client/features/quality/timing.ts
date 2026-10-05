/**
 * What a frame costs, measured on request (design/perf-probe.mjs turns it on for an A/B of Ship motion
 * on and off): the CPU time from the frame's first tick to the end of its last (the draw included),
 * and the GPU's time for the same span where the browser offers EXT_disjoint_timer_query_webgl2.
 * Off, it costs one branch a frame.
 */
import type { Ctx } from '../../core/context';

export interface Spread {
  p50: number;
  p95: number;
  n: number;
}

export interface FrameTiming {
  /** Starts (true) or stops measuring; starting clears what was measured before. */
  measure(on: boolean): void;
  /** The frames measured since it started: CPU ms, and GPU ms where the browser can say (null otherwise). */
  read(): { cpu: Spread | null; gpu: Spread | null; gpuTimer: boolean };
}

const spread = (xs: number[]): Spread | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const q = (k: number) => +s[Math.min(s.length - 1, Math.floor(s.length * k))].toFixed(3);
  return { p50: q(0.5), p95: q(0.95), n: s.length };
};

/** Measures frames for `ctx` once asked to. Its ticks go at the very start and the very end of each frame. */
export function frameTiming(ctx: Ctx): FrameTiming {
  const gl = ctx.renderer.getContext() as WebGL2RenderingContext;
  const ext = (() => {
    try {
      return gl.getExtension('EXT_disjoint_timer_query_webgl2') as { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null;
    } catch {
      return null;
    }
  })();
  let on = false;
  let start = 0;
  const cpu: number[] = [];
  const gpu: number[] = [];
  const pending: WebGLQuery[] = [];
  let query: WebGLQuery | null = null;

  function collect() {
    if (!ext) return;
    while (pending.length) {
      const q = pending[0];
      if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
      pending.shift();
      if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) gpu.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6);
      gl.deleteQuery(q);
    }
  }

  ctx.ticks.add('pre', ({ now }) => {
    if (!on) return;
    start = now;
    if (ext && !query && pending.length < 8) {
      query = gl.createQuery();
      if (query) gl.beginQuery(ext.TIME_ELAPSED_EXT, query);
    }
  });
  ctx.ticks.add('render', () => {
    if (!on) return;
    cpu.push(performance.now() - start);
    if (ext && query) {
      gl.endQuery(ext.TIME_ELAPSED_EXT);
      pending.push(query);
      query = null;
    }
    collect();
  });

  return {
    measure(next) {
      if (!next && query && ext) {
        gl.endQuery(ext.TIME_ELAPSED_EXT);
        gl.deleteQuery(query);
        query = null;
      }
      on = next;
      if (next) {
        cpu.length = 0;
        gpu.length = 0;
      }
    },
    read() {
      collect();
      return { cpu: spread(cpu), gpu: spread(gpu), gpuTimer: !!ext };
    },
  };
}
