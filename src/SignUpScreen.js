import 'react-native-get-random-values';
import React, { useState } from 'react';
import { 
  StyleSheet, Text, View, TextInput, TouchableOpacity, ScrollView, 
  SafeAreaView, Modal, Alert, KeyboardAvoidingView, Platform, FlatList, ActivityIndicator, Linking 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc, setDoc, serverTimestamp, arrayUnion } from 'firebase/firestore';
import { signInWithPhoneNumber, RecaptchaVerifier } from 'firebase/auth';
// import { v4 as uuidv4 } from "uuid";
import { db, auth } from './firebase'; 
import conditionsData from '../assets/conditions.json'; // Adjust path if needed

const COLORS = { 
  primaryGreen: '#5C832F', darkNavy: '#0F172A', textMuted: '#6B7280', 
  inputBg: '#F9FAFB', borderMuted: '#E5E7EB', errorRed: '#EF4444', 
  successGreen: '#10B981', white: '#FFFFFF', blue: '#4A90E2', overlay: 'rgba(0,0,0,0.5)' 
};

const InputLabel = ({ title, required }) => (
  <Text style={styles.label}>{title} {required && <Text style={{ color: COLORS.errorRed }}>*</Text>}</Text>
);

const ErrorMsg = ({ error }) => {
  if (!error) return null;
  return <Text style={styles.errorText}>{error}</Text>;
};

