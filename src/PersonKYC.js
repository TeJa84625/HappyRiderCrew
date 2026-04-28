import React, { useState, useRef } from 'react';
import { 
  StyleSheet, Text, View, TextInput, TouchableOpacity, ScrollView, 
  SafeAreaView, Modal, Image, ActivityIndicator, Platform, KeyboardAvoidingView, Alert
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator'; 
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, setDoc, arrayUnion } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'; 
import { db, storage } from './firebase'; 

const COLORS = { 
  primaryGreen: '#5C832F', darkNavy: '#0F172A', textMuted: '#6B7280', 
  inputBg: '#F9FAFB', borderMuted: '#E5E7EB', errorRed: '#EF4444',
  successGreen: '#10B981', white: '#FFFFFF', blue: '#4A90E2'
};

const InputLabel = ({ title, required }) => (
  <Text style={styles.label}>{title} {required && <Text style={{ color: COLORS.errorRed }}>*</Text>}</Text>
);

const ErrorMsg = ({ error }) => {
  if (!error) return null;
  return <Text style={styles.errorText}>{error}</Text>;
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

  // --- IMAGE OPTIMIZATION HELPER (Ensures under 1MB) ---
  const optimizeImage = async (uri) => {
    try {
      // Pass 1: Standard Resize & Compression
      let result = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 1200 } }],
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
      );

      // Check file size
      const response = await fetch(result.uri);
      const blob = await response.blob();

      // Pass 2: Aggressive compression if still > 1MB
      if (blob.size > 1024 * 1024) {
        result = await ImageManipulator.manipulateAsync(
          result.uri,
          [{ resize: { width: 1000 } }],
          { compress: 0.5, format: ImageManipulator.SaveFormat.JPEG }
        );
      }
      return result.uri;
    } catch (e) {
      console.error("Optimization failed", e);
      return uri;
    }
  };

  const pickImage = async (setter, fieldKey) => {
    let result = await ImagePicker.launchImageLibraryAsync({ quality: 1 });
    if (!result.canceled) {
      const optimized = await optimizeImage(result.assets[0].uri);
      setter(optimized);
      setErrors(prev => ({ ...prev, [fieldKey]: null }));
    }
  };

  const takeSelfie = async () => {
    if (cameraRef.current) {
      try {
        const photo = await cameraRef.current.takePictureAsync({ quality: 0.8 });
        const optimized = await optimizeImage(photo.uri);
        setSelfie(optimized);
        setErrors(prev => ({ ...prev, selfie: null }));
        setIsCameraActive(false);
      } catch (e) {
        Alert.alert("Camera Error", "Failed to capture photo.");
      }
    }
  };

  // --- FIREBASE STORAGE UPLOAD HELPER WITH SIZE GUARD ---
  const uploadToStorage = async (uri, path, fieldName) => {
    if (!uri) return null;
    const response = await fetch(uri);
    const blob = await response.blob();

    // Final 1MB Validation check before upload
    if (blob.size > 1024 * 1024) {
      throw new Error(`${fieldName} exceeds 1MB. Please try a different photo or lower resolution.`);
    }

    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, blob);
    return await getDownloadURL(storageRef);
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

      if (!userMobileId) throw new Error("User mobile ID not found. Log in again.");

      const timestamp = Date.now();
      const folder = `users/${userMobileId}/kyc_docs`;

      // 1. Upload All Images to Storage with size checking
      const [aadhaarUrl, panUrl, dlUrl, selfieUrl] = await Promise.all([
        uploadToStorage(aadhaarDoc, `${folder}/aadhaar_${timestamp}.jpg`, "Aadhaar Photo"),
        uploadToStorage(panDoc, `${folder}/pan_${timestamp}.jpg`, "PAN Photo"),
        uploadToStorage(dlDoc, `${folder}/dl_${timestamp}.jpg`, "DL Photo"),
        uploadToStorage(selfie, `${folder}/selfie_${timestamp}.jpg`, "Selfie"),
      ]);

      // 2. Generate Referral Code
      const namePart = (personalInfo.fullName || "USR").substring(0, 3).toUpperCase();
      const hexMobile = parseInt(userMobileId, 10).toString(16).toUpperCase();
      const newReferralCode = `${namePart}${hexMobile}`;

      const kycInfo = { 
        ...identity, 
        aadhaarDocUrl: aadhaarUrl, 
        panDocUrl: panUrl, 
        drivingLicenseDocUrl: dlUrl,
        selfieUrl: selfieUrl 
      };

      const updatePayload = {
        personKycInfo: kycInfo, 
        kycStatus: "submitted", 
        personalKycSubmitted: true,
        myReferralCode: newReferralCode,
        updatedAt: new Date().toISOString()
      };

      // 3. Firestore Updates
      await setDoc(doc(db, "users", userMobileId), updatePayload, { merge: true });
      await setDoc(doc(db, "kyc", "categories"), { pending: arrayUnion(userMobileId) }, { merge: true });
      
      // CREATE REFERRAL DOCUMENT
      await setDoc(doc(db, "referrals", newReferralCode), { 
        ownerId: userMobileId, 
        referredUsers: [] 
      }, { merge: true });

      // 4. Update Local Session
      const updatedSession = { ...personalInfo, personalKycSubmitted: true, myReferralCode: newReferralCode };
      await AsyncStorage.setItem('personalInfo', JSON.stringify(updatedSession));

      setIsSubmitting(false);
      Alert.alert("Success", "KYC documents uploaded and submitted!");
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
                onChangeText={(t) => setIdentity({...identity, aadhaar: t})}
              />
              <ErrorMsg error={errors.aadhaar} />

              <InputLabel title="Aadhaar Card Photo" required />
              <TouchableOpacity 
                style={[styles.uploadBtn, aadhaarDoc && styles.uploadBtnSuccess, errors.aadhaarDoc && styles.inputError]} 
                onPress={() => pickImage(setAadhaarDoc, 'aadhaarDoc')}
              >
                <Ionicons name={aadhaarDoc ? "checkmark-circle" : "cloud-upload-outline"} size={24} color={aadhaarDoc ? COLORS.successGreen : COLORS.primaryGreen} />
                <Text style={[styles.uploadText, aadhaarDoc && {color: COLORS.successGreen}]}>{aadhaarDoc ? "Aadhaar Added" : "Upload Aadhaar"}</Text>
              </TouchableOpacity>
              <ErrorMsg error={errors.aadhaarDoc} />
              
              <InputLabel title="PAN Number" required />
              <TextInput 
                style={[styles.standardInput, errors.pan && styles.inputError]} 
                placeholder="10-character PAN" 
                autoCapitalize="characters" 
                maxLength={10} 
                value={identity.pan}
                onChangeText={(t) => setIdentity({...identity, pan: t})}
              />
              <ErrorMsg error={errors.pan} />

              <InputLabel title="PAN Card Photo" required />
              <TouchableOpacity 
                style={[styles.uploadBtn, panDoc && styles.uploadBtnSuccess, errors.panDoc && styles.inputError]} 
                onPress={() => pickImage(setPanDoc, 'panDoc')}
              >
                <Ionicons name={panDoc ? "checkmark-circle" : "cloud-upload-outline"} size={24} color={panDoc ? COLORS.successGreen : COLORS.primaryGreen} />
                <Text style={[styles.uploadText, panDoc && {color: COLORS.successGreen}]}>{panDoc ? "PAN Added" : "Upload PAN"}</Text>
              </TouchableOpacity>
              <ErrorMsg error={errors.panDoc} />

              <InputLabel title="Driving License Number" required />
              <TextInput 
                style={[styles.standardInput, errors.drivingLicense && styles.inputError]} 
                placeholder="DL Number" 
                autoCapitalize="characters" 
                value={identity.drivingLicense}
                onChangeText={(t) => setIdentity({...identity, drivingLicense: t})}
              />
              <ErrorMsg error={errors.drivingLicense} />

              <InputLabel title="Driving License Photo" required />
              <TouchableOpacity 
                style={[styles.uploadBtn, dlDoc && styles.uploadBtnSuccess, errors.dlDoc && styles.inputError]} 
                onPress={() => pickImage(setDlDoc, 'dlDoc')}
              >
                <Ionicons name={dlDoc ? "checkmark-circle" : "cloud-upload-outline"} size={24} color={dlDoc ? COLORS.successGreen : COLORS.primaryGreen} />
                <Text style={[styles.uploadText, dlDoc && {color: COLORS.successGreen}]}>{dlDoc ? "DL Added" : "Upload DL"}</Text>
              </TouchableOpacity>
              <ErrorMsg error={errors.dlDoc} />
              
              <InputLabel title="Live Selfie" required />
              {!selfie ? (
                <TouchableOpacity style={[styles.cameraBtn, errors.selfie && styles.inputError]} onPress={() => setIsCameraActive(true)}>
                  <Ionicons name="camera" size={24} color={COLORS.primaryGreen} />
                  <Text style={styles.cameraBtnText}>Open Camera for Selfie</Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.previewCard}>
                  <Image source={{ uri: selfie }} style={styles.previewImage} />
                  <View style={styles.previewActionRow}>
                    <Text style={styles.successText}>Selfie Captured</Text>
                    <TouchableOpacity onPress={() => setIsCameraActive(true)}><Text style={styles.retakeText}>Retake</Text></TouchableOpacity>
                  </View>
                </View>
              )}
              <ErrorMsg error={errors.selfie} />

              <TouchableOpacity style={[styles.primaryButton, isSubmitting && styles.disabledButton]} onPress={handleValidationAndSubmit} disabled={isSubmitting}>
                {isSubmitting ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <ActivityIndicator color="#FFF" style={{ marginRight: 10 }} />
                    <Text style={styles.primaryButtonText}>Uploading Documents...</Text>
                  </View>
                ) : <Text style={styles.primaryButtonText}>Submit Application</Text>}
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