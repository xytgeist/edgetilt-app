export { default as LegalDocumentScreen } from './LegalDocumentScreen.jsx'
export { default as LegalAcceptanceModal } from './LegalAcceptanceModal.jsx'
export { LEGAL_DOCUMENTS, getLegalDocument, parseLegalPathname } from './legalDocuments.js'
export {
  LEGAL_POLICY_VERSION,
  LEGAL_CONTACT_EMAIL,
  LEGAL_ENTITY_NAME,
  LEGAL_EFFECTIVE_DATE,
} from './legalPolicyVersion.js'
export {
  recordLegalAcceptance,
  profileNeedsLegalAcceptance,
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
} from './legalDocumentNavigation.js'
