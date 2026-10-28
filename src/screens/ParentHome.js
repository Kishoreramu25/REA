import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  View, 
  Text, 
  TouchableOpacity, 
  TextInput, 
  Image, 
  ScrollView, 
  StyleSheet, 
  ActivityIndicator,
  TouchableWithoutFeedback,
  Keyboard,
  Platform
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { ChevronDown, ChevronUp, Search } from 'lucide-react-native';
import { useBusData } from '../hooks/useBusData';
import { useAuth } from '../context/AuthContext';

// Module-level flag for cold start auto-navigation only once per app launch
let hasAutoNavigatedColdStart = false;

export default function ParentHome({ navigation }) {
  const { buses = [], loading = false, loaded = false, refresh } = useBusData();
  const { role, isLoading: authLoading } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBus, setSelectedBus] = useState(null);
  const [savedBusId, setSavedBusId] = useState(null);
  const [savedBus, setSavedBus] = useState(null);

  // Hidden 7-tap trigger on the college logo
  const tapCountRef = useRef(0);
  const lastTapRef = useRef(0);

  const isFirstFocusRef = useRef(true);
  useFocusEffect(
    useCallback(() => {
      // Reload saved bus ID on focus
      AsyncStorage.getItem('esec_my_bus').then((id) => {
        if (id) setSavedBusId(id);
      }).catch(() => {});

      if (isFirstFocusRef.current) {
        isFirstFocusRef.current = false;
        return;
      }
      if (typeof refresh === 'function') {
        refresh();
      }
    }, [refresh])
  );

  // Set hasAutoNavigatedColdStart = true when role is admin or driver
  useEffect(() => {
    if (!authLoading && (role === 'admin' || role === 'driver')) {
      hasAutoNavigatedColdStart = true;
    }
  }, [authLoading, role]);

  // Load saved bus id from AsyncStorage on mount
  useEffect(() => {
    AsyncStorage.getItem('esec_my_bus')
      .then((id) => {
        if (id) setSavedBusId(id);
      })
      .catch(() => {});
  }, []);

  // Handle saved bus finding, auto-navigation on cold start, and stale bus removal
  useEffect(() => {
    if (!savedBusId) {
      setSavedBus(null);
      return;
    }

    if (loaded && (!buses || buses.length === 0)) {
      setSavedBus(null);
      setSavedBusId(null);
      AsyncStorage.removeItem('esec_my_bus').catch(() => {});
      AsyncStorage.removeItem('esec_my_stop').catch(() => {});
      return;
    }

    if (!buses || buses.length === 0) return;

    const found = buses.find((b) => String(b.id) === String(savedBusId));
    if (found) {
      setSavedBus(found);

      // Auto-open BusTracker for the saved bus on cold start only (skip until authLoading is false; set flag true if admin or driver)
      if (!hasAutoNavigatedColdStart && !authLoading) {
        if (role === 'admin' || role === 'driver') {
          hasAutoNavigatedColdStart = true;
        } else {
          hasAutoNavigatedColdStart = true;
          navigation.navigate('BusTracker', { bus: found });
        }
      }
    } else if (loaded) {
      // Clear esec_my_bus and esec_my_stop only when loaded is true and the saved bus is missing from buses
      AsyncStorage.removeItem('esec_my_bus').catch(() => {});
      AsyncStorage.removeItem('esec_my_stop').catch(() => {});
      setSavedBus(null);
      setSavedBusId(null);
    }
  }, [buses, savedBusId, loaded, role, authLoading, navigation]);

  const handleLogoTap = () => {
    const now = Date.now();
    if (now - lastTapRef.current > 3000) {
      tapCountRef.current = 0;
    }
    lastTapRef.current = now;
    tapCountRef.current += 1;

    if (tapCountRef.current >= 7) {
      tapCountRef.current = 0;
      navigation.navigate('Login');
    }
  };

  const handleFooterLongPress = () => {
    navigation.navigate('Login');
  };

  // Search also matches stop names
  const filteredBuses = (buses || []).filter((bus) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    const routeNo = String(bus.bus_number || bus.routeNo || '').toLowerCase();
    const origin = String(bus.start_place || bus.origin || '').toLowerCase();
    const endPlace = String(bus.end_place || bus.endPlace || '').toLowerCase();
    const name = String(bus.name || '').toLowerCase();

    if (routeNo.includes(q) || origin.includes(q) || endPlace.includes(q) || name.includes(q)) {
      return true;
    }

    // Match middle stop names
    const stops = bus.via || bus.stops || [];
    return stops.some((s) => {
      const sName = typeof s === 'object' ? (s.name || s.stop_name || '') : String(s);
      return sName.toLowerCase().includes(q);
    });
  });

  const handleSelectBus = (bus) => {
    setSelectedBus(bus);
    setSavedBus(bus);
    setSavedBusId(String(bus.id));
    setIsOpen(false);
    AsyncStorage.setItem('esec_my_bus', String(bus.id)).catch(() => {});
    navigation.navigate('BusTracker', { bus });
  };

  return (
    <TouchableWithoutFeedback 
      onPress={() => {
        Keyboard.dismiss();
        if (isOpen) setIsOpen(false);
      }}
    >
      <View style={styles.container}>

        {/* Main Center Content */}
        <View style={styles.contentWrapper}>
          {/* Logo & College Heading */}
          <View style={styles.headerBlock}>
            <TouchableOpacity 
              activeOpacity={1} 
              onPress={handleLogoTap}
              style={styles.logoTouchable}
            >
              <Image
                source={require('../../assets/logo.png')}
                style={styles.logo}
                resizeMode="contain"
              />
            </TouchableOpacity>

            <Text style={styles.collegeName}>ERODE SENGUNTHAR</Text>
            <Text style={styles.collegeSub}>ENGINEERING COLLEGE</Text>
          </View>

          {/* If saved bus exists, show minimal My Bus card with 'Open My Bus'; otherwise show Dropdown */}
          {savedBus && !isOpen ? (
            <View style={styles.myBusCard}>
              <View style={styles.myBusHeaderRow}>
                <Text style={styles.myBusBadgeText}>MY BUS</Text>
                <TouchableOpacity onPress={() => setIsOpen(true)} activeOpacity={0.7}>
                  <Text style={styles.changeBusLink}>Change bus</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.myBusTitle}>
                Bus {savedBus.bus_number || savedBus.routeNo}
              </Text>
              <Text style={styles.myBusRoute} numberOfLines={1}>
                {savedBus.start_place || savedBus.origin} ➔ {savedBus.end_place || 'ESEC Campus'}
              </Text>
              <Text style={styles.myBusTime}>
                Starts at {savedBus.startTime || savedBus.start_time || 'Scheduled'}
              </Text>

              <TouchableOpacity 
                style={styles.openMyBusBtn} 
                onPress={() => navigation.navigate('BusTracker', { bus: savedBus })}
                activeOpacity={0.8}
              >
                <Text style={styles.openMyBusBtnText}>Open My Bus</Text>
              </TouchableOpacity>
            </View>
          ) : (
            /* Bus Dropdown Container */
            <View style={styles.dropdownSection}>
              {/* Dropdown Header Trigger */}
              <TouchableOpacity
                style={[
                  styles.dropdownTrigger,
                  isOpen && styles.dropdownTriggerActive
                ]}
                onPress={() => setIsOpen(!isOpen)}
                activeOpacity={0.8}
              >
                <Text style={styles.triggerText}>
                  {isOpen ? 'Select Bus' : (savedBus ? `Bus ${savedBus.bus_number || savedBus.routeNo}` : 'Select Bus')}
                </Text>
                {loading && !isOpen ? (
                  <ActivityIndicator size="small" color="#475569" />
                ) : isOpen ? (
                  <ChevronUp size={20} color="#475569" strokeWidth={2.2} />
                ) : (
                  <ChevronDown size={20} color="#475569" strokeWidth={2.2} />
                )}
              </TouchableOpacity>

            {/* Dropdown Menu Card (Shown when expanded) */}
            {isOpen && (
              <View style={styles.dropdownCard}>
                {/* Search Bar */}
                <View style={styles.searchBar}>
                  <Search size={16} color="#94a3b8" />
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Search bus number or stop..."
                    placeholderTextColor="#94a3b8"
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>

                {/* Content / Bus list */}
                {loading ? (
                  <View style={styles.loaderWrap}>
                    <ActivityIndicator size="small" color="#2563eb" />
                  </View>
                ) : filteredBuses.length === 0 ? (
                  <View style={styles.emptyWrap}>
                    <Text style={styles.emptyText}>No buses</Text>
                  </View>
                ) : (
                  <ScrollView 
                    style={styles.busListScroll} 
                    keyboardShouldPersistTaps="handled"
                    nestedScrollEnabled
                  >
                    {filteredBuses.map((bus) => {
                      const busId = bus.id || bus.bus_number || bus.routeNo;
                      return (
                        <TouchableOpacity
                          key={String(busId)}
                          style={styles.busItemRow}
                          onPress={() => handleSelectBus(bus)}
                        >
                          <View style={{ flex: 1, marginRight: 8 }}>
                            <Text style={styles.busItemTitle}>
                              Bus {bus.bus_number || bus.routeNo}
                            </Text>
                            <Text style={styles.busItemRoute} numberOfLines={1}>
                              {bus.start_place || bus.origin} ➔ {bus.end_place || 'ESEC Campus'}
                            </Text>
                          </View>
                          <Text style={styles.busItemTime}>
                            {bus.startTime || bus.start_time || ''}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                )}
              </View>
            )}
          </View>
        )}
      </View>

        {/* Bottom Footer Section */}
        <View style={styles.footerSection}>
          <TouchableOpacity 
            activeOpacity={0.9} 
            onLongPress={handleFooterLongPress}
            style={styles.footerTouchable}
          >
            <Text style={styles.footerCollege}>Erode Sengunthar Engineering College</Text>
            <Text style={styles.footerOffice}>TRANSPORT OFFICE</Text>
          </TouchableOpacity>

          {/* Android / iOS Home Indicator */}
          <View style={styles.homeIndicator} />
        </View>
      </View>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
    justifyContent: 'space-between',
    paddingHorizontal: 28,
    paddingTop: Platform.OS === 'ios' ? 70 : 60,
    paddingBottom: Platform.OS === 'ios' ? 24 : 16
  },
  contentWrapper: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    paddingBottom: 40
  },
  headerBlock: {
    alignItems: 'center',
    marginBottom: 24
  },
  logoTouchable: {
    padding: 6
  },
  logo: {
    width: 140,
    height: 140,
    marginBottom: 14
  },
  collegeName: {
    fontSize: 18,
    fontWeight: '900',
    color: '#162a6b',
    textAlign: 'center',
    letterSpacing: 0.6
  },
  collegeSub: {
    fontSize: 13,
    fontWeight: '800',
    color: '#dc2626',
    textAlign: 'center',
    letterSpacing: 0.8,
    marginTop: 4
  },
  myBusCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 16,
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 6
      },
      android: {
        elevation: 2
      }
    })
  },
  myBusHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6
  },
  myBusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
    letterSpacing: 0.8
  },
  changeBusLink: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b'
  },
  myBusTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a'
  },
  myBusRoute: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 2
  },
  myBusTime: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2
  },
  openMyBusBtn: {
    marginTop: 14,
    height: 42,
    backgroundColor: '#0f172a',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center'
  },
  openMyBusBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14
  },
  dropdownSection: {
    width: '100%',
    maxWidth: 340,
    position: 'relative',
    zIndex: 100
  },
  dropdownTrigger: {
    width: '100%',
    height: 50,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16
  },
  dropdownTriggerActive: {
    borderColor: '#0f172a'
  },
  triggerText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#0f172a'
  },
  dropdownCard: {
    position: 'absolute',
    top: 58,
    left: 0,
    right: 0,
    zIndex: 1000,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 8,
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.14,
        shadowRadius: 16
      },
      android: {
        elevation: 8
      }
    })
  },
  searchBar: {
    height: 42,
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#edf2f7',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    gap: 8
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#1e293b',
    paddingVertical: 0
  },
  loaderWrap: {
    paddingVertical: 32,
    alignItems: 'center',
    justifyContent: 'center'
  },
  emptyWrap: {
    paddingVertical: 26,
    alignItems: 'center',
    justifyContent: 'center'
  },
  emptyText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#64748b'
  },
  busListScroll: {
    maxHeight: 220,
    marginTop: 6
  },
  busItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderColor: '#f1f5f9'
  },
  busItemTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a'
  },
  busItemRoute: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2
  },
  busItemTime: {
    fontSize: 12,
    fontWeight: '500',
    color: '#64748b'
  },
  footerSection: {
    alignItems: 'center',
    width: '100%',
    paddingBottom: 4
  },
  footerTouchable: {
    alignItems: 'center',
    paddingVertical: 4
  },
  footerCollege: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1e3a8a',
    textAlign: 'center'
  },
  footerOffice: {
    fontSize: 11,
    fontWeight: '800',
    color: '#b91c1c',
    letterSpacing: 1.2,
    textAlign: 'center',
    marginTop: 2
  },
  homeIndicator: {
    width: 120,
    height: 4,
    backgroundColor: '#000000',
    borderRadius: 2,
    marginTop: 14
  }
});
