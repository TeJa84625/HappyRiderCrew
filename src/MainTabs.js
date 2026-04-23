import React, { useState, useEffect } from 'react';
import { 
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, 
  Alert, SafeAreaView, Platform, Linking, Share, Image 
} from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from './firebase'; 

const Tab = createBottomTabNavigator();
const COLORS = { primaryGreen: '#5C832F', darkNavy: '#0F172A', bg: '#F3F4F6', white: '#FFFFFF', blue: '#3B82F6' };

const HomeScreen = () => {
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribe;

    const fetchUserData = async () => {
      try {
        const rawData = await AsyncStorage.getItem('personalInfo');
        if (rawData) {
          const session = JSON.parse(rawData);
          const mobileId = session?.mobile || session?.personalInfo?.mobile;
          
          if (mobileId) {
            unsubscribe = onSnapshot(doc(db, "users", mobileId), (docSnap) => {
              if (docSnap.exists()) {
                setUserData(docSnap.data());
              }
              setLoading(false);
            });
          } else {
            setLoading(false);
          }
        } else {
          setLoading(false);
        }
      } catch (error) {
        console.error("Error fetching session details:", error);
        setLoading(false);
      }
    };

    fetchUserData();

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  // --- NEW: Functional Contact Handlers ---
  const handleEmailSupport = () => {
    Linking.openURL('mailto:a@mail.com?subject=Support Request - Crew App');
  };

  const handlePhoneSupport = () => {
    Linking.openURL('tel:123456789');
  };

  const renderContent = () => {
    if (loading) return <ActivityIndicator size="large" color={COLORS.primaryGreen} />;

    const status = userData?.kycStatus;

    if (status === 'rejected') {
      return (
        <View style={styles.centerContent}>
          <Ionicons name="close-circle-outline" size={70} color="#EF4444" />
          <Text style={styles.statusTitle}>Application Rejected</Text>
          <Text style={styles.statusText}>We rejected your application due to the following reason:</Text>
          
          <View style={styles.reasonBox}>
            <Text style={styles.reasonText}>{userData?.reason || "Incomplete documentation. Please reach out to support."}</Text>
          </View>

          <Text style={styles.contactHeader}>Need help?</Text>
          <TouchableOpacity style={styles.contactRow} onPress={handleEmailSupport}>
            <Ionicons name="mail" size={20} color={COLORS.primaryGreen} />
            <Text style={styles.contactLink}>a@mail.com</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.contactRow} onPress={handlePhoneSupport}>
            <Ionicons name="call" size={20} color={COLORS.primaryGreen} />
            <Text style={styles.contactLink}>123456789</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (status === 'accepted') {
      return (
        <View style={styles.centerContent}>
          <Ionicons name="bicycle-outline" size={70} color={COLORS.primaryGreen} />
          <Text style={styles.statusTitle}>No Active Rides</Text>
          <Text style={styles.statusText}>You are verified and ready to go! There are currently no active rides assigned to you.</Text>
        </View>
      );
    }

    return (
      <View style={styles.centerContent}>
        <Ionicons name="time-outline" size={70} color="#F59E0B" />
        <Text style={styles.statusTitle}>Application Submitted!</Text>
        <Text style={styles.statusText}>We are working on your KYC verification. We will notify you within 24-72 hours once it is complete.</Text>
        
        <View style={{ marginTop: 30, alignItems: 'center', width: '100%' }}>
          <Text style={styles.contactHeader}>Contact Us</Text>
          <TouchableOpacity style={styles.contactRow} onPress={handleEmailSupport}>
            <Ionicons name="mail" size={20} color={COLORS.primaryGreen} />
            <Text style={styles.contactLink}>a@mail.com</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.contactRow} onPress={handlePhoneSupport}>
            <Ionicons name="call" size={20} color={COLORS.primaryGreen} />
            <Text style={styles.contactLink}>123456789</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.webWrapper}>
        <View style={styles.card}>
          {renderContent()}
        </View>
      </View>
    </SafeAreaView>
  );
};

