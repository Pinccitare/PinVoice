import GradientWaves from './GradientWaves';

interface AuroraBackgroundProps {
  theme?: 'dark' | 'light';
  /** Pausa o shader WebGL durante gravação/processamento para 0% de impacto na velocidade do áudio */
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
      <GradientWaves
        horizonColor={isLight ? '#4F67B8' : '#1E3A8A'}
        waveColor={isLight ? '#2B7BBB' : '#0D9488'}
        crestColor={isLight ? '#10B981' : '#34D399'}
        backgroundColor="transparent"
        lightMode={isLight}
        speed={0.22}
        amplitude={1.9}
        waveScale={0.52}
        waveRatio={0.85}
        swell={24}
        turbulence={14}
        tilt={65}
        zoom={1.08}
        height={5.4}
        fogDepth={17}
        relief={0.85}
        sheen={0.22}
        brightness={isLight ? 0.88 : 0.8}
        opacity={isLight ? 0.34 : 0.44}
        grain={0.05}
        quality="low"
        intro={true}
        mouseInteraction={true}
        parallaxStrength={0.28}
        mouseStrength={0.32}
        swellOnClick={false}
        paused={paused}
        dpr={1.25}
        className="h-full w-full"
      />
      {/* Vinheta sutil para garantir contraste cirúrgico sobre o shader */}
      <div
        className="absolute inset-0"
        style={{
          background: isLight
            ? 'radial-gradient(ellipse at 50% 0%, rgba(238,244,250,0.35) 0%, rgba(238,244,250,0.78) 100%)'
            : 'radial-gradient(ellipse at 50% 0%, rgba(5,9,20,0.22) 0%, rgba(5,9,20,0.72) 100%)',
        }}
      />
    </div>
  );
}
