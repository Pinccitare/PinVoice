import { useEffect, useRef } from 'react';

interface WaveFallbackCanvasProps {
  isLight: boolean;
  paused?: boolean;
}

interface WaveLayer {
  baseY: number;
  amp: number;
  freq1: number;
  freq2: number;
  speed1: number;
  speed2: number;
  phase: number;
  fillTop: string;
  fillBottom: string;
  crestColor: string;
  crestWidth: number;
}

const DARK_LAYERS: WaveLayer[] = [
  {
    baseY: 0.44,
    amp: 0.055,
    freq1: 2.1,
    freq2: 4.3,
    speed1: 0.42,
    speed2: -0.28,
    phase: 0.2,
    fillTop: 'rgba(30, 58, 138, 0.55)',
    fillBottom: 'rgba(15, 23, 42, 0.15)',
    crestColor: 'rgba(56, 189, 248, 0.35)',
    crestWidth: 1.5,
  },
  {
    baseY: 0.54,
    amp: 0.065,
    freq1: 1.8,
    freq2: 3.6,
    speed1: -0.35,
    speed2: 0.5,
    phase: 1.4,
    fillTop: 'rgba(2, 132, 199, 0.42)',
    fillBottom: 'rgba(30, 58, 138, 0.28)',
    crestColor: 'rgba(125, 211, 252, 0.48)',
    crestWidth: 2,
  },
  {
    baseY: 0.65,
    amp: 0.07,
    freq1: 2.4,
    freq2: 5.1,
    speed1: 0.52,
    speed2: 0.32,
    phase: 2.7,
    fillTop: 'rgba(56, 189, 248, 0.38)',
    fillBottom: 'rgba(30, 58, 138, 0.42)',
    crestColor: 'rgba(224, 242, 254, 0.65)',
    crestWidth: 2.4,
  },
  {
    baseY: 0.76,
    amp: 0.06,
    freq1: 2.9,
    freq2: 4.7,
    speed1: -0.46,
    speed2: 0.38,
    phase: 4.1,
    fillTop: 'rgba(56, 189, 248, 0.48)',
    fillBottom: 'rgba(14, 116, 144, 0.35)',
    crestColor: 'rgba(224, 242, 254, 0.78)',
    crestWidth: 2.6,
  },
  {
    baseY: 0.87,
    amp: 0.05,
    freq1: 2.2,
    freq2: 5.5,
    speed1: 0.6,
    speed2: -0.42,
    phase: 5.3,
    fillTop: 'rgba(14, 165, 233, 0.52)',
    fillBottom: 'rgba(30, 58, 138, 0.6)',
    crestColor: 'rgba(224, 242, 254, 0.85)',
    crestWidth: 2.2,
  },
];

const LIGHT_LAYERS: WaveLayer[] = [
  {
    baseY: 0.42,
    amp: 0.055,
    freq1: 2.1,
    freq2: 4.3,
    speed1: 0.42,
    speed2: -0.28,
    phase: 0.2,
    fillTop: 'rgba(56, 189, 248, 0.22)',
    fillBottom: 'rgba(2, 132, 199, 0.08)',
    crestColor: 'rgba(2, 132, 199, 0.35)',
    crestWidth: 1.5,
  },
  {
    baseY: 0.53,
    amp: 0.065,
    freq1: 1.8,
    freq2: 3.6,
    speed1: -0.35,
    speed2: 0.5,
    phase: 1.4,
    fillTop: 'rgba(2, 132, 199, 0.28)',
    fillBottom: 'rgba(30, 58, 138, 0.14)',
    crestColor: 'rgba(14, 165, 233, 0.5)',
    crestWidth: 2,
  },
  {
    baseY: 0.64,
    amp: 0.07,
    freq1: 2.4,
    freq2: 5.1,
    speed1: 0.52,
    speed2: 0.32,
    phase: 2.7,
    fillTop: 'rgba(56, 189, 248, 0.34)',
    fillBottom: 'rgba(2, 132, 199, 0.22)',
    crestColor: 'rgba(224, 242, 254, 0.9)',
    crestWidth: 2.4,
  },
  {
    baseY: 0.76,
    amp: 0.06,
    freq1: 2.9,
    freq2: 4.7,
    speed1: -0.46,
    speed2: 0.38,
    phase: 4.1,
    fillTop: 'rgba(14, 165, 233, 0.38)',
    fillBottom: 'rgba(30, 58, 138, 0.28)',
    crestColor: 'rgba(255, 255, 255, 0.92)',
    crestWidth: 2.6,
  },
  {
    baseY: 0.87,
    amp: 0.05,
    freq1: 2.2,
    freq2: 5.5,
    speed1: 0.6,
    speed2: -0.42,
    phase: 5.3,
    fillTop: 'rgba(2, 132, 199, 0.44)',
    fillBottom: 'rgba(30, 58, 138, 0.36)',
    crestColor: 'rgba(224, 242, 254, 0.95)',
    crestWidth: 2.2,
  },
];

/**
 * Fallback em Canvas 2D para dispositivos/navegadores sem WebGL2 habilitado.
 * Garante ondas fluidas visíveis nos modos claro e escuro sem depender de GPU WebGL2.
 */
export function WaveFallbackCanvas({ isLight, paused = false }: WaveFallbackCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    let rafId = 0;
    let time = 0;
    let lastTs = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const w = Math.max(1, Math.round(window.innerWidth * dpr));
      const h = Math.max(1, Math.round(window.innerHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    };

    const draw = (ts: number) => {
      resize();
      const dt = lastTs ? Math.min((ts - lastTs) / 1000, 0.1) : 0.016;
      lastTs = ts;
      if (!pausedRef.current) {
        time += dt;
      }

      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      const layers = isLight ? LIGHT_LAYERS : DARK_LAYERS;
      const steps = 64;

      for (const layer of layers) {
        const points: Array<[number, number]> = [];
        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          const x = t * w;
          const wave1 = Math.sin(t * Math.PI * layer.freq1 + time * layer.speed1 + layer.phase);
          const wave2 = Math.sin(t * Math.PI * layer.freq2 + time * layer.speed2 + layer.phase * 1.7) * 0.45;
          const y = (layer.baseY + (wave1 + wave2) * layer.amp) * h;
          points.push([x, y]);
        }

        const grad = ctx.createLinearGradient(0, layer.baseY * h - layer.amp * h * 1.5, 0, h);
        grad.addColorStop(0, layer.fillTop);
        grad.addColorStop(1, layer.fillBottom);

        ctx.beginPath();
        ctx.moveTo(0, h);
        for (const [px, py] of points) {
          ctx.lineTo(px, py);
        }
        ctx.lineTo(w, h);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();

        ctx.beginPath();
        points.forEach(([px, py], idx) => {
          if (idx === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.strokeStyle = layer.crestColor;
        ctx.lineWidth = layer.crestWidth;
        ctx.stroke();
      }

      if (!pausedRef.current) {
        rafId = requestAnimationFrame(draw);
      }
    };

    const onResize = () => {
      resize();
      if (pausedRef.current) {
        draw(performance.now());
      }
    };

    window.addEventListener('resize', onResize, { passive: true });
    rafId = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', onResize);
    };
  }, [isLight, paused]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 h-full w-full"
    />
  );
}
