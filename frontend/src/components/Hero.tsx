import { useStore, useSelectedLocation } from '../state/store';
import { LocationIcon, RefreshIcon } from './icons';
import { HourlyStrip } from './HourlyStrip';
import { TenDayForecast } from './TenDayForecast';
import { TileGrid } from './Tiles';
import { MapCard } from './MapCard';
import { formatTemperature, formatTime } from './format';
import type { ForecastPeriod } from '../types';

export function Hero() {
  const { locations, refresh, refreshingId } = useStore();
  const selected = useSelectedLocation();

  if (!selected) {
    return (
      <main className="flex flex-1 flex-col p-10">
        <div className="flex flex-1 flex-col items-center justify-center gap-6">
          <div className="text-center">
            <p className="text-2xl font-light text-white/85">Select a location</p>
            <p className="mt-2 text-sm text-white/60">
              Add a Singapore coordinate from the sidebar to see its weather.
            </p>
          </div>
          <div className="w-full max-w-5xl">
            <MapCard />
          </div>
        </div>
      </main>
    );
  }

  const isHome = locations[0]?.id === selected.id;
  const area =
    selected.weather?.area || `${selected.latitude.toFixed(3)}, ${selected.longitude.toFixed(3)}`;
  const condition = selected.weather?.condition || 'Conditions unavailable';
  const observed = formatTime(selected.weather?.observed_at);
  const validPeriod = selected.weather?.valid_period_text;
  const source = selected.weather?.source;
  const isRefreshing = refreshingId === selected.id;
  const temperature = formatTemperature(selected.weather?.temperature_c);
  const high = formatTemperature(selected.weather?.forecast_high_c);
  const low = formatTemperature(selected.weather?.forecast_low_c);
  const hasTemperature = selected.weather?.temperature_c !== null;
  const hasHighLow =
    selected.weather?.forecast_high_c !== null || selected.weather?.forecast_low_c !== null;
  const fallbackPeriods: ForecastPeriod[] =
    selected.weather?.forecast_periods?.length > 0
      ? selected.weather.forecast_periods
      : validPeriod && condition
        ? [{ label: validPeriod, forecast: condition }]
        : [];
  const hasDailyForecast = selected.weather?.daily_forecast?.length > 0;
  const hasSupplementaryTiles =
    selected.weather?.psi_twenty_four_hourly !== null ||
    selected.weather?.pm25_one_hourly !== null ||
    selected.weather?.wind_speed_knots !== null ||
    selected.weather?.wind_direction_degrees !== null ||
    selected.weather?.uv_index !== null ||
    selected.weather?.temperature_c !== null ||
    selected.weather?.rainfall_mm !== null ||
    selected.weather?.humidity_percent !== null ||
    selected.weather?.forecast_high_c !== null;

  return (
    <main className="flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-5xl flex-col gap-3 p-6 lg:p-8">
        <header className="flex flex-col items-center pt-6 pb-2 text-center">
          {isHome && (
            <div className="mb-2 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70">
              <LocationIcon className="h-3 w-3" />
              <span>Home</span>
            </div>
          )}
          <h1 className="text-4xl font-light leading-tight text-white">{area}</h1>
          {hasTemperature ? (
            <>
              <div className="mt-2 text-[6.5rem] font-extralight leading-none tracking-tight text-white">
                {temperature}
              </div>
              <div className="mt-1 text-lg text-white/90">{condition}</div>
              {hasHighLow && (
                <div className="mt-1 text-sm text-white/70 tabular-nums">
                  H:{high} L:{low}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="mt-4 rounded-full border border-white/15 bg-white/[0.08] px-4 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/65">
                Two-hour forecast
              </div>
              <div className="mt-4 text-5xl font-light leading-tight text-white">{condition}</div>
            </>
          )}
          {observed && <div className="mt-3 text-xs text-white/55">Updated {observed}</div>}
        </header>

        {validPeriod && (
          <p className="px-2 pb-1 text-center text-xs text-white/65">{validPeriod}</p>
        )}

        <HourlyStrip periods={fallbackPeriods} />
        {hasDailyForecast && <TenDayForecast weather={selected.weather} />}
        {hasSupplementaryTiles && <TileGrid weather={selected.weather} />}
        <MapCard />

        <footer className="mt-2 flex flex-col items-center gap-3 pb-8 text-xs text-white/55">
          <button
            type="button"
            onClick={() => void refresh(selected.id)}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.08] px-3 py-1.5 text-xs font-medium text-white/85 backdrop-blur-xl hover:bg-white/[0.14] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshIcon className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>{isRefreshing ? 'Refreshing…' : 'Refresh'}</span>
          </button>
          <p>
            Weather for {area}
            {source ? ` · ${source}` : ''}
          </p>
        </footer>
      </div>
    </main>
  );
}

interface ConditionStatProps {
  label: string;
  value: string;
}

function ConditionStat({ label, value }: ConditionStatProps) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-center backdrop-blur-sm">
      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/50">
        {label}
      </div>
      <div className="mt-1 text-lg font-medium tabular-nums text-white/95">{value}</div>
    </div>
  );
}
