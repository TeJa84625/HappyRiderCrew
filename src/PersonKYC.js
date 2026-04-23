import React, { useState, useRef } from 'react';
import { 
  StyleSheet, Text, View, TextInput, TouchableOpacity, ScrollView, 
  SafeAreaView, Modal, Image, ActivityIndicator, Platform, KeyboardAvoidingView, Alert
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, setDoc, arrayUnion } from 'firebase/firestore';
import { db } from './firebase'; 

const COLORS = { 
  primaryGreen: '#5C832F', darkNavy: '#0F172A', textMuted: '#6B7280', 
  inputBg: '#F9FAFB', borderMuted: '#E5E7EB', errorRed: '#EF4444',
  successGreen: '#10B981', white: '#FFFFFF', blue: '#4A90E2'
};

const MAX_FILE_SIZE_BYTES = 1 * 1024 * 1024; // 1MB Limit

const InputLabel = ({ title, required }) => (
  <Text style={styles.label}>{title} {required && <Text style={{ color: COLORS.errorRed }}>*</Text>}</Text>
);

const ErrorMsg = ({ error }) => {
  if (!error) return null;
  return <Text style={styles.errorText}>{error}</Text>;
};

const ImageUpload = ({ title, imageUri, setImageUri, hasError, clearError }) => {
  const pickFromGallery = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({ 
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false, 
      quality: 0.2 // Compression for Firestore performance
    });
    
    if (!result.canceled) {
      const fileSize = result.assets[0].fileSize;
      if (fileSize && fileSize > MAX_FILE_SIZE_BYTES) {
        Alert.alert("File Too Large", "Please select an image smaller than 1MB");
        return;
      }
      setImageUri(result.assets[0].uri);
      if (clearError) clearError();
    }
  };

  return (
    <TouchableOpacity 
      style={[styles.uploadBtn, imageUri && styles.uploadBtnSuccess, hasError && styles.inputError]} 
      onPress={pickFromGallery}
    >
      <Ionicons 
        name={imageUri ? "checkmark-circle" : "cloud-upload-outline"} 
        size={24} 
        color={imageUri ? COLORS.successGreen : hasError ? COLORS.errorRed : COLORS.primaryGreen} 
      />
      <Text style={[styles.uploadText, imageUri && {color: COLORS.successGreen}, hasError && {color: COLORS.errorRed}]}>
        {imageUri ? `${title} Uploaded` : `Upload ${title}`}
      </Text>
    </TouchableOpacity>
  );
};

