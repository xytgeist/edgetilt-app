import UIKit
import WebKit

/// Fake Dynamic Island while EdgeTilt is foregrounded.
/// iOS hides our real Live Activity Island until we background; this pill
/// mirrors the compact Activity UI over the WKWebView.
final class EdgeLiveBankrollIslandOverlay: NSObject {
  static let shared = EdgeLiveBankrollIslandOverlay()

  private weak var host: UIView?
  private let pill = UIView()
  private let glyphCircle = UIView()
  private let glyphImage = UIImageView()
  private let trailingLabel = UILabel()
  private var breathTimer: CADisplayLink?
  private var clockTimer: Timer?
  private var state: LiveBankrollAttributes.ContentState?
  private var webWantsVisible = true
  private var appIsActive = true
  private var observersInstalled = false

  private let pillHeight: CGFloat = 36
  private let glyphSize: CGFloat = 26

  private override init() {
    super.init()
    pill.backgroundColor = UIColor.black
    pill.layer.cornerRadius = pillHeight / 2
    pill.layer.borderWidth = 1
    pill.layer.borderColor = UIColor.white.withAlphaComponent(0.18).cgColor
    pill.layer.shadowColor = UIColor.black.cgColor
    pill.layer.shadowOpacity = 0.45
    pill.layer.shadowRadius = 8
    pill.layer.shadowOffset = CGSize(width: 0, height: 2)
    pill.isUserInteractionEnabled = true
    pill.addGestureRecognizer(UITapGestureRecognizer(target: self, action: #selector(handleTap)))

    glyphCircle.layer.cornerRadius = glyphSize / 2
    glyphCircle.clipsToBounds = true

    glyphImage.contentMode = .scaleAspectFit
    glyphImage.tintColor = .black

    trailingLabel.font = .monospacedDigitSystemFont(ofSize: 12, weight: .semibold)
    trailingLabel.textColor = .white
    trailingLabel.textAlignment = .right
    trailingLabel.adjustsFontSizeToFitWidth = true
    trailingLabel.minimumScaleFactor = 0.7

    pill.addSubview(glyphCircle)
    glyphCircle.addSubview(glyphImage)
    pill.addSubview(trailingLabel)
    pill.isHidden = true
  }

  func attach(webView: WKWebView) {
    guard let parent = webView.superview ?? webView.window else { return }
    if pill.superview !== parent {
      parent.addSubview(pill)
    }
    parent.bringSubviewToFront(pill)
    host = parent
    installObserversIfNeeded()
    layoutPill()
    refreshVisibility(animated: false)
  }

  /// Latest live-session snapshot. `nil` clears the overlay.
  func apply(state: LiveBankrollAttributes.ContentState?) {
    self.state = state
    updateChrome()
    refreshVisibility(animated: true)
  }

  /// Web sets `false` on bankroll screens that already show the live card.
  func setWebWantsVisible(_ visible: Bool) {
    webWantsVisible = visible
    refreshVisibility(animated: true)
  }

  private func installObserversIfNeeded() {
    guard !observersInstalled else { return }
    observersInstalled = true
    let center = NotificationCenter.default
    center.addObserver(
      self,
      selector: #selector(appDidBecomeActive),
      name: UIApplication.didBecomeActiveNotification,
      object: nil
    )
    center.addObserver(
      self,
      selector: #selector(appWillResignActive),
      name: UIApplication.willResignActiveNotification,
      object: nil
    )
  }

  @objc private func appDidBecomeActive() {
    appIsActive = true
    refreshVisibility(animated: true)
  }

  @objc private func appWillResignActive() {
    appIsActive = false
    refreshVisibility(animated: false)
  }

  private var shouldShow: Bool {
    guard state != nil else { return false }
    guard webWantsVisible else { return false }
    guard appIsActive else { return false }
    guard UIDevice.current.userInterfaceIdiom == .phone else { return false }
    return true
  }

  private func refreshVisibility(animated: Bool) {
    let show = shouldShow
    if show {
      startClock()
      startBreathIfNeeded()
      layoutPill()
    } else {
      stopClock()
      stopBreath()
    }

    let apply = {
      self.pill.isHidden = !show
      self.pill.alpha = show ? 1 : 0
      if show, let parent = self.pill.superview {
        parent.bringSubviewToFront(self.pill)
      }
    }
    if animated {
      UIView.animate(withDuration: 0.22, delay: 0, options: [.curveEaseInOut], animations: apply)
    } else {
      apply()
    }
  }

  private func updateChrome() {
    guard let state else {
      trailingLabel.text = nil
      return
    }

    let accent = accentColor(for: state)
    pill.layer.borderColor = accent.withAlphaComponent(0.55).cgColor
    glyphCircle.backgroundColor = accent.withAlphaComponent(0.35)
    glyphImage.image = UIImage(systemName: symbolName(for: state))?
      .withConfiguration(UIImage.SymbolConfiguration(pointSize: glyphSize * 0.42, weight: .bold))
    glyphImage.tintColor = .black

    let pausedTone = state.pokerPaused && state.hasPoker && !state.hasSlots
    trailingLabel.textColor = pausedTone ? Self.pausedColor : .white

    if state.isDual {
      trailingLabel.text = "2"
      trailingLabel.font = .systemFont(ofSize: 13, weight: .bold)
    } else {
      trailingLabel.font = .monospacedDigitSystemFont(ofSize: 12, weight: .semibold)
      tickClock()
    }
    layoutPill()
  }

  private func layoutPill() {
    guard let parent = pill.superview ?? host else { return }
    let safeTop = parent.safeAreaInsets.top
    let trailingWidth: CGFloat = state?.isDual == true ? 16 : 44
    let horizontalPad: CGFloat = 8
    let width = horizontalPad + glyphSize + 6 + trailingWidth + horizontalPad
    // Sit in the status-bar / Island band.
    let y = max(pillHeight / 2 + 2, safeTop * 0.52)
    pill.bounds = CGRect(x: 0, y: 0, width: width, height: pillHeight)
    pill.center = CGPoint(x: parent.bounds.midX, y: y)

    glyphCircle.frame = CGRect(
      x: horizontalPad,
      y: (pillHeight - glyphSize) / 2,
      width: glyphSize,
      height: glyphSize
    )
    glyphImage.frame = glyphCircle.bounds.insetBy(dx: 4, dy: 4)
    trailingLabel.frame = CGRect(
      x: glyphCircle.frame.maxX + 6,
      y: 0,
      width: trailingWidth,
      height: pillHeight
    )
  }

  private func startClock() {
    stopClock()
    tickClock()
    let timer = Timer(timeInterval: 1, repeats: true) { [weak self] _ in
      self?.tickClock()
    }
    RunLoop.main.add(timer, forMode: .common)
    clockTimer = timer
  }

  private func stopClock() {
    clockTimer?.invalidate()
    clockTimer = nil
  }

  private func tickClock() {
    guard let state, !state.isDual else { return }
    guard let start = state.primaryTimerStart else {
      trailingLabel.text = nil
      return
    }
    trailingLabel.text = Self.formatElapsed(from: start, to: Date())
  }

  private func startBreathIfNeeded() {
    stopBreath()
    guard let state, !(state.pokerPaused && state.hasPoker && !state.hasSlots) else {
      glyphCircle.transform = .identity
      glyphCircle.alpha = 1
      return
    }
    let link = CADisplayLink(target: self, selector: #selector(handleBreathTick))
    link.add(to: .main, forMode: .common)
    breathTimer = link
  }

  private func stopBreath() {
    breathTimer?.invalidate()
    breathTimer = nil
    glyphCircle.transform = .identity
    glyphCircle.alpha = 1
  }

  @objc private func handleBreathTick() {
    let t = CACurrentMediaTime()
    let pulse = (sin(t * 2.8) + 1) * 0.5
    let scale = 0.86 + 0.16 * CGFloat(pulse)
    glyphCircle.transform = CGAffineTransform(scaleX: scale, y: scale)
    glyphCircle.alpha = 0.55 + 0.45 * CGFloat(pulse)
  }

  @objc private func handleTap() {
    guard let state else { return }
    EdgePushManager.shared.handleCustomSchemeLink(state.widgetURL)
  }

  private func symbolName(for state: LiveBankrollAttributes.ContentState) -> String {
    if state.hasSlots && state.hasPoker { return "square.on.square.fill" }
    if state.hasSlots { return "dice.fill" }
    return "suit.spade.fill"
  }

  private func accentColor(for state: LiveBankrollAttributes.ContentState) -> UIColor {
    if state.hasSlots && state.hasPoker {
      return UIColor(red: 0.22, green: 0.85, blue: 0.88, alpha: 1)
    }
    if state.hasSlots {
      return UIColor(red: 0.20, green: 0.84, blue: 0.45, alpha: 1)
    }
    if state.pokerPaused {
      return Self.pausedColor
    }
    return UIColor(red: 0.18, green: 0.78, blue: 0.72, alpha: 1)
  }

  private static let pausedColor = UIColor(red: 0.98, green: 0.75, blue: 0.35, alpha: 1)

  private static func formatElapsed(from start: Date, to now: Date) -> String {
    let total = max(0, Int(now.timeIntervalSince(start)))
    let hours = total / 3600
    let minutes = (total % 3600) / 60
    let seconds = total % 60
    if hours > 0 {
      return String(format: "%d:%02d:%02d", hours, minutes, seconds)
    }
    return String(format: "%d:%02d", minutes, seconds)
  }
}