export default function SignUpScreen({ navigation }) {
  const [step, setStep] = useState('verification');
  
  // Verification States
  const [mobile, setMobile] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState({ text: '', type: '' }); 
  const [confirmationResult, setConfirmationResult] = useState(null); 
  
  // Detail States
  const [details, setDetails] = useState({ 
    fullName: '', gender: 'Male', dob: '', email: '', 
    address: '', pin: '', userCity: '', rideCity: '', referral: '' 
  });
  
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordStrength, setPasswordStrength] = useState({ text: '', color: COLORS.borderMuted, bars: 0 });
  const [passwordVisible, setPasswordVisible] = useState(false);

  // UI States
  const [showTnc, setShowTnc] = useState(false);
  const [showCityModal, setShowCityModal] = useState(false);
  const [isAgreed, setIsAgreed] = useState(false);
  const [errors, setErrors] = useState({});

  const isMobileValid = mobile.length === 10;
  const isOtpValid = otp.length === 6;
  const isPasswordMatch = password === confirmPassword && password.length > 0;

  // --- OTP Logic with Firebase Phone Auth ---
  const handleSendOtp = async () => {
    setStatusMsg({ text: '', type: '' });
    setIsLoading(true);

    try {
      const userRef = doc(db, 'users', mobile);
      const userSnap = await getDoc(userRef);

      if (userSnap.exists()) {
        setIsLoading(false);
        setStatusMsg({ text: 'User already exists. Please login.', type: 'error' });
        return;
      }

      const phoneNumber = `+91${mobile}`;
      
      if (!window.recaptchaVerifier) {
        window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
          'size': 'invisible',
          'callback': (response) => {
            console.log("Recaptcha verified");
          },
          'expired-callback': () => {
            setStatusMsg({ text: 'Recaptcha expired. Please try again.', type: 'error' });
          }
        });
      }

      const appVerifier = window.recaptchaVerifier; 
      const confirmation = await signInWithPhoneNumber(auth, phoneNumber, appVerifier);
      
      setConfirmationResult(confirmation);
      setOtpSent(true);
      setStatusMsg({ text: 'OTP sent successfully!', type: 'success' });
      setIsLoading(false);

    } catch (error) {
      setIsLoading(false);
      console.error(error);
      if (window.recaptchaVerifier) {
        window.recaptchaVerifier.render().then(function(widgetId) {
          window.grecaptcha.reset(widgetId);
        });
      }
      setStatusMsg({ text: 'Failed to send OTP. Check your number or Recaptcha setup.', type: 'error' });
    }
  };

  const verifyOtpAndProceed = async () => {
    setStatusMsg({ text: '', type: '' });
    setIsLoading(true);

    try {
      if (confirmationResult) {
        await confirmationResult.confirm(otp);
        setStatusMsg({ text: '', type: '' });
        setStep('register');
      } else {
        setStatusMsg({ text: 'Session expired. Please request OTP again.', type: 'error' });
      }
    } catch (error) {
      setStatusMsg({ text: 'Invalid OTP. Please check and try again.', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  // --- Formatting & Validation Logic ---
  const handleDobChange = (text) => {
    let cleaned = text.replace(/\D/g, '');
    let formatted = cleaned;
    if (cleaned.length > 2) formatted = cleaned.slice(0, 2) + '/' + cleaned.slice(2);
    if (cleaned.length > 4) formatted = formatted.slice(0, 5) + '/' + cleaned.slice(4, 8);
    setDetails({ ...details, dob: formatted });
    if (errors.dob) setErrors({ ...errors, dob: null });
  };

  const isValidDate = (dateString) => {
    const regex = /^(\d{2})\/(\d{2})\/(\d{4})$/;
    if (!regex.test(dateString)) return false;

    const [, day, month, year] = dateString.match(regex);
    const d = parseInt(day, 10);
    const m = parseInt(month, 10);
    const y = parseInt(year, 10);

    const MAX_LIFESPAN = 120;
    const MIN_AGE = 18;
    const today = new Date();
    const currentYear = today.getFullYear();

    const minYear = currentYear - MAX_LIFESPAN;
    const maxYear = currentYear - MIN_AGE;
    if (m < 1 || m > 12) return false;
    const daysInMonth = new Date(y, m, 0).getDate();
    if (d < 1 || d > daysInMonth) return false;
    const inputDate = new Date(y, m - 1, d);
    if (inputDate > today) return false;
    if (y < minYear || y > maxYear) return false;

    return true;
  };

  const checkPasswordStrength = (pass) => {
    setPassword(pass);

    if (errors.password) setErrors({ ...errors, password: null });

    // Enforce min length
    if (pass.length > 0 && pass.length < 8) {
      setErrors({ ...errors, password: 'Password must be at least 8 characters' });
      setPasswordStrength({ text: 'Weak', color: COLORS.errorRed, bars: 1 });
      return;
    }

    let score = 0;

    if (pass.length >= 8) score++;
    if (/[a-z]/.test(pass) && /[A-Z]/.test(pass)) score++;
    if (/[0-9]/.test(pass)) score++;
    if (/[^A-Za-z0-9]/.test(pass)) score++;

    if (!pass) {
      setPasswordStrength({ text: '', color: COLORS.borderMuted, bars: 0 });
    } else if (score <= 1) {
      setPasswordStrength({ text: 'Weak', color: COLORS.errorRed, bars: 1 });
    } else if (score <= 3) {
      setPasswordStrength({ text: 'Medium', color: '#F59E0B', bars: 2 });
    } else {
      setPasswordStrength({ text: 'Strong', color: COLORS.successGreen, bars: 4 });
    }
  };

  const handleEmailChange = (text) => {
    setDetails({ ...details, email: text.toLowerCase() });
    setErrors({ ...errors, email: null });

    const trimmed = text.trim();
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!trimmed) {
      setErrors((prev) => ({ ...prev, email: 'Email is required' }));
    } else if (!regex.test(trimmed)) {
      setErrors((prev) => ({ ...prev, email: 'Enter a valid email address' }));
    }
  };

  // --- ACTUAL DATABASE SAVING LOGIC ---
  const proceedToSaveUser = async (validReferralCode) => {
    setIsLoading(true);
    try {
      const { fullName, dob, email, address, pin, userCity, rideCity, gender } = details;

      const userData = {
        fullName: fullName.trim(),
        email: email.trim(),
        mobile,
        createdAt: serverTimestamp(),
        vehicleKycSubmitted: false,
        personalKycSubmitted: false,
        referralCode: validReferralCode || null,

        personalInfo: {
          password,
          gender,
          dob,
          address: address.trim(),
          pin: pin.trim(),
          userCity: userCity.trim(),
          preferredRideCity: rideCity
        }
      };

      await setDoc(doc(db, 'users', mobile), userData);

      if (validReferralCode) {
        await setDoc(
          doc(db, 'referrals', validReferralCode),
          {
            referredUsers: arrayUnion(mobile)
          },
          { merge: true }
        );
      }

      await AsyncStorage.setItem('personalInfo', JSON.stringify(userData));

      setIsLoading(false);
      Alert.alert("Success", "Account created successfully!");

      navigation.navigate('VehicleKYC');

    } catch (error) {
      setIsLoading(false);
      console.error(error);
      Alert.alert(
        "Registration Failed",
        "There was a problem saving your account to the database. Please check your connection and try again."
      );
    }
  };

  // --- PRE-REGISTRATION VALIDATION ---
  const handleFinalRegistration = async () => {
    let newErrors = {};
    const { fullName, dob, email, address, pin, userCity, rideCity } = details;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!fullName.trim()) newErrors.fullName = "Full Name is required";
    if (!email.trim()) newErrors.email = "Email ID is required";
    else if (!emailRegex.test(email.trim())) newErrors.email = "Enter a valid email address";
    if (!address.trim()) newErrors.address = "Address is required";
    if (!pin.trim() || pin.length < 6) newErrors.pin = "Valid 6-digit PIN required";
    if (!userCity.trim()) newErrors.userCity = "Please enter your city";
    if (!rideCity) newErrors.rideCity = "Please select a preferred ride city";
    if (!password) newErrors.password = "Password is required";
    else if (password.length < 8) newErrors.password = "Password must be at least 8 characters";
    if (password && !isPasswordMatch) newErrors.confirmPassword = "Passwords do not match";
    if (!isValidDate(dob)) newErrors.dob = "Valid Date required (DD/MM/YYYY)";

    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    if (!isAgreed) return Alert.alert("Terms Required", "Please read and accept the Terms and Conditions.");
    
    setIsLoading(true);

    try {
      const enteredReferral = details.referral.trim();

      // 1. Check if a referral code was actually entered
      if (enteredReferral) {
        const referralSnap = await getDoc(doc(db, 'referrals', enteredReferral));
        
        if (!referralSnap.exists()) {
          setIsLoading(false);
          // Set the inline UI error
          setErrors(prev => ({ ...prev, referral: "Referral code not found" }));
          
          Alert.alert(
            "Reference Not Found", 
            "The referral code you entered is mismatched or could not be found.",
            [
              { text: "Retry", style: "cancel" },
              { text: "Complete Registration", onPress: () => proceedToSaveUser(null) }
            ]
          );
          return;
        }

        // Referral EXISTS -> Proceed and pass the valid code
        await proceedToSaveUser(enteredReferral);

      } else {
        // No referral entered -> Proceed normally
        await proceedToSaveUser(null);
      }

    } catch (error) {
      setIsLoading(false);
      console.error(error);
      Alert.alert("Validation Error", "Could not verify referral code.");
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.keyboardWrapper}>
        <View style={styles.webWrapper}>

          {/* ================= VERIFICATION ================= */}
          {step === 'verification' && (
            <View style={styles.card}>
              <View>
                <Text style={styles.screenTitle}>Create Account</Text>
                <Text style={styles.screenSubtitle}>Step 1: Verify Mobile Number</Text>

                <InputLabel title="Mobile Number" required />
                <View style={styles.phoneInputContainer}>
                  <Text style={styles.countryCode}>+91</Text>
                  <TextInput
                    style={styles.phoneInput}
                    placeholder="10 digit number"
                    keyboardType="phone-pad"
                    maxLength={10}
                    value={mobile}
                    onChangeText={(t) => { setMobile(t.replace(/\D/g, '')); setStatusMsg({ text: '', type: '' }); }}
                    editable={!otpSent}
                  />
                </View>

                {otpSent && (
                  <View style={{ marginTop: 15 }}>
                    <InputLabel title="Enter 6-Digit OTP" required />
                    <TextInput
                      style={styles.standardInput}
                      placeholder="- - - - - -"
                      keyboardType="number-pad"
                      maxLength={6}
                      value={otp}
                      onChangeText={(t) => { setOtp(t); setStatusMsg({ text: '', type: '' }); }}
                      textAlign="center"
                      letterSpacing={8}
                    />
                  </View>
                )}
              </View>

              <View>
                {statusMsg.text !== '' && (
                  <Text style={[styles.statusText, { color: statusMsg.type === 'error' ? COLORS.errorRed : COLORS.successGreen }]}>
                    {statusMsg.text}
                  </Text>
                )}

                {!otpSent ? (
                  <TouchableOpacity
                    style={[styles.primaryButton, (!isMobileValid || isLoading) && styles.disabledButton]}
                    disabled={!isMobileValid || isLoading}
                    onPress={handleSendOtp}
                  >
                    {isLoading ? <ActivityIndicator color={COLORS.white} /> : <Text style={[styles.primaryButtonText, !isMobileValid && { color: COLORS.textMuted }]}>Verify & Send OTP</Text>}
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={[styles.primaryButton, (!isOtpValid || isLoading) && styles.disabledButton]}
                    disabled={!isOtpValid || isLoading}
                    onPress={verifyOtpAndProceed}
                  >
                    {isLoading ? <ActivityIndicator color={COLORS.white} /> : <Text style={[styles.primaryButtonText, !isOtpValid && { color: COLORS.textMuted }]}>Verify & Continue</Text>}
                  </TouchableOpacity>
                )}

                <TouchableOpacity onPress={() => navigation.navigate('Login')} style={styles.linkContainer}>
                  <Text style={styles.linkText}>Already have an account? <Text style={{ fontWeight: 'bold' }}>Login</Text></Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* ================= REGISTER ================= */}
          {step === 'register' && (
            <View style={styles.card}>
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
                <Text style={styles.screenTitle}>Personal Info</Text>
                <Text style={styles.screenSubtitle}>Step 2: Setup your profile</Text>

                <InputLabel title="Full Name" required />
                <TextInput
                  style={[styles.standardInput, errors.fullName && styles.inputError]}
                  placeholder="Enter your name"
                  value={details.fullName}
                  onChangeText={(t) => { setDetails({ ...details, fullName: t }); setErrors({...errors, fullName: null}); }}
                />
                <ErrorMsg error={errors.fullName} />

                <InputLabel title="Password" required />
                <View style={[styles.inputWithIcon, errors.password && styles.inputError]}>
                  <TextInput
                    style={styles.flexInput}
                    placeholder="Create a strong password"
                    secureTextEntry={!passwordVisible}
                    onChangeText={checkPasswordStrength}
                  />
                  <TouchableOpacity onPress={() => setPasswordVisible(!passwordVisible)}>
                    <Ionicons name={passwordVisible ? "eye-outline" : "eye-off-outline"} size={20} color={COLORS.textMuted} />
                  </TouchableOpacity>
                </View>
                <ErrorMsg error={errors.password} />

                {password.length > 0 && !errors.password && (
                  <View style={styles.strengthRow}>
                    {[1, 2, 3, 4].map(i => (
                      <View key={i} style={[styles.strengthDash, { backgroundColor: i <= passwordStrength.bars ? passwordStrength.color : COLORS.borderMuted }]} />
                    ))}
                    <Text style={[styles.strengthText, { color: passwordStrength.color }]}>{passwordStrength.text}</Text>
                  </View>
                )}

                <InputLabel title="Confirm Password" required />
                <View style={[styles.inputWithIcon, errors.confirmPassword && styles.inputError]}>
                  <TextInput
                    style={styles.flexInput}
                    placeholder="Confirm your password"
                    secureTextEntry={!passwordVisible}
                    onChangeText={(t) => { setConfirmPassword(t); setErrors({...errors, confirmPassword: null}); }}
                  />
                  {isPasswordMatch && <Ionicons name="checkmark-circle" size={20} color={COLORS.successGreen} style={{ paddingRight: 5 }} />}
                </View>
                <ErrorMsg error={errors.confirmPassword} />

                <View style={styles.row}>
                  <View style={{ flex: 1, marginRight: 10 }}>
                    <InputLabel title="Gender" required />
                    <View style={styles.segmentContainer}>
                      {["Male", "Female"].map((item) => (
                        <TouchableOpacity
                          key={item}
                          style={[styles.segmentButton, details.gender === item && styles.segmentButtonActive]}
                          onPress={() => setDetails({ ...details, gender: item })}
                        >
                          <Text style={[styles.segmentText, details.gender === item && styles.segmentTextActive]}>{item}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  <View style={{ flex: 1 }}>
                    <InputLabel title="Date of Birth" required />
                    <TextInput
                      style={[styles.standardInput, errors.dob && styles.inputError]}
                      placeholder="DD/MM/YYYY"
                      keyboardType="number-pad"
                      maxLength={10}
                      value={details.dob}
                      onChangeText={handleDobChange}
                    />
                    <ErrorMsg error={errors.dob} />
                  </View>
                </View>

                <InputLabel title="Email ID" required />
                <TextInput
                  style={[styles.standardInput, errors.email && styles.inputError]}
                  placeholder="name@example.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  value={details.email}
                  onChangeText={handleEmailChange}
                />
                <ErrorMsg error={errors.email} />

                <InputLabel title="Address" required />
                <TextInput
                  style={[styles.standardInput, { height: 80 }, errors.address && styles.inputError]}
                  multiline
                  placeholder="Full Address"
                  value={details.address}
                  onChangeText={(t) => { setDetails({ ...details, address: t }); setErrors({...errors, address: null}); }}
                />
                <ErrorMsg error={errors.address} />

                <View style={styles.row}>
                  <View style={{ flex: 1, marginRight: 10 }}>
                    <InputLabel title="PIN Code" required />
                    <TextInput
                      style={[styles.standardInput, errors.pin && styles.inputError]}
                      placeholder="6 digits"
                      keyboardType="number-pad"
                      maxLength={6}
                      value={details.pin}
                      onChangeText={(t) => { setDetails({ ...details, pin: t }); setErrors({...errors, pin: null}); }}
                    />
                    <ErrorMsg error={errors.pin} />
                  </View>

                  <View style={{ flex: 1 }}>
                    <InputLabel title="Your City" required />
                    <TextInput
                      style={[styles.standardInput, errors.userCity && styles.inputError]}
                      placeholder="E.g. Delhi"
                      value={details.userCity}
                      onChangeText={(t) => { setDetails({ ...details, userCity: t }); setErrors({...errors, userCity: null}); }}
                    />
                    <ErrorMsg error={errors.userCity} />
                  </View>
                </View>

                <InputLabel title="Preferred Ride City" required />
                <TouchableOpacity 
                  style={[styles.standardInput, { justifyContent: 'center' }, errors.rideCity && styles.inputError]}
                  onPress={() => setShowCityModal(true)}
                >
                  <Text style={{ color: details.rideCity ? COLORS.darkNavy : COLORS.textMuted, fontSize: 16 }}>
                    {details.rideCity || "Select operational city"}
                  </Text>
                </TouchableOpacity>
                <ErrorMsg error={errors.rideCity} />

                <View style={styles.referralHeader}>
                  <Text style={[styles.label, { marginBottom: 0, marginTop: 0 }]}>Referral Code</Text>
                  {/* <TouchableOpacity 
                    onPress={() => Linking.openURL('https://yourwebsite.com/how-referrals-work')} 
                    style={styles.howItWorksBtn}
                  >
                    <Ionicons name="information-circle-outline" size={14} color={COLORS.blue} />
                    <Text style={styles.howItWorksText}>How it works</Text>
                  </TouchableOpacity> */}
                </View>
                <TextInput
                  style={[styles.standardInput, errors.referral && styles.inputError]}
                  placeholder="Optional (e.g. HAP423A35CF)"
                  value={details.referral}
                  onChangeText={(t) => { 
                    setDetails({ ...details, referral: t });
                    if(errors.referral) setErrors({...errors, referral: null});
                  }}
                />
                <ErrorMsg error={errors.referral} />

                <View style={styles.tncContainer}>
                  <TouchableOpacity onPress={() => setShowTnc(true)} style={styles.tncButton}>
                    <Ionicons name={isAgreed ? "checkmark-circle" : "document-text-outline"} size={24} color={isAgreed ? COLORS.successGreen : COLORS.blue} />
                    <Text style={[styles.tncButtonText, { color: isAgreed ? COLORS.successGreen : COLORS.blue }]}>
                      {isAgreed ? "Terms & Conditions Accepted" : "Read & Accept Terms & Conditions"}
                    </Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity 
                  style={[styles.primaryButton, (!isAgreed || isLoading) && styles.disabledButton]} 
                  onPress={handleFinalRegistration}
                  disabled={!isAgreed || isLoading}
                >
                  {isLoading ? <ActivityIndicator color={COLORS.white} /> : <Text style={[styles.primaryButtonText, !isAgreed && { color: COLORS.textMuted }]}>Register Account</Text>}
                </TouchableOpacity>
              </ScrollView>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>

      <Modal visible={showCityModal} animationType="fade" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.bottomSheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Select Preferred City</Text>
              <TouchableOpacity onPress={() => setShowCityModal(false)}>
                <Ionicons name="close" size={24} color={COLORS.darkNavy} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={conditionsData.cities}
              keyExtractor={(item) => item}
              renderItem={({ item }) => (
                <TouchableOpacity 
                  style={styles.sheetItem} 
                  onPress={() => { 
                    setDetails({ ...details, rideCity: item }); 
                    setErrors({ ...errors, rideCity: null });
                    setShowCityModal(false); 
                  }}
                >
                  <Text style={[styles.sheetItemText, details.rideCity === item && { color: COLORS.blue, fontWeight: 'bold' }]}>{item}</Text>
                  {details.rideCity === item && <Ionicons name="checkmark" size={20} color={COLORS.blue} />}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>

      <Modal visible={showTnc} animationType="slide" transparent={false}>
        <SafeAreaView style={styles.safeArea}>
          <ScrollView contentContainerStyle={styles.modalContent}>
            <Text style={styles.screenTitle}>{conditionsData.title}</Text>
            <Text style={styles.screenSubtitle}>Last Updated: {conditionsData.lastUpdated}</Text>
            <View style={styles.tncScrollBox}>
              {conditionsData.sections.map((section, index) => (
                <View key={index} style={styles.tncSection}>
                  <Text style={styles.tncHeading}>{section.heading}</Text>
                  <Text style={styles.tncText}>{section.text}</Text>
                </View>
              ))}
            </View>
            <View style={styles.row}>
              <TouchableOpacity style={[styles.primaryButton, { flex: 1, backgroundColor: COLORS.errorRed, marginRight: 10 }]} onPress={() => { setIsAgreed(false); setShowTnc(false); }}>
                <Text style={styles.primaryButtonText}>Reject</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.primaryButton, { flex: 1, backgroundColor: COLORS.successGreen }]} onPress={() => { setIsAgreed(true); setShowTnc(false); }}>
                <Text style={styles.primaryButtonText}>Accept</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      <View nativeID="recaptcha-container" />

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.inputBg },
  keyboardWrapper: { flex: 1 },
  webWrapper: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16 },
  card: { width: '100%', maxWidth: 450, height: '95%', backgroundColor: COLORS.white, borderRadius: 16, padding: 20, justifyContent: 'space-between', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10, elevation: 5 },
  screenTitle: { fontSize: 28, fontWeight: 'bold', color: COLORS.darkNavy, marginBottom: 5 },
  screenSubtitle: { fontSize: 16, color: COLORS.textMuted, marginBottom: 20 },
  label: { fontSize: 14, fontWeight: 'bold', color: COLORS.darkNavy, marginBottom: 8, marginTop: 15 },
  
  phoneInputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.inputBg, borderRadius: 12, height: 60, paddingHorizontal: 15, borderWidth: 1, borderColor: COLORS.borderMuted },
  countryCode: { fontSize: 16, fontWeight: 'bold', color: COLORS.darkNavy, marginRight: 15, borderRightWidth: 1, borderColor: COLORS.borderMuted, paddingRight: 15 },
  phoneInput: { flex: 1, fontSize: 16, color: COLORS.darkNavy, height: '100%' },
  
  standardInput: { backgroundColor: COLORS.inputBg, borderRadius: 12, height: 60, paddingHorizontal: 15, fontSize: 16, borderWidth: 1, borderColor: COLORS.borderMuted },
  inputWithIcon: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.inputBg, borderRadius: 12, height: 60, borderWidth: 1, borderColor: COLORS.borderMuted, paddingHorizontal: 15 },
  flexInput: { flex: 1, fontSize: 16, height: '100%' },
  inputError: { borderColor: COLORS.errorRed, borderWidth: 1.5 },
  errorText: { color: COLORS.errorRed, fontSize: 12, marginTop: 4, marginLeft: 4 },
  statusText: { fontSize: 14, fontWeight: 'bold', marginBottom: 10, textAlign: 'center' },
  
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  segmentContainer: { flexDirection: "row", borderRadius: 12, backgroundColor: COLORS.inputBg, padding: 5, borderWidth: 1, borderColor: COLORS.borderMuted, height: 60, alignItems: 'center' },
  segmentButton: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: "center" },
  segmentButtonActive: { backgroundColor: COLORS.blue },
  segmentText: { color: COLORS.textMuted, fontWeight: "500", fontSize: 14 },
  segmentTextActive: { color: COLORS.white, fontWeight: "600" },
  
  primaryButton: { backgroundColor: COLORS.primaryGreen, borderRadius: 12, height: 60, justifyContent: 'center', alignItems: 'center', marginTop: 5 },
  primaryButtonText: { color: COLORS.white, fontSize: 18, fontWeight: 'bold' },
  disabledButton: { backgroundColor: COLORS.inputBg, borderColor: COLORS.borderMuted, borderWidth: 1 },
  
  strengthRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  strengthDash: { height: 4, flex: 1, borderRadius: 2, marginRight: 5 },
  strengthText: { fontSize: 12, fontWeight: 'bold', marginLeft: 5, width: 60 },
  linkContainer: { marginTop: 25, alignItems: 'center', paddingBottom: 15 },
  linkText: { color: COLORS.primaryGreen, fontSize: 16 },

  referralHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 15, marginBottom: 8 },
  howItWorksBtn: { flexDirection: 'row', alignItems: 'center' },
  howItWorksText: { color: COLORS.blue, fontSize: 12, fontWeight: 'bold', marginLeft: 4 },

  tncContainer: { marginTop: 20, marginBottom: 15, alignItems: 'center' },
  tncButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.inputBg, paddingVertical: 12, paddingHorizontal: 20, borderRadius: 12, borderWidth: 1, borderColor: COLORS.borderMuted, width: '100%', justifyContent: 'center' },
  tncButtonText: { fontSize: 16, fontWeight: '600', marginLeft: 8 },

  modalContent: { padding: 20, backgroundColor: COLORS.white, flexGrow: 1 },
  tncScrollBox: { flex: 1, marginVertical: 20, padding: 15, backgroundColor: COLORS.inputBg, borderRadius: 12, borderWidth: 1, borderColor: COLORS.borderMuted },
  tncSection: { marginBottom: 20 },
  tncHeading: { fontSize: 18, fontWeight: 'bold', color: COLORS.darkNavy, marginBottom: 8 },
  tncText: { fontSize: 15, color: COLORS.textMuted, lineHeight: 22 },

  modalOverlay: { flex: 1, backgroundColor: COLORS.overlay, justifyContent: 'flex-end' },
  bottomSheet: { backgroundColor: COLORS.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '60%' },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  sheetTitle: { fontSize: 20, fontWeight: 'bold', color: COLORS.darkNavy },
  sheetItem: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: COLORS.borderMuted },
  sheetItemText: { fontSize: 16, color: COLORS.darkNavy },
});