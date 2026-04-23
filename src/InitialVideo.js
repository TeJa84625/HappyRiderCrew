import React, { useState, useEffect } from 'react';
import {
  StyleSheet, Text, View, TouchableOpacity, SafeAreaView,
  StatusBar, Dimensions, Platform, ActivityIndicator
} from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import YoutubePlayer from "react-native-youtube-iframe";
import { Ionicons } from '@expo/vector-icons';

const { width, height } = Dimensions.get('window');

const COLORS = {
  primaryGreen: '#5C832F',
  white: '#FFFFFF',
  darkNavy: '#0F172A',
  overlay: 'rgba(0,0,0,0.7)'
};

// ================= CONFIG =================
const isOnlineMode = true; // true = YouTube, false = local video
const YT_VIDEO_ID = "7KgzkwjjKLg";
const SKIP_TIME_REQUIRED = 20;

export default function InitialVideo({ navigation }) {
  const [countdown, setCountdown] = useState(SKIP_TIME_REQUIRED);
  const [canSkip, setCanSkip] = useState(false);
  const [videoLoaded, setVideoLoaded] = useState(false);
  const [playVideo, setPlayVideo] = useState(true);

  useEffect(() => {
    // ⛔ Start timer ONLY after video loads
    if (!videoLoaded) return;

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setCanSkip(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [videoLoaded]);

  const handleNavigate = () => {
    setPlayVideo(false);

    navigation.reset({
      index: 0,
      routes: [{ name: 'MainTabs' }],
    });
  };

  const renderVideo = () => {
    // ================= WEB YOUTUBE =================
    if (isOnlineMode && Platform.OS === 'web') {
      return (
        <iframe
          width="100%"
          height="100%"
          src={`https://www.youtube.com/embed/${YT_VIDEO_ID}?autoplay=1&mute=0&controls=0&rel=0&modestbranding=1`}
          allow="autoplay; encrypted-media"
          frameBorder="0"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%'
          }}
          onLoad={() => setVideoLoaded(true)}
        />
      );
    }

    // ================= MOBILE YOUTUBE =================
    if (isOnlineMode) {
      return (
        <YoutubePlayer
          height={height}
          width={width}
          play={playVideo}
          videoId={YT_VIDEO_ID}
          initialPlayerParams={{
            controls: false,
            modestbranding: true,
            rel: false,
            autoplay: true
          }}
          onReady={() => setVideoLoaded(true)}
          onChangeState={(state) => {
            if (state === "ended") handleNavigate();
          }}
        />
      );
    }

    // ================= OFFLINE VIDEO =================
    return (
      <Video
        style={styles.video}
        source={require('../assets/intro_video.mp4')}
        resizeMode={ResizeMode.COVER}
        shouldPlay
        isLooping={false}
        useNativeControls={false}
        onLoad={() => setVideoLoaded(true)}
        onPlaybackStatusUpdate={(status) => {
          if (status.didJustFinish) handleNavigate();
        }}
      />
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar hidden />

      {renderVideo()}

      {/* Loader */}
      {!videoLoaded && (
        <View style={styles.loaderOverlay}>
          <ActivityIndicator size="large" color={COLORS.primaryGreen} />
          <Text style={{ color: '#fff', marginTop: 10 }}>
            Loading Video...
          </Text>
        </View>
      )}

      {/* TOP BRAND */}
      <View style={styles.topOverlay}>
        <Text style={styles.brandText}>Happy Rider Crew</Text>
      </View>

      {/* SKIP BUTTON */}
      <View style={styles.bottomOverlay}>
        <TouchableOpacity
          style={[styles.skipButton, (!canSkip || !videoLoaded) && styles.disabledSkip]}
          onPress={canSkip ? handleNavigate : null}
          disabled={!canSkip || !videoLoaded}
        >
          <Text style={styles.skipButtonText}>
            {!videoLoaded
              ? "Loading..."
              : canSkip
              ? "Skip Intro"
              : `Skip in ${countdown}s`}
          </Text>

          <Ionicons
            name={canSkip ? "chevron-forward-circle" : "time-outline"}
            size={24}
            color="#fff"
            style={{ marginLeft: 10 }}
          />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// ================= STYLES =================
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },

  video: {
    width: '100%',
    height: '100%',
    position: 'absolute'
  },

  loaderOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10
  },

  topOverlay: {
    position: 'absolute',
    top: 60,
    width: '100%',
    alignItems: 'center',
    zIndex: 20
  },

  brandText: {
    color: COLORS.white,
    fontSize: 24,
    fontWeight: 'bold'
  },

  bottomOverlay: {
    position: 'absolute',
    bottom: 60,
    width: '100%',
    alignItems: 'center',
    zIndex: 20
  },

  skipButton: {
    flexDirection: 'row',
    backgroundColor: COLORS.primaryGreen,
    paddingHorizontal: 40,
    paddingVertical: 18,
    borderRadius: 40,
    alignItems: 'center'
  },

  disabledSkip: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)'
  },

  skipButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold'
  }
});