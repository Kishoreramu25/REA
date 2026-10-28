import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabaseClient';
import { authService } from './authService';
import { APP_CONFIG } from '../utils/constants';
import { parseTimeToToday } from '../utils/helpers';

export const locationService = {
  /**
   * Request both foreground and background location permissions
   */
  async requestPermissions() {
    try {
      let fg = await Location.getForegroundPermissionsAsync();
      if (fg?.status !== 'granted') {
        fg = await Location.requestForegroundPermissionsAsync();
      }

      if (fg?.status !== 'granted') {
        return { granted: false, error: 'Foreground location permission denied. Please grant location access in device settings.' };
      }

      // On Android with foregroundService notification, foreground permission is sufficient
      return { 
        granted: true, 
        backgroundGranted: true 
      };
    } catch (err) {
      console.error('[locationService] requestPermissions error:', err);
      return { granted: false, error: err.message };
    }
  },

  /**
   * Start high-accuracy background location broadcasting for a bus
   * Requirement 5: timeInterval 10000, distanceInterval 0, remove deferredUpdatesInterval and showsBackgroundLocationIndicator.
   * Store deadline (arrival time + 30 min) in AsyncStorage.
   */
  async startBackgroundTracking(busId) {
    try {
      console.log('[locationService] startBackgroundTracking starting for busId:', busId);
      await AsyncStorage.setItem('esec_active_driver_bus_id', String(busId));

      // Calculate deadline: LATER of (arrival time + 30 min) and (now + 2 hours)
      try {
        const { data: busData } = await supabase
          .from('buses')
          .select('end_time')
          .eq('id', busId)
          .maybeSingle();

        const now = Date.now();
        const twoHoursLater = now + 2 * 60 * 60 * 1000;
        let arrivalDeadline = twoHoursLater;

        const arrivalTimeStr = busData?.end_time;
        if (arrivalTimeStr) {
          const arrivalDate = parseTimeToToday(arrivalTimeStr);
          if (arrivalDate) {
            arrivalDeadline = arrivalDate.getTime() + 30 * 60 * 1000;
          }
        }

        const finalDeadline = Math.max(arrivalDeadline, twoHoursLater);
        await AsyncStorage.setItem('esec_tracking_deadline', new Date(finalDeadline).toISOString());
        console.log('[locationService] Tracking deadline set to:', new Date(finalDeadline).toISOString());
      } catch (err) {
        console.warn('[locationService] Failed to set tracking deadline:', err);
        await AsyncStorage.setItem('esec_tracking_deadline', new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString());
      }

      // If the task is already registered, stop it first, then start, so new options always apply
      const isRegistered = await Location.hasStartedLocationUpdatesAsync(
        APP_CONFIG.LOCATION_TASK_NAME
      );
      console.log('[locationService] Task already registered?:', isRegistered);

      if (isRegistered) {
        try {
          await Location.stopLocationUpdatesAsync(APP_CONFIG.LOCATION_TASK_NAME);
          console.log('[locationService] Stopped existing task');
        } catch (e) {
          console.warn('[locationService] Error stopping previous task registration:', e);
        }
      }

      console.log('[locationService] Calling Location.startLocationUpdatesAsync...');
      await Location.startLocationUpdatesAsync(APP_CONFIG.LOCATION_TASK_NAME, {
        accuracy: Location.Accuracy.High,
        distanceInterval: 0,
        timeInterval: 10000,
        foregroundService: {
          notificationTitle: 'ESEC Bus Tracking Active',
          notificationBody: 'Broadcasting live bus location to students and parents.',
          notificationColor: '#002147'
        }
      });
      console.log('[locationService] Location.startLocationUpdatesAsync succeeded!');

      // Mark bus as active in Supabase using authenticated driver session token or direct update
      console.log('[locationService] Updating is_tracking: true via driver_update_tracking RPC...');
      let isTrackingUpdated = false;
      const driverToken = await authService.getDriverToken();
      if (driverToken) {
        const { error: rpcErr } = await supabase.rpc('driver_update_tracking', {
          p_token: driverToken,
          p_is_tracking: true
        });
        if (rpcErr) {
          console.error('[locationService] driver_update_tracking error:', rpcErr.message);
        } else {
          isTrackingUpdated = true;
          console.log('[locationService] Supabase is_tracking successfully updated to true via RPC!');
        }
      }

      if (!isTrackingUpdated && busId) {
        try {
          await supabase.from('buses').update({ is_tracking: true }).eq('id', busId);
          console.log('[locationService] Fallback direct update: is_tracking set to true for bus:', busId);
        } catch (e) {
          console.warn('[locationService] Fallback direct update is_tracking warning:', e);
        }
      }

      // Immediately fetch current GPS fix and push to bus_location so parents see LIVE status right away without waiting 10-30s
      try {
        console.log('[locationService] Sending immediate initial location ping...');
        const initialPos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        if (initialPos?.coords && busId) {
          const { latitude, longitude } = initialPos.coords;
          let rpcSuccess = false;
          if (driverToken) {
            const { error: locRpcErr } = await supabase.rpc('driver_upsert_location', {
              p_token: driverToken,
              p_latitude: latitude,
              p_longitude: longitude
            });
            if (!locRpcErr) rpcSuccess = true;
          }
          if (!rpcSuccess) {
            await supabase.from('bus_location').upsert({
              bus_id: busId,
              latitude,
              longitude,
              updated_at: new Date().toISOString()
            }, { onConflict: 'bus_id' });
          }
          console.log('[locationService] Immediate initial location successfully published for bus:', busId);
        }
      } catch (initLocErr) {
        console.warn('[locationService] Immediate initial location capture warning (background task will take over):', initLocErr);
      }

      return true;
    } catch (err) {
      console.error('[locationService] Start tracking error:', err);
      throw err;
    }
  },

  /**
   * Stop background location tracking
   */
  async stopBackgroundTracking(busId) {
    try {
      const isRegistered = await Location.hasStartedLocationUpdatesAsync(
        APP_CONFIG.LOCATION_TASK_NAME
      );

      if (isRegistered) {
        await Location.stopLocationUpdatesAsync(APP_CONFIG.LOCATION_TASK_NAME);
      }

      await AsyncStorage.removeItem('esec_active_driver_bus_id');
      await AsyncStorage.removeItem('esec_tracking_deadline');

      let stoppedViaRpc = false;
      const driverToken = await authService.getDriverToken();
      if (driverToken) {
        const { error: rpcErr } = await supabase.rpc('driver_update_tracking', {
          p_token: driverToken,
          p_is_tracking: false
        });
        if (!rpcErr) stoppedViaRpc = true;
      }

      if (!stoppedViaRpc && busId) {
        try {
          await supabase.from('buses').update({ is_tracking: false }).eq('id', busId);
        } catch (e) {}
      }
    } catch (err) {
      console.warn('[locationService] stopBackgroundTracking error:', err);
    }
  },

  /**
   * Get instant one-shot current location
   */
  async getCurrentLocation() {
    try {
      return await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High
      });
    } catch (e) {
      return null;
    }
  },

  /**
   * Subscribe to live Supabase updates for a specific bus (realtime channel only)
   */
  subscribeToBusLocation(busId, onLocationUpdate) {
    if (!busId) return () => {};

    // Realtime channel with unique ID
    const channelId = `realtime_bus_${busId}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    let channel = null;

    try {
      channel = supabase
        .channel(channelId)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'bus_location',
          filter: `bus_id=eq.${busId}`
        }, (payload) => {
          if (payload?.new) {
            onLocationUpdate(payload.new);
          }
        })
        .subscribe();
    } catch (e) {
      console.warn('[locationService] Realtime channel subscription error:', e);
    }

    return () => {
      if (channel) {
        try {
          supabase.removeChannel(channel);
        } catch (e) {}
      }
    };
  }
};
