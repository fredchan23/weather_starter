import { useState } from 'react';
import L from 'leaflet';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import { useStore } from '../state/store';
import { MapIcon, ExpandIcon, ShrinkIcon } from './icons';
import { formatTemperature } from './format';
import type { Location } from '../types';

function makePinIcon(condition: string, temp: string, isSelected: boolean): L.DivIcon {
    const truncated = condition.length > 16 ? condition.slice(0, 16) + '…' : condition;
    const label =
        temp === '--°' ? truncated : `${truncated} · ${temp}`;

    const pill = isSelected
        ? `background:white;color:#1a2035;box-shadow:0 0 0 3px rgba(255,255,255,0.6);`
        : `background:rgba(15,25,60,0.82);color:rgba(255,255,255,0.92);border:1px solid rgba(255,255,255,0.18);`;

    const html = `
    <div style="display:flex;flex-direction:column;align-items:center;pointer-events:none;">
      <div style="${pill}border-radius:999px;padding:3px 9px;font-size:11px;font-weight:600;white-space:nowrap;backdrop-filter:blur(6px);">
        ${label}
      </div>
      <div style="width:1.5px;height:7px;background:${isSelected ? 'white' : 'rgba(255,255,255,0.6)'};"></div>
      <div style="width:5px;height:5px;border-radius:50%;background:${isSelected ? 'white' : 'rgba(255,255,255,0.6)'};"></div>
    </div>`;

    return L.divIcon({
        html,
        className: '',
        iconAnchor: [0, 0],
        popupAnchor: [0, -24],
    });
}

interface MapInnerProps {
    locations: Location[];
    selectedId: number | null;
    select: (id: number) => void;
    zoom: number;
}

function MapInner({ locations, selectedId, select, zoom }: MapInnerProps) {
    const map = useMap();

    // Keep zoom in sync when prop changes (card vs expanded)
    if (map.getZoom() !== zoom) map.setZoom(zoom, { animate: false });

    return (
        <>
            <TileLayer
                url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                attribution='&copy; <a href="https://carto.com/">CARTO</a>'
            />
            {locations.map((loc) => {
                const condition = loc.weather?.condition ?? 'Unknown';
                const temp = formatTemperature(loc.weather?.temperature_c);
                const isSelected = loc.id === selectedId;
                return (
                    <Marker
                        key={loc.id}
                        position={[loc.latitude, loc.longitude]}
                        icon={makePinIcon(condition, temp, isSelected)}
                        eventHandlers={{ click: () => select(loc.id) }}
                    />
                );
            })}
        </>
    );
}

export function MapCard() {
    const { locations, selectedId, select } = useStore();
    const [isExpanded, setIsExpanded] = useState(false);

    if (locations.length === 0) return null;

    const headerBar = (expanded: boolean) => (
        <div className="flex items-center justify-between px-3 py-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.15em] text-white/80">
                <MapIcon className="h-3.5 w-3.5" />
                <span>Map</span>
            </div>
            <button
                type="button"
                className="rounded-full p-1 text-white/70 hover:bg-white/10 hover:text-white"
                onClick={() => setIsExpanded(!expanded)}
                aria-label={expanded ? 'Close fullscreen map' : 'Open fullscreen map'}
            >
                {expanded ? <ShrinkIcon className="h-4 w-4" /> : <ExpandIcon className="h-4 w-4" />}
            </button>
        </div>
    );

    return (
        <>
            {/* Card mode */}
            <div className="overflow-hidden rounded-2xl border border-white/15 bg-white/[0.08]" style={{ height: '240px' }}>
                <div className="relative h-full w-full">
                    {isExpanded ? (
                        // Placeholder while modal is open — keeps layout stable
                        <div className="h-full w-full bg-white/[0.04]" />
                    ) : (
                        <MapContainer
                            center={[1.352, 103.82]}
                            zoom={11}
                            zoomControl={false}
                            attributionControl={false}
                            style={{ height: '100%', width: '100%' }}
                        >
                            <MapInner locations={locations} selectedId={selectedId} select={select} zoom={11} />
                        </MapContainer>
                    )}
                    {/* Overlay header strip */}
                    <div className="absolute top-0 left-0 right-0 z-[1000] backdrop-blur-sm bg-black/25">
                        {headerBar(false)}
                    </div>
                </div>
            </div>

            {/* Expanded / fullscreen modal */}
            {isExpanded && (
                <div className="fixed inset-0 z-50 flex flex-col bg-[#0d1526]">
                    <div className="flex-shrink-0 border-b border-white/10 bg-[#0d1526]/80 backdrop-blur-md">
                        {headerBar(true)}
                    </div>
                    <div className="flex-1">
                        <MapContainer
                            center={[1.352, 103.82]}
                            zoom={12}
                            zoomControl={false}
                            attributionControl={false}
                            style={{ height: '100%', width: '100%' }}
                        >
                            <MapInner locations={locations} selectedId={selectedId} select={select} zoom={12} />
                        </MapContainer>
                    </div>
                </div>
            )}
        </>
    );
}
