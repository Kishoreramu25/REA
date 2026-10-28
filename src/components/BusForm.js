import React, { useState, useRef } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  ScrollView, 
  StyleSheet, 
  Alert 
} from 'react-native';
import * as Location from 'expo-location';
import StopInput from './StopInput';
import MapPickerModal from './MapPickerModal';
import { COLORS, APP_CONFIG } from '../utils/constants';
import { supabase } from '../services/supabaseClient';
import { 
  isValidTimeFormat, 
  timeToMinutes, 
  parseLatLng, 
  validateLatLng, 
  getPointsDistanceMeters 
} from '../utils/helpers';

export default function BusForm({ initialValues, onSave, onCancel, submitLabel = 'Save Bus Route' }) {
  const [routeNo, setRouteNo] = useState(initialValues?.routeNo ? String(initialValues.routeNo) : '');
  const [driverPhone, setDriverPhone] = useState(initialValues?.driverPhone || '');
  const [origin, setOrigin] = useState(initialValues?.origin || '');
  const [startTime, setStartTime] = useState(initialValues?.startTime || '');
  
  // Start Coords
  const getInitialCoords = (lat, lng, defaultVal = '') => {
    if (lat != null && lng != null && !isNaN(lat) && !isNaN(lng)) {
      return `${lat}, ${lng}`;
    }
    return defaultVal;
  };

  const [startCoords, setStartCoords] = useState(
    getInitialCoords(initialValues?.startLat ?? initialValues?.start_lat, initialValues?.startLng ?? initialValues?.start_lng, '')
  );

  const [endPlace, setEndPlace] = useState(initialValues?.endPlace || 'ESEC Campus');
  const [collegeTime, setCollegeTime] = useState(initialValues?.collegeTime || '');
  
  // End Coords default to APP_CONFIG.CAMPUS_COORDS
  const [endCoords, setEndCoords] = useState(
    getInitialCoords(initialValues?.endLat ?? initialValues?.end_lat, initialValues?.endLng ?? initialValues?.end_lng, APP_CONFIG.CAMPUS_COORDS || '')
  );

  const [via, setVia] = useState(initialValues?.via || []);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const scrollRef = useRef(null);
  const [locatingField, setLocatingField] = useState(null);
  const [mapPickerVisible, setMapPickerVisible] = useState(false);
  const [mapTargetField, setMapTargetField] = useState('end'); // 'start' | 'end'

  // Open map picker modal for start or end coordinates
  const openMapPicker = (field) => {
    setMapTargetField(field);
    setMapPickerVisible(true);
  };

  // Callback when a location is picked from the Map modal
  const handleSelectFromMap = ({ lat, lng, formatted, name }) => {
    setError('');
    if (mapTargetField === 'end') {
      setEndCoords(formatted);
      if (name && (!endPlace.trim() || endPlace === 'ESEC Campus')) {
        setEndPlace(name);
      }
    } else {
      setStartCoords(formatted);
      if (name && !origin.trim()) {
        setOrigin(name);
      }
    }
  };

  // Robust device GPS detection
  const handleUseLocation = async (setter, fieldName) => {
    try {
      setLocatingField(fieldName);
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Location permission is required to detect coordinates.');
        return;
      }

      // Fast check: cached position
      let loc = await Location.getLastKnownPositionAsync().catch(() => null);
      if (loc?.coords) {
        const fastFormatted = `${loc.coords.latitude.toFixed(6)}, ${loc.coords.longitude.toFixed(6)}`;
        setter(fastFormatted);
      }

      // Fresh accurate GPS position
      loc = await Location.getCurrentPositionAsync({ 
        accuracy: Location.Accuracy.High 
      }).catch(async () => {
        return await Location.getCurrentPositionAsync({ 
          accuracy: Location.Accuracy.Balanced 
        }).catch(() => null);
      });

      if (loc?.coords) {
        const formatted = `${loc.coords.latitude.toFixed(6)}, ${loc.coords.longitude.toFixed(6)}`;
        setter(formatted);

        // Reverse geocode to suggest place name
        try {
          const rev = await Location.reverseGeocodeAsync({
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude
          });
          if (Array.isArray(rev) && rev.length > 0) {
            const place = rev[0];
            const name = place.district || place.city || place.subregion || place.name;
            if (fieldName === 'start' && !origin.trim() && name) {
              setOrigin(name);
            } else if (fieldName === 'end' && (!endPlace.trim() || endPlace === 'ESEC Campus') && name) {
              setEndPlace(name);
            }
          }
        } catch (e) {}

        Alert.alert('Location Fetched', `Detected GPS coordinates:\n${formatted}`);
      } else {
        Alert.alert('Location Error', 'Unable to fetch current GPS coordinates. Please ensure GPS is enabled.');
      }
    } catch (e) {
      Alert.alert('Location Error', e.message || 'Unable to fetch current location.');
    } finally {
      setLocatingField(null);
    }
  };

  const notifyError = (msg) => {
    setError(msg);
    Alert.alert('Incomplete or Invalid Details', msg);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  const handleSubmit = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      setError('');

      const cleanRouteNo = parseInt(routeNo, 10);
      if (isNaN(cleanRouteNo) || cleanRouteNo <= 0) {
        notifyError('Please enter a valid Bus Number (e.g. 45).');
        return;
      }

      // Driver PIN validation (on edit, empty keeps current PIN)
      const cleanPin = String(driverPhone || '').trim();
      let pinToSubmit = cleanPin;

      if (initialValues?.id) {
        if (!cleanPin) {
          pinToSubmit = null;
        } else if (!/^\d{6}$/.test(cleanPin)) {
          notifyError('Driver Access PIN must be exactly 6 digits (numbers only).');
          return;
        }
      } else {
        if (!/^\d{6}$/.test(cleanPin)) {
          notifyError('Driver Access PIN must be exactly 6 digits (numbers only).');
          return;
        }
      }

      if (!origin.trim()) {
        notifyError('Start Place (Origin) is required.');
        return;
      }

      if (!startTime.trim()) {
        notifyError('Departure Start Time is required.');
        return;
      }
      if (!isValidTimeFormat(startTime.trim())) {
        notifyError('Departure Time must be in "hh:mm AM/PM" format (e.g. 06:40 AM).');
        return;
      }

      // Validate Start Coords
      if (!startCoords.trim()) {
        notifyError('Start coordinates are required. Enter "lat, lng" or paste Google Maps link.');
        return;
      }
      const startParsed = parseLatLng(startCoords);
      if (!startParsed) {
        notifyError('Start coordinates invalid. Expected "lat, lng" or Google Maps link.');
        return;
      }
      const startVal = validateLatLng(startParsed);
      if (!startVal.valid) {
        notifyError(`Start Place: ${startVal.error}`);
        return;
      }

      if (!endPlace.trim()) {
        notifyError('End Place is required.');
        return;
      }

      if (!collegeTime.trim()) {
        notifyError('Arrival Time at destination is required.');
        return;
      }
      if (!isValidTimeFormat(collegeTime.trim())) {
        notifyError('Arrival Time must be in "hh:mm AM/PM" format (e.g. 08:15 AM).');
        return;
      }

      // Validate End Coords
      if (!endCoords.trim()) {
        notifyError('End coordinates are required. Enter "lat, lng" or paste Google Maps link.');
        return;
      }
      const endParsed = parseLatLng(endCoords);
      if (!endParsed) {
        notifyError('End coordinates invalid. Expected "lat, lng" or Google Maps link.');
        return;
      }
      const endVal = validateLatLng(endParsed);
      if (!endVal.valid) {
        notifyError(`End Place: ${endVal.error}`);
        return;
      }

      // Validate all middle stops
      const validatedVia = [];
      for (let i = 0; i < via.length; i++) {
        const s = via[i];
        if (!isValidTimeFormat(s.time)) {
          notifyError(`Stop "${s.name}" time must be in "hh:mm AM/PM" format (e.g. 07:10 AM).`);
          return;
        }
        const sParsed = parseLatLng(s.lat != null && s.lng != null ? { lat: s.lat, lng: s.lng } : s.coords);
        if (!sParsed) {
          notifyError(`Stop "${s.name}": coordinates are required.`);
          return;
        }
        const sVal = validateLatLng(sParsed);
        if (!sVal.valid) {
          notifyError(`Stop "${s.name}": ${sVal.error}`);
          return;
        }
        validatedVia.push({
          ...s,
          lat: sVal.lat,
          lng: sVal.lng,
          latitude: sVal.lat,
          longitude: sVal.lng
        });
      }

      // Check start < stops (in order) < arrival
      const startMins = timeToMinutes(startTime.trim());
      let prevMins = startMins;
      let prevName = origin.trim();

      for (let i = 0; i < validatedVia.length; i++) {
        const stopMins = timeToMinutes(validatedVia[i].time);
        if (stopMins <= prevMins) {
          notifyError(`Stop "${validatedVia[i].name}" (${validatedVia[i].time}) must be scheduled after ${prevName} (${formatMinutes(prevMins)}).`);
          return;
        }
        prevMins = stopMins;
        prevName = validatedVia[i].name;
      }

      const arrivalMins = timeToMinutes(collegeTime.trim());
      if (arrivalMins <= prevMins) {
        notifyError(`Arrival Time at destination (${collegeTime.trim()}) must be after ${prevName} (${formatMinutes(prevMins)}).`);
        return;
      }

      // Neighbouring points distance check (must be at least 50m apart)
      const pointsList = [
        { name: origin.trim(), lat: startVal.lat, lng: startVal.lng },
        ...validatedVia,
        { name: endPlace.trim(), lat: endVal.lat, lng: endVal.lng }
      ];

      for (let i = 0; i < pointsList.length - 1; i++) {
        const pA = pointsList[i];
        const pB = pointsList[i + 1];
        const dist = getPointsDistanceMeters(pA, pB);
        if (dist < 50) {
          notifyError(`Neighbouring points "${pA.name}" and "${pB.name}" are too close (${Math.round(dist)} m apart). Must be at least 50 m apart.`);
          return;
        }
      }

      await onSave({
        routeNo: cleanRouteNo,
        driverPhone: pinToSubmit,
        origin: origin.trim(),
        startTime: startTime.trim(),
        startLat: startVal.lat,
        start_lat: startVal.lat,
        startLng: startVal.lng,
        start_lng: startVal.lng,
        endPlace: endPlace.trim(),
        collegeTime: collegeTime.trim(),
        endLat: endVal.lat,
        end_lat: endVal.lat,
        endLng: endVal.lng,
        end_lng: endVal.lng,
        via: validatedVia
      });
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const formatMinutes = (m) => {
    let h = Math.floor(m / 60);
    const mins = m % 60;
    const period = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    const hPad = h < 10 ? `0${h}` : `${h}`;
    const mPad = mins < 10 ? `0${mins}` : `${mins}`;
    return `${hPad}:${mPad} ${period}`;
  };

  return (
    <ScrollView ref={scrollRef} style={styles.scroll} contentContainerStyle={styles.content}>
      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {/* Row 1: Bus Number & Driver PIN */}
      <View style={styles.row}>
        <View style={styles.col}>
          <Text style={styles.label}>Bus Number *</Text>
          <TextInput
            style={styles.input}
            placeholder="Bus number"
            placeholderTextColor="#9ca3af"
            keyboardType="number-pad"
            value={routeNo}
            onChangeText={(val) => { setError(''); setRouteNo(val); }}
          />
        </View>

        <View style={styles.col}>
          <Text style={styles.label}>Driver Access PIN (6 Digits) *</Text>
          <TextInput
            style={styles.input}
            placeholder="6-digit PIN"
            placeholderTextColor="#9ca3af"
            keyboardType="numeric"
            maxLength={6}
            value={driverPhone}
            onChangeText={(val) => { setError(''); setDriverPhone(val.replace(/[^0-9]/g, '').slice(0, 6)); }}
          />
        </View>
      </View>

      {/* Row 2: Start Place & Departure Time */}
      <View style={styles.row}>
        <View style={styles.col}>
          <Text style={styles.label}>Start Place (Origin) *</Text>
          <TextInput
            style={styles.input}
            placeholder="Start place"
            placeholderTextColor="#9ca3af"
            value={origin}
            onChangeText={(val) => { setError(''); setOrigin(val); }}
          />
        </View>

        <View style={styles.col}>
          <Text style={styles.label}>Departure Time *</Text>
          <TextInput
            style={styles.input}
            placeholder="hh:mm AM/PM"
            placeholderTextColor="#9ca3af"
            value={startTime}
            onChangeText={(val) => { setError(''); setStartTime(val); }}
          />
        </View>
      </View>

      {/* Start Coordinates Row */}
      <View style={styles.formGroup}>
        <View style={styles.fieldHeader}>
          <Text style={styles.label}>Start Coordinates *</Text>
          <View style={styles.actionBtnGroup}>
            <TouchableOpacity 
              style={styles.textBtn} 
              onPress={() => handleUseLocation(setStartCoords, 'start')}
              disabled={locatingField === 'start'}
              activeOpacity={0.7}
            >
              <Text style={styles.textBtnLabel}>
                {locatingField === 'start' ? 'Locating...' : 'Use GPS'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.textBtn} 
              onPress={() => openMapPicker('start')}
              activeOpacity={0.7}
            >
              <Text style={styles.textBtnLabel}>
                Pick on Map
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <TextInput
          style={styles.input}
          placeholder="Coordinates"
          placeholderTextColor="#9ca3af"
          value={startCoords}
          onChangeText={(val) => { setError(''); setStartCoords(val); }}
        />
      </View>

      {/* Row 3: End Place & Arrival Time */}
      <View style={styles.row}>
        <View style={styles.col}>
          <Text style={styles.label}>End Place *</Text>
          <TextInput
            style={styles.input}
            placeholder="Destination"
            placeholderTextColor="#9ca3af"
            value={endPlace}
            onChangeText={(val) => { setError(''); setEndPlace(val); }}
          />
        </View>

        <View style={styles.col}>
          <Text style={styles.label}>Arrival Time at ESEC *</Text>
          <TextInput
            style={styles.input}
            placeholder="hh:mm AM/PM"
            placeholderTextColor="#9ca3af"
            value={collegeTime}
            onChangeText={(val) => { setError(''); setCollegeTime(val); }}
          />
        </View>
      </View>

      {/* End Coordinates Row */}
      <View style={styles.formGroup}>
        <View style={styles.fieldHeader}>
          <Text style={styles.label}>End Coordinates *</Text>
          <View style={styles.actionBtnGroup}>
            <TouchableOpacity 
              style={styles.textBtn} 
              onPress={() => handleUseLocation(setEndCoords, 'end')}
              disabled={locatingField === 'end'}
              activeOpacity={0.7}
            >
              <Text style={styles.textBtnLabel}>
                {locatingField === 'end' ? 'Locating...' : 'Use GPS'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.textBtn} 
              onPress={() => openMapPicker('end')}
              activeOpacity={0.7}
            >
              <Text style={styles.textBtnLabel}>
                Pick on Map
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <TextInput
          style={styles.input}
          placeholder="Coordinates"
          placeholderTextColor="#9ca3af"
          value={endCoords}
          onChangeText={(val) => { setError(''); setEndCoords(val); }}
        />
      </View>

      {/* Middle Stops & Timings */}
      <StopInput stops={via} onStopsChange={setVia} />

      {/* Action Buttons */}
      <View style={styles.btnRow}>
        {onCancel ? (
          <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity 
          style={[styles.submitBtn, saving && { opacity: 0.6 }]} 
          onPress={handleSubmit}
          disabled={saving}
          activeOpacity={0.8}
        >
          <Text style={styles.submitBtnText}>{saving ? 'Saving...' : submitLabel}</Text>
        </TouchableOpacity>
      </View>

      {/* Map Location Picker Modal */}
      <MapPickerModal
        visible={mapPickerVisible}
        onClose={() => setMapPickerVisible(false)}
        onSelectLocation={handleSelectFromMap}
        initialCoords={mapTargetField === 'end' ? endCoords : startCoords}
        title={mapTargetField === 'end' ? 'Choose Destination from Map' : 'Choose Origin from Map'}
        targetFieldName={mapTargetField}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: '#ffffff'
  },
  content: {
    padding: 16,
    maxWidth: 720,
    width: '100%',
    alignSelf: 'center'
  },
  errorBox: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    padding: 10,
    marginBottom: 12,
    borderRadius: 6
  },
  errorText: {
    color: '#dc2626',
    fontSize: 12,
    fontWeight: '600'
  },
  row: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12
  },
  col: {
    flex: 1
  },
  formGroup: {
    marginBottom: 14
  },
  fieldHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 5
  },
  actionBtnGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  textBtn: {
    height: 28,
    paddingHorizontal: 8,
    backgroundColor: '#ffffff',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#d1d5db',
    alignItems: 'center',
    justifyContent: 'center'
  },
  textBtnLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: '#374151'
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: '#111827',
    textTransform: 'uppercase',
    letterSpacing: 0.3
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
  btnRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
    marginBottom: 30
  },
  cancelBtn: {
    flex: 1,
    height: 42,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff'
  },
  cancelBtnText: {
    color: '#4b5563',
    fontWeight: '600',
    fontSize: 13
  },
  submitBtn: {
    flex: 2,
    height: 42,
    backgroundColor: '#111827',
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center'
  },
  submitBtnText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 13
  }
});
