import {
  IBMPlexSans_400Regular,
  IBMPlexSans_500Medium,
  IBMPlexSans_600SemiBold,
  useFonts,
} from '@expo-google-fonts/ibm-plex-sans';
import { Literata_400Regular, Literata_500Medium } from '@expo-google-fonts/literata';
import { DefaultTheme, NavigationContainer, Theme } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AnimatedSplash } from './src/components';
import { RootNavigator } from './src/navigation/RootNavigator';
import { LoginScreen } from './src/screens/LoginScreen';
import { AuthProvider, useAuth } from './src/state/AuthContext';
import { JournalsProvider } from './src/state/JournalsContext';
import { ProfileProvider } from './src/state/ProfileContext';
import { SnackbarProvider } from './src/state/SnackbarContext';
import { colors } from './src/theme';

const navigationTheme: Theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: colors.background,
    card: colors.surface,
    text: colors.text,
    border: colors.border,
    primary: colors.primary,
  },
};

const SPLASH_MIN_MS = 1500;

/** Decides between the animated splash, the login gate, and the app. */
function Shell({ fontsLoaded }: { fontsLoaded: boolean }) {
  const { user, initializing } = useAuth();
  const [minTimeDone, setMinTimeDone] = useState(false);
  const [splashMounted, setSplashMounted] = useState(true);
  const splashOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const timer = setTimeout(() => setMinTimeDone(true), SPLASH_MIN_MS);
    return () => clearTimeout(timer);
  }, []);

  const appReady = fontsLoaded && !initializing;

  useEffect(() => {
    if (appReady && minTimeDone && splashMounted) {
      Animated.timing(splashOpacity, {
        toValue: 0,
        duration: 450,
        useNativeDriver: true,
      }).start(() => setSplashMounted(false));
    }
  }, [appReady, minTimeDone, splashMounted, splashOpacity]);

  return (
    <View style={styles.flex}>
      {fontsLoaded ? (
        user ? (
          <NavigationContainer theme={navigationTheme}>
            <StatusBar style="dark" />
            <RootNavigator />
          </NavigationContainer>
        ) : (
          <View style={styles.flex}>
            <StatusBar style="dark" />
            <LoginScreen />
          </View>
        )
      ) : null}

      {splashMounted ? (
        <Animated.View style={[styles.overlay, { opacity: splashOpacity }]} pointerEvents="none">
          <AnimatedSplash />
        </Animated.View>
      ) : null}
    </View>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({
    IBMPlexSans_400Regular,
    IBMPlexSans_500Medium,
    IBMPlexSans_600SemiBold,
    Literata_400Regular,
    Literata_500Medium,
  });

  return (
    <GestureHandlerRootView style={styles.flex}>
      <SafeAreaProvider>
        <AuthProvider>
          <ProfileProvider>
            <JournalsProvider>
              <SnackbarProvider>
                <Shell fontsLoaded={fontsLoaded} />
              </SnackbarProvider>
            </JournalsProvider>
          </ProfileProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
});
