import { useStore } from '../state/store';

interface Props {
  onUseLocation: () => void;
}

export function LocationBanner({ onUseLocation }: Props) {
  const { isCentralDefault, clearCentralDefault } = useStore();

  if (!isCentralDefault) return null;

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-white/15 bg-white/[0.08] px-4 py-3 text-sm text-white/85 backdrop-blur-xl">
      <span>Showing Central by default. Use your location instead?</span>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={onUseLocation}
          className="rounded-full border border-white/20 bg-white/[0.12] px-3 py-1 text-xs font-medium hover:bg-white/[0.2]"
        >
          Use my location
        </button>
        <button
          type="button"
          aria-label="Dismiss banner"
          onClick={clearCentralDefault}
          className="flex h-6 w-6 items-center justify-center rounded-full text-white/60 hover:bg-white/[0.12] hover:text-white/90"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
