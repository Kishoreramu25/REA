import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabaseClient';
import { locationService } from '../services/locationService';

export function useLocation(busId = null) {
  const [location, setLocation] = useState(null);
  const [isTracking, setIsTracking] = useState(false);
  const [error, setError] = useState(null);
  const [fetchFailed, setFetchFailed] = useState(false);
  const [lastOkAt, setLastOkAt] = useState(null);
  const [locationLoaded, setLocationLoaded] = useState(false);

  const fetchLocation = useCallback(async () => {
    if (!busId) return;
    try {
      const { data, error: sbError } = await supabase
        .from('bus_location')
        .select('*')
        .eq('bus_id', busId)
        .maybeSingle();

      if (sbError) {
        setFetchFailed(true);
      } else {
        setFetchFailed(false);
        setLastOkAt(new Date());
        if (data) {
          setLocation(data);
        }
      }
    } catch (err) {
      setFetchFailed(true);
    } finally {
      setLocationLoaded(true);
    }
  }, [busId]);

  // Polling and realtime subscription
  useEffect(() => {
    if (!busId) return;

    fetchLocation();
    const pollInterval = setInterval(fetchLocation, 12000);

    const unsubscribe = locationService.subscribeToBusLocation(busId, (newLoc) => {
      setFetchFailed(false);
      setLastOkAt(new Date());
      setLocation(newLoc);
    });

    return () => {
      clearInterval(pollInterval);
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [busId, fetchLocation]);

  const startTracking = async (idToTrack = busId) => {
    try {
      const perm = await locationService.requestPermissions();
      if (!perm.granted) {
        throw new Error(perm.error || 'Location permission denied');
      }

      await locationService.startBackgroundTracking(idToTrack);
      setIsTracking(true);
      setError(null);
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  const stopTracking = async (idToTrack = busId) => {
    try {
      await locationService.stopBackgroundTracking(idToTrack);
      setIsTracking(false);
    } catch (err) {
      setError(err.message);
    }
  };

  return {
    location,
    isTracking,
    error,
    startTracking,
    stopTracking,
    refetch: fetchLocation,
    fetchFailed,
    lastOkAt,
    locationLoaded
  };
}
