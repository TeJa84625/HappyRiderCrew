import React, { useState, useRef } from 'react';
import { 
  StyleSheet, Text, View, TextInput, TouchableOpacity, ScrollView, 
  SafeAreaView, Modal, Image, Platform, ActivityIndicator, Alert, FlatList, KeyboardAvoidingView 
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from './firebase'; // MUST IMPORT storage HERE

const COLORS = { 
  primaryGreen: '#5C832F', 
  darkNavy: '#0F172A', 
  textMuted: '#6B7280', 
  inputBg: '#F9FAFB', 
  borderMuted: '#E5E7EB', 
  errorRed: '#EF4444',
  successGreen: '#10B981', 
  white: '#FFFFFF',
  blue: '#4A90E2',
  overlay: 'rgba(0,0,0,0.5)'
};

const VEHICLE_TYPES = ["2 Wheeler (Bike/Scooter)", "Auto", "4 Wheeler"];

const InputLabel = ({ title, required }) => (
  <Text style={styles.label}>{title} {required && <Text style={{ color: COLORS.errorRed }}>*</Text>}</Text>
);

const ErrorMsg = ({ error }) => {
  if (!error) return null;
  return <Text style={styles.errorText}>{error}</Text>;
};

const ImageUpload = ({ title, imageUri, setImageUri, hasError, clearError }) => {
  const pickFromGallery = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({ quality: 0.5 });
    if (!result.canceled) {
      setImageUri(result.assets[0].uri);
      if (clearError) clearError();
    }
  };
  return (
    <TouchableOpacity 
      style={[
        styles.uploadBtn, 
        imageUri && styles.uploadBtnSuccess,
        hasError && styles.inputError
      ]} 
      onPress={pickFromGallery}
    >
      <Ionicons name={imageUri ? "checkmark-circle" : "cloud-upload-outline"} size={24} color={imageUri ? COLORS.successGreen : hasError ? COLORS.errorRed : COLORS.primaryGreen} />
      <Text style={[styles.uploadText, imageUri && {color: COLORS.successGreen}, hasError && {color: COLORS.errorRed}]}>
        {imageUri ? `${title} Selected` : `Upload ${title}`}
      </Text>
    </TouchableOpacity>
  );
};

