import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { AuthProvider } from './src/context/AuthContext';
import RootNavigator from './src/navigation/RootNavigator';

import { View, Text, TouchableOpacity } from 'react-native';

// Register background task definition safely
import './src/services/taskManager';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.warn('[App ErrorBoundary caught]:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <SafeAreaProvider>
          <View style={{ flex: 1, backgroundColor: '#ffffff', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
            <Text style={{ fontSize: 18, fontWeight: '900', color: '#b91c1c', marginBottom: 8 }}>Notice</Text>
            <Text style={{ fontSize: 13, color: '#475569', textAlign: 'center', marginBottom: 20 }}>
              {String(this.state.error?.message || this.state.error)}
            </Text>
            <TouchableOpacity 
              style={{ backgroundColor: '#162a6b', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 }}
              onPress={() => this.setState({ hasError: false, error: null })}
            >
              <Text style={{ color: '#ffffff', fontWeight: '800' }}>Try Again</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaProvider>
      );
    }
    return this.props.children;
  }
}

import { navigationRef } from './src/navigation/navigationRef';

export default function App() {
  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <AuthProvider>
          <NavigationContainer ref={navigationRef}>
            <StatusBar style="dark" />
            <RootNavigator />
          </NavigationContainer>
        </AuthProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}

