import { useState, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../services/supabaseClient';
import { authService } from '../services/authService';
import { mapBus, formatTimeForDB } from '../utils/helpers';
import { APP_CONFIG } from '../utils/constants';

let inMemoryBusCache = [];

export function useBusData() {
  const [buses, setBuses] = useState(inMemoryBusCache || []);
  const [loading, setLoading] = useState(inMemoryBusCache.length === 0);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(null);
  const busesRef = useRef(buses);
  busesRef.current = buses;
  const isFirstLoadRef = useRef(true);

  // Load from local storage cache first
  const loadCache = useCallback(async () => {
    try {
      const stored = await AsyncStorage.getItem(APP_CONFIG.STORAGE_CACHE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          inMemoryBusCache = parsed;
          setBuses(parsed);
          setLoading(false);
          return true;
        }
      }
    } catch (e) {}
    return false;
  }, []);

  // Fetch all buses with stops from Supabase
  const fetchBuses = useCallback(async () => {
    try {
      if (inMemoryBusCache.length === 0 && busesRef.current.length === 0) {
        setLoading(true);
      }

      let res = await supabase
        .from('public_buses')
        .select(`
          id,
          bus_number,
          start_place,
          start_time,
          start_lat,
          start_lng,
          end_place,
          end_time,
          end_lat,
          end_lng,
          is_tracking,
          stops (
            id,
            stop_name,
            stop_time,
            stop_order,
            latitude,
            longitude
          )
        `)
        .order('bus_number', { ascending: true });

      if (res.error) {
        // Fallback to buses table if view not yet migrated
        res = await supabase
          .from('buses')
          .select(`
            id,
            bus_number,
            start_place,
            start_time,
            start_lat,
            start_lng,
            end_place,
            end_time,
            end_lat,
            end_lng,
            is_tracking,
            stops (
              id,
              stop_name,
              stop_time,
              stop_order,
              latitude,
              longitude
            )
          `)
          .order('bus_number', { ascending: true });
      }

      const { data, error: sbError } = res;

      if (sbError) {
        console.warn('[useBusData] Supabase error:', sbError.message);
        await loadCache();
        return;
      }

      // Requirement 9: Use mapBus() in useBusData
      if (Array.isArray(data)) {
        const mapped = data
          .map((b) => mapBus(b))
          .filter(Boolean)
          .sort((a, b) => (a.routeNo || 0) - (b.routeNo || 0));

        inMemoryBusCache = mapped;
        setBuses(mapped);
        setLoaded(true);
        await AsyncStorage.setItem(APP_CONFIG.STORAGE_CACHE_KEY, JSON.stringify(mapped));
      }
    } catch (err) {
      setError(err.message);
      await loadCache();
    } finally {
      setLoading(false);
      isFirstLoadRef.current = false;
    }
  }, [loadCache]);

  useEffect(() => {
    // Eagerly hydrate from storage cache
    loadCache();
    // Fetch in background to silently refresh
    fetchBuses();

    // Unique channel identifier so multiple screens using useBusData do not collide
    const channelId = `buses_realtime_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    let busChannel = null;

    try {
      busChannel = supabase
        .channel(channelId)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'buses' }, () => {
          fetchBuses();
        })
        .subscribe();
    } catch (e) {
      console.warn('[useBusData] Realtime subscription error:', e);
    }

    return () => {
      if (busChannel) {
        try {
          supabase.removeChannel(busChannel);
        } catch (e) {}
      }
    };
  }, [loadCache, fetchBuses]);

  // Helper to get active admin session token
  const getRequiredAdminToken = async () => {
    try {
      const token = await authService.getAdminToken();
      if (token) return token;
      const session = await authService.getStoredSession();
      if (session?.token) return session.token;
    } catch (e) {}
    return 'admin_session_active';
  };

  // Create Bus with Middle Stops
  const addBus = async (busData) => {
    const adminToken = await getRequiredAdminToken();
    const routeNo = parseInt(busData.routeNo, 10);
    const startLat = busData.startLat != null ? parseFloat(busData.startLat) : (busData.start_lat != null ? parseFloat(busData.start_lat) : null);
    const startLng = busData.startLng != null ? parseFloat(busData.startLng) : (busData.start_lng != null ? parseFloat(busData.start_lng) : null);
    const endLat = busData.endLat != null ? parseFloat(busData.endLat) : (busData.end_lat != null ? parseFloat(busData.end_lat) : null);
    const endLng = busData.endLng != null ? parseFloat(busData.endLng) : (busData.end_lng != null ? parseFloat(busData.end_lng) : null);

    const stopsPayload = Array.isArray(busData.via) ? busData.via.map((stop, idx) => ({
      stop_name: typeof stop === 'object' ? stop.name : String(stop),
      stop_time: formatTimeForDB(typeof stop === 'object' ? stop.time : ''),
      stop_order: idx + 1,
      latitude: typeof stop === 'object' ? (stop.lat ?? stop.latitude) : null,
      longitude: typeof stop === 'object' ? (stop.lng ?? stop.longitude) : null
    })) : [];

    let createdBusId = null;

    // 1. Try admin_save_bus RPC if present
    try {
      const res = await supabase.rpc('admin_save_bus', {
        p_token: adminToken,
        p_bus_id: null,
        p_bus_number: String(routeNo),
        p_driver_phone: busData.driverPhone || '',
        p_start_place: busData.origin,
        p_start_time: formatTimeForDB(busData.startTime),
        p_start_lat: startLat,
        p_start_lng: startLng,
        p_end_place: busData.endPlace || 'ESEC Campus',
        p_end_time: formatTimeForDB(busData.collegeTime),
        p_end_lat: endLat,
        p_end_lng: endLng,
        p_stops: stopsPayload
      });
      if (!res.error && res.data) {
        createdBusId = res.data?.bus_id;
      }
    } catch (e) {}

    // 2. Direct table insert fallback
    if (!createdBusId) {
      const { data: newBus, error: insErr } = await supabase
        .from('buses')
        .insert({
          bus_number: String(routeNo),
          driver_phone: busData.driverPhone || '000000',
          start_place: busData.origin,
          start_time: formatTimeForDB(busData.startTime),
          start_lat: startLat,
          start_lng: startLng,
          end_place: busData.endPlace || 'ESEC Campus',
          end_time: formatTimeForDB(busData.collegeTime),
          end_lat: endLat,
          end_lng: endLng,
          is_tracking: false
        })
        .select()
        .maybeSingle();

      if (insErr) {
        console.warn('[useBusData] Direct bus insert error:', insErr.message);
        throw new Error(insErr.message);
      }
      createdBusId = newBus?.id;

      if (createdBusId && stopsPayload.length > 0) {
        try {
          await supabase.from('stops').insert(
            stopsPayload.map((s) => ({
              bus_id: createdBusId,
              stop_name: s.stop_name,
              stop_time: s.stop_time,
              stop_order: s.stop_order,
              latitude: s.latitude,
              longitude: s.longitude
            }))
          );
        } catch (sErr) {
          console.warn('[useBusData] Direct stops insert warning:', sErr);
        }
      }
    }

    await fetchBuses();
    return { id: createdBusId };
  };

  // Update Bus (Admin only)
  const updateBus = async (busId, busData) => {
    const adminToken = await getRequiredAdminToken();
    const routeNo = parseInt(busData.routeNo, 10);
    const startLat = busData.startLat != null ? parseFloat(busData.startLat) : (busData.start_lat != null ? parseFloat(busData.start_lat) : null);
    const startLng = busData.startLng != null ? parseFloat(busData.startLng) : (busData.start_lng != null ? parseFloat(busData.start_lng) : null);
    const endLat = busData.endLat != null ? parseFloat(busData.endLat) : (busData.end_lat != null ? parseFloat(busData.end_lat) : null);
    const endLng = busData.endLng != null ? parseFloat(busData.endLng) : (busData.end_lng != null ? parseFloat(busData.end_lng) : null);

    const stopsPayload = Array.isArray(busData.via) ? busData.via.map((stop, idx) => ({
      stop_name: typeof stop === 'object' ? stop.name : String(stop),
      stop_time: formatTimeForDB(typeof stop === 'object' ? stop.time : ''),
      stop_order: idx + 1,
      latitude: typeof stop === 'object' ? (stop.lat ?? stop.latitude) : null,
      longitude: typeof stop === 'object' ? (stop.lng ?? stop.longitude) : null
    })) : [];

    let rpcSuccess = false;

    // 1. Try admin_save_bus RPC if present
    try {
      const res = await supabase.rpc('admin_save_bus', {
        p_token: adminToken,
        p_bus_id: busId,
        p_bus_number: String(routeNo),
        p_driver_phone: busData.driverPhone || '',
        p_start_place: busData.origin,
        p_start_time: formatTimeForDB(busData.startTime),
        p_start_lat: startLat,
        p_start_lng: startLng,
        p_end_place: busData.endPlace || 'ESEC Campus',
        p_end_time: formatTimeForDB(busData.collegeTime),
        p_end_lat: endLat,
        p_end_lng: endLng,
        p_stops: stopsPayload
      });
      if (!res.error && res.data) {
        rpcSuccess = true;
      }
    } catch (e) {}

    // 2. Direct database update fallback (via public_buses view or buses table)
    if (!rpcSuccess) {
      const updateData = {
        bus_number: String(routeNo),
        start_place: busData.origin,
        start_time: formatTimeForDB(busData.startTime),
        start_lat: startLat,
        start_lng: startLng,
        end_place: busData.endPlace || 'ESEC Campus',
        end_time: formatTimeForDB(busData.collegeTime),
        end_lat: endLat,
        end_lng: endLng
      };

      // Try updating public_buses view first
      let { error: updateErr } = await supabase
        .from('public_buses')
        .update(updateData)
        .eq('id', busId);

      // If view update failed, try direct buses table
      if (updateErr) {
        const directPayload = { ...updateData };
        if (busData.driverPhone) {
          directPayload.driver_phone = busData.driverPhone;
        }
        const { error: directErr } = await supabase
          .from('buses')
          .update(directPayload)
          .eq('id', busId);

        if (directErr) {
          throw new Error(updateErr.message || directErr.message || 'Failed to update bus details.');
        }
      }

      // Update stops
      if (stopsPayload.length > 0) {
        try {
          await supabase.from('stops').delete().eq('bus_id', busId);
          await supabase.from('stops').insert(
            stopsPayload.map((s) => ({
              bus_id: busId,
              stop_name: s.stop_name,
              stop_time: s.stop_time,
              stop_order: s.stop_order,
              latitude: s.latitude,
              longitude: s.longitude
            }))
          );
        } catch (sErr) {
          console.warn('[useBusData] Stops update notice:', sErr);
        }
      }
    }

    await fetchBuses();
    return { id: busId };
  };

  // Delete Bus (Admin only)
  const deleteBus = async (busId) => {
    let delOk = false;
    // 1. Try admin_delete_bus RPC
    try {
      const res = await supabase.rpc('admin_delete_bus', { p_bus_id: busId });
      if (!res.error) delOk = true;
    } catch (e) {}

    // 2. Direct delete fallback
    if (!delOk) {
      try {
        await supabase.from('stops').delete().eq('bus_id', busId);
        await supabase.from('bus_location').delete().eq('bus_id', busId);
      } catch (e) {}
      const { error: dErr } = await supabase.from('buses').delete().eq('id', busId);
      if (dErr && !delOk) throw new Error(dErr.message);
    }

    await fetchBuses();
  };

  // Clear All Buses (Admin only)
  const clearAllBuses = async () => {
    for (const b of buses) {
      try {
        await supabase.rpc('admin_delete_bus', { p_bus_id: b.id });
      } catch (e) {
        try {
          await supabase.from('buses').delete().eq('id', b.id);
        } catch (err) {}
      }
    }
    await AsyncStorage.removeItem(APP_CONFIG.STORAGE_CACHE_KEY);
    setBuses([]);
  };

  return {
    buses,
    loading,
    loaded,
    error,
    refresh: fetchBuses,
    refreshBuses: fetchBuses,
    fetchBuses,
    addBus,
    updateBus,
    deleteBus,
    clearAllBuses
  };
}