const ProfileScreen = ({ navigation }) => {
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity onPress={handleLogout} style={styles.headerLogoutBtn}>
          <Ionicons name="log-out-outline" size={26} color="#EF4444" />
        </TouchableOpacity>
      )
    });

    const fetchUserData = async () => {
      try {
        const rawData = await AsyncStorage.getItem('personalInfo');
        if (rawData) {
          const session = JSON.parse(rawData);
          const mobileId = session?.mobile || session?.personalInfo?.mobile;
          
          if (mobileId) {
            onSnapshot(doc(db, "users", mobileId), (docSnap) => {
              if (docSnap.exists()) setUserData(docSnap.data());
              setLoading(false);
            });
          } else { setLoading(false); }
        } else { setLoading(false); }
      } catch (error) { setLoading(false); }
    };

    fetchUserData();
  }, [navigation]);

  // --- LOGOUT FUNCTIONALITY ---
  // --- LOGOUT FUNCTIONALITY (Mobile & Web Supported) ---
  const handleLogout = () => {
    const executeLogout = async () => {
      try {
        await AsyncStorage.clear(); 
        
        // Grab the parent navigator to break out of the bottom tabs
        const parentNav = navigation.getParent() || navigation;
        
        parentNav.reset({ 
          index: 0, 
          routes: [{ name: 'Login' }] // <-- Fixed: Now exactly matches your Stack.Screen name
        }); 
        
      } catch (error) {
        console.error("Error clearing session:", error);
        if (Platform.OS === 'web') {
          window.alert("Failed to log out properly. Please try again.");
        } else {
          Alert.alert("Error", "Failed to log out properly. Please try again.");
        }
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm("Are you sure you want to securely log out?")) {
        executeLogout();
      }
    } else {
      Alert.alert("Log Out", "Are you sure you want to securely log out?", [
        { text: "Cancel", style: "cancel" },
        { text: "Log Out", style: "destructive", onPress: executeLogout }
      ]);
    }
  };

  // --- NEW: SHARE FUNCTIONALITY ---
  const handleShare = async (code) => {
    try {
      await Share.share({
        message: `Hey! Join the delivery crew and earn rewards using my referral code: ${code}\n\nDownload the app now!`,
      });
    } catch (error) {
      console.error("Error sharing code:", error.message);
    }
  };

  const renderContent = () => {
    if (loading) return <ActivityIndicator size="large" color={COLORS.primaryGreen} />;

    const fullName = userData?.fullName || "Crew Member";
    const mobile = userData?.mobile || userData?.personalInfo?.mobile || "N/A";
    const city = userData?.personalInfo?.preferredRideCity || "Location Not Set";
    
    // Pure text logic for vehicle (Removed image completely as requested)
    const brand = userData?.vehicleKycInfo?.vehicleCompany || userData?.vehicleKycInfo?.company || "";
    const model = userData?.vehicleKycInfo?.vehicleModel || userData?.vehicleKycInfo?.model || "Vehicle";
    const plateRaw = userData?.vehicleKycInfo?.rcNumber || userData?.vehicleInfo?.rcNumber;
    const plate = plateRaw ? ` (${plateRaw})` : "";
    const vehicleDisplay = `${brand} ${model}${plate}`.trim();

    const referralCode = userData?.myReferralCode || "Generating...";

    return (
      <View style={styles.profileContent}>
        <View style={styles.avatarCircle}>
          <Text style={styles.avatarText}>{fullName.charAt(0).toUpperCase()}</Text>
        </View>
        <Text style={styles.profileName}>{fullName}</Text>
        <Text style={styles.profileDetail}>+91 {mobile}</Text>
        
        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Ionicons name="location" size={20} color={COLORS.primaryGreen} />
            <Text style={styles.infoText}>{city}</Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="bicycle" size={20} color={COLORS.primaryGreen} />
            <Text style={styles.infoText}>{vehicleDisplay}</Text>
          </View>
        </View>
        
        <View style={styles.referralBox}>
          <Text style={styles.referralLabel}>Your Referral Code</Text>
          <Text style={styles.referralCode}>{referralCode}</Text>
          
          <TouchableOpacity style={styles.shareBtn} onPress={() => handleShare(referralCode)}>
            <Ionicons name="share-social-outline" size={20} color={COLORS.white} />
            <Text style={styles.shareBtnText}>Share Code</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.webWrapper}>
        <View style={styles.card}>
          {renderContent()}
        </View>
      </View>
    </SafeAreaView>
  );
};

