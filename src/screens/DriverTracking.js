import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  TouchableOpacity, 
  ScrollView, 
  StyleSheet, 
  Image, 
  Alert, 
  Linking 
} from 'react-native';
import { 
  Play, 
  Square, 
  PhoneCall, 
  LogOut, 
  ShieldCheck, 
  MapPin, 
  Clock,
  Radio,
  X
} from 'lucide-react-native';
import LocationDisplay from '../components/LocationDisplay';
import { useAuth } from '../context/AuthContext';
import { useLocation } from '../hooks/useLocation';
import { useBusData } from '../hooks/useBusData';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS, APP_CONFIG } from '../utils/constants';

export default function DriverTracking({ navigation }) {
  const { session, logout } = useAuth();
  const { buses = [] } = useBusData();

  // Requirement 9: Load bus fresh by id from useBusData (remove fallback bus 45) so admin edits show
  const bus = buses.find((b) => b.id === session?.bus?.id) || session?.bus;

  const { location, isTracking, startTracking, stopTracking } = useLocation(bus?.id);
  const [activeTrip, setActiveTrip] = useState(false);

  // Requirement 9: On mount and every 15 s re-check Location.hasStartedLocationUpdatesAsync and update activeTrip, so an auto-stop shows
  useEffect(() => {
    let isMounted = true;
    const checkTrackingStatus = async () => {
      try {
        const hasStarted = await Location.hasStartedLocationUpdatesAsync(APP_CONFIG.LOCATION_TASK_NAME);
        const deadlineStr = await AsyncStorage.getItem('esec_tracking_deadline');
        const storedBusId = await AsyncStorage.getItem('esec_active_driver_bus_id');

        const isDeadlineInFuture = Boolean(
          deadlineStr && 
          !isNaN(new Date(deadlineStr).getTime()) && 
          new Date(deadlineStr).getTime() > Date.now()
        );
        const isBusMatch = Boolean(
          storedBusId && 
          bus?.id && 
          parseInt(storedBusId, 10) === bus.id
        );

        const isActive = Boolean(hasStarted || (isDeadlineInFuture && isBusMatch));
        if (isMounted) {
          setActiveTrip(isActive);
        }
      } catch (err) {
        console.warn('[DriverTracking] Check tracking task error:', err);
      }
    };

    checkTrackingStatus();
    const interval = setInterval(checkTrackingStatus, 15000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [bus?.id]);

  // Action 1: Share location (Start broadcasting live GPS)
  const handleShareLocation = async () => {
    console.log('[DriverTracking] handleShareLocation CLICKED! bus:', JSON.stringify(bus));
    if (!bus?.id) {
      console.warn('[DriverTracking] bus?.id is missing!', bus, session);
      Alert.alert('Bus Information Missing', 'Cannot share location because the bus ID is missing. Please log out and log in again.');
      return;
    }
    try {
      console.log('[DriverTracking] Calling startTracking with bus.id:', bus.id);
      await startTracking(bus.id);
      console.log('[DriverTracking] startTracking finished successfully!');
      setActiveTrip(true);
      Alert.alert('Sharing Live Location', `Broadcasting live GPS for Bus No ${bus.bus_number || bus.routeNo}. Students and parents can now view your real-time position.`);
    } catch (err) {
      console.error('[DriverTracking] handleShareLocation error caught:', err);
      Alert.alert('Location Error', err?.message || 'Could not start background tracking');
    }
  };

  // Action 2: Stop sharing location (Stop broadcasting GPS)
  const handleStopSharing = async () => {
    if (!bus?.id) return;
    try {
      await stopTracking(bus.id);
      setActiveTrip(false);
      Alert.alert('Stopped Sharing', 'Live location broadcast has been stopped.');
    } catch (err) {
      Alert.alert('Location Error', err.message || 'Could not stop background tracking');
    }
  };

  // Action 3: Close portal (Navigate to ParentHome)
  const handleClose = () => {
    if (activeTrip && bus?.id) {
      Alert.alert(
        'Sharing Location Active',
        'Your bus location is currently being shared with parents. Choose an option:',
        [
          { text: 'Keep Sharing & Close', onPress: () => navigation.navigate('ParentHome') },
          { 
            text: 'Stop Sharing & Close', 
            style: 'destructive',
            onPress: async () => {
              await stopTracking(bus.id);
              setActiveTrip(false);
              navigation.navigate('ParentHome');
            }
          },
          { text: 'Cancel', style: 'cancel' }
        ]
      );
    } else {
      navigation.navigate('ParentHome');
    }
  };

  // Action 4: Logout (Requirement 3: offer Cancel / "Logout & keep sharing" / "Stop sharing & logout")
  const handleLogout = async () => {
    if (activeTrip && bus?.id) {
      Alert.alert(
        'Active Location Broadcast',
        'A trip is currently active. Choose how you would like to proceed:',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Logout & keep sharing',
            onPress: async () => {
              await logout(true);
              navigation.replace('ParentHome');
            }
          },
          { 
            text: 'Stop sharing & logout', 
            style: 'destructive',
            onPress: async () => {
              await stopTracking(bus.id);
              setActiveTrip(false);
              await logout(false);
              navigation.replace('ParentHome');
            }
          }
        ]
      );
      return;
    }

    Alert.alert(
      'Log Out of Driver Shift',
      'Are you sure you want to log out of your driver shift?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Log Out', 
          style: 'destructive',
          onPress: async () => {
            await logout(false);
            navigation.replace('ParentHome');
          }
        }
      ]
    );
  };

  const callTransportOffice = () => {
    Linking.openURL(`tel:${APP_CONFIG.TRANSPORT_OFFICE_PHONE}`);
  };

  if (!bus) {
    return (
      <View style={styles.container}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => navigation.navigate('ParentHome')}>
            <X size={18} color="#475569" />
          </TouchableOpacity>
        </View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: COLORS.text, marginBottom: 12 }}>No Bus Assigned</Text>
          <TouchableOpacity style={{ padding: 12, backgroundColor: COLORS.primary }} onPress={handleLogout}>
            <Text style={{ color: '#fff', fontWeight: '700' }}>Logout</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.topBar}>
        <View style={styles.brandRow}>
          <Image source={require('../../assets/logo.png')} style={styles.logo} resizeMode="contain" />
          <View>
            <Text style={styles.pageTitle}>Driver Shift Portal</Text>
            <Text style={styles.badgeText}>Bus No {bus.bus_number}</Text>
          </View>
        </View>

        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.headerCloseBtn} onPress={handleClose} activeOpacity={0.7}>
            <X size={18} color="#475569" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.7}>
            <LogOut size={16} color="#dc2626" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Live Location Display Widget with Clock & Delay info */}
        <LocationDisplay
          isTracking={activeTrip || isTracking}
          location={location}
          busName={`Bus No ${bus.bus_number}`}
          origin={bus.start_place}
          endPlace={bus.end_place || 'ESEC Campus'}
          startTime={bus.start_time || bus.startTime || ''}
          collegeTime={bus.end_time || bus.collegeTime || ''}
          stops={bus.stops || []}
        />

        {/* Dedicated Driver Actions Control Panel (Change 2) */}
        <View style={styles.actionPanel}>
          <Text style={styles.panelTitle}>Driver Shift Controls</Text>

          {/* Row 1: Share Location & Stop Sharing Location */}
          <View style={styles.actionRow}>
            {/* Share Location Button */}
            <TouchableOpacity
              style={[
                styles.actionBtn,
                styles.shareBtn,
                activeTrip && styles.shareBtnActive
              ]}
              onPress={handleShareLocation}
              disabled={activeTrip}
              activeOpacity={0.8}
            >
              <Radio size={16} color="#ffffff" />
              <Text style={styles.actionBtnText}>
                {activeTrip ? 'Sharing Active' : 'Share Location'}
              </Text>
            </TouchableOpacity>

            {/* Stop Sharing Location Button */}
            <TouchableOpacity
              style={[
                styles.actionBtn,
                styles.stopBtn,
                !activeTrip && styles.btnDisabled
              ]}
              onPress={handleStopSharing}
              disabled={!activeTrip}
              activeOpacity={0.8}
            >
              <Square size={14} color="#ffffff" />
              <Text style={styles.actionBtnText}>Stop Sharing Location</Text>
            </TouchableOpacity>
          </View>

          {/* Row 2: Close and Logout Buttons */}
          <View style={styles.actionRow}>
            {/* Close Button */}
            <TouchableOpacity
              style={[styles.actionBtn, styles.closeBtn]}
              onPress={handleClose}
              activeOpacity={0.7}
            >
              <X size={16} color="#1e293b" />
              <Text style={styles.closeBtnText}>Close</Text>
            </TouchableOpacity>

            {/* Logout Button (Requested specifically) */}
            <TouchableOpacity
              style={[styles.actionBtn, styles.logoutActionBtn]}
              onPress={handleLogout}
              activeOpacity={0.7}
            >
              <LogOut size={16} color="#dc2626" />
              <Text style={styles.logoutActionText}>Logout</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Route Details Card */}
        <View style={styles.detailsCard}>
          <Text style={styles.cardHeader}>Shift Route Overview</Text>

          <View style={styles.detailRow}>
            <MapPin size={14} color={COLORS.accent} />
            <Text style={styles.detailLabel}>Start Terminal:</Text>
            <Text style={styles.detailValue}>{bus.start_place}</Text>
          </View>

          <View style={styles.detailRow}>
            <Clock size={14} color={COLORS.accent} />
            <Text style={styles.detailLabel}>Scheduled Departure:</Text>
            <Text style={styles.detailValue}>{bus.start_time || bus.startTime || '--:--'}</Text>
          </View>

          <View style={styles.detailRow}>
            <MapPin size={14} color={COLORS.success} />
            <Text style={styles.detailLabel}>Final Destination:</Text>
            <Text style={styles.detailValue}>{bus.end_place || 'ESEC Campus'}</Text>
          </View>

          <View style={styles.detailRow}>
            <Clock size={14} color={COLORS.success} />
            <Text style={styles.detailLabel}>Scheduled Arrival:</Text>
            <Text style={styles.detailValue}>{bus.end_time || bus.collegeTime || '--:--'}</Text>
          </View>
        </View>

        {/* Background Service Assurance Notice */}
        <View style={styles.assuranceBox}>
          <ShieldCheck size={18} color={COLORS.accent} />
          <View style={{ flex: 1 }}>
            <Text style={styles.assuranceTitle}>Background Geolocation Enabled</Text>
            <Text style={styles.assuranceText}>
              GPS continues broadcasting even if you lock your phone or switch apps during your shift.
            </Text>
          </View>
        </View>

        {/* Emergency Call Transport Office */}
        <TouchableOpacity style={styles.emergencyBtn} onPress={callTransportOffice}>
          <PhoneCall size={16} color="#ffffff" />
          <Text style={styles.emergencyBtnText}>Emergency Call Transport Office</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background
  },
  topBar: {
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 16,
    paddingTop: 44,
    paddingBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  logo: {
    width: 32,
    height: 32
  },
  pageTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: COLORS.text
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.accent
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  headerCloseBtn: {
    padding: 7,
    borderWidth: 1,
    borderColor: COLORS.borderDark,
    backgroundColor: '#f8fafc',
    borderRadius: 6
  },
  logoutBtn: {
    padding: 7,
    borderWidth: 1,
    borderColor: '#fecaca',
    backgroundColor: '#fef2f2',
    borderRadius: 6
  },
  content: {
    padding: 16
  },
  actionPanel: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    marginBottom: 12
  },
  panelTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.text,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10
  },
  actionBtn: {
    flex: 1,
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 8
  },
  shareBtn: {
    backgroundColor: '#16a34a'
  },
  shareBtnActive: {
    backgroundColor: '#059669'
  },
  stopBtn: {
    backgroundColor: '#dc2626'
  },
  closeBtn: {
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5e1'
  },
  closeBtnText: {
    color: '#1e293b',
    fontSize: 13,
    fontWeight: '800'
  },
  logoutActionBtn: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fca5a5'
  },
  logoutActionText: {
    color: '#b91c1c',
    fontSize: 13,
    fontWeight: '800'
  },
  actionBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800'
  },
  btnDisabled: {
    backgroundColor: '#94a3b8',
    opacity: 0.6
  },
  detailsCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    marginBottom: 12
  },
  cardHeader: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.text,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8
  },
  detailLabel: {
    fontSize: 12,
    color: COLORS.textSecondary
  },
  detailValue: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.text
  },
  assuranceBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: COLORS.accentLight,
    borderWidth: 1,
    borderColor: '#bae6fd',
    padding: 12,
    marginBottom: 16
  },
  assuranceTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.accent
  },
  assuranceText: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 2,
    lineHeight: 15
  },
  emergencyBtn: {
    backgroundColor: COLORS.primaryDark,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 44
  },
  emergencyBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 12
  }
});
