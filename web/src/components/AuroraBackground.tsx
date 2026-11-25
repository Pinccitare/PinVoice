import { useCallback, useEffect, useState } from 'react';
import GradientWaves from './GradientWaves';
import { WaveFallbackCanvas } from './WaveFallbackCanvas';

interface AuroraBackgroundProps {
  theme?: 'dark' | 'light';
  /** Pausa o shader WebGL durante o processamento do áudio para 0% de impacto na velocidade */
  paused?: boolean;
}

export function AuroraBackground({
  theme = 'dark',
  paused = false,
}: AuroraBackgroundProps) {
  const isLight = theme === 'light';
  const [webglUnsupported, setWebglUnsupported] = useState(false);
  const [isWideDesktop, setIsWideDesktop] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 768 : false,
  );

  const handleUnsupported = useCallback(() => {
    setWebglUnsupported(true);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const update = () => setIsWideDesktop(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
    >
      {/* Fallback sutil caso algum PC de hospital esteja com WebGL2 desativado */}
      <div
        className="absolute inset-0"
        style={{
          background: isLight
            ? 'radial-gradient(120% 80% at 50% 100%, rgba(56,189,248,0.24) 0%, rgba(30,58,138,0.14) 45%, transparent 80%)'
            : 'radial-gradient(120% 80% at 50% 100%, rgba(56,189,248,0.22) 0%, rgba(30,58,138,0.34) 45%, transparent 80%)',
        }}
      />

      {webglUnsupported ? (
        <WaveFallbackCanvas isLight={isLight} paused={paused} />
      ) : (
        <GradientWaves
          horizonColor="#1e3a8a"
          waveColor={isLight ? '#0284c7' : '#38bdf8'}
          crestColor={isLight ? '#38bdf8' : '#e0f2fe'}
          backgroundColor="transparent"
          lightMode={isLight}
          speed={0.5}
          amplitude={isWideDesktop ? 2.8 : 2.3}
          relief={1}
          lightAngle={150}
          mouseInteraction={false}
          swellOnClick={false}
          waveScale={isWideDesktop ? 0.38 : 0.5}
          swell={25}
          turbulence={20}
          tilt={isWideDesktop ? 54 : 60}
          zoom={isWideDesktop ? 1.05 : 1.1}
          height={isWideDesktop ? 6.5 : 5.5}
          fogDepth={isWideDesktop ? 26 : 18}
          brightness={isWideDesktop ? (isLight ? 1.65 : 1.35) : isLight ? 1.55 : 1.15}
          opacity={1}
          quality="medium"
          intro={false}
          paused={paused}
          dpr={1.5}
          onUnsupported={handleUnsupported}
          style={{ width: '100%', height: '100%', position: 'absolute', inset: 0 }}
        />
      )}
    </div>
  );
}