export const MainTabs = () => {
  return (
    <Tab.Navigator 
      screenOptions={({ route }) => ({
        tabBarIcon: ({ color, size }) => {
          let iconName = route.name === 'Home' ? 'home' : 'person';
          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: COLORS.primaryGreen,
        tabBarInactiveTintColor: 'gray',
        headerTitleAlign: 'left', // Align to left to fit logo + text
        headerStyle: {
          backgroundColor: COLORS.white,
          elevation: 2, // shadow for Android
          shadowOpacity: 0.1, // shadow for iOS/Web
        },
      })}
    >
      <Tab.Screen 
        name="Home" 
        component={HomeScreen} 
        options={{ 
          headerTitle: "", // We hide the default title to use headerLeft
          headerLeft: () => (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 15 }}>
              <Image 
                source={require('../assets/logo.jpg')} 
                style={{ width: 40, height: 40, borderRadius: 20 }} 
                resizeMode="contain"
              />
              <Text style={{ 
                marginLeft: 10, 
                fontSize: 18, 
                fontWeight: 'bold', 
                color: COLORS.primaryGreen // Your Ovulo Green
              }}>
                Happy Rider Crew
              </Text>
            </View>
          ) 
        }} 
      />
      <Tab.Screen 
  name="Profile" 
  component={ProfileScreen} 
  options={{ 
    headerTitle: "", 
    headerLeft: () => (
      <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 15 }}>
        <Image 
          source={require('../assets/logo.jpg')} 
          style={{ width: 40, height: 40, borderRadius: 20 }} 
          resizeMode="contain"
        />
        <Text style={{ 
          marginLeft: 10, 
          fontSize: 18, 
          fontWeight: 'bold', 
          color: COLORS.primaryGreen 
        }}>
          My Profile
        </Text>
      </View>
    )
  }} 
/>
    </Tab.Navigator>
  );
};

const styles = StyleSheet.create({
  // Web-Responsive Wrappers
  safeArea: { flex: 1, backgroundColor: COLORS.bg },
  webWrapper: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: Platform.OS === 'web' ? 16 : 0 },
  card: { width: '100%', maxWidth: 450, flex: 1, backgroundColor: COLORS.bg, padding: 20 },
  
  // Home Screen Content
  centerContent: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  statusTitle: { fontSize: 24, fontWeight: 'bold', color: COLORS.darkNavy, marginTop: 15, marginBottom: 10, textAlign: 'center' },
  statusText: { fontSize: 16, color: '#6B7280', textAlign: 'center', lineHeight: 24 },
  reasonBox: { backgroundColor: '#FEE2E2', padding: 15, borderRadius: 8, marginTop: 15, marginBottom: 20, width: '100%' },
  reasonText: { color: '#B91C1C', fontSize: 15, textAlign: 'center', fontWeight: '500' },
  
  contactHeader: { fontSize: 18, fontWeight: 'bold', color: COLORS.darkNavy, marginTop: 20, marginBottom: 10 },
  contactRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.white, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 8, marginBottom: 10, width: '80%', justifyContent: 'center', elevation: 1, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 3 },
  contactLink: { fontSize: 16, color: COLORS.darkNavy, marginLeft: 10, fontWeight: '500' },
  
  // Profile Screen Content
  profileContent: { flex: 1, alignItems: 'center' },
  headerLogoutBtn: { marginRight: 20 },
  avatarCircle: { width: 90, height: 90, borderRadius: 45, backgroundColor: COLORS.primaryGreen, justifyContent: 'center', alignItems: 'center', marginTop: 10 },
  avatarText: { fontSize: 36, color: COLORS.white, fontWeight: 'bold' },
  profileName: { fontSize: 24, fontWeight: 'bold', color: COLORS.darkNavy, marginTop: 15 },
  profileDetail: { fontSize: 16, color: '#6B7280', marginTop: 5, fontWeight: '500' },
  
  infoCard: { width: '100%', backgroundColor: COLORS.white, padding: 15, borderRadius: 12, marginTop: 25, elevation: 1, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5 },
  infoRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  infoText: { fontSize: 16, color: COLORS.darkNavy, marginLeft: 10, flex: 1 },
  
  referralBox: { marginTop: 20, width: '100%', backgroundColor: COLORS.white, padding: 25, borderRadius: 12, alignItems: 'center', elevation: 1, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5 },
  referralLabel: { fontSize: 14, color: '#6B7280', marginBottom: 5 },
  referralCode: { fontSize: 26, fontWeight: 'bold', color: COLORS.primaryGreen, letterSpacing: 1.5, marginVertical: 10 },
  shareBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.primaryGreen, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 8, marginTop: 10 },
  shareBtnText: { color: COLORS.white, fontWeight: 'bold', fontSize: 16, marginLeft: 8 }
});