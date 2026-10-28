import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import * as Location from 'expo-location';
import MapPickerModal from './MapPickerModal';
import { COLORS } from '../utils/constants';
import { isValidTimeFormat, parseLatLng, validateLatLng } from '../utils/helpers';

export default function StopInput({ stops = [], onStopsChange }) {
  const [stopName, setStopName] = useState('');
  const [stopTime, setStopTime] = useState('');
  const [stopCoords, setStopCoords] = useState('');
  const [editingIndex, setEditingIndex] = useState(null);
  const [locating, setLocating] = useState(false);
  const [mapPickerVisible, setMapPickerVisible] = useState(false);
  const [error, setError] = useState('');

  const handleStartEdit = (index) => {
    setError('');
    const stop = stops[index];
    if (!stop) return;

    setEditingIndex(index);
    setStopName(stop.name || '');
    setStopTime(stop.time || '');

    const latVal = stop.lat ?? stop.latitude;
    const lngVal = stop.lng ?? stop.longitude;
    if (latVal != null && lngVal != null) {
      setStopCoords(`${Number(latVal).toFixed(6)}, ${Number(lngVal).toFixed(6)}`);
    } else if (stop.coords) {
      setStopCoords(typeof stop.coords === 'string' ? stop.coords : `${stop.coords.lat}, ${stop.coords.lng}`);
    } else {
      setStopCoords('');
    }
  };

  const handleCancelEdit = () => {
    setEditingIndex(null);
    setStopName('');
    setStopTime('');
    setStopCoords('');
    setError('');
  };

  const handleUseMyLocation = async () => {
    try {
      setLocating(true);
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Location permission is required to detect coordinates.');
        return;
      }

      // Fast check: cached position
      let loc = await Location.getLastKnownPositionAsync().catch(() => null);
      if (loc?.coords) {
        setStopCoords(`${loc.coords.latitude.toFixed(6)}, ${loc.coords.longitude.toFixed(6)}`);
      }

      // Fresh accurate GPS
      loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }).catch(async () => {
        return await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).catch(() => null);
      });

      if (loc?.coords) {
        const formatted = `${loc.coords.latitude.toFixed(6)}, ${loc.coords.longitude.toFixed(6)}`;
        setStopCoords(formatted);

        try {
          const rev = await Location.reverseGeocodeAsync({
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude
          });
          if (Array.isArray(rev) && rev.length > 0 && !stopName.trim()) {
            const p = rev[0];
            const name = p.name || p.street || p.district || p.city;
            if (name) setStopName(name);
          }
        } catch (e) {}

        Alert.alert('Location Fetched', `Detected GPS:\n${formatted}`);
      } else {
        Alert.alert('Location Error', 'Unable to fetch current GPS coordinates.');
      }
    } catch (e) {
      Alert.alert('Location Error', e.message || 'Unable to fetch current location.');
    } finally {
      setLocating(false);
    }
  };

  const handleSelectFromMap = ({ formatted, name }) => {
    setStopCoords(formatted);
    if (name && !stopName.trim()) {
      setStopName(name);
    }
  };

  const handleSaveOrAddStop = () => {
    setError('');
    const trimmedName = stopName.trim();
    const trimmedTime = stopTime.trim();
    const trimmedCoords = stopCoords.trim();

    if (!trimmedName) {
      setError('Please enter a stop name.');
      return;
    }

    if (!trimmedTime) {
      setError('Please enter a stop time.');
      return;
    }

    if (!isValidTimeFormat(trimmedTime)) {
      setError('Stop time must be "hh:mm AM/PM" (e.g. 06:55 AM).');
      return;
    }

    if (!trimmedCoords) {
      setError('Stop coordinates are required. Enter "lat, lng" or paste Google Maps link.');
      return;
    }

    const parsed = parseLatLng(trimmedCoords);
    if (!parsed) {
      setError('Invalid coordinates format. Expected "lat, lng" or Google Maps link.');
      return;
    }

    const val = validateLatLng(parsed);
    if (!val.valid) {
      setError(val.error);
      return;
    }

    if (editingIndex !== null) {
      // Update existing stop in-place
      const updated = [...stops];
      updated[editingIndex] = {
        ...updated[editingIndex],
        name: trimmedName,
        time: trimmedTime,
        lat: val.lat,
        lng: val.lng,
        latitude: val.lat,
        longitude: val.lng
      };
      onStopsChange(updated);
      setEditingIndex(null);
    } else {
      // Add new stop
      const updated = [
        ...stops,
        {
          name: trimmedName,
          time: trimmedTime,
          lat: val.lat,
          lng: val.lng,
          latitude: val.lat,
          longitude: val.lng
        }
      ];
      onStopsChange(updated);
    }

    setStopName('');
    setStopTime('');
    setStopCoords('');
  };

  const handleRemove = (index) => {
    if (editingIndex === index) {
      handleCancelEdit();
    } else if (editingIndex !== null && editingIndex > index) {
      setEditingIndex(editingIndex - 1);
    }
    const updated = stops.filter((_, idx) => idx !== index);
    onStopsChange(updated);
  };

  const handleMove = (index, direction) => {
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= stops.length) return;
    const updated = [...stops];
    const temp = updated[index];
    updated[index] = updated[target];
    updated[target] = temp;

    if (editingIndex === index) {
      setEditingIndex(target);
    } else if (editingIndex === target) {
      setEditingIndex(index);
    }

    onStopsChange(updated);
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Middle Stops & Scheduled Times</Text>
        <Text style={styles.badge}>{stops.length} Added</Text>
      </View>

      <Text style={styles.sublabel}>
        Add each stop between Start Place and End Place along with its arrival time and GPS coordinates. Tap Edit to modify a stop.
      </Text>

      {/* Editing Banner Notification */}
      {editingIndex !== null && (
        <View style={styles.editingBanner}>
          <Text style={styles.editingBannerText}>
            Editing Stop #{editingIndex + 1}: <Text style={{ fontWeight: '700' }}>{stops[editingIndex]?.name || 'Stop'}</Text>
          </Text>
          <TouchableOpacity 
            onPress={handleCancelEdit} 
            style={styles.cancelEditLink}
            activeOpacity={0.7}
          >
            <Text style={styles.cancelEditLinkText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      )}

      {error ? (
        <Text style={{ color: COLORS.danger, fontSize: 11, fontWeight: '700', marginBottom: 6 }}>
          {error}
        </Text>
      ) : null}

      {/* Row 1: Stop Name & Time */}
      <View style={styles.inputRow}>
        <TextInput
          style={[styles.input, styles.nameInput]}
          placeholder="Stop name"
          placeholderTextColor="#9ca3af"
          value={stopName}
          onChangeText={(val) => { setError(''); setStopName(val); }}
        />
        <TextInput
          style={[styles.input, styles.timeInput]}
          placeholder="hh:mm AM/PM"
          placeholderTextColor="#9ca3af"
          value={stopTime}
          onChangeText={(val) => { setError(''); setStopTime(val); }}
        />
      </View>

      {/* Row 2: Lat, Lng input + Built-in text actions */}
      <View style={styles.secondRow}>
        <TextInput
          style={[styles.input, styles.coordsInput]}
          placeholder="Coordinates"
          placeholderTextColor="#9ca3af"
          value={stopCoords}
          onChangeText={(val) => { setError(''); setStopCoords(val); }}
        />

        <TouchableOpacity 
          style={styles.textBtn} 
          onPress={handleUseMyLocation} 
          disabled={locating}
          activeOpacity={0.7}
        >
          <Text style={styles.textBtnLabel}>{locating ? 'Locating...' : 'Use GPS'}</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.textBtn} 
          onPress={() => setMapPickerVisible(true)} 
          activeOpacity={0.7}
        >
          <Text style={styles.textBtnLabel}>Map</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.saveOrAddBtn} 
          onPress={handleSaveOrAddStop}
          activeOpacity={0.8}
        >
          <Text style={styles.saveOrAddBtnText}>{editingIndex !== null ? 'Save' : '+ Add'}</Text>
        </TouchableOpacity>
      </View>

      {/* Stops Sequence List - Container-free clean alignment */}
      <View>
        {stops.length === 0 ? (
          <Text style={styles.emptyText}>
            No middle stops added yet.
          </Text>
        ) : (
          stops.map((stop, idx) => {
            const latVal = stop.lat ?? stop.latitude;
            const lngVal = stop.lng ?? stop.longitude;
            const isEditing = editingIndex === idx;

            return (
              <View 
                key={idx} 
                style={[styles.stopItem, isEditing && styles.stopItemEditing]}
              >
                <View style={styles.stopLeftWrap}>
                  <Text style={styles.stopIndex}>#{idx + 1}</Text>
                  <TouchableOpacity 
                    style={{ flex: 1 }}
                    onPress={() => handleStartEdit(idx)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.stopNameText, isEditing && styles.stopNameTextEditing]}>
                      {stop.name}
                    </Text>
                    <Text style={styles.stopMetaText}>
                      {stop.time}{latVal != null && lngVal != null ? `  •  ${Number(latVal).toFixed(4)}, ${Number(lngVal).toFixed(4)}` : ''}
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Built-in text actions with proper alignment & spacing */}
                <View style={styles.stopActionsWrap}>
                  <TouchableOpacity
                    onPress={() => isEditing ? handleCancelEdit() : handleStartEdit(idx)}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.actionLinkText}>{isEditing ? 'Done' : 'Edit'}</Text>
                  </TouchableOpacity>

                  <Text style={styles.actionDividerText}>|</Text>

                  <TouchableOpacity
                    disabled={idx === 0}
                    onPress={() => handleMove(idx, 'up')}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.actionLinkText, idx === 0 && styles.disabledLinkText]}>↑</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    disabled={idx === stops.length - 1}
                    onPress={() => handleMove(idx, 'down')}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.actionLinkText, idx === stops.length - 1 && styles.disabledLinkText]}>↓</Text>
                  </TouchableOpacity>

                  <Text style={styles.actionDividerText}>|</Text>

                  <TouchableOpacity
                    onPress={() => handleRemove(idx)}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.actionDeleteLinkText}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
      </View>

      {/* Map Picker Modal for Stops */}
      <MapPickerModal
        visible={mapPickerVisible}
        onClose={() => setMapPickerVisible(false)}
        onSelectLocation={handleSelectFromMap}
        initialCoords={stopCoords}
        title={editingIndex !== null ? `Edit Stop #${editingIndex + 1} on Map` : "Choose Stop Location from Map"}
        targetFieldName="stop"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 14
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 4
  },
  title: {
    fontSize: 12,
    fontWeight: '700',
    color: '#111827',
    textTransform: 'uppercase',
    letterSpacing: 0.3
  },
  badge: {
    fontSize: 11,
    color: '#6b7280'
  },
  sublabel: {
    fontSize: 11.5,
    color: '#6b7280',
    marginBottom: 10
  },
  inputRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8
  },
  secondRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12
  },
  input: {
    height: 38,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 6,
    paddingHorizontal: 10,
    fontSize: 13,
    color: '#111827'
  },
  nameInput: {
    flex: 2
  },
  timeInput: {
    flex: 1
  },
  coordsInput: {
    flex: 2
  },
  textBtn: {
    height: 38,
    paddingHorizontal: 10,
    backgroundColor: '#ffffff',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#d1d5db',
    alignItems: 'center',
    justifyContent: 'center'
  },
  textBtnLabel: {
    fontSize: 11.5,
    fontWeight: '500',
    color: '#374151'
  },
  saveOrAddBtn: {
    height: 38,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: 6
  },
  saveOrAddBtnText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 12
  },
  emptyText: {
    color: '#9ca3af',
    fontSize: 12,
    paddingVertical: 12
  },
  stopItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderColor: '#f3f4f6'
  },
  stopItemEditing: {
    backgroundColor: '#fafafa'
  },
  stopLeftWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    marginRight: 10
  },
  stopIndex: {
    fontSize: 11,
    fontWeight: '600',
    color: '#9ca3af',
    width: 22
  },
  stopNameText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#111827'
  },
  stopNameTextEditing: {
    color: '#111827',
    fontWeight: '700'
  },
  stopMetaText: {
    fontSize: 11,
    color: '#6b7280',
    marginTop: 2
  },
  stopActionsWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  actionLinkText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
    paddingHorizontal: 2
  },
  actionDividerText: {
    fontSize: 11,
    color: '#d1d5db'
  },
  disabledLinkText: {
    color: '#d1d5db'
  },
  actionDeleteLinkText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#dc2626',
    paddingHorizontal: 2
  },
  editingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderColor: '#e5e7eb',
    marginBottom: 8
  },
  editingBannerText: {
    fontSize: 12,
    color: '#374151'
  },
  cancelEditLink: {
    paddingVertical: 2,
    paddingHorizontal: 6
  },
  cancelEditLinkText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280'
  }
});
