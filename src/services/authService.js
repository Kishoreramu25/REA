import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { supabase } from './supabaseClient';
import { mapBus } from '../utils/helpers';

const USER_SESSION_KEY = 'esec_user_session';
const DRIVER_TOKEN_SECURE_KEY = 'esec_driver_session_token';
const ADMIN_TOKEN_SECURE_KEY = 'esec_admin_session_token';

export const authService = {
  /**
   * Driver Login via verify_pin_login RPC.
   * Returns a 32-byte cryptographically random token stored in sessions table.
   * Persists token into expo-secure-store so background GPS continues after logout.
   */
  async driverLogin(busNumber, pin) {
    const cleanBus = String(busNumber || '').trim();
    const cleanPin = String(pin || '').trim();

    if (!cleanBus) throw new Error('Please enter the bus number.');
    if (!cleanPin || cleanPin.length !== 6) throw new Error('Driver PIN must be exactly 6 digits.');

    const { data, error } = await supabase.rpc('verify_pin_login', {
      p_bus_number: cleanBus,
      p_pin: cleanPin
    });

    if (error) throw new Error(error.message);
    if (!data || !data.success) {
      if (data?.locked) {
        throw new Error(data.error || 'Account locked for 15 minutes due to 5 failed attempts.');
      }
      throw new Error(data?.error || 'Invalid Driver PIN.');
    }

    // Securely persist raw token in both SecureStore and AsyncStorage for maximum reliability
    try {
      await SecureStore.setItemAsync(DRIVER_TOKEN_SECURE_KEY, data.token);
    } catch (e) {
      console.warn('[authService] SecureStore setItemAsync warning:', e);
    }
    try {
      await AsyncStorage.setItem(DRIVER_TOKEN_SECURE_KEY, data.token);
    } catch (e) {}

    // Fetch full bus details including stops
    let busDetails = null;
    if (data.bus_id) {
      try {
        const { data: bData } = await supabase
          .from('public_buses')
          .select('*, stops(*)')
          .eq('id', data.bus_id)
          .maybeSingle();
        if (bData) busDetails = mapBus(bData);
      } catch (e) {}
    }

    const session = {
      role: 'driver',
      token: data.token,
      bus_id: data.bus_id,
      bus_number: data.bus_number,
      bus: busDetails,
      name: `Driver (Bus ${data.bus_number})`,
      expiresAt: data.expires_at ? new Date(data.expires_at).getTime() : Date.now() + 12 * 3600 * 1000
    };

    await AsyncStorage.setItem(USER_SESSION_KEY, JSON.stringify(session));
    return session;
  },

  /**
   * Admin Login via admin_login RPC using a secure passphrase.
   */
  async adminLogin(passphrase) {
    const cleanPass = String(passphrase || '').trim();
    if (!cleanPass) throw new Error('Please enter the admin passphrase.');

    const { data, error } = await supabase.rpc('admin_login', {
      p_passphrase: cleanPass
    });

    if (error) throw new Error(error.message);
    if (!data || !data.success) {
      if (data?.locked) {
        throw new Error(data.error || 'Account locked for 15 minutes due to 5 failed attempts.');
      }
      throw new Error(data?.error || 'Invalid admin credentials.');
    }

    if (data.token) {
      try {
        await SecureStore.setItemAsync(ADMIN_TOKEN_SECURE_KEY, data.token);
      } catch (e) {
        console.warn('[authService] SecureStore setItemAsync warning:', e);
      }
      try {
        await AsyncStorage.setItem(ADMIN_TOKEN_SECURE_KEY, data.token);
      } catch (e) {}
    }

    const session = {
      role: 'admin',
      token: data.token,
      passphrase: cleanPass,
      name: data.name || 'Transport Administrator',
      college: data.college || 'ESEC',
      expiresAt: data.expires_at ? new Date(data.expires_at).getTime() : Date.now() + 3600 * 1000
    };

    await AsyncStorage.setItem(USER_SESSION_KEY, JSON.stringify(session));
    return session;
  },

  /**
   * Unified verifyPin for 6-digit keypad login.
   * Tries admin credentials, active bus, bus 1, or public_buses.
   */
  async verifyPin(input, optBusNumber = null) {
    const clean = String(input || '').trim();
    if (!clean) throw new Error('Please enter access PIN or passphrase.');

    // 1. Direct call to unified verify_pin_login RPC
    try {
      const { data, error } = await supabase.rpc('verify_pin_login', {
        p_pin: clean
      });

      if (!error && data && data.success) {
        if (data.role === 'admin') {
          const adminToken = data.token || `admin_token_${Date.now()}`;
          try {
            await SecureStore.setItemAsync(ADMIN_TOKEN_SECURE_KEY, adminToken);
          } catch (e) {}
          try {
            await AsyncStorage.setItem(ADMIN_TOKEN_SECURE_KEY, adminToken);
          } catch (e) {}
          const session = {
            role: 'admin',
            token: adminToken,
            passphrase: clean,
            name: data.name || 'Transport Administrator',
            college: data.college || 'ESEC',
            expiresAt: data.expires_at ? new Date(data.expires_at).getTime() : Date.now() + 24 * 3600 * 1000
          };
          await AsyncStorage.setItem(USER_SESSION_KEY, JSON.stringify(session));
          return session;
        }

        if (data.role === 'driver') {
          let busDetails = null;
          if (data.bus_id) {
            try {
              const { data: bData } = await supabase
                .from('public_buses')
                .select('*, stops(*)')
                .eq('id', data.bus_id)
                .maybeSingle();
              if (bData) busDetails = mapBus(bData);
            } catch (e) {}
          }

          const driverToken = data.token || `driver_token_${data.bus_id || '1'}_${Date.now()}`;
          try {
            await SecureStore.setItemAsync(DRIVER_TOKEN_SECURE_KEY, driverToken);
          } catch (e) {}
          try {
            await AsyncStorage.setItem(DRIVER_TOKEN_SECURE_KEY, driverToken);
          } catch (e) {}

          const session = {
            role: 'driver',
            token: driverToken,
            bus_id: data.bus_id,
            bus_number: data.bus_number,
            bus: busDetails,
            name: data.name || `Driver (Bus ${data.bus_number})`,
            expiresAt: data.expires_at ? new Date(data.expires_at).getTime() : Date.now() + 24 * 3600 * 1000
          };
          await AsyncStorage.setItem(USER_SESSION_KEY, JSON.stringify(session));
          return session;
        }
      }
    } catch (rpcErr) {
      if (rpcErr?.message?.includes('locked')) throw rpcErr;
    }

    // 2. Try admin login RPC if separate
    try {
      const adminSession = await this.adminLogin(clean);
      if (adminSession?.role === 'admin') return adminSession;
    } catch (adminErr) {
      if (adminErr?.message?.includes('locked')) throw adminErr;
    }

    // 3. Fallback to driver login with bus number
    if (optBusNumber) {
      return await this.driverLogin(optBusNumber, clean);
    }

    throw new Error('Invalid PIN. Check your Driver PIN or Admin password.');
  },

  /**
   * Retrieves the driver session token from SecureStore or AsyncStorage fallback.
   */
  async getDriverToken() {
    try {
      const sec = await SecureStore.getItemAsync(DRIVER_TOKEN_SECURE_KEY);
      if (sec) return sec;
    } catch (e) {}

    try {
      const fallback = await AsyncStorage.getItem(DRIVER_TOKEN_SECURE_KEY);
      if (fallback) return fallback;
    } catch (e) {}

    try {
      const sessionStr = await AsyncStorage.getItem(USER_SESSION_KEY);
      if (sessionStr) {
        const s = JSON.parse(sessionStr);
        if (s?.role === 'driver' && s?.token) return s.token;
      }
    } catch (e) {}

    return null;
  },

  /**
   * Retrieves the admin session token from SecureStore or AsyncStorage fallback.
   */
  async getAdminToken() {
    try {
      const sec = await SecureStore.getItemAsync(ADMIN_TOKEN_SECURE_KEY);
      if (sec) return sec;
    } catch (e) {}

    try {
      const fallback = await AsyncStorage.getItem(ADMIN_TOKEN_SECURE_KEY);
      if (fallback) return fallback;
    } catch (e) {}

    try {
      const sessionStr = await AsyncStorage.getItem(USER_SESSION_KEY);
      if (sessionStr) {
        const session = JSON.parse(sessionStr);
        if (session?.role === 'admin' && session?.token) return session.token;
      }
    } catch (e) {}

    return null;
  },

  /**
   * Restores stored session for UI state.
   */
  async getStoredSession() {
    try {
      const str = await AsyncStorage.getItem(USER_SESSION_KEY);
      return str ? JSON.parse(str) : null;
    } catch (e) {
      return null;
    }
  },

  /**
   * Logout user.
   */
  async logout(keepSharing = false) {
    await AsyncStorage.removeItem(USER_SESSION_KEY);
    try {
      await AsyncStorage.removeItem(ADMIN_TOKEN_SECURE_KEY);
    } catch (e) {}
    if (!keepSharing) {
      try {
        await SecureStore.deleteItemAsync(DRIVER_TOKEN_SECURE_KEY);
      } catch (e) {}
      try {
        await SecureStore.deleteItemAsync(ADMIN_TOKEN_SECURE_KEY);
      } catch (e) {}
      try {
        await AsyncStorage.removeItem(DRIVER_TOKEN_SECURE_KEY);
      } catch (e) {}
    }
  }
};