import { useCallback } from 'react';
import { fetchForecastAreas } from '../api';
import { resolveGeoUpgrade } from '../locationHelpers';
import { useStore } from './store';

export function useGeoUpgrade() {
  const { centralDefaultId, deleteLocation, create, clearCentralDefault } =
    useStore();

  return useCallback(async () => {
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject),
      );

      const { latitude, longitude } = position.coords;
      const { areas } = await fetchForecastAreas();
      const nearest = resolveGeoUpgrade(areas, latitude, longitude);

      if (!nearest) {
        clearCentralDefault();
        return;
      }

      if (centralDefaultId !== null) {
        await deleteLocation(centralDefaultId);
      }
      await create({ latitude: nearest.latitude, longitude: nearest.longitude });
      clearCentralDefault();
    } catch {
      clearCentralDefault();
    }
  }, [centralDefaultId, deleteLocation, create, clearCentralDefault]);
}
