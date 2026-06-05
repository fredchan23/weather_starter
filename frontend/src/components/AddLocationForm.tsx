import { useEffect, useId, useState } from 'react';
import { fetchForecastAreas, logInteraction } from '../api';
import { findDuplicateLocation } from '../locationHelpers';
import { REGION_MAP, REGION_ORDER } from '../regionMap';
import type { Region } from '../regionMap';
import { useStore } from '../state/store';
import type { ForecastArea } from '../types';
import { PlusIcon } from './icons';

interface StatusMessage {
    tone: 'info' | 'success' | 'error';
    message: string;
}

type AreasLoadState =
    | { status: 'idle' }
    | { status: 'loading' }
    | { status: 'error' }
    | { status: 'loaded'; areas: ForecastArea[] };

const GEOLOCATION_OPTIONS = {
    enableHighAccuracy: false,
    timeout: 8000,
    maximumAge: 300000,
} as const;

export function AddLocationForm() {
    const { locations, isAdding, setAdding, create, select } = useStore();
    const [busyAction, setBusyAction] = useState<'geolocation' | 'area' | null>(null);
    const [status, setStatus] = useState<StatusMessage | null>(null);
    const [selectedRegion, setSelectedRegion] = useState<Region | null>(null);
    const [areasState, setAreasState] = useState<AreasLoadState>({ status: 'idle' });
    const statusId = useId();

    useEffect(() => {
        if (!status) return undefined;
        const timeout = window.setTimeout(() => setStatus(null), 5000);
        return () => window.clearTimeout(timeout);
    }, [status]);

    const loadAreas = () => {
        setAreasState({ status: 'loading' });
        fetchForecastAreas()
            .then((r) => setAreasState({ status: 'loaded', areas: r.areas }))
            .catch(() => setAreasState({ status: 'error' }));
    };

    const openPicker = () => {
        setAdding(true);
        if (areasState.status !== 'loaded' && areasState.status !== 'loading') {
            loadAreas();
        }
    };

    const cancel = () => {
        setSelectedRegion(null);
        setStatus(null);
        setAdding(false);
    };

    const retryLoadAreas = () => loadAreas();

    const handleAreaSelect = async (area: ForecastArea) => {
        if (busyAction) return;

        const duplicate = findDuplicateLocation(locations, area);
        if (duplicate) {
            select(duplicate.id);
            setStatus({
                tone: 'info',
                message: `Already saved. Showing ${duplicate.weather.area ?? area.name}.`,
            });
            logInteraction('location_duplicate_selected', { source: 'picker' });
            return;
        }

        setBusyAction('area');
        logInteraction('location_picker_area_selected', { area: area.name });
        try {
            await create({ latitude: area.latitude, longitude: area.longitude });
            setStatus({ tone: 'success', message: `Added ${area.name}.` });
        } catch (error) {
            setStatus({
                tone: 'error',
                message: error instanceof Error ? error.message : 'Could not add location.',
            });
            logInteraction('location_create_failed', { reason: 'create_failed', source: 'picker' });
        } finally {
            setBusyAction(null);
        }
    };

    const getCurrentPosition = () =>
        new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, GEOLOCATION_OPTIONS);
        });

    const handleUseMyLocation = async () => {
        if (busyAction) return;
        if (typeof navigator === 'undefined' || !navigator.geolocation) {
            setStatus({
                tone: 'error',
                message: 'Geolocation is not available in this browser.',
            });
            logInteraction('location_geolocation_failed', { reason: 'unsupported' });
            return;
        }

        setBusyAction('geolocation');
        setStatus({ tone: 'info', message: 'Finding your location…' });
        logInteraction('location_geolocation_clicked');

        try {
            const position = await getCurrentPosition();
            const { latitude, longitude } = position.coords;

            const resolvedAreas = await fetchForecastAreas().catch(() => null);
            const snappedArea = resolvedAreas?.areas.length
                ? resolvedAreas.areas.reduce((nearest, area) => {
                    const d = (area.latitude - latitude) ** 2 + (area.longitude - longitude) ** 2;
                    const nd = (nearest.latitude - latitude) ** 2 + (nearest.longitude - longitude) ** 2;
                    return d < nd ? area : nearest;
                })
                : null;

            const coords = snappedArea
                ? { latitude: snappedArea.latitude, longitude: snappedArea.longitude }
                : { latitude: Number(latitude.toFixed(4)), longitude: Number(longitude.toFixed(4)) };

            const duplicate = findDuplicateLocation(locations, coords);
            if (duplicate) {
                select(duplicate.id);
                setStatus({
                    tone: 'info',
                    message: `Already saved. Showing ${duplicate.weather.area ?? 'the existing location'}.`,
                });
                logInteraction('location_duplicate_selected', { source: 'geolocation' });
                return;
            }

            logInteraction('location_geolocation_resolved', {
                snappedArea: snappedArea?.name ?? null,
                usedRawFallback: !snappedArea,
            });

            await create(coords);
            setStatus({
                tone: 'success',
                message: snappedArea
                    ? `Added ${snappedArea.name} from your device location.`
                    : 'Added your location.',
            });
        } catch (error) {
            const reason = geolocationFailureReason(error);
            setStatus({ tone: 'error', message: geolocationFailureMessage(reason) });
            logInteraction('location_geolocation_failed', { reason });
        } finally {
            setBusyAction(null);
        }
    };

    if (!isAdding) {
        return (
            <div className="grid gap-2.5 rounded-2xl border border-white/15 bg-white/[0.07] p-3 backdrop-blur-xl">
                <button
                    type="button"
                    onClick={handleUseMyLocation}
                    disabled={busyAction !== null}
                    aria-describedby={status ? statusId : undefined}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/20 bg-white/[0.12] px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-white/[0.16] disabled:cursor-not-allowed disabled:opacity-60"
                >
                    <PlusIcon />
                    <span>{busyAction === 'geolocation' ? 'Finding location…' : 'Use my location'}</span>
                </button>
                <button
                    type="button"
                    onClick={openPicker}
                    disabled={busyAction !== null}
                    className="rounded-2xl border border-white/10 bg-white/[0.05] px-3 py-2 text-sm font-medium text-white/75 transition hover:bg-white/[0.09] hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                    Add location
                </button>
                <StatusBanner status={status} id={statusId} />
            </div>
        );
    }

    return (
        <div
            aria-describedby={status ? statusId : undefined}
            className="grid gap-3 rounded-2xl border border-white/15 bg-white/[0.1] p-3 backdrop-blur-xl"
        >
            <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/60">
                    Pick an area
                </p>
                <button
                    type="button"
                    onClick={handleUseMyLocation}
                    disabled={busyAction !== null}
                    className="rounded-full border border-white/15 bg-white/[0.08] px-3 py-1 text-[11px] font-medium text-white/80 transition hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-60"
                >
                    {busyAction === 'geolocation' ? 'Finding…' : 'Use my location'}
                </button>
            </div>

            {areasState.status === 'loading' && (
                <p className="py-2 text-center text-xs text-white/50">Loading areas…</p>
            )}

            {areasState.status === 'error' && (
                <div className="grid gap-2 py-1 text-center">
                    <p className="text-xs text-white/60">Could not load forecast areas.</p>
                    <button
                        type="button"
                        onClick={retryLoadAreas}
                        className="mx-auto rounded-md border border-white/15 bg-white/[0.08] px-3 py-1.5 text-xs font-medium text-white/80 transition hover:bg-white/[0.12]"
                    >
                        Retry
                    </button>
                </div>
            )}

            {areasState.status === 'loaded' && (
                <>
                    <div
                        role="group"
                        aria-label="Region"
                        className="flex flex-wrap gap-1.5"
                    >
                        {REGION_ORDER.map((region) => (
                            <button
                                key={region}
                                type="button"
                                onClick={() => setSelectedRegion(region === selectedRegion ? null : region)}
                                aria-pressed={selectedRegion === region}
                                className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition ${
                                    selectedRegion === region
                                        ? 'border-white/40 bg-white/25 text-white'
                                        : 'border-white/15 bg-white/[0.07] text-white/70 hover:bg-white/[0.12] hover:text-white'
                                }`}
                            >
                                {region}
                            </button>
                        ))}
                    </div>

                    {selectedRegion && (
                        <ul
                            aria-label={`Areas in ${selectedRegion}`}
                            className="flex flex-wrap gap-1.5"
                        >
                            {REGION_MAP[selectedRegion].map((areaName) => {
                                const area = areasState.areas.find((a) => a.name === areaName);
                                if (!area) return null;
                                return (
                                    <li key={areaName}>
                                        <button
                                            type="button"
                                            onClick={() => void handleAreaSelect(area)}
                                            disabled={busyAction !== null}
                                            className="rounded-lg border border-white/15 bg-white/[0.08] px-2.5 py-1 text-xs text-white/85 transition hover:border-white/30 hover:bg-white/[0.15] hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                                        >
                                            {areaName}
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </>
            )}

            <div className="flex justify-end">
                <button
                    type="button"
                    onClick={cancel}
                    className="rounded-md px-2.5 py-1.5 text-xs font-medium text-white/70 transition hover:text-white"
                >
                    Cancel
                </button>
            </div>

            <StatusBanner status={status} id={statusId} />
        </div>
    );
}

function StatusBanner({ status, id }: { status: StatusMessage | null; id: string }) {
    if (!status) return null;
    const toneClasses =
        status.tone === 'error'
            ? 'border-red-300/25 bg-red-500/15 text-red-50'
            : status.tone === 'success'
                ? 'border-emerald-300/25 bg-emerald-500/15 text-emerald-50'
                : 'border-white/15 bg-white/[0.08] text-white/75';
    return (
        <p
            id={id}
            role={status.tone === 'error' ? 'alert' : 'status'}
            aria-live={status.tone === 'error' ? 'assertive' : 'polite'}
            aria-atomic="true"
            className={`rounded-md border px-2.5 py-1.5 text-xs ${toneClasses}`}
        >
            {status.message}
        </p>
    );
}

function geolocationFailureReason(
    error: unknown,
): 'permission_denied' | 'position_unavailable' | 'timeout' | 'unsupported' | 'unknown' {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return 'unsupported';
    if (error && typeof error === 'object' && 'code' in error) {
        const code = Number((error as GeolocationPositionError).code);
        if (code === 1) return 'permission_denied';
        if (code === 2) return 'position_unavailable';
        if (code === 3) return 'timeout';
    }
    return 'unknown';
}

function geolocationFailureMessage(
    reason: 'permission_denied' | 'position_unavailable' | 'timeout' | 'unsupported' | 'unknown',
): string {
    switch (reason) {
        case 'permission_denied': return 'Location permission was denied.';
        case 'position_unavailable': return 'Your location could not be determined. Try again or pick an area.';
        case 'timeout': return 'Location lookup timed out. Try again or pick an area.';
        case 'unsupported': return 'Geolocation is not available in this browser.';
        default: return 'Could not determine your location. Pick an area instead.';
    }
}
