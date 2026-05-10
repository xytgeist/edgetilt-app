# Offers Feature Map

This folder holds the **Offers calendar** feature. The main screen component is **`OffersCalendar.jsx`**, mounted from **`src/features/shell/AppShell.jsx`** (not from `App.jsx`).

## Structure

- `OffersCalendar.jsx`
  - Tab-level screen: calendar, forms, push/reminder UI, modals, and wiring into hooks below.

- `utils.js`
  - Pure data/date helpers used by both hooks and components.
  - No React state or side effects.

- `components/`
  - Presentational UI pieces for Offers.
  - Current components:
    - `AddEventFab.jsx`
    - `DateTimeInput.jsx`
    - `OfferFormModal.jsx`
    - `ReviewQueuePanel.jsx`
    - `UploadProgressOverlay.jsx`
    - `WeekEventDetailModal.jsx`

- `hooks/useOffersCalendarState.js`
  - Owns Offers UI state, derived values, and read-side loading/polling.
  - Includes:
    - calendar/form/review state
    - upload spinner message flow
    - `loadEvents`, `loadReviewQueue`, `refreshImportResults`
    - form flow handlers (`openForm`, `closeForm`, `beginEdit`)
    - review navigation handlers (`beginReviewItem`, `skipReviewItem`, `skipCurrentReviewFromForm`)

- `hooks/useOffersCalendarMutations.js`
  - Owns write-side mutation flows.
  - Includes:
    - `saveEvent`
    - `handleImportPhotos`
    - `applyCurrentFieldsToAssociatedReviewItems`

## Maintenance Guidelines

- Keep `utils.js` framework-agnostic.
- Prefer adding new Offers UI blocks under `components/`.
- Put data writes in `useOffersCalendarMutations.js`.
- Put read/polling and UI-only state in `useOffersCalendarState.js`.
