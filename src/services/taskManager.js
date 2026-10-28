import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabaseClient';
import { authService } from './authService';
import { APP_CONFIG } from '../utils/constants';

// Register background task safely at module evaluation level
try {
  if (TaskManager && typeof TaskManager.defineTask === 'function') {
    TaskManager.defineTask(APP_CONFIG.LOCATION_TASK_NAME, async ({ data, error }) => {
      if (error) {
        console.warn('[TaskManager] Background tracking error:', error.message);
        return;
      }

      try {
        // Retrieve driver token from expo-secure-store (persists across app exit/logout)
        const driverToken = await authService.getDriverToken();
        const activeBusIdStr = await AsyncStorage.getItem('esec_active_driver_bus_id');
        const activeBusId = activeBusIdStr ? parseInt(activeBusIdStr, 10) : null;

        if (!driverToken && !activeBusId) {
          console.warn('[TaskManager] No authenticated driver session token or bus ID available. Skipping update.');
          return;
        }

        // Check if past deadline (arrival time + 30 min)
        const deadlineStr = await AsyncStorage.getItem('esec_tracking_deadline');
        if (deadlineStr) {
          const deadlineTime = new Date(deadlineStr).getTime();
          if (Date.now() > deadlineTime) {
            console.log('[TaskManager] Tracking deadline exceeded. Terminating background task.');
            const isRegistered = await Location.hasStartedLocationUpdatesAsync(APP_CONFIG.LOCATION_TASK_NAME);
            if (isRegistered) {
              await Location.stopLocationUpdatesAsync(APP_CONFIG.LOCATION_TASK_NAME);
            }
            await AsyncStorage.removeItem('esec_active_driver_bus_id');
            await AsyncStorage.removeItem('esec_tracking_deadline');

            // Turn off tracking status using the authenticated token or direct update
            if (driverToken) {
              await supabase.rpc('driver_update_tracking', {
                p_token: driverToken,
                p_is_tracking: false
              });
            }
            if (activeBusId) {
              await supabase.from('buses').update({ is_tracking: false }).eq('id', activeBusId);
            }
            return;
          }
        }

        // Process location update
        if (data && data.locations && data.locations.length > 0) {
          const latestLocation = data.locations[data.locations.length - 1];
          const { latitude, longitude } = latestLocation.coords;

          let locationSaved = false;
          // Try privileged RPC first
          if (driverToken) {
            const { data: rpcRes, error: rpcErr } = await supabase.rpc('driver_upsert_location', {
              p_token: driverToken,
              p_latitude: latitude,
              p_longitude: longitude
            });

            if (rpcErr) {
              console.warn('[TaskManager] driver_upsert_location RPC error, falling back to direct update:', rpcErr.message);
            } else {
              locationSaved = true;
              console.log('[TaskManager] Location updated via RPC for bus:', rpcRes?.bus_id);
            }
          }

          // Fallback direct upsert to bus_location
          if (!locationSaved && activeBusId) {
            const { error: directErr } = await supabase.from('bus_location').upsert({
              bus_id: activeBusId,
              latitude,
              longitude,
              updated_at: new Date().toISOString()
            }, { onConflict: 'bus_id' });

            if (directErr) {
              console.error('[TaskManager] Direct bus_location upsert error:', directErr.message);
            } else {
              console.log('[TaskManager] Direct location updated in Supabase for bus:', activeBusId);
            }
          }
        }
      } catch (err) {
        console.error('[TaskManager] Unexpected error in location task:', err);
      }
    });
  }
} catch (e) {
  console.warn('[TaskManager] Task registration skipped on this platform:', e);
}
