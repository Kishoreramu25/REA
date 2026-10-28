import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, Platform } from 'react-native';
import BusForm from '../components/BusForm';
import { useBusData } from '../hooks/useBusData';

export default function AdminAddBus({ navigation, route }) {
  const { addBus, updateBus } = useBusData();
  const busToEdit = route.params?.busToEdit || null;
  const isEditing = Boolean(busToEdit);

  const handleSave = async (formData) => {
    try {
      if (isEditing) {
        await updateBus(busToEdit.id, formData);
        Alert.alert('Success', `Bus No ${formData.routeNo} updated successfully!`);
      } else {
        await addBus(formData);
        Alert.alert('Success', `Bus No ${formData.routeNo} created successfully!`);
      }
      navigation.goBack();
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to save bus');
    }
  };

  const handleExit = () => {
    if (Platform.OS === 'web') {
      const confirmed = window.confirm('Exit without saving? Any unsaved route details will be discarded.');
      if (confirmed) {
        navigation.goBack();
      }
    } else {
      Alert.alert(
        'Exit Bus Form',
        'Are you sure you want to exit? Any unsaved route details will be discarded.',
        [
          { text: 'Keep Editing', style: 'cancel' },
          { 
            text: 'Exit Without Saving', 
            style: 'destructive', 
            onPress: () => navigation.goBack() 
          }
        ]
      );
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={handleExit} activeOpacity={0.7}>
          <Text style={styles.backBtnText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {isEditing ? `Edit ${busToEdit.name}` : 'Add New Bus Route'}
        </Text>
      </View>

      <BusForm
        initialValues={busToEdit}
        onSave={handleSave}
        onCancel={handleExit}
        submitLabel={isEditing ? 'Save Changes' : 'Create Bus Route'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff'
  },
  header: {
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 48 : 42,
    paddingBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  backBtn: {
    paddingVertical: 2,
    paddingHorizontal: 6,
    marginRight: 4
  },
  backBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151'
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827'
  }
});