export default function VehicleKYC({ navigation }) {
  const [formData, setFormData] = useState({
    vehicleType: '',
    passengerSeats: '',
    ownershipType: 'Own',
    company: '',
    model: '',
    rcNumber: '',
    insurance: 'Yes',
    insuranceNumber: '',
    mileage: '',
    // New Rental Fields
    rentalCompany: '',
    rentalOwner: '',
    rentalPhone: '',
    rentDueDate: ''
  });

  // Document States (Local URIs)
  const [rcDoc, setRcDoc] = useState(null);
  const [vehicleImageFront, setVehicleImageFront] = useState(null);
  const [vehicleImageSide, setVehicleImageSide] = useState(null);
  const [vehicleImageBack, setVehicleImageBack] = useState(null);
  const [numberPlate, setNumberPlate] = useState(null);
  const [rentalDoc, setRentalDoc] = useState(null);

  // UI States
  const [showTypeModal, setShowTypeModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState({});

  // Camera States
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const cameraRef = useRef(null);

  const openCamera = async () => {
    if (!cameraPermission?.granted) await requestCameraPermission();
    setIsCameraActive(true);
  };

  const takePicture = async () => {
    if (cameraRef.current) {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.5 });
      setNumberPlate(photo.uri);
      setErrors({ ...errors, numberPlate: null }); 
      setIsCameraActive(false);
    }
  };

  // Helper to format Date inputs (DD/MM/YYYY)
  const handleDateChange = (text, field) => {
    let cleaned = text.replace(/\D/g, '');
    let formatted = cleaned;
    if (cleaned.length > 2) formatted = cleaned.slice(0, 2) + '/' + cleaned.slice(2);
    if (cleaned.length > 4) formatted = formatted.slice(0, 5) + '/' + cleaned.slice(4, 8);
    setFormData({ ...formData, [field]: formatted });
    if (errors[field]) setErrors({ ...errors, [field]: null });
  };

  // Firebase Storage Upload Helper
  const uploadImageToFirebase = async (uri, folder, userId) => {
    if (!uri) return null;
    if (uri.startsWith('http')) return uri; // Already a remote URL

    try {
      const response = await fetch(uri);
      const blob = await response.blob();
      const filename = uri.substring(uri.lastIndexOf('/') + 1);
      const storageRef = ref(storage, `kyc_documents/${userId}/${folder}/${filename}`);
      
      await uploadBytes(storageRef, blob);
      const downloadURL = await getDownloadURL(storageRef);
      return downloadURL;
    } catch (error) {
      console.error(`Error uploading ${folder} image:`, error);
      throw new Error(`Failed to upload ${folder}.`);
    }
  };

  const handleValidationAndSubmit = async () => {
    let newErrors = {};

    // 1. Basic Text Field Validation
    if (!formData.vehicleType) newErrors.vehicleType = "Vehicle Type is required";
    if ((formData.vehicleType === 'Auto' || formData.vehicleType === '4 Wheeler') && !formData.passengerSeats.trim()) {
      newErrors.passengerSeats = "Passenger seats required";
    }
    if (!formData.company.trim()) newErrors.company = "Company is required";
    if (!formData.model.trim()) newErrors.model = "Model is required";
    if (!formData.rcNumber.trim()) newErrors.rcNumber = "RC Number is required";
    if (!formData.mileage.trim()) newErrors.mileage = "Mileage is required";

    // 2. Rental Specific Validation
    if (formData.ownershipType === 'Rental') {
      if (!formData.rentalCompany.trim()) newErrors.rentalCompany = "Rental Company is required";
      if (!formData.rentalOwner.trim()) newErrors.rentalOwner = "Owner name is required";
      if (!formData.rentalPhone.trim() || formData.rentalPhone.length < 10) newErrors.rentalPhone = "Valid phone number required";
      if (!formData.rentDueDate.trim()) newErrors.rentDueDate = "Rent due date required";
      if (!rentalDoc) newErrors.rentalDoc = "Rental Agreement is required";
    }

    // 3. Image & Document Validation
    if (!rcDoc) newErrors.rcDoc = "RC Document is required";
    if (!numberPlate) newErrors.numberPlate = "Live number plate capture is required";
    if (!vehicleImageFront) newErrors.vehicleImageFront = "Front view is required";
    if (!vehicleImageSide) newErrors.vehicleImageSide = "Side view is required";
    if (!vehicleImageBack) newErrors.vehicleImageBack = "Back view is required";

    setErrors(newErrors);

    if (Object.keys(newErrors).length > 0) {
      Alert.alert("Missing Fields", "Please complete all required fields highlighted in red.");
      return;
    }

    setIsSubmitting(true);

    try {
      const personalInfoRaw = await AsyncStorage.getItem('personalInfo');
      if (!personalInfoRaw) throw new Error("Session expired. Please log in again.");
      
      const personalInfo = JSON.parse(personalInfoRaw);
      const userMobileId = personalInfo.mobile;

      // 4. Upload all images to Firebase Storage
      const uploadedRcDoc = await uploadImageToFirebase(rcDoc, 'rc_documents', userMobileId);
      const uploadedPlate = await uploadImageToFirebase(numberPlate, 'number_plates', userMobileId);
      const uploadedFront = await uploadImageToFirebase(vehicleImageFront, 'vehicle_front', userMobileId);
      const uploadedSide = await uploadImageToFirebase(vehicleImageSide, 'vehicle_side', userMobileId);
      const uploadedBack = await uploadImageToFirebase(vehicleImageBack, 'vehicle_back', userMobileId);
      
      let uploadedRentalDoc = null;
      if (formData.ownershipType === 'Rental') {
        uploadedRentalDoc = await uploadImageToFirebase(rentalDoc, 'rental_agreements', userMobileId);
      }

      // 5. Construct Payload with Firebase Remote URLs
      const vehiclePayload = {
        ...formData,
        rcDoc: uploadedRcDoc, 
        numberPlate: uploadedPlate,
        vehicleImages: { 
          front: uploadedFront, 
          side: uploadedSide, 
          back: uploadedBack 
        },
        rentalDoc: uploadedRentalDoc // Will be null if Ownership is "Own"
      };

      // 6. Update Firestore Document
      const userRef = doc(db, "users", userMobileId);
      await updateDoc(userRef, {
        vehicleInfo: vehiclePayload,
        vehicleKyc: true
      });

      // 7. Update Local Storage Session
      const updatedSession = { ...personalInfo, vehicleKyc: true, vehicleInfo: vehiclePayload };
      await AsyncStorage.setItem('personalInfo', JSON.stringify(updatedSession));

      setIsSubmitting(false);
      Alert.alert("Success", "Vehicle details saved successfully!");
      navigation.navigate('PersonKYC');

    } catch (error) {
      setIsSubmitting(false);
      console.error(error);
      Alert.alert("Upload Error", error.message || "Failed to save vehicle data. Please check your connection.");
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.keyboardWrapper}>
        <View style={styles.webWrapper}>
          <View style={styles.card}>
            
            <Modal visible={isCameraActive} animationType="slide" transparent={false}>
              <CameraView style={styles.camera} facing="back" ref={cameraRef}>
                <View style={styles.cameraOverlay}>
                  <View style={styles.plateGuide}><Text style={styles.guideText}>Align Number Plate</Text></View>
                  <View style={styles.cameraControls}>
                    <TouchableOpacity onPress={() => setIsCameraActive(false)}><Ionicons name="close" size={40} color="#FFF" /></TouchableOpacity>
                    <TouchableOpacity style={styles.captureBtn} onPress={takePicture}><View style={styles.captureBtnInner} /></TouchableOpacity>
                    <View style={{ width: 40 }} />
                  </View>
                </View>
              </CameraView>
            </Modal>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
              
              <Text style={styles.screenTitle}>Vehicle Details</Text>
              <Text style={styles.screenSubtitle}>Step 1: Register your vehicle</Text>

              {/* Vehicle Type */}
              <InputLabel title="Vehicle Type" required />
              <TouchableOpacity 
                style={[styles.pickerWrapper, errors.vehicleType && styles.inputError]} 
                onPress={() => setShowTypeModal(true)}
              >
                <Text style={{ color: formData.vehicleType ? COLORS.darkNavy : COLORS.textMuted, fontSize: 16 }}>
                  {formData.vehicleType || "Select Vehicle Type"}
                </Text>
                <Ionicons name="chevron-down" size={20} color={COLORS.textMuted} />
              </TouchableOpacity>
              <ErrorMsg error={errors.vehicleType} />

              {/* Passenger Seats */}
              {(formData.vehicleType === 'Auto' || formData.vehicleType === '4 Wheeler') && (
                <View>
                  <InputLabel title="Number of Passenger Seats" required />
                  <TextInput 
                    style={[styles.standardInput, errors.passengerSeats && styles.inputError]} 
                    placeholder="e.g. 3" 
                    keyboardType="number-pad"
                    value={formData.passengerSeats}
                    onChangeText={(t) => { setFormData({...formData, passengerSeats: t}); setErrors({...errors, passengerSeats: null}); }}
                  />
                  <ErrorMsg error={errors.passengerSeats} />
                </View>
              )}

              {/* Ownership Type */}
              <InputLabel title="Ownership Type" required />
              <View style={styles.segmentContainer}>
                {["Own", "Rental"].map((item) => (
                  <TouchableOpacity
                    key={item}
                    style={[styles.segmentButton, formData.ownershipType === item && styles.segmentButtonActive]}
                    onPress={() => {
                      setFormData({ ...formData, ownershipType: item });
                      // Clear rental errors if switching back to Own
                      if (item === 'Own') {
                        setErrors({ ...errors, rentalCompany: null, rentalOwner: null, rentalPhone: null, rentDueDate: null, rentalDoc: null });
                      }
                    }}
                  >
                    <Text style={[styles.segmentText, formData.ownershipType === item && styles.segmentTextActive]}>{item}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* RENTAL SPECIFIC FIELDS */}
              {formData.ownershipType === 'Rental' && (
                <View style={styles.rentalContainer}>
                  <InputLabel title="Rental Company Name" required />
                  <TextInput 
                    style={[styles.standardInput, errors.rentalCompany && styles.inputError]} 
                    placeholder="e.g., Zoomcar, Ola Fleet" 
                    value={formData.rentalCompany} 
                    onChangeText={(t) => { setFormData({...formData, rentalCompany: t}); setErrors({...errors, rentalCompany: null}); }}
                  />
                  <ErrorMsg error={errors.rentalCompany} />

                  <InputLabel title="Rental Owner Name" required />
                  <TextInput 
                    style={[styles.standardInput, errors.rentalOwner && styles.inputError]} 
                    placeholder="Owner Full Name" 
                    value={formData.rentalOwner} 
                    onChangeText={(t) => { setFormData({...formData, rentalOwner: t}); setErrors({...errors, rentalOwner: null}); }}
                  />
                  <ErrorMsg error={errors.rentalOwner} />

                  <View style={styles.row}>
                    <View style={{ flex: 1, marginRight: 10 }}>
                      <InputLabel title="Owner Phone" required />
                      <TextInput 
                        style={[styles.standardInput, errors.rentalPhone && styles.inputError]} 
                        placeholder="10-digit number" 
                        keyboardType="phone-pad"
                        maxLength={10}
                        value={formData.rentalPhone} 
                        onChangeText={(t) => { setFormData({...formData, rentalPhone: t}); setErrors({...errors, rentalPhone: null}); }}
                      />
                      <ErrorMsg error={errors.rentalPhone} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <InputLabel title="Rent Due Date" required />
                      <TextInput 
                        style={[styles.standardInput, errors.rentDueDate && styles.inputError]} 
                        placeholder="DD/MM/YYYY" 
                        keyboardType="number-pad"
                        maxLength={10}
                        value={formData.rentDueDate} 
                        onChangeText={(t) => handleDateChange(t, 'rentDueDate')}
                      />
                      <ErrorMsg error={errors.rentDueDate} />
                    </View>
                  </View>

                  <InputLabel title="Rental Agreement Document" required />
                  <ImageUpload title="Rental Agreement" imageUri={rentalDoc} setImageUri={setRentalDoc} hasError={errors.rentalDoc} clearError={() => setErrors({...errors, rentalDoc: null})} />
                  <ErrorMsg error={errors.rentalDoc} />
                </View>
              )}

              {/* Basic Details */}
              <View style={styles.row}>
                <View style={{ flex: 1, marginRight: 10 }}>
                  <InputLabel title="Company" required />
                  <TextInput 
                    style={[styles.standardInput, errors.company && styles.inputError]} 
                    placeholder="e.g., Honda" 
                    value={formData.company} 
                    onChangeText={(t) => { setFormData({...formData, company: t}); setErrors({...errors, company: null}); }}
                  />
                  <ErrorMsg error={errors.company} />
                </View>
                <View style={{ flex: 1 }}>
                  <InputLabel title="Model" required />
                  <TextInput 
                    style={[styles.standardInput, errors.model && styles.inputError]} 
                    placeholder="e.g., Activa 6G" 
                    value={formData.model} 
                    onChangeText={(t) => { setFormData({...formData, model: t}); setErrors({...errors, model: null}); }}
                  />
                  <ErrorMsg error={errors.model} />
                </View>
              </View>

              <InputLabel title="RC Number" required />
              <TextInput 
                style={[styles.standardInput, errors.rcNumber && styles.inputError]} 
                placeholder="Registration Certificate Number" 
                autoCapitalize="characters" 
                value={formData.rcNumber} 
                onChangeText={(t) => { setFormData({...formData, rcNumber: t}); setErrors({...errors, rcNumber: null}); }}
              />
              <ErrorMsg error={errors.rcNumber} />
              
              <InputLabel title="RC Document" required />
              <ImageUpload title="RC Document" imageUri={rcDoc} setImageUri={setRcDoc} hasError={errors.rcDoc} clearError={() => setErrors({...errors, rcDoc: null})} />
              <ErrorMsg error={errors.rcDoc} />
              
              {/* Number Plate Live Capture */}
              <InputLabel title="Number Plate (Live Capture)" required />
              {!numberPlate ? (
                <TouchableOpacity style={[styles.cameraBtn, errors.numberPlate && styles.inputError]} onPress={openCamera}>
                  <Ionicons name="camera" size={24} color={errors.numberPlate ? COLORS.errorRed : COLORS.primaryGreen} />
                  <Text style={[styles.cameraBtnText, errors.numberPlate && { color: COLORS.errorRed }]}>Open Camera</Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.previewCard}>
                  <Image source={{ uri: numberPlate }} style={styles.previewImage} />
                  <View style={styles.previewActionRow}>
                    <Text style={styles.successText}>Plate Captured</Text>
                    <TouchableOpacity onPress={openCamera}><Text style={styles.retakeText}>Retake</Text></TouchableOpacity>
                  </View>
                </View>
              )}
              <ErrorMsg error={errors.numberPlate} />

              {/* Vehicle Images */}
              <InputLabel title="Vehicle Images" required />
              <ImageUpload title="Front View" imageUri={vehicleImageFront} setImageUri={setVehicleImageFront} hasError={errors.vehicleImageFront} clearError={() => setErrors({...errors, vehicleImageFront: null})} />
              <ErrorMsg error={errors.vehicleImageFront} />
              
              <ImageUpload title="Side View" imageUri={vehicleImageSide} setImageUri={setVehicleImageSide} hasError={errors.vehicleImageSide} clearError={() => setErrors({...errors, vehicleImageSide: null})} />
              <ErrorMsg error={errors.vehicleImageSide} />
              
              <ImageUpload title="Back View" imageUri={vehicleImageBack} setImageUri={setVehicleImageBack} hasError={errors.vehicleImageBack} clearError={() => setErrors({...errors, vehicleImageBack: null})} />
              <ErrorMsg error={errors.vehicleImageBack} />

              {/* Mileage */}
              <InputLabel title="Approximate Mileage (km/l)" required />
              <TextInput 
                style={[styles.standardInput, errors.mileage && styles.inputError]} 
                placeholder="e.g. 45" 
                keyboardType="number-pad"
                value={formData.mileage}
                onChangeText={(t) => { setFormData({...formData, mileage: t}); setErrors({...errors, mileage: null}); }}
              />
              <ErrorMsg error={errors.mileage} />

              {/* Insurance Details */}
              <InputLabel title="Do you have vehicle insurance?" required />
              <View style={styles.segmentContainer}>
                {["Yes", "No"].map((item) => (
                  <TouchableOpacity
                    key={item}
                    style={[styles.segmentButton, formData.insurance === item && styles.segmentButtonActive]}
                    onPress={() => {
                      setFormData({ ...formData, insurance: item, insuranceNumber: item === 'No' ? '' : formData.insuranceNumber });
                    }}
                  >
                    <Text style={[styles.segmentText, formData.insurance === item && styles.segmentTextActive]}>{item}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {formData.insurance === 'Yes' && (
                <View>
                  <InputLabel title="Insurance Number" />
                  <TextInput 
                    style={styles.standardInput} 
                    placeholder="Optional" 
                    autoCapitalize="characters"
                    value={formData.insuranceNumber}
                    onChangeText={(t) => setFormData({...formData, insuranceNumber: t})}
                  />
                </View>
              )}

              {/* Submit Button */}
              <TouchableOpacity 
                style={[styles.primaryButton, isSubmitting && styles.disabledButton]} 
                onPress={handleValidationAndSubmit} 
                disabled={isSubmitting}
              >
                {isSubmitting ? <ActivityIndicator color="#FFF" /> : <Text style={styles.primaryButtonText}>Save & Continue</Text>}
              </TouchableOpacity>

            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* Vehicle Type Bottom Sheet Modal */}
      <Modal visible={showTypeModal} animationType="fade" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.bottomSheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Select Vehicle Type</Text>
              <TouchableOpacity onPress={() => setShowTypeModal(false)}>
                <Ionicons name="close" size={24} color={COLORS.darkNavy} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={VEHICLE_TYPES}
              keyExtractor={(item) => item}
              renderItem={({ item }) => (
                <TouchableOpacity 
                  style={styles.sheetItem} 
                  onPress={() => { 
                    setFormData({ ...formData, vehicleType: item, passengerSeats: '' }); 
                    setErrors({ ...errors, vehicleType: null, passengerSeats: null });
                    setShowTypeModal(false); 
                  }}
                >
                  <Text style={[styles.sheetItemText, formData.vehicleType === item && { color: COLORS.blue, fontWeight: 'bold' }]}>{item}</Text>
                  {formData.vehicleType === item && <Ionicons name="checkmark" size={20} color={COLORS.blue} />}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.inputBg },
  keyboardWrapper: { flex: 1 },
  webWrapper: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16 },
  card: {
    width: '100%',
    maxWidth: 450,
    height: Platform.OS === 'web' ? '95%' : '100%',
    backgroundColor: COLORS.white,
    padding: 20,
    borderRadius: 16,
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5,
  },
  screenTitle: { fontSize: 28, fontWeight: 'bold', color: COLORS.darkNavy, marginBottom: 5, marginTop: 10 },
  screenSubtitle: { fontSize: 16, color: COLORS.textMuted, marginBottom: 20 },
  label: { fontSize: 14, fontWeight: 'bold', color: COLORS.darkNavy, marginBottom: 8, marginTop: 15 },
  
  standardInput: { backgroundColor: COLORS.inputBg, borderRadius: 12, height: 60, paddingHorizontal: 15, fontSize: 16, borderWidth: 1, borderColor: COLORS.borderMuted },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  
  pickerWrapper: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: COLORS.inputBg, borderRadius: 12, height: 60, borderWidth: 1, borderColor: COLORS.borderMuted, paddingHorizontal: 15 },
  
  inputError: { borderColor: COLORS.errorRed, borderWidth: 1.5 },
  errorText: { color: COLORS.errorRed, fontSize: 12, marginTop: 4, marginLeft: 4 },

  segmentContainer: { flexDirection: "row", borderRadius: 12, backgroundColor: COLORS.inputBg, padding: 5, borderWidth: 1, borderColor: COLORS.borderMuted, height: 60, alignItems: 'center' },
  segmentButton: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: "center" },
  segmentButtonActive: { backgroundColor: COLORS.blue },
  segmentText: { color: COLORS.textMuted, fontWeight: "500", fontSize: 14 },
  segmentTextActive: { color: COLORS.white, fontWeight: "600" },

  rentalContainer: { backgroundColor: '#F0F9FF', padding: 15, borderRadius: 12, marginTop: 15, borderWidth: 1, borderColor: '#BAE6FD' },

  uploadBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#E8F5E9', padding: 15, borderRadius: 12, marginBottom: 4, borderWidth: 1, borderColor: COLORS.primaryGreen, borderStyle: 'dashed' },
  uploadBtnSuccess: { backgroundColor: '#E8F5E9', borderColor: COLORS.successGreen, borderStyle: 'solid' },
  uploadText: { flex: 1, marginLeft: 10, color: COLORS.primaryGreen, fontWeight: 'bold', fontSize: 16 },
  
  cameraBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.inputBg, height: 60, borderRadius: 12, marginBottom: 4, borderWidth: 1, borderColor: COLORS.primaryGreen },
  cameraBtnText: { marginLeft: 10, color: COLORS.primaryGreen, fontWeight: 'bold', fontSize: 16 },

  primaryButton: { backgroundColor: COLORS.primaryGreen, borderRadius: 12, height: 60, justifyContent: 'center', alignItems: 'center', marginTop: 20, marginBottom: 30 },
  primaryButtonText: { color: COLORS.white, fontSize: 18, fontWeight: 'bold' },
  disabledButton: { opacity: 0.7 },

  camera: { flex: 1 },
  cameraOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'space-between', paddingBottom: 40 },
  plateGuide: { marginTop: 150, alignSelf: 'center', width: '80%', height: 100, borderWidth: 2, borderColor: COLORS.successGreen, borderStyle: 'dashed', borderRadius: 10, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.1)' },
  guideText: { color: COLORS.white, fontWeight: 'bold', fontSize: 16, backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 15, paddingVertical: 5, borderRadius: 20 },
  cameraControls: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', width: '100%' },
  captureBtn: { width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.3)', justifyContent: 'center', alignItems: 'center' },
  captureBtnInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: COLORS.white },
  
  previewCard: { backgroundColor: COLORS.white, borderRadius: 12, marginBottom: 4, borderWidth: 1, borderColor: COLORS.borderMuted, overflow: 'hidden' },
  previewImage: { width: '100%', height: 150, resizeMode: 'cover' },
  previewActionRow: { flexDirection: 'row', justifyContent: 'space-between', padding: 12, backgroundColor: COLORS.inputBg },
  successText: { color: COLORS.successGreen, fontWeight: 'bold', fontSize: 14 },
  retakeText: { color: COLORS.primaryGreen, fontWeight: 'bold', fontSize: 14 },

  modalOverlay: { flex: 1, backgroundColor: COLORS.overlay, justifyContent: 'flex-end' },
  bottomSheet: { backgroundColor: COLORS.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '60%' },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  sheetTitle: { fontSize: 20, fontWeight: 'bold', color: COLORS.darkNavy },
  sheetItem: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: COLORS.borderMuted },
  sheetItemText: { fontSize: 16, color: COLORS.darkNavy },
});