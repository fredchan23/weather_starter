import { useEffect, useId, useState } from 'react';
import type { FormEvent } from 'react';
import { fetchForecastAreas, logInteraction } from '../api';
import { useStore } from '../state/store';
import {
    findDuplicateLocation,
    isWithinSingaporeBounds,
    normalizeCoordinatePair,
    selectNearestForecastArea,
} from '../locationHelpers';
import { PlusIcon } from './icons';

interface StatusMessage {
    tone: 'info' | 'success' | 'error';
    message: string;
}

type LocationSource = 'geolocation' | 'manual';

const GEOLOCATION_OPTIONS = {
    enableHighAccuracy: false,
    timeout: 8000,
    maximumAge: 300000,
} as const;

export function AddLocationForm() {
    const { locations, isAdding, setAdding, create, select } = useStore();
    const [latitude, setLatitude] = useState('');
    const [longitude, setLongitude] = useState('');
    const [busyAction, setBusyAction] = useState<LocationSource | null>(null);
    const [status, setStatus] = useState<StatusMessage | null>(null);
    const statusId = useId();

    useEffect(() => {
        if (!status) return undefined;

        const timeout = window.setTimeout(() => {
            setStatus(null);
        }, 5000);

        return () => window.clearTimeout(timeout);
    }, [status]);

    const cancelManual = () => {
        setLatitude('');
        setLongitude('');
        setStatus(null);
        setAdding(false);
    };

    const showStatus = (nextStatus: StatusMessage | null) => {
        setStatus(nextStatus);
    };

    const getCurrentPosition = () =>
        new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, GEOLOCATION_OPTIONS);
        });

    const resolveAndCreate = async (
        input: { latitude: number; longitude: number },
        source: LocationSource,
    ) => {
        const normalizedInput = normalizeCoordinatePair(input);
        const resolvedAreas = await fetchForecastAreas().catch(() => null);
        const snappedArea = resolvedAreas?.areas.length
            ? selectNearestForecastArea(
                resolvedAreas.areas,
                input.latitude,
                input.longitude,
            )
            : null;
        const normalizedCoordinates = snappedArea
            ? normalizeCoordinatePair(snappedArea)
            : normalizedInput;
        const resolvedEvent =
            source === 'geolocation'
                ? 'location_geolocation_resolved'
                : 'location_manual_resolved';
        const duplicate = findDuplicateLocation(locations, normalizedCoordinates);

        logInteraction(resolvedEvent, {
            duplicatePrechecked: true,
            usedStaleAreas: resolvedAreas?.stale ?? false,
            usedRawFallback: !snappedArea,
            snappedArea: snappedArea?.name ?? null,
        });

        if (duplicate) {
            select(duplicate.id);
            showStatus({
                tone: 'info',
                message: `Already saved. Showing ${duplicate.weather.area ?? 'the existing location'}.`,
            });
            logInteraction('location_duplicate_selected', {
                duplicatePrechecked: true,
                usedStaleAreas: resolvedAreas?.stale ?? false,
                usedRawFallback: !snappedArea,
            });
            return;
        }

        if (!resolvedAreas?.areas.length && !isWithinSingaporeBounds(normalizedCoordinates)) {
            showStatus({
                tone: 'error',
                message:
                    source === 'manual'
                        ? 'Forecast areas are unavailable and these coordinates are outside Singapore.'
                        : 'Could not resolve your location outside Singapore.',
            });
            logInteraction('location_create_failed', {
                reason: 'areas_unavailable_out_of_bounds',
                source,
                usedRawFallback: true,
            });
            return;
        }

        try {
            await create(normalizedCoordinates);
            showStatus({
                tone: 'success',
                message: snappedArea
                    ? `Added ${snappedArea.name} from your ${source === 'geolocation' ? 'device location' : 'coordinates'}.`
                    : 'Added your location and used the coordinates as entered.',
            });
        } catch (error) {
            showStatus({
                tone: 'error',
                message:
                    error instanceof Error ? error.message : 'Could not add location.',
            });
            logInteraction('location_create_failed', {
                reason: 'create_failed',
                source,
                usedRawFallback: !snappedArea,
            });
        }
    };

    const handleUseMyLocation = async () => {
        if (busyAction) return;
        if (typeof navigator === 'undefined' || !navigator.geolocation) {
            showStatus({
                tone: 'error',
                message: 'Geolocation is not available in this browser. Use manual coordinates instead.',
            });
            logInteraction('location_geolocation_failed', { reason: 'unsupported' });
            return;
        }

        setBusyAction('geolocation');
        showStatus({ tone: 'info', message: 'Finding your location…' });
        logInteraction('location_geolocation_clicked');

        try {
            const position = await getCurrentPosition();
            await resolveAndCreate(
                {
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
                },
                'geolocation',
            );
        } catch (error) {
            const reason = geolocationFailureReason(error);
            showStatus({
                tone: 'error',
                message: geolocationFailureMessage(reason),
            });
            logInteraction('location_geolocation_failed', {
                reason,
                duplicatePrechecked: true,
            });
        } finally {
            setBusyAction(null);
        }
    };

    const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (busyAction) return;

        const latitudeValue = Number(latitude);
        const longitudeValue = Number(longitude);
        if (!Number.isFinite(latitudeValue) || !Number.isFinite(longitudeValue)) {
            showStatus({
                tone: 'error',
                message: 'Enter valid latitude and longitude values.',
            });
            return;
        }

        setBusyAction('manual');
        setStatus(null);
        logInteraction('location_manual_submitted');

        try {
            await resolveAndCreate(
                { latitude: latitudeValue, longitude: longitudeValue },
                'manual',
            );
            setLatitude('');
            setLongitude('');
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
                    onClick={() => setAdding(true)}
                    disabled={busyAction !== null}
                    className="rounded-2xl border border-white/10 bg-white/[0.05] px-3 py-2 text-sm font-medium text-white/75 transition hover:bg-white/[0.09] hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                    Add coordinates manually
                </button>
                <StatusBanner status={status} id={statusId} />
            </div>
        );
    }

    return (
        <form
            onSubmit={onSubmit}
            aria-busy={busyAction !== null}
            aria-describedby={status ? statusId : undefined}
            className="grid gap-2.5 rounded-2xl border border-white/15 bg-white/[0.1] p-3 backdrop-blur-xl"
        >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/60">
                        Manual coordinates
                    </p>
                    <p className="mt-1 text-[11px] text-white/55">
                        We still snap to the nearest forecast area when metadata is available.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={handleUseMyLocation}
                    disabled={busyAction !== null}
                    className="w-full rounded-full border border-white/15 bg-white/[0.08] px-3 py-1.5 text-[11px] font-medium text-white/80 transition hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                >
                    Use my location
                </button>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <label className="grid min-w-0 gap-1">
                    <span className="text-[11px] text-white/60">Latitude</span>
                    <input
                        type="number"
                        step="any"
                        value={latitude}
                        onChange={(e) => setLatitude(e.target.value)}
                        placeholder="1.3508"
                        required
                        className="w-full min-w-0 rounded-md border border-white/15 bg-white/10 px-2 py-1.5 text-sm text-white placeholder:text-white/40"
                    />
                </label>
                <label className="grid min-w-0 gap-1">
                    <span className="text-[11px] text-white/60">Longitude</span>
                    <input
                        type="number"
                        step="any"
                        value={longitude}
                        onChange={(e) => setLongitude(e.target.value)}
                        placeholder="103.8390"
                        required
                        className="w-full min-w-0 rounded-md border border-white/15 bg-white/10 px-2 py-1.5 text-sm text-white placeholder:text-white/40"
                    />
                </label>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                    type="button"
                    onClick={cancelManual}
                    className="rounded-md px-2.5 py-1.5 text-xs font-medium text-white/70 transition hover:text-white"
                >
                    Cancel
                </button>
                <button
                    type="submit"
                    disabled={busyAction !== null}
                    className="rounded-md bg-white/90 px-3 py-1.5 text-xs font-semibold text-slate-900 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                    {busyAction === 'manual' ? 'Adding…' : 'Add location'}
                </button>
            </div>
            <StatusBanner status={status} id={statusId} />
        </form>
    );
}

function StatusBanner({
    status,
    id,
}: {
    status: StatusMessage | null;
    id: string;
}) {
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
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
        return 'unsupported';
    }
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
        case 'permission_denied':
            return 'Location permission was denied. Use manual coordinates instead.';
        case 'position_unavailable':
            return 'Your location could not be determined. Try again or add coordinates manually.';
        case 'timeout':
            return 'Location lookup timed out. Try again or use manual coordinates instead.';
        case 'unsupported':
            return 'Geolocation is not available in this browser. Use manual coordinates instead.';
        default:
            return 'Could not determine your location. Use manual coordinates instead.';
    }
}
