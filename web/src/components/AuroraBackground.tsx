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
        opacity={isLight ? 0.55 : 0.72}
        quality="medium"
        paused={paused}
        dpr={1.5}
        className="h-full w-full"
      />
      {/* Vinheta suave para manter contraste de leitura nos cartões */}
      <div
        className="absolute inset-0"
        style={{
          background: isLight
            ? 'radial-gradient(ellipse at 50% 0%, rgba(238,244,250,0.22) 0%, rgba(238,244,250,0.68) 100%)'
            : 'radial-gradient(ellipse at 50% 0%, rgba(5,9,20,0.18) 0%, rgba(5,9,20,0.64) 100%)',
        }}
      />
    </div>
  );
}
