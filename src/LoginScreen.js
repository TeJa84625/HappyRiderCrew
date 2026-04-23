import React, { useState } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  TextInput, 
  TouchableOpacity, 
  Image,
  SafeAreaView,
  Platform,
  ActivityIndicator
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc, collection, query, where, getDocs, updateDoc } from 'firebase/firestore';
import { db } from './firebase'; 

const COLORS = { 
  primaryGreen: '#5C832F', 
  darkNavy: '#0F172A', 
  textMuted: '#6B7280', 
  inputBg: '#F9FAFB', 
  borderMuted: '#E5E7EB', 
  errorRed: '#EF4444',
  white: '#FFFFFF' 
};

export default function LoginScreen({ navigation }) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(false); // <-- State for spinner
  const [errorMsg, setErrorMsg] = useState('');

  const isLoginValid = identifier.trim().length > 0 && password.length >= 8;

  const validateFormat = (input) => {
    const mobileRegex = /^\d{10}$/;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (mobileRegex.test(input)) return 'mobile';
    if (emailRegex.test(input)) return 'email';
    return null;
  };

  const handleLogin = async () => {
    const id = identifier.trim();
    const inputType = validateFormat(id);

    if (!inputType) {
      setErrorMsg("Please enter a valid 10-digit number or email.");
      return;
    }

    setIsLoading(true); // START LOADING
    setErrorMsg('');

    try {
      let userRef = null;
      let userData = null;

      if (inputType === 'mobile') {
        userRef = doc(db, 'users', id);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) userData = userSnap.data();
      } else {
        const q = query(collection(db, 'users'), where('email', '==', id.toLowerCase()));
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
          userRef = querySnapshot.docs[0].ref;
          userData = querySnapshot.docs[0].data();
        }
      }

      if (!userData) {
        setErrorMsg("Account not found. Please sign up.");
        setIsLoading(false); // STOP LOADING
        return;
      }

      if (userData.personalInfo?.password !== password) {
        setErrorMsg("Incorrect password. Please try again.");
        setIsLoading(false); // STOP LOADING
        return;
      }

      // KYC Checks
      let vKyc = userData.vehicleKycSubmitted ?? false;
      let pKyc = userData.personalKycSubmitted ?? false;

      await AsyncStorage.setItem('personalInfo', JSON.stringify(userData));
      
      setIsLoading(false); // STOP LOADING before navigation

      if (!vKyc) {
        navigation.navigate('VehicleKYC');
      } else if (!pKyc) {
        navigation.navigate('PersonKYC');
      } else {
        navigation.reset({ index: 0, routes: [{ name: 'MainTabs' }] });
      }

    } catch (error) {
      console.error("Login Error: ", error);
      setErrorMsg("Connection error. Please try again.");
      setIsLoading(false); // STOP LOADING
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.webWrapper}>
        <View style={styles.card}>
          <View>
            <Image
              source={require('../assets/logo_text.jpg')}
              style={styles.logo}
              resizeMode="contain"
            />
            <Text style={styles.screenTitle}>Welcome Back</Text>
            <Text style={styles.screenSubtitle}>Login to your Happy Rider's account</Text>
          </View>

          <View>
            <Text style={styles.label}>Email or Mobile Number</Text>
            <TextInput 
              style={styles.standardInput} 
              placeholder="Enter email or 10-digit number" 
              value={identifier}
              onChangeText={(t) => { setIdentifier(t); setErrorMsg(''); }} 
              autoCapitalize="none"
              editable={!isLoading} // Disable input while loading
            />

            <Text style={styles.label}>Password</Text>
            <View style={styles.inputWithIcon}>
              <TextInput 
                style={styles.flexInput} 
                placeholder="Enter your password" 
                secureTextEntry={!passwordVisible} 
                value={password} 
                onChangeText={(t) => { setPassword(t); setErrorMsg(''); }} 
                editable={!isLoading} // Disable input while loading
              />
              <TouchableOpacity onPress={() => setPasswordVisible(!passwordVisible)}>
                <Ionicons 
                  name={passwordVisible ? "eye-outline" : "eye-off-outline"} 
                  size={20} 
                  color={COLORS.textMuted} 
                />
              </TouchableOpacity>
            </View>
          </View>

          <View>
            {errorMsg !== '' && <Text style={styles.errorText}>{errorMsg}</Text>}

            <TouchableOpacity 
              style={[
                styles.primaryButton, 
                (!isLoginValid || isLoading) && styles.disabledButton
              ]} 
              disabled={!isLoginValid || isLoading} 
              onPress={handleLogin} 
            >
              {isLoading ? (
                <ActivityIndicator size="small" color={COLORS.white} />
              ) : (
                <Text style={[
                  styles.primaryButtonText, 
                  !isLoginValid && { color: COLORS.textMuted }
                ]}>
                  Login
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity 
              onPress={() => navigation.navigate('SignUp')} 
              style={styles.linkContainer}
              disabled={isLoading}
            >
              <Text style={styles.linkText}>
                Don't have an account? <Text style={{ fontWeight: 'bold' }}>Sign Up</Text>
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  logo: {
    width: '100%',
    height: 120,
  },
  safeArea: { 
    flex: 1, 
    backgroundColor: COLORS.white 
  },
  webWrapper: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    height: Platform.OS === 'web' ? 600 : '80%',
    backgroundColor: COLORS.white,
    padding: 20,
    borderRadius: 16,
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5,
  },
  screenTitle: { 
    fontSize: 28, 
    fontWeight: 'bold', 
    color: COLORS.darkNavy, 
    marginBottom: 5 
  },
  screenSubtitle: { 
    fontSize: 16, 
    color: COLORS.textMuted, 
    marginBottom: 30 
  },
  label: { 
    fontSize: 14, 
    fontWeight: 'bold', 
    color: COLORS.darkNavy, 
    marginBottom: 8, 
    marginTop: 15 
  },
  standardInput: { 
    backgroundColor: COLORS.inputBg, 
    borderRadius: 12, 
    height: 60, 
    paddingHorizontal: 15, 
    fontSize: 16, 
    borderWidth: 1, 
    borderColor: COLORS.borderMuted 
  },
  inputWithIcon: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: COLORS.inputBg, 
    borderRadius: 12, 
    height: 60, 
    borderWidth: 1, 
    borderColor: COLORS.borderMuted, 
    paddingHorizontal: 15 
  },
  flexInput: { 
    flex: 1, 
    fontSize: 16, 
    height: '100%' 
  },
  errorText: {
    color: COLORS.errorRed,
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 10
  },
  primaryButton: { 
    backgroundColor: COLORS.primaryGreen, 
    borderRadius: 12, 
    height: 60,               // Fixed height prevents the button from shrinking
    justifyContent: 'center', 
    alignItems: 'center', 
    marginTop: 5,
    width: '100%',
  },
  loaderWrapper: {
    justifyContent: 'center',
    alignItems: 'center',
    height: '100%',           // Ensures it takes up the full button interior
    width: '100%',
  },
  primaryButtonText: { 
    color: COLORS.white, 
    fontSize: 18, 
    fontWeight: 'bold' 
  },
  disabledButton: { 
    backgroundColor: COLORS.inputBg, // Light gray background when disabled/loading
    borderColor: COLORS.borderMuted, 
    borderWidth: 1,
    opacity: 0.8,                    // Slight transparency to show it's "busy"
  },
  linkContainer: { 
    marginTop: 20, 
    alignItems: 'center' 
  },
  linkText: { 
    color: COLORS.primaryGreen, 
    fontSize: 16 
  },
});