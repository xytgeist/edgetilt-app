export { default as LegalDocumentScreen } from './LegalDocumentScreen.jsx'
export { default as LegalAcceptanceModal } from './LegalAcceptanceModal.jsx'
export {
  LEGAL_DOCUMENTS,
  getLegalDocument,
  parseLegalPathname,
  resolveLegalViewFromLocation,
} from './legalDocuments.js'
export {
  TELNYX_10DLC_MOBILE_NOT_SOLD_OR_SHARED,
  TELNYX_10DLC_ORIGINATOR_OPTIN_EXCLUSION,
  TELNYX_10DLC_SMS_VENDOR_SHARE,
} from './telnyx10dlcPrivacyCopy.js'
export {
  LEGAL_POLICY_VERSION,
  LEGAL_CONTACT_EMAIL,
  LEGAL_ENTITY_NAME,
  LEGAL_EFFECTIVE_DATE,
} from './legalPolicyVersion.js'
export {
  copySupportEmailToClipboard,
  supportMailtoHref,
  SUPPORT_BILLING_NO_ACCESS_SUBJECT,
} from './supportContact.js'
export {
  recordLegalAcceptance,
  profileNeedsLegalAcceptance,
  shouldShowLegalAcceptanceModal,
  markPendingLegalAcceptance,
  readPendingLegalAcceptance,
  clearPendingLegalAcceptance,
} from './legalAcceptance.js'
export {
  markLegalReturnToAuth,
  readLegalReturnToAuth,
  clearLegalReturnToAuth,
  isLegalFromAuthUrl,
  shouldReturnLegalToAuth,
  legalDocumentPathFromAuth,
  markLegalReturnContext,
  readLegalReturnContext,
  clearLegalReturnContext,
  parseLegalReturnFromUrl,
  resolveLegalReturnContext,
  applyLegalReturnReopen,
  consumeReopenLoungeWelcome,
  consumeReopenLoungeDockPanel,
  legalDocumentPathFromSource,
} from './legalDocumentNavigation.js'
