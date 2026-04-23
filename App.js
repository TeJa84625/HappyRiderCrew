import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import InitialVideo from './src/InitialVideo';
import LoginScreen from './src/LoginScreen';
import SignUpScreen from './src/SignUpScreen';
import VehicleKYC from './src/VehicleKYC';
import PersonKYC from './src/PersonKYC';
import { MainTabs } from './src/MainTabs';

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator 
        initialRouteName="Login" // Start at Login
        screenOptions={{ headerShown: false }}
      >
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="SignUp" component={SignUpScreen} />
        
        <Stack.Screen name="VehicleKYC" component={VehicleKYC} />
        <Stack.Screen name="PersonKYC" component={PersonKYC} />

        <Stack.Screen name="InitialVideo" component={InitialVideo} />

        <Stack.Screen name="MainTabs" component={MainTabs} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}