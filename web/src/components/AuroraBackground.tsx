import GradientWaves from './GradientWaves';

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
            ? 'radial-gradient(120% 80% at 50% 100%, rgba(56,189,248,0.22) 0%, rgba(30,58,138,0.12) 45%, transparent 80%)'
            : 'radial-gradient(120% 80% at 50% 100%, rgba(56,189,248,0.18) 0%, rgba(30,58,138,0.28) 45%, transparent 80%)',
        }}
      />

      <GradientWaves
        horizonColor="#1e3a8a"
        waveColor="#38bdf8"
        crestColor="#e0f2fe"
        backgroundColor="transparent"
        lightMode={isLight}
        speed={0.5}
        amplitude={1.8}
        relief={1}
        lightAngle={150}
        mouseInteraction
        swellOnClick
        waveScale={0.9}
        swell={25}
        turbulence={28}
        tilt={58}
        zoom={0.88}
        brightness={isLight ? 1.05 : 1.15}
        opacity={isLight ? 0.85 : 0.95}
        quality="medium"
        paused={paused}
        dpr={1.5}
        style={{ width: '100%', height: '100%', position: 'absolute', inset: 0 }}
      />
    </div>
  );
}
