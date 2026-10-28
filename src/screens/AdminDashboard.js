import React, { useState, useMemo } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  ScrollView, 
  StyleSheet, 
  Image, 
  Alert, 
  ActivityIndicator,
  Platform 
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useBusData } from '../hooks/useBusData';
import { useAuth } from '../context/AuthContext';

export default function AdminDashboard({ navigation }) {
  const { buses = [], loading = false, deleteBus, clearAllBuses, refresh } = useBusData();
  const { logout } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');

  // Requirement 11: Call refresh() on screen focus (useFocusEffect)
  useFocusEffect(
    React.useCallback(() => {
      if (typeof refresh === 'function') {
        refresh();
      }
    }, [refresh])
  );

  const safeBuses = Array.isArray(buses) ? buses : [];

  const filteredBuses = useMemo(() => {
    if (!searchQuery.trim()) return safeBuses;
    const q = searchQuery.toLowerCase().trim();
    return safeBuses.filter((b) => {
      if (!b) return false;
      const matchRoute = String(b.routeNo || '').includes(q);
      const matchName = (b.name || '').toLowerCase().includes(q);
      const matchOrigin = (b.origin || '').toLowerCase().includes(q);
      const matchPhone = (b.driverPhone || '').toLowerCase().includes(q);
      const matchVia = (b.via || []).some((s) => {
        const stopName = typeof s === 'object' ? s?.name || '' : String(s || '');
        return stopName.toLowerCase().includes(q);
      });
      return matchRoute || matchName || matchOrigin || matchPhone || matchVia;
    });
  }, [safeBuses, searchQuery]);

  const handleDelete = (bus) => {
    Alert.alert(
      `Delete ${bus.name}?`,
      `Are you sure you want to delete Route #${bus.routeNo} (${bus.origin} to ${bus.endPlace})?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteBus(bus.id);
            } catch (err) {
              Alert.alert('Error', err.message);
            }
          }
        }
      ]
    );
  };

  const handleClearAll = () => {
    if (buses.length === 0) return;
    Alert.alert(
      'Clear All Buses?',
      'Are you sure you want to delete ALL buses? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Clear All', 
          style: 'destructive',
          onPress: async () => {
            await clearAllBuses();
          }
        }
      ]
    );
  };

  const performLogout = async () => {
    try {
      await logout();
    } catch (err) {
      console.warn('[AdminDashboard] Logout error:', err);
    }
    navigation.reset({
      index: 0,
      routes: [{ name: 'ParentHome' }]
    });
  };

  const handleLogout = () => {
    if (Platform.OS === 'web') {
      const confirmed = window.confirm('Are you sure you want to log out of Admin Dashboard?');
      if (confirmed) {
        performLogout();
      }
    } else {
      Alert.alert(
        'Log Out of Admin Portal',
        'Are you sure you want to log out of Admin Dashboard?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Log Out',
            style: 'destructive',
            onPress: performLogout
          }
        ],
        { cancelable: true }
      );
    }
  };

  return (
    <View style={styles.container}>
      {/* Top Bar */}
      <View style={styles.topBar}>
        <View style={styles.brandRow}>
          <TouchableOpacity 
            style={styles.backBtn} 
            onPress={() => navigation.navigate('ParentHome')}
            activeOpacity={0.7}
          >
            <Text style={styles.backBtnText}>←</Text>
          </TouchableOpacity>
          <Image source={require('../../assets/logo.png')} style={styles.logo} resizeMode="contain" />
          <View style={styles.titleWrap}>
            <Text style={styles.pageTitle} numberOfLines={1} ellipsizeMode="tail">Transport Admin</Text>
            <Text style={styles.badgeText} numberOfLines={1} ellipsizeMode="tail">Dashboard</Text>
          </View>
        </View>

        <View style={styles.headerActions}>
          <TouchableOpacity 
            style={styles.addBtn} 
            onPress={() => navigation.navigate('AdminAddBus')}
            activeOpacity={0.7}
          >
            <Text style={styles.addBtnText}>+ Add Bus</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.7}>
            <Text style={styles.logoutBtnText}>Logout</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Main Content */}
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Search & Stats Row */}
        <View style={styles.searchRow}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search routes..."
            placeholderTextColor="#9ca3af"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />

          <View style={styles.statsRow}>
            <Text style={styles.countText}>
              <Text style={styles.countBold}>{filteredBuses.length}</Text> {filteredBuses.length === 1 ? 'Bus Route' : 'Bus Routes'}
            </Text>

            {buses.length > 0 && (
              <TouchableOpacity style={styles.clearAllBtn} onPress={handleClearAll} activeOpacity={0.7}>
                <Text style={styles.clearAllText}>Clear All</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {loading ? (
          <ActivityIndicator color="#6b7280" style={{ marginTop: 40 }} />
        ) : filteredBuses.length === 0 ? (
          <View style={styles.emptyBlock}>
            <Text style={styles.emptyTitle}>No Buses Created Yet</Text>
            <Text style={styles.emptyDesc}>
              Tap below to create a bus route with origin, stop times, and driver phone.
            </Text>
            <TouchableOpacity 
              style={styles.createFirstBtn} 
              onPress={() => navigation.navigate('AdminAddBus')}
              activeOpacity={0.7}
            >
              <Text style={styles.createFirstBtnText}>Create First Bus</Text>
            </TouchableOpacity>
          </View>
        ) : (
          filteredBuses.map((bus) => (
            <View key={bus.id || bus.routeNo} style={styles.busItem}>
              {/* Header: Route #, Name, and Actions */}
              <View style={styles.busRowHeader}>
                <View style={styles.busTitleWrap}>
                  <Text style={styles.routeNoText}>Route #{bus.routeNo}</Text>
                  <Text style={styles.busNameText}>{bus.name}</Text>
                </View>

                <View style={styles.actionsWrap}>
                  <TouchableOpacity 
                    onPress={() => navigation.navigate('AdminAddBus', { busToEdit: bus })}
                    style={styles.actionBtn}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.editText}>Edit</Text>
                  </TouchableOpacity>

                  <Text style={styles.actionSep}>/</Text>

                  <TouchableOpacity 
                    onPress={() => handleDelete(bus)}
                    style={styles.actionBtn}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.deleteText}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Schedule and Route Path */}
              <View style={styles.detailGrid}>
                <View style={styles.detailCol}>
                  <Text style={styles.detailLabel}>Origin & Departure</Text>
                  <Text style={styles.detailValue}>
                    {bus.origin} ({bus.startTime})
                  </Text>
                </View>

                <View style={styles.detailCol}>
                  <Text style={styles.detailLabel}>Destination & Arrival</Text>
                  <Text style={styles.detailValue}>
                    {bus.endPlace || 'ESEC Campus'} ({bus.collegeTime})
                  </Text>
                </View>

                <View style={styles.detailCol}>
                  <Text style={styles.detailLabel}>Driver Contact</Text>
                  <Text style={styles.detailValue}>
                    {bus.driverPhone || 'Not set'}
                  </Text>
                </View>
              </View>

              {/* Middle stops (Natural text flow, no containers) */}
              {Array.isArray(bus.via) && bus.via.length > 0 && (
                <View style={styles.stopsBlock}>
                  <Text style={styles.detailLabel}>Route Stops</Text>
                  <Text style={styles.stopsFlowText}>
                    {bus.via.map((s) => `${s.name} (${s.time})`).join('  •  ')}
                  </Text>
                </View>
              )}
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff'
  },
  topBar: {
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 48 : 42,
    paddingBottom: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  backBtn: {
    paddingVertical: 2,
    paddingHorizontal: 6,
    marginRight: 2
  },
  backBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151'
  },
  logo: {
    width: 26,
    height: 26
  },
  titleWrap: {
    flexDirection: 'column'
  },
  pageTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827'
  },
  badgeText: {
    fontSize: 11,
    color: '#6b7280',
    marginTop: 1
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14
  },
  addBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8
  },
  addBtnText: {
    color: '#111827',
    fontWeight: '600',
    fontSize: 13
  },
  logoutBtn: {
    paddingVertical: 4,
    paddingHorizontal: 6
  },
  logoutBtnText: {
    color: '#dc2626',
    fontWeight: '600',
    fontSize: 13
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingVertical: 18,
    maxWidth: 960,
    width: '100%',
    alignSelf: 'center'
  },
  searchRow: {
    marginBottom: 20
  },
  searchInput: {
    height: 38,
    borderBottomWidth: 1,
    borderColor: '#e5e7eb',
    fontSize: 13,
    color: '#111827',
    paddingVertical: 6,
    marginBottom: 10
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4
  },
  countText: {
    fontSize: 12,
    color: '#6b7280'
  },
  countBold: {
    fontWeight: '700',
    color: '#111827'
  },
  clearAllBtn: {
    paddingVertical: 4,
    paddingHorizontal: 6
  },
  clearAllText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#dc2626'
  },
  emptyBlock: {
    paddingVertical: 40,
    alignItems: 'center'
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 6
  },
  emptyDesc: {
    fontSize: 12,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16
  },
  createFirstBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 6
  },
  createFirstBtnText: {
    color: '#111827',
    fontWeight: '600',
    fontSize: 13
  },
  busItem: {
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderColor: '#f3f4f6'
  },
  busRowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12
  },
  busTitleWrap: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    flex: 1
  },
  routeNoText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827'
  },
  busNameText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151'
  },
  actionsWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  actionBtn: {
    paddingVertical: 2,
    paddingHorizontal: 4
  },
  editText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151'
  },
  actionSep: {
    fontSize: 12,
    color: '#d1d5db'
  },
  deleteText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#dc2626'
  },
  detailGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginBottom: 10
  },
  detailCol: {
    minWidth: 180,
    flex: 1
  },
  detailLabel: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 2
  },
  detailValue: {
    fontSize: 12.5,
    fontWeight: '500',
    color: '#111827'
  },
  stopsBlock: {
    marginTop: 4
  },
  stopsFlowText: {
    fontSize: 12,
    color: '#4b5563',
    lineHeight: 18,
    marginTop: 2
  }
});
