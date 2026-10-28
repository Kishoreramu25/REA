import React, { useState } from 'react';
import { 
  View, 
  Text, 
  TextInput,
  TouchableOpacity, 
  Image, 
  StyleSheet, 
  ScrollView, 
  ActivityIndicator,
  Platform,
  Vibration
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { COLORS, APP_CONFIG } from '../utils/constants';

export default function LoginScreen({ navigation }) {
  const { verifyPin } = useAuth();
  const [pin, setPin] = useState('');
  const [driverPin, setDriverPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const MAX_PIN_LENGTH = 6;

  // Handle direct text input for 6-digit driver PIN
  const handleDriverPinChange = (text) => {
    if (loading) return;
    const clean = text.replace(/[^0-9]/g, '').slice(0, MAX_PIN_LENGTH);
    setDriverPin(clean);
    setPin(clean);
    setError('');

    if (clean.length === MAX_PIN_LENGTH) {
      submitPin(clean);
    }
  };

  // Handle digit press on custom keypad
  const handleKeyPress = (digit) => {
    if (loading) return;
    setError('');

    const current = driverPin || pin;
    if (current.length < MAX_PIN_LENGTH) {
      const newPin = current + digit;
      setPin(newPin);
      setDriverPin(newPin);

      // Auto verify when 6 digits are reached
      if (newPin.length === MAX_PIN_LENGTH) {
        submitPin(newPin);
      }
    }
  };

  // Handle backspace / delete
  const handleDelete = () => {
    if (loading) return;
    setError('');
    setPin((prev) => prev.slice(0, -1));
    setDriverPin((prev) => prev.slice(0, -1));
  };

  // Handle clear all
  const handleClear = () => {
    if (loading) return;
    setError('');
    setPin('');
    setDriverPin('');
  };

  // Verify PIN against Admin (587828) & Driver assigned PINs
  const submitPin = async (pinToVerify) => {
    const rawPin = pinToVerify || driverPin || pin;
    const cleanPin = String(rawPin || '').trim();

    if (!cleanPin || cleanPin.length !== 6) {
      setError('Please enter a 6-digit PIN');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const session = await verifyPin(cleanPin);

      if (session?.role === 'admin') {
        navigation.navigate('AdminDashboard');
      } else if (session?.role === 'driver') {
        navigation.navigate('DriverTracking');
      } else {
        setError('Invalid PIN. Check your assigned Driver PIN or Admin password.');
        setPin('');
        setDriverPin('');
      }
    } catch (err) {
      if (Platform.OS !== 'web') {
        Vibration.vibrate(100);
      }
      setError(err.message || 'Invalid PIN. Check your Driver PIN or Admin password.');
      setPin('');
      setDriverPin('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView 
      style={styles.container} 
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      bounces={false}
    >
      {/* Top Bar with Back Arrow */}
      <View style={styles.topBar}>
        <TouchableOpacity 
          style={styles.backBtn} 
          onPress={() => navigation.navigate('ParentHome')}
          activeOpacity={0.7}
        >
          <Text style={styles.backBtnText}>←</Text>
        </TouchableOpacity>
      </View>

      {/* Institutional Branding matching ParentHome.js */}
      <View style={styles.header}>
        <Image
          source={require('../../assets/logo.png')}
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={styles.collegeName}>ERODE SENGUNTHAR</Text>
        <Text style={styles.collegeSub}>ENGINEERING COLLEGE</Text>
      </View>

      {/* PIN Prompt Header */}
      <View style={styles.promptWrap}>
        <Text style={styles.promptTitle}>Enter Access PIN</Text>
        <Text style={styles.promptDesc}>
          Enter 6-digit driver PIN or master admin PIN
        </Text>
      </View>

      {/* Driver PIN Input */}
      <View style={styles.inputWrapper}>
        <TextInput
          placeholder="PIN"
          placeholderTextColor="#9ca3af"
          maxLength={6}
          keyboardType="numeric"
          secureTextEntry={true}
          value={driverPin}
          onChangeText={handleDriverPinChange}
          style={styles.pinInput}
          editable={!loading}
        />
      </View>

      {/* 6-Digit PIN Display Indicator */}
      <View style={styles.dotsContainer}>
        {[0, 1, 2, 3, 4, 5].map((index) => {
          const isFilled = index < (driverPin || pin).length;
          return (
            <View 
              key={index} 
              style={[
                styles.dot, 
                isFilled && styles.dotFilled,
                error ? styles.dotError : null
              ]} 
            />
          );
        })}
      </View>

      {/* Error Message */}
      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : (
        <View style={styles.errorPlaceholder} />
      )}

      {/* On-Screen Numeric Keypad */}
      <View style={styles.keypad}>
        {/* Row 1 */}
        <View style={styles.keyRow}>
          <KeyButton label="1" onPress={() => handleKeyPress('1')} disabled={loading} />
          <KeyButton label="2" onPress={() => handleKeyPress('2')} disabled={loading} />
          <KeyButton label="3" onPress={() => handleKeyPress('3')} disabled={loading} />
        </View>

        {/* Row 2 */}
        <View style={styles.keyRow}>
          <KeyButton label="4" onPress={() => handleKeyPress('4')} disabled={loading} />
          <KeyButton label="5" onPress={() => handleKeyPress('5')} disabled={loading} />
          <KeyButton label="6" onPress={() => handleKeyPress('6')} disabled={loading} />
        </View>

        {/* Row 3 */}
        <View style={styles.keyRow}>
          <KeyButton label="7" onPress={() => handleKeyPress('7')} disabled={loading} />
          <KeyButton label="8" onPress={() => handleKeyPress('8')} disabled={loading} />
          <KeyButton label="9" onPress={() => handleKeyPress('9')} disabled={loading} />
        </View>

        {/* Row 4 */}
        <View style={styles.keyRow}>
          <TouchableOpacity 
            style={[styles.key, styles.clearKey]} 
            onPress={handleClear} 
            activeOpacity={0.6}
            disabled={loading || (driverPin || pin).length === 0}
          >
            <Text style={styles.clearKeyText}>C</Text>
          </TouchableOpacity>

          <KeyButton label="0" onPress={() => handleKeyPress('0')} disabled={loading} />

          <TouchableOpacity 
            style={[styles.key, styles.deleteKey]} 
            onPress={handleDelete} 
            activeOpacity={0.6}
            disabled={loading || (driverPin || pin).length === 0}
          >
            <Text style={styles.deleteKeyText}>⌫</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Submit / Verification Button */}
      <TouchableOpacity 
        style={[
          styles.submitBtn,
          ((driverPin || pin).length !== 6 || loading) && styles.submitBtnDisabled
        ]} 
        onPress={() => submitPin(driverPin || pin)}
        disabled={(driverPin || pin).length !== 6 || loading}
        activeOpacity={0.8}
      >
        {loading ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <Text style={styles.submitBtnText}>Verify & Enter</Text>
        )}
      </TouchableOpacity>

      {/* Security Note at bottom */}
      <View style={styles.footerNote}>
        <Text style={styles.footerNoteText}>
          ESEC Transport Management
        </Text>
      </View>
    </ScrollView>
  );
}

// Reusable numeric keypad button
function KeyButton({ label, onPress, disabled }) {
  return (
    <TouchableOpacity 
      style={styles.key} 
      onPress={onPress} 
      activeOpacity={0.5}
      disabled={disabled}
    >
      <Text style={styles.keyText}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff'
  },
  content: {
    paddingHorizontal: 28,
    paddingTop: Platform.OS === 'ios' ? 60 : 44,
    paddingBottom: 24,
    alignItems: 'center'
  },
  topBar: {
    width: '100%',
    paddingBottom: 4,
    flexDirection: 'row',
    alignItems: 'center'
  },
  backBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    marginRight: 4
  },
  backBtnText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#374151'
  },
  header: {
    alignItems: 'center',
    marginBottom: 20,
    marginTop: 2
  },
  logo: {
    width: 96,
    height: 96,
    marginBottom: 14
  },
  collegeName: {
    fontSize: 18,
    fontWeight: '900',
    color: '#111827',
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
  promptWrap: {
    alignItems: 'center',
    marginBottom: 16
  },
  promptTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'center'
  },
  promptDesc: {
    fontSize: 12,
    color: '#6b7280',
    textAlign: 'center',
    marginTop: 4
  },
  inputWrapper: {
    width: '100%',
    maxWidth: 280,
    marginBottom: 16
  },
  pinInput: {
    width: '100%',
    height: 50,
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#d1d5db',
    borderRadius: 8,
    textAlign: 'center',
    fontSize: 22,
    fontWeight: '800',
    color: '#111827',
    letterSpacing: 6
  },
  dotsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 14,
    marginBottom: 12
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: '#d1d5db',
    backgroundColor: '#ffffff'
  },
  dotFilled: {
    borderColor: '#111827',
    backgroundColor: '#111827'
  },
  dotError: {
    borderColor: '#ef4444',
    backgroundColor: '#fee2e2'
  },
  errorBox: {
    backgroundColor: '#fee2e2',
    borderWidth: 1,
    borderColor: '#fca5a5',
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginBottom: 12,
    maxWidth: 320
  },
  errorText: {
    color: '#b91c1c',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center'
  },
  errorPlaceholder: {
    height: 24,
    marginBottom: 8
  },
  keypad: {
    width: '100%',
    maxWidth: 300,
    gap: 12,
    marginBottom: 20
  },
  keyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 14
  },
  key: {
    flex: 1,
    height: 60,
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center'
  },
  keyText: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827'
  },
  clearKey: {
    backgroundColor: '#ffffff',
    borderColor: '#e5e7eb'
  },
  clearKeyText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#6b7280'
  },
  deleteKey: {
    backgroundColor: '#ffffff',
    borderColor: '#e5e7eb'
  },
  deleteKeyText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827'
  },
  submitBtn: {
    width: '100%',
    maxWidth: 300,
    height: 44,
    backgroundColor: '#111827',
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16
  },
  submitBtnDisabled: {
    backgroundColor: '#9ca3af'
  },
  submitBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.3
  },
  footerNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4
  },
  footerNoteText: {
    fontSize: 11,
    color: '#9ca3af',
    fontWeight: '500'
  }
});