export default function PersonKYC({ navigation }) {
  const [identity, setIdentity] = useState({ aadhaar: '', pan: '', drivingLicense: '' });
  const [aadhaarDoc, setAadhaarDoc] = useState(null);
  const [panDoc, setPanDoc] = useState(null);
  const [dlDoc, setDlDoc] = useState(null);
  const [selfie, setSelfie] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState({});

  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const cameraRef = useRef(null);

  const openCamera = async () => {
    const { granted } = await requestCameraPermission();
    if (!granted) {
      Alert.alert("Permission Required", "Camera access is needed for the live selfie.");
      return;
    }
    setIsCameraActive(true);
  };

  const takeSelfie = async () => {
    if (cameraRef.current) {
      try {
        const photo = await cameraRef.current.takePictureAsync({ quality: 0.2 });
        setSelfie("photo.uri");
        setErrors(prev => ({ ...prev, selfie: null }));
        setIsCameraActive(false);
      } catch (e) {
        Alert.alert("Camera Error", "Failed to capture photo.");
      }
    }
  };

  const handleValidationAndSubmit = async () => {
    let newErrors = {};

    if (!identity.aadhaar.trim() || identity.aadhaar.length < 12) newErrors.aadhaar = "Valid 12-digit Aadhaar required";
    if (!identity.pan.trim() || identity.pan.length < 10) newErrors.pan = "Valid 10-character PAN required";
    if (!identity.drivingLicense.trim()) newErrors.drivingLicense = "DL Number is required";
    
    if (!aadhaarDoc) newErrors.aadhaarDoc = "Aadhaar document required";
    if (!panDoc) newErrors.panDoc = "PAN document required";
    if (!dlDoc) newErrors.dlDoc = "DL document required";
    if (!selfie) newErrors.selfie = "Live selfie required";

    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    setIsSubmitting(true);

    try {
      const personalInfoRaw = await AsyncStorage.getItem('personalInfo');
      const personalInfo = JSON.parse(personalInfoRaw);
      const userMobileId = personalInfo.mobile || personalInfo.personalInfo?.mobile;

      // Generate Referral Code
      const namePart = (personalInfo.fullName || "USR").substring(0, 3).toUpperCase();
      const hexMobile = parseInt(userMobileId, 10).toString(16).toUpperCase();
      const newReferralCode = `${namePart}${hexMobile}`;

      const kycInfo = { 
        ...identity, 
        aadhaarDoc, 
        panDoc, 
        drivingLicenseDoc: dlDoc,
        selfie 
      };

      const updatePayload = {
        personKycInfo: kycInfo, 
        kycStatus: "submitted", 
        personalKycSubmitted: true,
        myReferralCode: newReferralCode 
      };

      // Firestore Updates
      await setDoc(doc(db, "users", userMobileId), updatePayload, { merge: true });
      await setDoc(doc(db, "kyc", "categories"), { pending: arrayUnion(userMobileId) }, { merge: true });
      await setDoc(doc(db, "referrals", newReferralCode), { ownerId: userMobileId, referredUsers: [] }, { merge: true });

      // Update Local Session
      const updatedSession = { ...personalInfo, personalKycSubmitted: true, myReferralCode: newReferralCode };
      await AsyncStorage.setItem('personalInfo', JSON.stringify(updatedSession));

      setIsSubmitting(false);
      Alert.alert("Success", "KYC submitted successfully!");

      // Navigate to InitialVideo
      navigation.reset({ index: 0, routes: [{ name: 'InitialVideo' }] });

    } catch (error) {
      setIsSubmitting(false);
      Alert.alert("Submission Failed", error.message);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.keyboardWrapper}>
        <View style={styles.webWrapper}>
          <View style={styles.card}>
            
            <Modal visible={isCameraActive} animationType="slide">
              <CameraView style={styles.camera} facing="front" ref={cameraRef}>
                <View style={styles.cameraOverlay}>
                  <View style={styles.faceGuide}><Text style={styles.guideText}>Center your face</Text></View>
                  <View style={styles.cameraControls}>
                    <TouchableOpacity onPress={() => setIsCameraActive(false)}><Ionicons name="close-circle" size={55} color="#FFF" /></TouchableOpacity>
                    <TouchableOpacity style={styles.captureBtn} onPress={takeSelfie}><View style={styles.captureBtnInner} /></TouchableOpacity>
                    <View style={{ width: 55 }} />
                  </View>
                </View>
              </CameraView>
            </Modal>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.screenTitle}>Identity Verification</Text>
              <Text style={styles.screenSubtitle}>Step 2: Upload personal documents</Text>

              <InputLabel title="Aadhaar Number" required />
              <TextInput 
                style={[styles.standardInput, errors.aadhaar && styles.inputError]} 
                placeholder="12-digit number" 
                keyboardType="number-pad" 
                maxLength={12} 
                value={identity.aadhaar}
                onChangeText={(t) => { setIdentity({...identity, aadhaar: t}); setErrors(p => ({...p, aadhaar: null})); }}
              />
              <ErrorMsg error={errors.aadhaar} />

              <InputLabel title="Aadhaar Card Photo" required />
              <ImageUpload title="Aadhaar Card" imageUri={aadhaarDoc} setImageUri={setAadhaarDoc} hasError={errors.aadhaarDoc} clearError={() => setErrors(p => ({...p, aadhaarDoc: null}))} />
              <ErrorMsg error={errors.aadhaarDoc} />
              
              <InputLabel title="PAN Number" required />
              <TextInput 
                style={[styles.standardInput, errors.pan && styles.inputError]} 
                placeholder="10-character PAN" 
                autoCapitalize="characters" 
                maxLength={10} 
                value={identity.pan}
                onChangeText={(t) => { setIdentity({...identity, pan: t}); setErrors(p => ({...p, pan: null})); }}
              />
              <ErrorMsg error={errors.pan} />

              <InputLabel title="PAN Card Photo" required />
              <ImageUpload title="PAN Card" imageUri={panDoc} setImageUri={setPanDoc} hasError={errors.panDoc} clearError={() => setErrors(p => ({...p, panDoc: null}))} />
              <ErrorMsg error={errors.panDoc} />

              <InputLabel title="Driving License Number" required />
              <TextInput 
                style={[styles.standardInput, errors.drivingLicense && styles.inputError]} 
                placeholder="DL Number" 
                autoCapitalize="characters" 
                value={identity.drivingLicense}
                onChangeText={(t) => { setIdentity({...identity, drivingLicense: t}); setErrors(p => ({...p, drivingLicense: null})); }}
              />
              <ErrorMsg error={errors.drivingLicense} />

              <InputLabel title="Driving License Photo" required />
              <ImageUpload title="Driving License" imageUri={dlDoc} setImageUri={setDlDoc} hasError={errors.dlDoc} clearError={() => setErrors(p => ({...p, dlDoc: null}))} />
              <ErrorMsg error={errors.dlDoc} />
              
              <InputLabel title="Live Selfie" required />
              {!selfie ? (
                <TouchableOpacity style={[styles.cameraBtn, errors.selfie && styles.inputError]} onPress={openCamera}>
                  <Ionicons name="camera" size={24} color={COLORS.primaryGreen} />
                  <Text style={styles.cameraBtnText}>Open Camera for Selfie</Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.previewCard}>
                  <Image source={{ uri: selfie }} style={styles.previewImage} />
                  <View style={styles.previewActionRow}>
                    <Text style={styles.successText}>Selfie Captured</Text>
                    <TouchableOpacity onPress={openCamera}><Text style={styles.retakeText}>Retake</Text></TouchableOpacity>
                  </View>
                </View>
              )}
              <ErrorMsg error={errors.selfie} />

              <TouchableOpacity style={[styles.primaryButton, isSubmitting && styles.disabledButton]} onPress={handleValidationAndSubmit} disabled={isSubmitting}>
                {isSubmitting ? <ActivityIndicator color="#FFF" /> : <Text style={styles.primaryButtonText}>Submit Application</Text>}
              </TouchableOpacity>

            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.inputBg },
  keyboardWrapper: { flex: 1 },
  webWrapper: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16 },
  card: { width: '100%', maxWidth: 450, height: Platform.OS === 'web' ? '95%' : '100%', backgroundColor: COLORS.white, padding: 20, borderRadius: 16, elevation: 5 },
  screenTitle: { fontSize: 28, fontWeight: 'bold', color: COLORS.darkNavy, marginTop: 10 },
  screenSubtitle: { fontSize: 16, color: COLORS.textMuted, marginBottom: 20 },
  label: { fontSize: 14, fontWeight: 'bold', color: COLORS.darkNavy, marginBottom: 8, marginTop: 15 },
  standardInput: { backgroundColor: COLORS.inputBg, borderRadius: 12, height: 60, paddingHorizontal: 15, fontSize: 16, borderWidth: 1, borderColor: COLORS.borderMuted },
  inputError: { borderColor: COLORS.errorRed, borderWidth: 1.5 },
  errorText: { color: COLORS.errorRed, fontSize: 12, marginTop: 4, marginLeft: 4 },
  uploadBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#E8F5E9', padding: 15, borderRadius: 12, marginBottom: 4, borderWidth: 1, borderColor: COLORS.primaryGreen, borderStyle: 'dashed' },
  uploadBtnSuccess: { backgroundColor: '#E8F5E9', borderColor: COLORS.successGreen, borderStyle: 'solid' },
  uploadText: { flex: 1, marginLeft: 10, color: COLORS.primaryGreen, fontWeight: 'bold', fontSize: 14 },
  cameraBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.inputBg, height: 60, borderRadius: 12, marginBottom: 4, borderWidth: 1, borderColor: COLORS.primaryGreen },
  cameraBtnText: { marginLeft: 10, color: COLORS.primaryGreen, fontWeight: 'bold', fontSize: 16 },
  primaryButton: { backgroundColor: COLORS.primaryGreen, borderRadius: 12, height: 60, justifyContent: 'center', alignItems: 'center', marginTop: 30, marginBottom: 30 },
  primaryButtonText: { color: COLORS.white, fontSize: 18, fontWeight: 'bold' },
  disabledButton: { opacity: 0.7 },
  camera: { flex: 1 },
  cameraOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'space-between', paddingBottom: 40 },
  faceGuide: { marginTop: 100, alignSelf: 'center', width: 250, height: 350, borderWidth: 2, borderColor: COLORS.successGreen, borderStyle: 'dashed', borderRadius: 125, backgroundColor: 'rgba(255,255,255,0.1)' },
  guideText: { color: COLORS.white, fontWeight: 'bold', fontSize: 16, backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 15, paddingVertical: 5, borderRadius: 20, textAlign: 'center' },
  cameraControls: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', width: '100%' },
  captureBtn: { width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.3)', justifyContent: 'center', alignItems: 'center' },
  captureBtnInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: COLORS.white },
  previewCard: { backgroundColor: COLORS.white, borderRadius: 12, marginBottom: 4, borderWidth: 1, borderColor: COLORS.borderMuted, overflow: 'hidden' },
  previewImage: { width: '100%', height: 150, resizeMode: 'cover' },
  previewActionRow: { flexDirection: 'row', justifyContent: 'space-between', padding: 12, backgroundColor: COLORS.inputBg },
  successText: { color: COLORS.successGreen, fontWeight: 'bold', fontSize: 14 },
  retakeText: { color: COLORS.primaryGreen, fontWeight: 'bold', fontSize: 14 },
});