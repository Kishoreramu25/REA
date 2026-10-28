import React, { useEffect, useState, useRef, useCallback } from 'react';
import { 
  View, 
  Text, 
  TouchableOpacity, 
  ScrollView, 
  Image, 
  StyleSheet, 
  Linking,
  ActivityIndicator,
  RefreshControl
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ArrowLeft, RotateCw, MapPin, Phone } from 'lucide-react-native';
import BusStatus, { BUS_STATUS_HEADER_HEIGHT } from '../components/BusStatus';
import { useLocation } from '../hooks/useLocation';
import { useBusData } from '../hooks/useBusData';
import { COLORS, APP_CONFIG } from '../utils/constants';
import { 
  getBusStatus, 
  BUS_STATUS, 
  getRouteProgress, 
  formatLastSeen, 
  isBusLate, 
  parseTimeToToday
} from '../utils/helpers';

function formatTime12(d) {
  if (!d || isNaN(new Date(d).getTime())) return '';
  const date = new Date(d);
  let h = date.getHours();
  const m = date.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  const hPad = h < 10 ? `0${h}` : `${h}`;
  const mPad = m < 10 ? `0${m}` : `${m}`;
  return `${hPad}:${mPad} ${ampm}`;
}

export default function BusTracker({ navigation, route }) {
  const passedBus = route.params?.bus || null;
  const { buses = [], refresh: refreshBuses } = useBusData();
  
  // Realtime clock updated every second
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Read live bus by id from useBusData() (use the passed bus until loaded)
  const bus = buses.find((b) => b.id === passedBus?.id) || passedBus;
  const { 
    location, 
    refetch: refetchLocation, 
    fetchFailed, 
    lastOkAt,
    locationLoaded
  } = useLocation(bus?.id);

  // Item 2: Save opened bus id in AsyncStorage key 'esec_my_bus'
  useEffect(() => {
    if (bus?.id) {
      AsyncStorage.setItem('esec_my_bus', String(bus.id)).catch(() => {});
    }
  }, [bus?.id]);

  // Item 1: My stop management
  const [myStopName, setMyStopName] = useState(null);
  const [stopChangedWarning, setStopChangedWarning] = useState(false);

  // Stops list for matching
  const stopsList = [
    { name: bus?.origin || bus?.start_place || 'Start Place', isOrigin: true },
    ...(bus?.via || bus?.stops || []).map((s) => ({
      name: typeof s === 'object' ? (s.name || s.stop_name || 'Stop') : String(s)
    })),
    { name: bus?.endPlace || bus?.end_place || 'ESEC Campus', isTerminal: true }
  ];

  // Load and validate saved stop for this bus
  useEffect(() => {
    if (!bus?.id) return;

    AsyncStorage.getItem('esec_my_stop')
      .then((stored) => {
        if (!stored) {
          setMyStopName(null);
          setStopChangedWarning(false);
          return;
        }

        try {
          const parsed = JSON.parse(stored);
          if (parsed && String(parsed.busId) === String(bus.id)) {
            // Check if stop name still exists in the route
            const match = stopsList.some(
              (s) => !s.isTerminal && s.name.trim().toLowerCase() === parsed.name?.trim().toLowerCase()
            );

            if (match) {
              setMyStopName(parsed.name);
              setStopChangedWarning(false);
            } else {
              // Stop was removed or edited by admin
              AsyncStorage.removeItem('esec_my_stop');
              setMyStopName(null);
              setStopChangedWarning(true);
            }
          } else {
            // My stop belongs to a different bus
            setMyStopName(null);
            setStopChangedWarning(false);
          }
        } catch (e) {
          setMyStopName(null);
        }
      })
      .catch(() => {});
  }, [bus?.id, bus?.via, bus?.stops, bus?.origin, bus?.start_place]);

  const handleToggleMyStop = async (stop) => {
    if (!stop || !stop.name || !bus?.id) return;

    if (myStopName && myStopName.trim().toLowerCase() === stop.name.trim().toLowerCase()) {
      // Tap again clears it
      setMyStopName(null);
      setStopChangedWarning(false);
      await AsyncStorage.removeItem('esec_my_stop');
    } else {
      // Tap sets it
      setMyStopName(stop.name);
      setStopChangedWarning(false);
      await AsyncStorage.setItem('esec_my_stop', JSON.stringify({ busId: bus.id, name: stop.name }));
    }
  };

  // Pull-to-refresh & manual refresh spinner state
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefreshAll = useCallback(async () => {
    setIsRefreshing(true);
    setNow(new Date());
    try {
      if (typeof refreshBuses === 'function') await refreshBuses();
      if (typeof refetchLocation === 'function') await refetchLocation();
    } catch (e) {
      console.warn('Refresh error:', e);
    } finally {
      setIsRefreshing(false);
    }
  }, [refreshBuses, refetchLocation]);

  // Periodic background refresh every 15s
  useEffect(() => {
    if (typeof refreshBuses === 'function') {
      const interval = setInterval(() => {
        refreshBuses();
      }, 15000);
      return () => clearInterval(interval);
    }
  }, [refreshBuses]);

  // Item 5d: Offline with effectiveNow
  const effectiveNow = (fetchFailed && lastOkAt) ? lastOkAt : now;
  const status = getBusStatus(bus, location, effectiveNow);

  // Item 3: Highest nextIdx ref: raise ONLY when status is LIVE or SIGNAL_LOST and progress.phase is 'en_route'. Reset for NOT_STARTED and ENDED.
  const highestNextIdxRef = useRef(0);
  if (status === BUS_STATUS.NOT_STARTED || status === BUS_STATUS.ENDED) {
    highestNextIdxRef.current = 0;
  }

  const minNextIdx = highestNextIdxRef.current;
  const progress = getRouteProgress(bus, location, effectiveNow, minNextIdx);

  if ((status === BUS_STATUS.LIVE || status === BUS_STATUS.SIGNAL_LOST) && progress.ready && progress.phase === 'en_route') {
    if (progress.nextIdx > highestNextIdxRef.current) {
      highestNextIdxRef.current = progress.nextIdx;
    }
  }

  // Auto-scroll to target stop row minus one
  const scrollViewRef = useRef(null);
  const [rowLayouts, setRowLayouts] = useState({});
  const hasAutoScrolledRef = useRef(false);

  const myStopIdx = myStopName 
    ? stopsList.findIndex((s) => s.name.trim().toLowerCase() === myStopName.trim().toLowerCase()) 
    : -1;

  const handleRowLayoutsChange = useCallback((layouts) => {
    setRowLayouts(layouts);
  }, []);

  useEffect(() => {
    if (!hasAutoScrolledRef.current && (status === BUS_STATUS.LIVE || status === BUS_STATUS.SIGNAL_LOST) && progress.ready) {
      const targetIdx = (myStopIdx >= 0 ? Math.min(progress.nextIdx, myStopIdx) : progress.nextIdx);
      const rowIdx = Math.max(0, targetIdx - 1);
      if (rowLayouts[rowIdx]?.y != null) {
        hasAutoScrolledRef.current = true;
        const scrollY = rowLayouts[rowIdx].y + BUS_STATUS_HEADER_HEIGHT;
        scrollViewRef.current?.scrollTo({ y: scrollY, animated: true });
      }
    }
  }, [status, progress.ready, progress.nextIdx, myStopIdx, rowLayouts]);

  useEffect(() => {
    if (hasAutoScrolledRef.current && rowLayouts) {
      const targetIdx = (myStopIdx >= 0 ? Math.min(progress.nextIdx, myStopIdx) : progress.nextIdx);
      const rowIdx = Math.max(0, targetIdx - 1);
      if (rowLayouts[rowIdx]?.y != null) {
        const scrollY = rowLayouts[rowIdx].y + BUS_STATUS_HEADER_HEIGHT;
        scrollViewRef.current?.scrollTo({ y: scrollY, animated: true });
      }
    }
  }, [myStopName]);

  if (!bus) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>No bus selected</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backBtnText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const handleCallOffice = () => {
    Linking.openURL(`tel:${APP_CONFIG.TRANSPORT_OFFICE_PHONE}`);
  };

  const handleOpenMap = () => {
    if (location?.latitude && location?.longitude) {
      Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${location.latitude},${location.longitude}`);
    }
  };

  const isMapEnabled = (status === BUS_STATUS.LIVE || status === BUS_STATUS.SIGNAL_LOST) && 
    location?.latitude != null && location?.longitude != null;

  // Real GPS "Updated Ns ago" = now - location.updated_at
  let updatedText = 'Updated just now';
  if (location?.updated_at) {
    const updatedMs = new Date(location.updated_at).getTime();
    const diffSec = Math.max(0, Math.floor((now.getTime() - updatedMs) / 1000));
    if (diffSec < 60) {
      updatedText = `Updated ${diffSec}s ago`;
    } else {
      updatedText = `Updated ${Math.floor(diffSec / 60)}m ago`;
    }
  }

  // Bottom bar title, sub, color based on requirements
  let bottomStatusTitle = '';
  let bottomStatusSub = '';
  let bottomStatusColor = '#64748b';

  const startTimeStr = bus.startTime || bus.start_time || 'scheduled time';
  const arrivalTimeStr = bus.collegeTime || bus.end_time || 'scheduled arrival';
  const endName = bus.endPlace || bus.end_place || 'ESEC Campus';
  const isTracking = bus.isTracking || bus.is_tracking;

  if (isTracking && !locationLoaded) {
    // Item 1: check first, before the NOT_STARTED, ENDED and SIGNAL_LOST branches
    bottomStatusTitle = 'Checking bus location...';
    bottomStatusSub = 'Connecting to GPS...';
    bottomStatusColor = '#64748b';
  } else if (status === BUS_STATUS.NOT_STARTED) {
    bottomStatusTitle = `Bus not started yet • Starts at ${startTimeStr}`;
    bottomStatusColor = '#64748b';

    if (isBusLate(bus, now)) {
      const startDate = parseTimeToToday(startTimeStr, now);
      const lateMins = startDate ? Math.max(0, Math.floor((now.getTime() - startDate.getTime()) / 60000)) : 0;
      bottomStatusSub = `${lateMins} min late`;
      bottomStatusColor = '#dc2626';
    } else {
      bottomStatusSub = `Scheduled departure at ${startTimeStr}`;
    }
  } else if (status === BUS_STATUS.ENDED) {
    bottomStatusTitle = `Trip ended • Scheduled arrival ${arrivalTimeStr}`;
    bottomStatusSub = 'Trip complete';
    bottomStatusColor = '#64748b';
  } else if (status === BUS_STATUS.SIGNAL_LOST) {
    bottomStatusTitle = formatLastSeen(location?.updated_at);
    bottomStatusSub = `Searching for signal • ${updatedText}`;
    bottomStatusColor = '#d97706';
  } else {
    // LIVE
    const delay = progress.delayMin || 0;
    if (delay < 3) {
      bottomStatusColor = '#16a34a'; // green
    } else if (delay <= 9) {
      bottomStatusColor = '#f59e0b'; // amber
    } else {
      bottomStatusColor = '#dc2626'; // red
    }

    const nextStopName = stopsList[progress.nextIdx]?.name || 'Next Stop';

    // Item 2: Keep off_route, before_start and arrived above the My stop branch
    if (!progress.ready) {
      bottomStatusTitle = 'Bus is live';
      bottomStatusSub = updatedText;
    } else if (progress.phase === 'off_route') {
      bottomStatusTitle = 'Live GPS, off route';
      bottomStatusSub = `No ETA • ${updatedText}`;
      bottomStatusColor = '#d97706';
    } else if (progress.phase === 'before_start') {
      const originName = bus.origin || bus.start_place || 'Origin';
      bottomStatusTitle = `Bus is ${progress.distToNextKm.toFixed(1)} km from ${originName}`;
      bottomStatusSub = `Starting soon • ${updatedText}`;
    } else if (progress.phase === 'arrived') {
      bottomStatusTitle = `Reached ${endName}`;
      bottomStatusSub = `Trip complete • ${updatedText}`;
    } else if (myStopName && myStopIdx !== -1) {
      // With My stop set and phase at_start, show "Reaches {name} in N mins" (progress.etaMin[myStopIdx]), or "Bus is at {name} now" if My stop is the origin.
      if (progress.phase === 'at_start') {
        const isOrigin = myStopIdx === 0;
        if (isOrigin) {
          bottomStatusTitle = `Bus is at ${myStopName} now`;
        } else {
          const etaVal = (progress.etaMin && progress.etaMin[myStopIdx] != null) ? progress.etaMin[myStopIdx] : 0;
          bottomStatusTitle = `Reaches ${myStopName} in ${etaVal} mins`;
        }

        let delayText = 'On time';
        if (progress.delayMin >= 3) delayText = `${progress.delayMin} min late`;
        else if (progress.delayMin <= -3) delayText = `${Math.abs(progress.delayMin)} min early`;
        bottomStatusSub = `${delayText} • ${updatedText}`;
      } else {
        const isMyStopPassed = myStopIdx < progress.nextIdx;
        const isMyStopAtBus = myStopIdx === progress.nextIdx && progress.etaNextMin === 0;

        if (isMyStopPassed) {
          bottomStatusTitle = `Bus has passed ${myStopName}`;
        } else if (isMyStopAtBus) {
          bottomStatusTitle = `Bus is at ${myStopName} now`;
        } else {
          const etaMyStopMin = (progress.etaMin && progress.etaMin[myStopIdx] != null) ? progress.etaMin[myStopIdx] : 0;
          if (etaMyStopMin === 0) {
            bottomStatusTitle = `Bus is at ${myStopName} now`;
          } else {
            bottomStatusTitle = `Reaches ${myStopName} in ${etaMyStopMin} mins`;
          }
        }

        const distToMyStop = progress.distToStopKm ? progress.distToStopKm[myStopIdx] : null;
        if (!isMyStopPassed && distToMyStop != null && distToMyStop > 0) {
          bottomStatusSub = `Bus near ${nextStopName} • ~${distToMyStop.toFixed(1)} km to your stop • ${updatedText}`;
        } else {
          bottomStatusSub = `Bus near ${nextStopName} • ${updatedText}`;
        }
      }
    } else if (progress.phase === 'at_start') {
      // Without My stop, keep "Bus at {origin}"
      const originName = bus.origin || bus.start_place || 'Origin';
      bottomStatusTitle = `Bus at ${originName}`;
      let delayText = 'On time';
      if (progress.delayMin >= 3) delayText = `${progress.delayMin} min late`;
      else if (progress.delayMin <= -3) delayText = `${Math.abs(progress.delayMin)} min early`;
      bottomStatusSub = `${delayText} • ${updatedText}`;
    } else {
      // en_route without My stop
      if (progress.etaNextMin === 0) {
        bottomStatusTitle = `Arriving now at ${nextStopName}`;
      } else if (progress.distToNextKm < 1 && progress.etaNextMin >= 1) {
        bottomStatusTitle = `Bus near ${nextStopName} • ${progress.etaNextMin} min`;
      } else {
        bottomStatusTitle = `Arriving ${nextStopName} in ${progress.etaNextMin} mins`;
      }

      let delayText = 'On time';
      if (progress.delayMin >= 3) {
        delayText = `${progress.delayMin} min late`;
      } else if (progress.delayMin <= -3) {
        delayText = `${Math.abs(progress.delayMin)} min early`;
      }
      bottomStatusSub = `${delayText} • ${updatedText}`;
    }
  }

  const busTitle = `Bus No ${bus.bus_number || bus.routeNo} - ${endName}`;

  return (
    <View style={styles.container}>
      {/* 1. Top Bar: Back | Title | College Logo */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backAction} onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <ArrowLeft size={20} color="#0f172a" />
        </TouchableOpacity>

        <Text style={styles.busTitle} numberOfLines={1}>
          {busTitle}
        </Text>

        <Image source={require('../../assets/logo.png')} style={styles.headerLogo} resizeMode="contain" />
      </View>

      {/* Item 5 & Item 1 Notification Strips under header */}
      {fetchFailed ? (
        <View style={styles.offlineStrip}>
          <Text style={styles.offlineText}>
            {lastOkAt ? `No internet • last update ${formatTime12(lastOkAt)}` : 'No internet'}
          </Text>
        </View>
      ) : stopChangedWarning ? (
        <View style={styles.warningStrip}>
          <Text style={styles.warningText}>
            Your stop was changed. Pick it again.
          </Text>
        </View>
      ) : !myStopName ? (
        <View style={styles.hintStrip}>
          <Text style={styles.hintText}>
            Tap the star next to your stop for your own ETA.
          </Text>
        </View>
      ) : null}

      {/* 2. Route Stops Timeline with Pull-to-Refresh */}
      <ScrollView 
        ref={scrollViewRef}
        style={styles.scrollArea} 
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={handleRefreshAll} colors={[COLORS.primary]} />
        }
      >
        <BusStatus 
          bus={bus} 
          location={location} 
          status={status} 
          progress={progress} 
          now={now} 
          myStopName={myStopName}
          onToggleMyStop={handleToggleMyStop}
          onRowLayoutsChange={handleRowLayoutsChange}
        />
      </ScrollView>

      {/* 3. Sticky Bottom Status Bar (Item 5e: phone, map pin, refresh as three round buttons) */}
      <View style={styles.bottomBar}>
        <View style={styles.bottomStatusCol}>
          <View style={styles.statusTitleRow}>
            <View style={[styles.statusDot, { backgroundColor: bottomStatusColor }]} />
            <Text style={[styles.bottomStatusTitle, { color: bottomStatusColor }]} numberOfLines={1}>
              {bottomStatusTitle}
            </Text>
          </View>
          <Text style={styles.bottomStatusSub} numberOfLines={1}>
            {bottomStatusSub}
          </Text>
        </View>

        <View style={styles.bottomActionsRow}>
          {/* Phone button */}
          <TouchableOpacity 
            style={styles.actionCircleBtn} 
            onPress={handleCallOffice}
            activeOpacity={0.75}
          >
            <Phone size={17} color="#1e293b" strokeWidth={2.2} />
          </TouchableOpacity>

          {/* Map pin button (enabled only for LIVE or SIGNAL_LOST, grey otherwise) */}
          <TouchableOpacity 
            style={[
              styles.actionCircleBtn, 
              !isMapEnabled && styles.disabledActionBtn
            ]} 
            onPress={() => {
              if (isMapEnabled) handleOpenMap();
            }}
            disabled={!isMapEnabled}
            activeOpacity={0.75}
          >
            <MapPin size={17} color={isMapEnabled ? '#1e293b' : '#94a3b8'} strokeWidth={2.2} />
          </TouchableOpacity>

          {/* Refresh button with spinner */}
          <TouchableOpacity 
            style={styles.actionCircleBtn} 
            onPress={handleRefreshAll}
            disabled={isRefreshing}
            activeOpacity={0.75}
          >
            {isRefreshing ? (
              <ActivityIndicator size="small" color="#1e293b" />
            ) : (
              <RotateCw size={17} color="#1e293b" strokeWidth={2.2} />
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff'
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20
  },
  errorText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 12
  },
  backBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: COLORS.primary,
    borderRadius: 6
  },
  backBtnText: {
    color: '#ffffff',
    fontWeight: '700'
  },
  header: {
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 16,
    paddingTop: 44,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    elevation: 2,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2
  },
  backAction: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f1f5f9'
  },
  busTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '800',
    color: '#0f172a',
    marginHorizontal: 12,
    textAlign: 'left'
  },
  headerLogo: {
    width: 38,
    height: 38
  },
  offlineStrip: {
    backgroundColor: '#f1f5f9',
    borderBottomWidth: 1,
    borderColor: '#e2e8f0',
    paddingVertical: 6,
    paddingHorizontal: 14,
    alignItems: 'center'
  },
  offlineText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b'
  },
  warningStrip: {
    backgroundColor: '#fef2f2',
    borderBottomWidth: 1,
    borderColor: '#fecaca',
    paddingVertical: 6,
    paddingHorizontal: 14,
    alignItems: 'center'
  },
  warningText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#dc2626'
  },
  hintStrip: {
    backgroundColor: '#f8fafc',
    borderBottomWidth: 1,
    borderColor: '#f1f5f9',
    paddingVertical: 6,
    paddingHorizontal: 14,
    alignItems: 'center'
  },
  hintText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#64748b'
  },
  scrollArea: {
    flex: 1,
    backgroundColor: '#ffffff'
  },
  scrollContent: {
    paddingBottom: 120
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    elevation: 8,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.08,
    shadowRadius: 4
  },
  bottomStatusCol: {
    flex: 1,
    marginRight: 12
  },
  statusTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4
  },
  bottomStatusTitle: {
    fontSize: 15,
    fontWeight: '800',
    flexShrink: 1
  },
  bottomStatusSub: {
    fontSize: 12,
    fontWeight: '500',
    color: '#64748b',
    marginLeft: 14
  },
  bottomActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  actionCircleBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0'
  },
  disabledActionBtn: {
    opacity: 0.4,
    backgroundColor: '#f8fafc',
    borderColor: '#e2e8f0'
  }
});
