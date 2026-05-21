import { useStore } from '../state/store';
import { CloseIcon, CloudIcon, HomeIcon } from './icons';
import { formatTemperature, formatTime } from './format';
import type { KeyboardEvent } from 'react';
import type { Location } from '../types';

interface SidebarCardProps {
  location: Location;
  isHome: boolean;
}

export function SidebarCard({ location, isHome }: SidebarCardProps) {
  const { selectedId, select, deleteLocation } = useStore();
  const isSelected = selectedId === location.id;
  const observed = formatTime(location.weather.observed_at);
  const area =
    location.weather.area ||
    `${location.latitude.toFixed(3)}, ${location.longitude.toFixed(3)}`;
  const condition = location.weather.condition || '-';
  const temperature = formatTemperature(location.weather.temperature_c);
  const high = formatTemperature(location.weather.forecast_high_c);
  const low = formatTemperature(location.weather.forecast_low_c);
  const humidity = formatNumber(location.weather.humidity_percent);
  const rainfall = formatNumber(location.weather.rainfall_mm, 1);
  const temperatureDisplay =
    temperature === '--°' ? temperature : `${temperature}C`;
  const hasTemperature = location.weather.temperature_c !== null;
  const hasHighLow =
    location.weather.forecast_high_c !== null ||
    location.weather.forecast_low_c !== null;
  const hasCurrentConditionReadings =
    location.weather.humidity_percent !== null ||
    location.weather.rainfall_mm !== null;

  const onSelect = () => select(location.id);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect();
    }
  };
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={onKeyDown}
      aria-pressed={isSelected}
      className={`relative w-full cursor-pointer overflow-hidden rounded-2xl border text-left backdrop-blur-xl transition ${
        isSelected
          ? 'border-white/30 bg-white/20 shadow-lg shadow-black/20'
          : 'border-white/10 bg-white/[0.07] hover:bg-white/[0.12]'
      }`}
    >
      <button
        type="button"
        aria-label={`Delete location ${area}`}
        title={`Delete location ${area}`}
        onClick={(event) => {
          event.stopPropagation();
          void deleteLocation(location.id);
        }}
        className="absolute right-2 top-2 z-10 rounded-full bg-black/20 p-1.5 text-white/65 transition hover:bg-white/15 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
      >
        <CloseIcon className="h-4 w-4" />
      </button>
      <div className="flex items-start justify-between gap-3 px-4 pt-3 pr-10">
        <div className="min-w-0">
          <div className="truncate text-lg font-semibold leading-tight text-white">
            {area}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-white/70">
            {isHome ? (
              <>
                <span>My Location</span>
                <span className="text-white/40">·</span>
                <HomeIcon className="h-3 w-3" />
                <span>Home</span>
              </>
            ) : observed ? (
              <span>{observed}</span>
            ) : (
              <span className="text-white/50">Not refreshed</span>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end leading-none text-right">
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/50">
            {hasTemperature ? 'Temperature' : 'Source'}
          </span>
          <span className="text-3xl font-medium tabular-nums text-white/95">
            {hasTemperature ? temperatureDisplay : '2-hr'}
          </span>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-white/10 px-4 py-2 text-xs">
        <div className="flex items-center gap-2 text-white/80">
          <CloudIcon className="h-4 w-4 text-white/70" />
          <span>{condition}</span>
        </div>
        {hasHighLow && (
          <div className="text-white/60 tabular-nums">
            H:{high} L:{low}
          </div>
        )}
      </div>
      {hasCurrentConditionReadings && (
        <div className="grid grid-cols-2 gap-2 border-t border-white/10 px-4 py-2 text-[11px] text-white/70">
          <div className="flex items-center justify-between rounded-full bg-white/[0.05] px-3 py-1.5">
            <span>Humidity</span>
            <span className="tabular-nums text-white/90">{humidity}%</span>
          </div>
          <div className="flex items-center justify-between rounded-full bg-white/[0.05] px-3 py-1.5">
            <span>Rain</span>
            <span className="tabular-nums text-white/90">{rainfall} mm</span>
          </div>
        </div>
      )}
    </div>
  );
}

function formatNumber(value: number | null | undefined, digits = 0): string {
  return typeof value === 'number' && Number.isFinite(value)
    ? value.toFixed(digits)
    : '--';
}
