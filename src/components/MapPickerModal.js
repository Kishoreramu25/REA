import React, { useState, useEffect, useRef } from 'react';
import { 
  Modal, 
  View, 
  Text, 
  TouchableOpacity, 
  StyleSheet, 
  Platform, 
  ActivityIndicator, 
  Alert 
} from 'react-native';
import * as Location from 'expo-location';
import { COLORS } from '../utils/constants';
import { parseLatLng } from '../utils/helpers';

// Quick transit and institution anchors
export const PRESET_LOCATIONS = [
  { id: 'esec', name: 'ESEC Campus', lat: 11.285000, lng: 77.640000 },
  { id: 'perundurai', name: 'Perundurai', lat: 11.275000, lng: 77.585000 },
  { id: 'erode_jxn', name: 'Erode Junction', lat: 11.341234, lng: 77.717890 },
  { id: 'chithode', name: 'Chithode', lat: 11.416667, lng: 77.683333 },
  { id: 'bhavani', name: 'Bhavani', lat: 11.448560, lng: 77.683050 },
];

export default function MapPickerModal({ 
  visible, 
  onClose, 
  onSelectLocation, 
  initialCoords = '', 
  title = 'Select Location from Map',
  targetFieldName = 'end'
}) {
  const [selectedLat, setSelectedLat] = useState(11.285000);
  const [selectedLng, setSelectedLng] = useState(77.640000);
  const [locating, setLocating] = useState(false);
  const iframeRef = useRef(null);

  // Sync initial coords when modal opens
  useEffect(() => {
    if (visible) {
      let lat = 11.285000;
      let lng = 77.640000;
      if (initialCoords) {
        const parsed = parseLatLng(initialCoords);
        if (parsed) {
          lat = Number(parsed.lat.toFixed(6));
          lng = Number(parsed.lng.toFixed(6));
        }
      }
      setSelectedLat(lat);
      setSelectedLng(lng);
    }
  }, [visible, initialCoords]);

  // Listen for message from Leaflet iframe on Web
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    const handleMessage = (event) => {
      if (!event.data) return;
      if (event.data.type === 'COORD_PICKED') {
        const lat = Number(event.data.lat);
        const lng = Number(event.data.lng);
        if (!isNaN(lat) && !isNaN(lng)) {
          setSelectedLat(Number(lat.toFixed(6)));
          setSelectedLng(Number(lng.toFixed(6)));
        }
      } else if (event.data.type === 'COORD_PICKED_AND_CONFIRM') {
        const lat = Number(event.data.lat);
        const lng = Number(event.data.lng);
        if (!isNaN(lat) && !isNaN(lng)) {
          handleConfirmWithCoords(lat, lng);
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onSelectLocation, onClose]);

  // Send message to iframe to pan and update marker
  const postToMap = (lat, lng, zoom = 15) => {
    const fixedLat = Number(lat.toFixed(6));
    const fixedLng = Number(lng.toFixed(6));
    setSelectedLat(fixedLat);
    setSelectedLng(fixedLng);

    if (iframeRef.current && iframeRef.current.contentWindow) {
      iframeRef.current.contentWindow.postMessage({
        type: 'SET_MAP_VIEW',
        lat: fixedLat,
        lng: fixedLng,
        zoom
      }, '*');
    }
  };

  // GPS My Location
  const handleDetectGPS = async () => {
    try {
      setLocating(true);
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Location permission is required to detect coordinates.');
        return;
      }

      let loc = await Location.getLastKnownPositionAsync().catch(() => null);
      if (loc?.coords) {
        postToMap(loc.coords.latitude, loc.coords.longitude, 16);
      }

      loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }).catch(async () => {
        return await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).catch(() => null);
      });

      if (loc?.coords) {
        postToMap(loc.coords.latitude, loc.coords.longitude, 16);
      } else {
        Alert.alert('Location Notice', 'Could not obtain exact GPS coordinates.');
      }
    } catch (e) {
      Alert.alert('Location Error', e.message || 'Unable to fetch current location.');
    } finally {
      setLocating(false);
    }
  };

  const handleConfirmWithCoords = async (lat, lng) => {
    const formatted = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    let name = '';
    try {
      const rev = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
      if (Array.isArray(rev) && rev.length > 0) {
        const p = rev[0];
        name = p.name || p.street || p.district || p.city || '';
      }
    } catch (e) {}

    onSelectLocation({
      lat,
      lng,
      formatted,
      name
    });
    onClose();
  };

  const handleConfirm = () => {
    handleConfirmWithCoords(selectedLat, selectedLng);
  };

  // Generate Leaflet HTML for web iframe
  const getLeafletHtml = () => {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    * { box-sizing: border-box; }
    html, body { 
      margin: 0; 
      padding: 0; 
      width: 100%; 
      height: 100%; 
      overflow: hidden; 
      background: #f8fafc; 
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; 
    }
    #map { width: 100%; height: 100%; cursor: crosshair; }
    .map-badge {
      position: absolute;
      top: 10px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 1000;
      background: rgba(15, 23, 42, 0.88);
      color: #ffffff;
      padding: 6px 16px;
      border-radius: 20px;
      font-size: 11px;
      font-weight: 600;
      box-shadow: 0 4px 14px rgba(0,0,0,0.2);
      pointer-events: none;
      white-space: nowrap;
    }
  </style>
</head>
<body>
  <div class="map-badge">Click anywhere on map to pick location</div>
  <div id="map"></div>
  <script>
    var lat = ${selectedLat};
    var lng = ${selectedLng};
    var map = L.map('map', { 
      zoomControl: true,
      doubleClickZoom: false 
    }).setView([lat, lng], 15);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    var marker = L.marker([lat, lng], { draggable: true }).addTo(map);

    function sendCoord(latVal, lngVal, confirmNow) {
      window.parent.postMessage({
        type: confirmNow ? 'COORD_PICKED_AND_CONFIRM' : 'COORD_PICKED',
        lat: Number(latVal.toFixed(6)),
        lng: Number(lngVal.toFixed(6))
      }, '*');
    }

    map.on('click', function(e) {
      marker.setLatLng(e.latlng);
      sendCoord(e.latlng.lat, e.latlng.lng, false);
    });

    map.on('dblclick', function(e) {
      marker.setLatLng(e.latlng);
      sendCoord(e.latlng.lat, e.latlng.lng, true);
    });

    marker.on('dragend', function() {
      var pos = marker.getLatLng();
      sendCoord(pos.lat, pos.lng, false);
    });

    window.addEventListener('message', function(event) {
      if (!event.data) return;
      if (event.data.type === 'SET_MAP_VIEW') {
        var nLat = Number(event.data.lat);
        var nLng = Number(event.data.lng);
        if (!isNaN(nLat) && !isNaN(nLng)) {
          map.setView([nLat, nLng], event.data.zoom || 15);
          marker.setLatLng([nLat, nLng]);
        }
      }
    });
  </script>
</body>
</html>`;
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modalCard}>
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.headerTitle}>{title}</Text>
              <Text style={styles.headerSub}>Click on the map to drop pin • Double click to select</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
              <Text style={styles.closeBtnText}>Close</Text>
            </TouchableOpacity>
          </View>

          {/* Quick Jump Anchors */}
          <View style={styles.anchorRow}>
            <TouchableOpacity 
              style={[styles.anchorBtn, styles.gpsAnchorBtn]} 
              onPress={handleDetectGPS}
              disabled={locating}
              activeOpacity={0.7}
            >
              <Text style={styles.gpsAnchorText}>{locating ? 'Locating...' : 'Use GPS'}</Text>
            </TouchableOpacity>

            {PRESET_LOCATIONS.map((preset) => (
              <TouchableOpacity
                key={preset.id}
                style={styles.anchorBtn}
                onPress={() => postToMap(preset.lat, preset.lng, 15)}
                activeOpacity={0.7}
              >
                <Text style={styles.anchorBtnText}>{preset.name}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Real Interactive Map View */}
          <View style={styles.mapContainer}>
            {Platform.OS === 'web' ? (
              <iframe
                ref={iframeRef}
                srcDoc={getLeafletHtml()}
                style={styles.iframe}
                title="Interactive Map Picker"
              />
            ) : (
              <View style={styles.fallbackView}>
                <Text style={styles.fallbackText}>Map picker is optimized for Web interface.</Text>
              </View>
            )}
          </View>

          {/* Bottom Confirmation Bar */}
          <View style={styles.footer}>
            <View style={styles.coordsDisplay}>
              <Text style={styles.coordsLabel}>Coordinates</Text>
              <Text style={styles.coordsValue}>
                {selectedLat.toFixed(6)}, {selectedLng.toFixed(6)}
              </Text>
            </View>

            <View style={styles.actions}>
              <TouchableOpacity 
                style={styles.cancelBtn} 
                onPress={onClose}
                activeOpacity={0.7}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.confirmBtn} 
                onPress={handleConfirm}
                activeOpacity={0.85}
              >
                <Text style={styles.confirmBtnText}>Select Location</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16
  },
  modalCard: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    width: '100%',
    maxWidth: 880,
    height: '88%',
    maxHeight: 700,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e5e7eb'
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff'
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827'
  },
  headerSub: {
    fontSize: 11,
    color: '#6b7280',
    marginTop: 2
  },
  closeBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8
  },
  closeBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6b7280'
  },
  anchorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderColor: '#e5e7eb'
  },
  anchorBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#ffffff'
  },
  anchorBtnText: {
    fontSize: 11.5,
    fontWeight: '500',
    color: '#374151'
  },
  gpsAnchorBtn: {
    borderColor: '#111827',
    backgroundColor: '#111827'
  },
  gpsAnchorText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#ffffff'
  },
  mapContainer: {
    flex: 1,
    backgroundColor: '#f9fafb',
    position: 'relative'
  },
  iframe: {
    width: '100%',
    height: '100%',
    border: 'none'
  },
  fallbackView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  fallbackText: {
    color: '#6b7280',
    fontSize: 13
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff'
  },
  coordsDisplay: {
    flexDirection: 'column',
    gap: 2
  },
  coordsLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: 0.3
  },
  coordsValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#111827'
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  cancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#ffffff'
  },
  cancelBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4b5563'
  },
  confirmBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 6,
    backgroundColor: '#111827'
  },
  confirmBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ffffff'
  }
});
