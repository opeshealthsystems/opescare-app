import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { BillingScreen } from '../screens/BillingScreen';
import { AppointmentDetailScreen } from '../screens/care/AppointmentDetailScreen';
import { AppointmentListScreen } from '../screens/care/AppointmentListScreen';
import { WaitingRoomScreen } from '../screens/care/WaitingRoomScreen';
import { CarePlanDetailScreen } from '../screens/care/CarePlanDetailScreen';
import { ReferralDetailScreen } from '../screens/care/ReferralDetailScreen';
import { AppointmentCheckInScreen } from '../screens/care/AppointmentCheckInScreen';
import { AppointmentConfirmedScreen } from '../screens/care/AppointmentConfirmedScreen';
import { AppointmentReviewScreen } from '../screens/care/AppointmentReviewScreen';
import { AppointmentsHomeScreen } from '../screens/care/AppointmentsHomeScreen';
import { AvailableTimeSlotsScreen } from '../screens/care/AvailableTimeSlotsScreen';
import { CalendarDayScreen } from '../screens/care/CalendarDayScreen';
import { CancellationConfirmationScreen } from '../screens/care/CancellationConfirmationScreen';
import { BookAppointmentFormScreen } from '../screens/care/BookAppointmentFormScreen';
import { FacilityProfileScreen } from '../screens/care/FacilityProfileScreen';
import { FindFacilityScreen } from '../screens/care/FindFacilityScreen';
import { FindProviderScreen } from '../screens/care/FindProviderScreen';
import { ProviderProfileScreen } from '../screens/care/ProviderProfileScreen';
import { ConsultationCompletedScreen } from '../screens/care/ConsultationCompletedScreen';
import { RescheduleAppointmentScreen } from '../screens/care/RescheduleAppointmentScreen';
import { TelemedicineConsultationScreen } from '../screens/care/TelemedicineConsultationScreen';
import { TelemedicineWaitingRoomScreen } from '../screens/care/TelemedicineWaitingRoomScreen';
import { MyHealthIdScreen } from '../screens/core/MyHealthIdScreen';
import { AccountSetupScreen } from '../screens/enrol/AccountSetupScreen';
import { LinkHealthIdScreen } from '../screens/enrol/LinkHealthIdScreen';
import { PhoneVerificationScreen } from '../screens/enrol/PhoneVerificationScreen';
import { ReceptionRequiredScreen } from '../screens/enrol/ReceptionRequiredScreen';
import { SelfRegistrationScreen } from '../screens/enrol/SelfRegistrationScreen';
import { MedicationDetailScreen } from '../screens/meds/MedicationDetailScreen';
import { MedicationScheduleScreen } from '../screens/meds/MedicationScheduleScreen';
import { MedicationsScreen } from '../screens/meds/MedicationsScreen';
import { OrderFromPharmacyScreen } from '../screens/meds/OrderFromPharmacyScreen';
import { RequestRefillScreen } from '../screens/meds/RequestRefillScreen';
import { PrescriptionDetailScreen } from '../screens/meds/PrescriptionDetailScreen';
import { DiagnosticsDashboardScreen } from '../screens/diagnostics/DiagnosticsDashboardScreen';
import { LabResultDetailScreen } from '../screens/diagnostics/LabResultDetailScreen';
import { LabResultTrendScreen } from '../screens/diagnostics/LabResultTrendScreen';
import { LabReportFullScreen } from '../screens/diagnostics/LabReportFullScreen';
import { SampleCollectionScreen } from '../screens/diagnostics/SampleCollectionScreen';
import { RequestLabTestScreen } from '../screens/diagnostics/RequestLabTestScreen';
import { ImageThumbnailsScreen } from '../screens/imaging/ImageThumbnailsScreen';
import { MedicalImageViewerScreen } from '../screens/imaging/MedicalImageViewerScreen';
import { ViewFullReportScreen } from '../screens/imaging/ViewFullReportScreen';
import { AddImagingToHealthRecordScreen } from '../screens/imaging/AddImagingToHealthRecordScreen';
import { BookImagingStudyScreen } from '../screens/imaging/BookImagingStudyScreen';
import { DownloadShareImagingScreen } from '../screens/imaging/DownloadShareImagingScreen';
import { ImagingOrderDetailScreen } from '../screens/imaging/ImagingOrderDetailScreen';
import { ImagingResultDetailScreen } from '../screens/imaging/ImagingResultDetailScreen';
import { ImagingPreparationScreen } from '../screens/imaging/ImagingPreparationScreen';
import { ImagingHistoryScreen } from '../screens/imaging/ImagingHistoryScreen';
import { CompareStudiesScreen } from '../screens/imaging/CompareStudiesScreen';
import { ImagingResultsScreen } from '../screens/imaging/ImagingResultsScreen';
import { RadiologyReportScreen } from '../screens/imaging/RadiologyReportScreen';
import { PaymentProcessingStatusScreen } from '../screens/billing/PaymentProcessingStatusScreen';
import { PaymentReceiptScreen } from '../screens/billing/PaymentReceiptScreen';
import { PaymentRequestInvoiceScreen } from '../screens/billing/PaymentRequestInvoiceScreen';
import { DocumentPreviewScreen } from '../screens/docs/DocumentPreviewScreen';
import { MedicalCertificateScreen } from '../screens/docs/MedicalCertificateScreen';
import { MessageThreadScreen } from '../screens/chat/MessageThreadScreen';
import { NewMessageScreen } from '../screens/messaging/NewMessageScreen';
import { NotificationsScreen } from '../screens/messaging/NotificationsScreen';
import { MedicalTasksScreen } from '../screens/MedicalTasksScreen';
import { MainTabNavigator } from './MainTabNavigator';
import { AppBackground } from '../components/Watermark';
import { AppStackParamList } from './routes';

