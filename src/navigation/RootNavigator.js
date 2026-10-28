import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { resetRoot } from './navigationRef';

import LoginScreen from '../screens/LoginScreen';
import ParentHome from '../screens/ParentHome';
import BusTracker from '../screens/BusTracker';
import AdminDashboard from '../screens/AdminDashboard';
import AdminAddBus from '../screens/AdminAddBus';
import DriverTracking from '../screens/DriverTracking';

const Stack = createNativeStackNavigator();

export default function RootNavigator() {
  const { role, isLoading } = useAuth();

  React.useEffect(() => {
    if (!isLoading && role) {
      if (role === 'admin') {
        resetRoot('AdminDashboard');
      } else if (role === 'driver') {
        resetRoot('DriverTracking');
      }
    }
  }, [role, isLoading]);

  return (
    <Stack.Navigator
      initialRouteName="ParentHome"
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right'
      }}
    >
      <Stack.Screen name="ParentHome" component={ParentHome} />
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="BusTracker" component={BusTracker} />
      <Stack.Screen name="AdminDashboard" component={AdminDashboard} />
      <Stack.Screen name="AdminAddBus" component={AdminAddBus} />
      <Stack.Screen name="DriverTracking" component={DriverTracking} />
    </Stack.Navigator>
  );
}
