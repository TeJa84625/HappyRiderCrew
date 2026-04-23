import React, { useState, useRef } from 'react';
import { 
  StyleSheet, Text, View, TextInput, TouchableOpacity, ScrollView, 
  Image, SafeAreaView, Platform, ActivityIndicator, Alert, 
  Modal, KeyboardAvoidingView, FlatList 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { CameraView, useCameraPermissions } from 'expo-camera';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from './firebase'; 

const COLORS = { 
  primaryGreen: '#5C832F', 
  successGreen: '#10B981',
  darkNavy: '#0F172A', 
  textMuted: '#6B7280', 
  inputBg: '#F9FAFB', 
  borderMuted: '#E5E7EB', 
  errorRed: '#EF4444',
  white: '#FFFFFF',
  blue: '#3B82F6',
  overlay: 'rgba(0,0,0,0.5)'
};

const VEHICLE_TYPES = ["2 Wheeler (Bike/Scooter)", "3 Wheeler (Auto)", "4 Wheeler (Car,Van)"];
const FUEL_TYPES = ["Petrol", "Diesel", "EV"];
const RELATIONS = ["Mother", "Father", "Brother", "Uncle", "Friend", "Others"];

const InputLabel = ({ title, required }) => (
  <Text style={styles.label}>{title} {required && <Text style={{ color: COLORS.errorRed }}>*</Text>}</Text>
);

const ErrorMsg = ({ error }) => {
  if (!error) return null;
  return <Text style={styles.errorText}>{error}</Text>;
};

export default function VehicleKYC({ navigation }) {
  const [formData, setFormData] = useState({
    vehicleType: '', fuelType: 'Petrol', passengerSeats: '2', ownershipType: 'Own',
    vehicleCompany: '', vehicleModel: '', rcNumber: '', insurance: 'No', 
    insuranceNumber: '', mileage: '',
    rentalCompany: '', rentalOwner: '', rentalPhone: '', rentDueDate: '',
    relationType: '', otherRelation: '', ownerName: '', ownerAadhar: '', ownerConsent: false
  });

  const [rcDoc, setRcDoc] = useState(null);
  const [vehicleImageFront, setVehicleImageFront] = useState(null);
  const [vehicleImageSide, setVehicleImageSide] = useState(null);
  const [vehicleImageBack, setVehicleImageBack] = useState(null);
  const [numberPlate, setNumberPlate] = useState(null);
  const [rentalDoc, setRentalDoc] = useState(null);

  const [showTypeModal, setShowTypeModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState({});
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [isCameraActive, setIsCameraActive] = useState(false);
  const cameraRef = useRef(null);

  const handleDateChange = (text) => {
    let cleaned = text.replace(/\D/g, '');
    let formatted = cleaned;
    if (cleaned.length > 2) formatted = cleaned.slice(0, 2) + '/' + cleaned.slice(2);
    if (cleaned.length > 4) formatted = formatted.slice(0, 5) + '/' + cleaned.slice(4, 8);
    setFormData({ ...formData, rentDueDate: formatted });
  };

  const handleRcChange = (text) => {
    let clean = text.replace(/[^A-Z0-9]/gi, '').toUpperCase();
    let formatted = "";
    if (clean.length > 0) formatted += clean.slice(0, 2); 
    if (clean.length > 2) formatted += " " + clean.slice(2, 4); 
    if (clean.length > 4) formatted += " " + clean.slice(4, 6); 
    if (clean.length > 6) formatted += " " + clean.slice(6, 10); 
    setFormData({ ...formData, rcNumber: formatted.trim() });
  };

  const pickImage = async (setter, fieldKey) => {
    let result = await ImagePicker.launchImageLibraryAsync({ quality: 0.6 });
    if (!result.canceled) {
      setter(result.assets[0].uri);
      setErrors(prev => ({ ...prev, [fieldKey]: null }));
    }
  };

  const validate = () => {
    let e = {};
    if (!formData.vehicleType) e.vehicleType = "Select vehicle type";
    if (formData.vehicleType && formData.vehicleType !== "2 Wheeler (Bike/Scooter)" && !formData.passengerSeats) e.passengerSeats = "Required";
    if (!formData.vehicleCompany.trim()) e.vehicleCompany = "Required";
    if (!formData.vehicleModel.trim()) e.vehicleModel = "Required";
    if (formData.rcNumber.length < 13) e.rcNumber = "Invalid format";

    if (formData.ownershipType === 'Rental') {
      if (!formData.rentalCompany.trim()) e.rentalCompany = "Required";
      if (formData.rentalPhone.length !== 10) e.rentalPhone = "Invalid phone";
      if (!rentalDoc) e.rentalDoc = "Required";
    }

    if (formData.ownershipType === 'Family/Friends') {
      if (!formData.relationType) e.relationType = "Required";
      if (!formData.ownerName.trim()) e.ownerName = "Required";
      if (formData.ownerAadhar.length < 12) e.ownerAadhar = "12 digits required";
      if (!formData.ownerConsent) e.ownerConsent = "Mandatory";
    }

    if (!rcDoc || !numberPlate || !vehicleImageFront || !vehicleImageSide || !vehicleImageBack) {
      Alert.alert("Error", "Please upload all required photos and documents.");
      return false;
    }

    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleKycSubmit = async () => {
    if (!validate()) return;
    setIsSubmitting(true);
    try {
      const rawData = await AsyncStorage.getItem('personalInfo');
      const session = JSON.parse(rawData);
      const mobileId = session?.mobile || session?.personalInfo?.mobile;

      // Base Vehicle Data
      let vehiclePayload = {
        vehicleType: formData.vehicleType,
        fuelType: formData.fuelType,
        passengerSeats: formData.passengerSeats,
        ownershipType: formData.ownershipType,
        vehicleCompany: formData.vehicleCompany,
        vehicleModel: formData.vehicleModel,
        rcNumber: formData.rcNumber,
        mileage: formData.mileage || "N/A",
        insurance: formData.insurance === "Yes" ? formData.insuranceNumber : "insurance no",
        rcDoc,
        numberPlate,
        vehicleImages: { front: vehicleImageFront, side: vehicleImageSide, back: vehicleImageBack }
      };

      // Conditional Mapping for Ownership
      if (formData.ownershipType === 'Rental') {
        vehiclePayload.rentalInfo = {
          rentalCompany: formData.rentalCompany,
          rentalOwner: formData.rentalOwner,
          rentalPhone: formData.rentalPhone,
          rentDueDate: formData.rentDueDate,
          rentalDoc: rentalDoc
        };
      } else if (formData.ownershipType === 'Family/Friends') {
        vehiclePayload.framilyInfo = {
          relationType: formData.relationType === 'Others' ? formData.otherRelation : formData.relationType,
          ownerName: formData.ownerName,
          ownerAadhar: formData.ownerAadhar,
          ownerConsent: formData.ownerConsent
        };
      }

      const userRef = doc(db, "users", mobileId);
      await updateDoc(userRef, { vehicleKycInfo: vehiclePayload, vehicleKycSubmitted: true });
      await AsyncStorage.setItem('personalInfo', JSON.stringify({ ...session, vehicleKycSubmitted: true, vehicleKycInfo: vehiclePayload }));
      
      navigation.navigate('PersonKYC');
    } catch (err) {
      Alert.alert("Error", err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.keyboardWrapper}>
        <View style={styles.webWrapper}>
          <View style={styles.card}>
            <Modal visible={isCameraActive} animationType="slide">
              <CameraView style={styles.camera} ref={cameraRef}>
                <View style={styles.cameraOverlay}>
                  <View style={styles.plateGuide}><Text style={styles.guideText}>Align Number Plate</Text></View>
                  <View style={styles.cameraControls}>
                    <TouchableOpacity onPress={() => setIsCameraActive(false)}><Ionicons name="close-circle" size={50} color="#FFF" /></TouchableOpacity>
                    <TouchableOpacity style={styles.captureBtn} onPress={async () => {
                      const photo = await cameraRef.current.takePictureAsync({ quality: 0.5 });
                      setNumberPlate("photo.uri");
                      setIsCameraActive(false);
                    }}><View style={styles.captureBtnInner} /></TouchableOpacity>
                    <View style={{ width: 50 }} />
                  </View>
                </View>
              </CameraView>
            </Modal>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.screenTitle}>Vehicle Details</Text>
              <Text style={styles.screenSubtitle}>Step 1: Register your vehicle</Text>

              <InputLabel title="Vehicle Type" required />
              <TouchableOpacity style={[styles.pickerWrapper, errors.vehicleType && styles.inputError]} onPress={() => setShowTypeModal(true)}>
                <Text style={{ color: formData.vehicleType ? COLORS.darkNavy : COLORS.textMuted }}>{formData.vehicleType || "Select Type"}</Text>
                <Ionicons name="chevron-down" size={20} color={COLORS.textMuted} />
              </TouchableOpacity>
              <ErrorMsg error={errors.vehicleType} />

              {formData.vehicleType && formData.vehicleType !== "2 Wheeler (Bike/Scooter)" && (
                <View>
                  <InputLabel title="No. of Passenger Seats" required />
                  <TextInput style={[styles.standardInput, errors.passengerSeats && styles.inputError]} keyboardType="numeric" value={formData.passengerSeats} onChangeText={t => setFormData({...formData, passengerSeats: t.replace(/[^0-9]/g, '')})} />
                  <ErrorMsg error={errors.passengerSeats} />
                </View>
              )}

              <InputLabel title="Fuel Type" />
              <View style={styles.segmentContainer}>
                {FUEL_TYPES.map(f => (
                  <TouchableOpacity key={f} style={[styles.segmentButton, formData.fuelType === f && styles.segmentButtonActive]} onPress={() => setFormData({...formData, fuelType: f})}>
                    <Text style={[styles.segmentText, formData.fuelType === f && styles.segmentTextActive]}>{f}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <InputLabel title="Ownership Type" required />
              <View style={styles.segmentContainer}>
                {["Own", "Family/Friends", "Rental"].map(o => (
                  <TouchableOpacity key={o} style={[styles.segmentButton, formData.ownershipType === o && styles.segmentButtonActive]} onPress={() => setFormData({...formData, ownershipType: o})}>
                    <Text style={[styles.segmentText, formData.ownershipType === o && styles.segmentTextActive]}>{o}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {formData.ownershipType === 'Family/Friends' && (
                <View style={styles.rentalContainer}>
                  <InputLabel title="Relation with Owner" required />
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                    {RELATIONS.map(r => (
                      <TouchableOpacity key={r} onPress={() => setFormData({...formData, relationType: r})} style={{ padding: 10, backgroundColor: formData.relationType === r ? COLORS.blue : COLORS.white, borderRadius: 8, marginRight: 8, marginBottom: 8, borderWidth: 1, borderColor: COLORS.borderMuted }}>
                        <Text style={{ color: formData.relationType === r ? COLORS.white : COLORS.darkNavy, fontSize: 12 }}>{r}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  {formData.relationType === 'Others' && <TextInput style={[styles.standardInput, {marginTop: 5}]} placeholder="Specify Relation" value={formData.otherRelation} onChangeText={t => setFormData({...formData, otherRelation: t})} />}
                  
                  <InputLabel title="Owner Full Name" required />
                  <TextInput style={styles.standardInput} value={formData.ownerName} onChangeText={t => setFormData({...formData, ownerName: t})} />
                  
                  <InputLabel title="Owner Aadhar" required />
                  <TextInput style={styles.standardInput} maxLength={12} keyboardType="numeric" value={formData.ownerAadhar} onChangeText={t => setFormData({...formData, ownerAadhar: t.replace(/[^0-9]/g, '')})} />
                  
                  <TouchableOpacity style={{flexDirection: 'row', alignItems: 'center', marginTop: 15}} onPress={() => setFormData({...formData, ownerConsent: !formData.ownerConsent})}>
                    <Ionicons name={formData.ownerConsent ? "checkbox" : "square-outline"} size={26} color={COLORS.primaryGreen} />
                    <Text style={{marginLeft: 10, fontSize: 13, flex: 1}}>Owner knows vehicle is for Happy Rider use.</Text>
                  </TouchableOpacity>
                  <ErrorMsg error={errors.ownerConsent} />
                </View>
              )}

              {formData.ownershipType === 'Rental' && (
                <View style={styles.rentalContainer}>
                  <InputLabel title="Rental Company Name" required />
                  <TextInput style={styles.standardInput} value={formData.rentalCompany} onChangeText={t => setFormData({...formData, rentalCompany: t})} />
                  <InputLabel title="Rental Owner Name" required />
                  <TextInput style={styles.standardInput} value={formData.rentalOwner} onChangeText={t => setFormData({...formData, rentalOwner: t})} />
                  <View style={styles.row}>
                    <View style={{ flex: 0.48 }}><InputLabel title="Owner Phone" required /><TextInput style={styles.standardInput} keyboardType="numeric" maxLength={10} value={formData.rentalPhone} onChangeText={t => setFormData({...formData, rentalPhone: t.replace(/[^0-9]/g, '')})} /></View>
                    <View style={{ flex: 0.48 }}><InputLabel title="Due Date" required /><TextInput style={styles.standardInput} placeholder="DD/MM/YYYY" maxLength={10} value={formData.rentDueDate} onChangeText={handleDateChange} /></View>
                  </View>
                  <InputLabel title="Rental Agreement" required />
                  <TouchableOpacity style={[styles.uploadBtn, rentalDoc && styles.uploadBtnSuccess]} onPress={() => pickImage(setRentalDoc, 'rentalDoc')}>
                      <Ionicons name={rentalDoc ? "checkmark-circle" : "document-attach"} size={24} color={rentalDoc ? COLORS.successGreen : COLORS.primaryGreen} /><Text style={[styles.uploadText, rentalDoc && {color: COLORS.successGreen}]}>{rentalDoc ? "Uploaded" : "Upload Doc"}</Text>
                  </TouchableOpacity>
                </View>
              )}

              <View style={[styles.row, { marginTop: 10 }]}>
                <View style={{ flex: 0.48 }}><InputLabel title="Company" required /><TextInput style={styles.standardInput} placeholder="e.g. Honda" value={formData.vehicleCompany} onChangeText={t => setFormData({...formData, vehicleCompany: t})} /></View>
                <View style={{ flex: 0.48 }}><InputLabel title="Model" required /><TextInput style={styles.standardInput} placeholder="e.g. Activa" value={formData.vehicleModel} onChangeText={t => setFormData({...formData, vehicleModel: t})} /></View>
              </View>

              <InputLabel title="RC Number (AA 00 AA 0000)" required />
              <TextInput style={[styles.standardInput, errors.rcNumber && styles.inputError]} maxLength={13} value={formData.rcNumber} onChangeText={handleRcChange} />
              <ErrorMsg error={errors.rcNumber} />

              <InputLabel title="RC Document" required />
              <TouchableOpacity style={[styles.uploadBtn, rcDoc && styles.uploadBtnSuccess]} onPress={() => pickImage(setRcDoc, 'rcDoc')}>
                <Ionicons name={rcDoc ? "checkmark-circle" : "image"} size={24} color={rcDoc ? COLORS.successGreen : COLORS.primaryGreen} /><Text style={[styles.uploadText, rcDoc && {color: COLORS.successGreen}]}>{rcDoc ? "RC Added" : "Upload RC"}</Text>
              </TouchableOpacity>

              <InputLabel title="Number Plate Capture" required />
              {!numberPlate ? (
                <TouchableOpacity style={styles.cameraBtn} onPress={async () => {
                    const { granted } = await requestCameraPermission();
                    if (granted) setIsCameraActive(true);
                }}><Ionicons name="camera" size={24} color={COLORS.primaryGreen} /><Text style={styles.cameraBtnText}>Open Camera</Text></TouchableOpacity>
              ) : (
                <View style={styles.previewCard}>
                  <Image source={{ uri: numberPlate }} style={styles.previewImage} />
                  <View style={styles.previewActionRow}><Text style={styles.successText}>Captured</Text><TouchableOpacity onPress={() => setIsCameraActive(true)}><Text style={styles.retakeText}>Retake</Text></TouchableOpacity></View>
                </View>
              )}

              <InputLabel title="Vehicle Front View" required />
              <TouchableOpacity style={[styles.uploadBtn, vehicleImageFront && styles.uploadBtnSuccess]} onPress={() => pickImage(setVehicleImageFront, 'vFront')}>
                <Ionicons name={vehicleImageFront ? "checkmark-circle" : "camera"} size={22} color={vehicleImageFront ? COLORS.successGreen : COLORS.primaryGreen}/><Text style={[styles.uploadText, vehicleImageFront && {color: COLORS.successGreen}]}>Upload Front View</Text>
              </TouchableOpacity>

              <InputLabel title="Vehicle Side View" required />
              <TouchableOpacity style={[styles.uploadBtn, vehicleImageSide && styles.uploadBtnSuccess]} onPress={() => pickImage(setVehicleImageSide, 'vSide')}>
                <Ionicons name={vehicleImageSide ? "checkmark-circle" : "camera"} size={22} color={vehicleImageSide ? COLORS.successGreen : COLORS.primaryGreen}/><Text style={[styles.uploadText, vehicleImageSide && {color: COLORS.successGreen}]}>Upload Side View</Text>
              </TouchableOpacity>

              <InputLabel title="Vehicle Back View" required />
              <TouchableOpacity style={[styles.uploadBtn, vehicleImageBack && styles.uploadBtnSuccess]} onPress={() => pickImage(setVehicleImageBack, 'vBack')}>
                <Ionicons name={vehicleImageBack ? "checkmark-circle" : "camera"} size={22} color={vehicleImageBack ? COLORS.successGreen : COLORS.primaryGreen}/><Text style={[styles.uploadText, vehicleImageBack && {color: COLORS.successGreen}]}>Upload Back View</Text>
              </TouchableOpacity>

              <InputLabel title={`Mileage - ${formData.fuelType === 'EV' ? 'Km/Charge' : 'Km/L'}`} />
              <TextInput style={styles.standardInput} keyboardType="numeric" value={formData.mileage} onChangeText={t => setFormData({...formData, mileage: t})} />

              <InputLabel title="Insurance?" required />
              <View style={styles.segmentContainer}>
                {["Yes", "No"].map(i => (
                  <TouchableOpacity key={i} style={[styles.segmentButton, formData.insurance === i && styles.segmentButtonActive]} onPress={() => setFormData({...formData, insurance: i})}>
                    <Text style={[styles.segmentText, formData.insurance === i && styles.segmentTextActive]}>{i}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {formData.insurance === 'Yes' && (
                <View>
                  <InputLabel title="Insurance Number (Optional)" />
                  <TextInput style={styles.standardInput} placeholder="Policy Number" value={formData.insuranceNumber} onChangeText={t => setFormData({...formData, insuranceNumber: t})} />
                </View>
              )}

              <TouchableOpacity style={[styles.primaryButton, isSubmitting && styles.disabledButton]} onPress={handleKycSubmit} disabled={isSubmitting}>
                {isSubmitting ? <ActivityIndicator color="#FFF" /> : <Text style={styles.primaryButtonText}>Save & Continue</Text>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>

      <Modal visible={showTypeModal} transparent={true} animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.bottomSheet}>
            <Text style={styles.sheetTitle}>Vehicle Type</Text>
            {VEHICLE_TYPES.map(item => (
              <TouchableOpacity key={item} style={styles.sheetItem} onPress={() => { setFormData({...formData, vehicleType: item}); setShowTypeModal(false); }}>
                <Text style={styles.sheetItemText}>{item}</Text>
              </TouchableOpacity>
            ))}
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
  card: { width: '100%', maxWidth: 450, height: Platform.OS === 'web' ? '95%' : '100%', backgroundColor: COLORS.white, padding: 20, borderRadius: 16, elevation: 5 },
  screenTitle: { fontSize: 28, fontWeight: 'bold', color: COLORS.darkNavy, marginTop: 10 },
  screenSubtitle: { fontSize: 16, color: COLORS.textMuted, marginBottom: 20 },
  label: { fontSize: 14, fontWeight: 'bold', color: COLORS.darkNavy, marginBottom: 8, marginTop: 15 },
  standardInput: { backgroundColor: COLORS.inputBg, borderRadius: 12, height: 60, paddingHorizontal: 15, fontSize: 16, borderWidth: 1, borderColor: COLORS.borderMuted },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  pickerWrapper: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: COLORS.inputBg, borderRadius: 12, height: 60, borderWidth: 1, borderColor: COLORS.borderMuted, paddingHorizontal: 15 },
  segmentContainer: { flexDirection: "row", borderRadius: 12, backgroundColor: COLORS.inputBg, padding: 5, borderWidth: 1, borderColor: COLORS.borderMuted, height: 60, alignItems: 'center' },
  segmentButton: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: "center" },
  segmentButtonActive: { backgroundColor: COLORS.blue },
  segmentText: { color: COLORS.textMuted, fontWeight: "500", fontSize: 14 },
  segmentTextActive: { color: COLORS.white, fontWeight: "600" },
  rentalContainer: { backgroundColor: '#F0F9FF', padding: 15, borderRadius: 12, marginTop: 15, borderWidth: 1, borderColor: '#BAE6FD' },
  uploadBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#E8F5E9', padding: 15, borderRadius: 12, marginBottom: 4, borderWidth: 1, borderColor: COLORS.primaryGreen, borderStyle: 'dashed' },
  uploadBtnSuccess: { backgroundColor: '#E8F5E9', borderColor: COLORS.successGreen, borderStyle: 'solid' },
  uploadText: { flex: 1, marginLeft: 10, color: COLORS.primaryGreen, fontWeight: 'bold', fontSize: 14 },
  cameraBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.inputBg, height: 60, borderRadius: 12, marginBottom: 4, borderWidth: 1, borderColor: COLORS.primaryGreen },
  cameraBtnText: { marginLeft: 10, color: COLORS.primaryGreen, fontWeight: 'bold', fontSize: 16 },
  primaryButton: { backgroundColor: COLORS.primaryGreen, borderRadius: 12, height: 60, justifyContent: 'center', alignItems: 'center', marginTop: 20, marginBottom: 30 },
  primaryButtonText: { color: COLORS.white, fontSize: 18, fontWeight: 'bold' },
  disabledButton: { opacity: 0.7 },
  inputError: { borderColor: COLORS.errorRed, borderWidth: 1.5 },
  errorText: { color: COLORS.errorRed, fontSize: 12, marginTop: 4, marginLeft: 4 },
  camera: { flex: 1 },
  cameraOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'space-between', paddingBottom: 40 },
  plateGuide: { marginTop: 150, alignSelf: 'center', width: '80%', height: 100, borderWidth: 2, borderColor: COLORS.successGreen, borderStyle: 'dashed', borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  guideText: { color: COLORS.white, fontWeight: 'bold', fontSize: 16 },
  cameraControls: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', width: '100%' },
  captureBtn: { width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.3)', justifyContent: 'center', alignItems: 'center' },
  captureBtnInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: COLORS.white },
  previewCard: { backgroundColor: COLORS.white, borderRadius: 12, marginBottom: 4, borderWidth: 1, borderColor: COLORS.borderMuted, overflow: 'hidden' },
  previewImage: { width: '100%', height: 150, resizeMode: 'cover' },
  previewActionRow: { flexDirection: 'row', justifyContent: 'space-between', padding: 12, backgroundColor: COLORS.inputBg },
  successText: { color: COLORS.successGreen, fontWeight: 'bold' },
  retakeText: { color: COLORS.primaryGreen, fontWeight: 'bold' },
  modalOverlay: { flex: 1, backgroundColor: COLORS.overlay, justifyContent: 'flex-end' },
  bottomSheet: { backgroundColor: COLORS.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 },
  sheetTitle: { fontSize: 20, fontWeight: 'bold', color: COLORS.darkNavy, marginBottom: 15 },
  sheetItem: { paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: COLORS.borderMuted },
  sheetItemText: { fontSize: 16, color: COLORS.darkNavy }
});