# Native Swift/SwiftUI Rewrite Checklist & Architecture Spec

Target: Post-v1 Native Evolution (Lounge Feed & Media Layer).

---

## 1. Data Layer & State Management (Swift / Supabase)

- [ ] **Supabase Swift SDK Integration**
  - Configure `SupabaseClient` in Swift with session restoration matching web Keychain auth token (`setAuthSession`).
  - Auth state sync: listen for session expiration, refresh tokens, and broadcast user state across SwiftUI views.
- [ ] **Data Models & Decodable Structs**
  - `LoungePost`: author profile, text body, media URLs, Stream UID, cashtags, mentions, poll data, quote embeds, like count, repost count, comment count.
  - `LoungeAuthorProfile`: display name, handle, avatar URL, bio, role, subscription status, badge tier (Pro checkmark).
  - `SyndicatePick`: picker persona (Scott, Rocco, Chedda, Tank), sport, league, event name, market, selection, line/odds, status (pending, won, lost, push), units.
  - `LoungePoll`: question, options, vote counts, user voted option, expiration timestamp.
  - `LoungeComment`: hierarchical thread structure, parent-child relations, reply gates.
- [ ] **Realtime Subscriptions (Swift Channels)**
  - `posts` table INSERT / UPDATE / DELETE listener.
  - `post_likes` and `post_bookmarks` optimistic toggle handling.
  - `post_comments` live listener for open thread detail sheets.
- [ ] **Local Feed Cache & Offline Persistence**
  - SwiftData / CoreData or in-memory LRU cache for instant timeline load on app boot.
  - Scroll position restoration when switching between tabs.

---

## 2. Core Timeline & Feed UI (SwiftUI / UIKit)

- [ ] **High-Performance Recycled Feed List**
  - `UICollectionViewCompositionalLayout` or optimized SwiftUI `LazyVStack` with cell reuse at 120Hz ProMotion.
  - Dynamic cell sizing without layout jump on media load.
  - Pull-to-refresh with native Apple spinner and haptic click (`UIImpactFeedbackGenerator`).
  - Smooth infinite scroll pagination trigger (prefetching next page 5 rows before bottom).
- [ ] **Rich Post Text & Token Rendering**
  - Native attributed text parser:
    - Cashtags (`$BUFFALO`, `$NVDA`) in bright cyan with tap-to-filter / market sheet.
    - Mentions (`@username`) in cyan with tap-to-profile navigation.
    - Clickable URLs with link preview metadata fetchers.
- [ ] **Custom Card Views**
  - **Syndicate & Scott Bot Pick Cards**: 4-person grid / solo spot layout, live odds pill styling, auto-grading W/L result chips, unit tracking badges.
  - **Community Poll Card**: Animated progress bars showing live vote percentages, radio selection state, expiration countdown timer.
  - **Quote Repost Card**: Nested mini-card container with distinct border and author badge.
  - **Edge Pro & Creator Badges**: Custom checkmark glyph (blue in light mode, cyan/teal in dark mode) with no shadow.

---

## 3. Video Engine & Media Player (AVFoundation / Cloudflare Stream)

- [ ] **Native `AVQueuePlayer` / `AVPlayerPool`**
  - Custom player recycling manager to avoid allocating more than 3 AVPlayer instances in memory.
  - Visible-viewport intersection detector: automatically starts the video nearest the vertical center.
  - Zero-lag video pre-buffering from Cloudflare Stream HLS manifests (`.m3u8`).
- [ ] **Unmuted Feed Sound Coordinator**
  - Global sound coordinator: tapping unmute on one video keeps subsequent feed videos unmuted as you scroll.
  - Background audio session ducking / activation.
- [ ] **Native Fullscreen Media Lightbox**
  - Custom `UIViewController` transition: image/video springs directly out of the feed card.
  - `UIPanGestureRecognizer` + `UIPinchGestureRecognizer` running at 120Hz ProMotion for smooth rubber-band dragging, zooming, and swipe-down-to-dismiss.
  - Side-by-side multi-image carousel paging.

---

## 4. Post Composer & Media Pipeline

- [ ] **Native Rich Text Composer**
  - `UITextView` with auto-expanding height, dynamic character count, and keyboard tracking.
  - Autocomplete dropdown popup above keyboard for `@mentions` and `$cashtags`.
  - Audience pill and reply gate selector (Everyone vs. Pro Subscribers Only).
- [ ] **Hardware Video Trimming & Compression**
  - `AVAssetExportSession` / VideoToolbox: hardware-accelerated H.264/HEVC encoding for 4K -> 1080p in under 1 second.
  - Native video trim scrubber with frame-by-frame filmstrip thumbnails.
- [ ] **Native Photo Picker & Camera**
  - `PHPickerViewController` for fluid multi-photo selection with iCloud download status.
  - Direct camera capture sheet.

---

## 5. Post Detail & Threaded Comments

- [ ] **Native Bottom Sheet / Drawer**
  - Native sheet presentation (`UISheetPresentationController` or custom drag gesture).
  - Sticky bottom reply composer anchored to the virtual keyboard.
  - Recursive nested comment hierarchy with visual indent lines.

---

## 6. Profile Screen & Market Charts

- [ ] **Profile Screen**
  - Collapsing parallax header with blur avatar tuck on scroll.
  - Tabbed sub-views: Posts, Media, Likes, Bookmarks, and Scott Bot Scorecard.
- [ ] **Native Market Charts**
  - Lightweight Swift Charts (`Charts` framework) or Metal-accelerated candlestick/line rendering for live crypto & stock tickers.