const Stack = createNativeStackNavigator<AppStackParamList>();

/**
 * Every authenticated detail screen lives here as a flat native stack above the
 * tab navigator.
 *
 * SCREEN AGENTS: your route is already declared in `routes.ts` and registered
 * below. To ship a screen, import your component and swap it in on that one
 * line. Change nothing else.
 *
 * There are no placeholders left in the patient stack: every route below is a
 * real screen. If a route has no implementation, do not park a placeholder
 * here — remove the route and the thing that navigates to it, so a patient
 * cannot reach a dead end from a finished screen.
 */

export function AppStackNavigator() {
  return (
    // `screenLayout` drops the app-wide OPES seal behind every screen in this
    // stack exactly once (opaque page colour + faded watermark), so the seal is
    // app-wide without editing the 87 screens, and each card stays opaque so
    // push/pop transitions never bleed through. See `components/Watermark.tsx`.
    <Stack.Navigator
      screenOptions={{ headerShown: false }}
      screenLayout={({ children }) => <AppBackground>{children}</AppBackground>}
    >
      <Stack.Screen name="MainTabs" component={MainTabNavigator} />

      {/* -- 01 Core Access ------------------------------------------------
          CORE-003 (OnboardingWelcome) is registered on the ROOT stack, not
          here: it is the front door, shown once before sign-in.

          ConnectedProviders is gone rather than placeheld — nothing in the
          platform implements it, and Settings used to link straight at it. */}
      <Stack.Screen name="MyHealthId" component={MyHealthIdScreen} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} />
      <Stack.Screen name="AccountSetup" component={AccountSetupScreen} />
      <Stack.Screen name="LinkHealthId" component={LinkHealthIdScreen} />
      <Stack.Screen name="PhoneVerification" component={PhoneVerificationScreen} />
      <Stack.Screen name="SelfRegistration" component={SelfRegistrationScreen} />
      <Stack.Screen name="ReceptionRequired" component={ReceptionRequiredScreen} />

      {/* -- 02 Medications ------------------------------------------------ */}
      <Stack.Screen name="Medications" component={MedicationsScreen} />
      <Stack.Screen name="MedicalTasks" component={MedicalTasksScreen} />
      <Stack.Screen name="PrescriptionDetail" component={PrescriptionDetailScreen} />
      <Stack.Screen name="MedicationDetail" component={MedicationDetailScreen} />
      <Stack.Screen name="MedicationSchedule" component={MedicationScheduleScreen} />
      <Stack.Screen name="RequestRefill" component={RequestRefillScreen} />
      <Stack.Screen name="OrderFromPharmacy" component={OrderFromPharmacyScreen} />

      {/* -- 03 Diagnostics ------------------------------------------------ */}
      <Stack.Screen name="DiagnosticsDashboard" component={DiagnosticsDashboardScreen} />
      <Stack.Screen name="LabResultDetail" component={LabResultDetailScreen} />
      <Stack.Screen name="LabResultTrend" component={LabResultTrendScreen} />
      <Stack.Screen name="LabReportFull" component={LabReportFullScreen} />
      <Stack.Screen name="LabAppointmentCollection" component={SampleCollectionScreen} />
      <Stack.Screen name="RequestLabTest" component={RequestLabTestScreen} />
      <Stack.Screen name="ImagingHistory" component={ImagingHistoryScreen} />

      {/* -- 04 Imaging ---------------------------------------------------- */}
      <Stack.Screen name="ImagingResults" component={ImagingResultsScreen} />
      <Stack.Screen name="ImagingResultDetail" component={ImagingResultDetailScreen} />
      <Stack.Screen name="ImageThumbnails" component={ImageThumbnailsScreen} />
      <Stack.Screen name="MedicalImageViewer" component={MedicalImageViewerScreen} />
      <Stack.Screen name="RadiologyReport" component={RadiologyReportScreen} />
      <Stack.Screen name="ViewFullReport" component={ViewFullReportScreen} />
      <Stack.Screen name="AddImagingToHealthRecord" component={AddImagingToHealthRecordScreen} />
      <Stack.Screen name="DownloadShareImaging" component={DownloadShareImagingScreen} />
      <Stack.Screen name="ImagingOrderDetail" component={ImagingOrderDetailScreen} />
      <Stack.Screen name="BookImagingStudy" component={BookImagingStudyScreen} />
      <Stack.Screen name="ImagingPreparation" component={ImagingPreparationScreen} />
      <Stack.Screen name="ImagingComparison" component={CompareStudiesScreen} />

      {/* -- 05 Appointments & Care --------------------------------------- */}
      <Stack.Screen name="AppointmentsHome" component={AppointmentsHomeScreen} />
      <Stack.Screen name="AppointmentList" component={AppointmentListScreen} />
      <Stack.Screen name="AppointmentDetail" component={AppointmentDetailScreen} />
      <Stack.Screen name="ProviderProfile" component={ProviderProfileScreen} />
      <Stack.Screen name="FacilityProfile" component={FacilityProfileScreen} />
      <Stack.Screen name="FindProvider" component={FindProviderScreen} />
      <Stack.Screen name="FindFacility" component={FindFacilityScreen} />
      <Stack.Screen name="AvailableTimeSlots" component={AvailableTimeSlotsScreen} />
      <Stack.Screen name="BookAppointmentForm" component={BookAppointmentFormScreen} />
      <Stack.Screen name="AppointmentReview" component={AppointmentReviewScreen} />
      <Stack.Screen name="AppointmentConfirmed" component={AppointmentConfirmedScreen} />
      <Stack.Screen name="RescheduleAppointment" component={RescheduleAppointmentScreen} />
      <Stack.Screen name="CancellationConfirmation" component={CancellationConfirmationScreen} />
      <Stack.Screen name="AppointmentCheckIn" component={AppointmentCheckInScreen} />
      <Stack.Screen name="WaitingRoom" component={WaitingRoomScreen} />
      <Stack.Screen name="TelemedicineWaitingRoom" component={TelemedicineWaitingRoomScreen} />
      <Stack.Screen name="TelemedicineConsultation" component={TelemedicineConsultationScreen} />
      <Stack.Screen name="ConsultationCompleted" component={ConsultationCompletedScreen} />
      <Stack.Screen name="CarePlanDetail" component={CarePlanDetailScreen} />
      <Stack.Screen name="ReferralDetail" component={ReferralDetailScreen} />
      <Stack.Screen name="CalendarDay" component={CalendarDayScreen} />

      {/* -- 06 Messaging & Documents ------------------------------------- */}
      <Stack.Screen name="MessageThread" component={MessageThreadScreen} />
      <Stack.Screen name="NewMessage" component={NewMessageScreen} />
      <Stack.Screen name="MedicalCertificate" component={MedicalCertificateScreen} />
      <Stack.Screen name="DocumentPreview" component={DocumentPreviewScreen} />

      {/* -- 07 Financial -------------------------------------------------- */}
      <Stack.Screen name="Billing" component={BillingScreen} />
      <Stack.Screen name="PaymentRequestInvoice" component={PaymentRequestInvoiceScreen} />
      <Stack.Screen name="PaymentProcessingStatus" component={PaymentProcessingStatusScreen} />
      <Stack.Screen name="PaymentReceipt" component={PaymentReceiptScreen} />
    </Stack.Navigator>
  );
}
