import { KhatamStar } from './IslamicPatterns';

/**
 * What the globe's space shows before the globe has drawn its first complete
 * frame (lazy chunk parse, mount, base texture): the Basmala in the app's
 * Amiri face with a slow gold light sweeping across it, over faintly turning
 * khatam stars. Sits on the same fixed space backdrop as the globe, so it
 * reads as a prelude rather than a spinner, and cross-fades with the globe
 * the moment the surface is up.
 *
 * Every animation here is transform/opacity only. It runs during the busiest
 * moment of a cold start (tile decodes and uploads), so nothing may repaint
 * per frame: the sweep is a bright copy of the text inside a narrow window
 * that slides across on a transform while the copy counter-slides to stay
 * put — the compositor does all of it. The component is unmounted after the
 * fade, so no animation outlives the load.
 */
const GOLD = '#d9b96a';
const BRIGHT = '#fff3cf';
const TEXT_WIDTH = 320;
const SWEEP_WIDTH = 90;
const TRAVEL = TEXT_WIDTH + SWEEP_WIDTH * 2;
export const GLOBE_LOADER_FADE_MS = 450;

const textStyle = {
  fontFamily: '"Amiri", serif',
  fontSize: 30,
  lineHeight: 1.6,
  letterSpacing: 0.5,
  width: TEXT_WIDTH,
} as const;

export function GlobeLoader({ fading = false }: { fading?: boolean }) {
  return (
    <div
      data-testid="globe-loader"
      data-state={fading ? 'fading' : 'visible'}
      className="pointer-events-none absolute inset-0 z-[5] flex items-center justify-center select-none"
      style={{ opacity: fading ? 0 : 1, transition: `opacity ${GLOBE_LOADER_FADE_MS}ms ease-out` }}
    >
      <div className="relative flex items-center justify-center" style={{ width: 280, height: 280 }}>
        <div className="absolute inset-0 flex items-center justify-center globe-loader-turn">
          <KhatamStar size={280} stroke={GOLD} strokeWidth={0.6} opacity={0.16} />
        </div>
        <div className="absolute inset-0 flex items-center justify-center globe-loader-turn-reverse">
          <KhatamStar size={180} stroke={GOLD} strokeWidth={0.6} opacity={0.1} />
        </div>

        <div className="relative" style={{ width: TEXT_WIDTH }}>
          <p
            lang="ar"
            dir="rtl"
            className="m-0 text-center"
            style={{ ...textStyle, color: GOLD, textShadow: '0 2px 18px rgba(0,0,0,0.85)' }}
          >
            بِسْمِ ٱللَّٰهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ
          </p>
          <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
            <div className="globe-loader-sweep absolute top-0 bottom-0" style={{ width: SWEEP_WIDTH, left: -SWEEP_WIDTH }}>
              <p
                lang="ar"
                dir="rtl"
                className="globe-loader-sweep-text m-0 text-center absolute top-0"
                style={{ ...textStyle, color: BRIGHT, left: SWEEP_WIDTH }}
              >
                بِسْمِ ٱللَّٰهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ
              </p>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes globe-loader-turn { to { transform: rotate(360deg); } }
        @keyframes globe-loader-turn-reverse { to { transform: rotate(-360deg); } }
        .globe-loader-turn { animation: globe-loader-turn 48s linear infinite; }
        .globe-loader-turn-reverse { animation: globe-loader-turn-reverse 32s linear infinite; }
        .globe-loader-sweep {
          -webkit-mask-image: linear-gradient(90deg, transparent, #000 45%, #000 55%, transparent);
          mask-image: linear-gradient(90deg, transparent, #000 45%, #000 55%, transparent);
          animation: globe-loader-sweep 2.6s ease-in-out infinite;
        }
        .globe-loader-sweep-text { animation: globe-loader-sweep-counter 2.6s ease-in-out infinite; }
        @keyframes globe-loader-sweep { to { transform: translateX(${TRAVEL}px); } }
        @keyframes globe-loader-sweep-counter { to { transform: translateX(-${TRAVEL}px); } }
      `}</style>
    </div>
  );
}
