import UIKit
import WebKit

/// Yahoo login in its own WKWebView (Yahoo login inside the app webview hard-crashed the IPA).
/// Stopgap while Yahoo's Fantasy API approval is pending: once Yahoo's own fantasy web API answers for the
/// signed-in user, returns the yahoo.com cookie header once and dismisses. Never reads the password.
enum EdgeYahooLoginSheet {
  /// The web opens this right after the Yahoo OAuth web-auth session returns, while that sheet is still
  /// animating away. UIKit drops a present() during a transition without calling back, which left the web
  /// waiting forever, so wait for the hierarchy to settle and report failure instead of hanging.
  static func present(completion: @escaping (Result<[String: Any], Error>) -> Void) {
    DispatchQueue.main.async {
      attemptPresent(completion: completion, triesLeft: 20)
    }
  }

  private static func attemptPresent(completion: @escaping (Result<[String: Any], Error>) -> Void, triesLeft: Int) {
    let presenter = topViewController()
    let settling = presenter == nil
      || presenter?.isBeingDismissed == true
      || presenter?.isBeingPresented == true
      || presenter?.transitionCoordinator != nil
    if settling {
      guard triesLeft > 0 else {
        completion(.success(["ok": false, "error": "Could not open Yahoo login. Try again."]))
        return
      }
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
        attemptPresent(completion: completion, triesLeft: triesLeft - 1)
      }
      return
    }
    guard let presenter else { return }
    let controller = EdgeYahooLoginController(completion: completion)
    let nav = UINavigationController(rootViewController: controller)
    nav.modalPresentationStyle = .pageSheet
    if let sheet = nav.sheetPresentationController {
      sheet.detents = [.custom { context in context.maximumDetentValue * 0.92 }]
      sheet.prefersGrabberVisible = true
      sheet.prefersEdgeAttachedInCompactHeight = true
      sheet.preferredCornerRadius = 22
      sheet.prefersScrollingExpandsWhenScrolledToEdge = false
    }
    presenter.present(nav, animated: true)
    DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
      if nav.presentingViewController == nil {
        controller.failToOpen()
      }
    }
  }

  /// Top of the presented chain, skipping a controller that is on its way out.
  private static func topViewController() -> UIViewController? {
    let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
    let window = scenes.flatMap(\.windows).first(where: \.isKeyWindow)
      ?? scenes.first?.windows.first
    var controller = window?.rootViewController
    while let presented = controller?.presentedViewController, !presented.isBeingDismissed {
      controller = presented
    }
    return controller
  }
}

final class EdgeYahooLoginController: UIViewController, WKNavigationDelegate, WKUIDelegate {
  private static let loginURL =
    "https://login.yahoo.com/?.src=fantasy&.intl=us&.done=https%3A%2F%2Ffootball.fantasysports.yahoo.com%2F"
  /// Same probe Yahoo's fantasy pages run; CORS allows it from *.fantasysports.yahoo.com with cookies.
  private static let probeJS = """
    const r = await fetch('https://pub-api-ro.fantasysports.yahoo.com/fantasy/v2/users;use_login=1?format=json', { credentials: 'include' });
    if (!r.ok) return 0;
    const t = await r.text();
    return t.indexOf('"guid"') >= 0 ? 1 : 0;
    """

  private let completion: (Result<[String: Any], Error>) -> Void
  private var finished = false
  private var probing = false
  private var timer: Timer?
  private lazy var webView: WKWebView = {
    let config = WKWebViewConfiguration()
    config.websiteDataStore = .nonPersistent()
    config.allowsInlineMediaPlayback = true
    config.applicationNameForUserAgent = "Version/18.0 Mobile/15E148 Safari/604.1"
    let view = WKWebView(frame: .zero, configuration: config)
    view.navigationDelegate = self
    view.uiDelegate = self
    return view
  }()

  init(completion: @escaping (Result<[String: Any], Error>) -> Void) {
    self.completion = completion
    super.init(nibName: nil, bundle: nil)
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

  override func viewDidLoad() {
    super.viewDidLoad()
    title = "Yahoo"
    navigationItem.leftBarButtonItem = UIBarButtonItem(
      barButtonSystemItem: .cancel,
      target: self,
      action: #selector(cancelTapped)
    )
    view.backgroundColor = .systemBackground
    webView.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(webView)
    NSLayoutConstraint.activate([
      webView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
      webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      webView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
    ])
    if let url = URL(string: Self.loginURL) {
      webView.load(URLRequest(url: url))
    }
    timer = Timer.scheduledTimer(withTimeInterval: 2.0, repeats: true) { [weak self] _ in
      self?.probeSession()
    }
  }

  override func viewDidDisappear(_ animated: Bool) {
    super.viewDidDisappear(animated)
    // Also covers the sheet going away with its presenter (no dismiss flag on us), which used to hang the web.
    if isBeingDismissed || navigationController?.isBeingDismissed == true || navigationController?.presentingViewController == nil {
      finish(ok: false, cancelled: true, cookie: nil, error: nil)
    }
  }

  deinit {
    timer?.invalidate()
  }

  /// The sheet never made it on screen; answer the web so it can show an error instead of waiting.
  func failToOpen() {
    finish(ok: false, cancelled: false, cookie: nil, error: "Could not open Yahoo login. Try again.")
  }

  @objc private func cancelTapped() {
    finish(ok: false, cancelled: true, cookie: nil, error: nil)
    dismiss(animated: true)
  }

  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    probeSession()
  }

  func webView(
    _ webView: WKWebView,
    createWebViewWith configuration: WKWebViewConfiguration,
    for navigationAction: WKNavigationAction,
    windowFeatures: WKWindowFeatures
  ) -> WKWebView? {
    if navigationAction.targetFrame == nil, let url = navigationAction.request.url {
      webView.load(URLRequest(url: url))
    }
    return nil
  }

  private func probeSession() {
    guard !finished, !probing else { return }
    guard let host = webView.url?.host?.lowercased(), host.hasSuffix("fantasysports.yahoo.com") else { return }
    probing = true
    webView.callAsyncJavaScript(Self.probeJS, arguments: [:], in: nil, in: .page) { [weak self] result in
      guard let self else { return }
      let signedIn: Bool
      switch result {
      case .success(let value): signedIn = (value as? NSNumber)?.intValue == 1
      case .failure: signedIn = false
      }
      guard signedIn else {
        self.probing = false
        return
      }
      self.harvestCookies()
    }
  }

  private func harvestCookies() {
    webView.configuration.websiteDataStore.httpCookieStore.getAllCookies { [weak self] cookies in
      var seen = Set<String>()
      var pairs: [String] = []
      for cookie in cookies {
        let domain = cookie.domain.lowercased()
        guard domain == "yahoo.com" || domain.hasSuffix(".yahoo.com") else { continue }
        guard !cookie.value.isEmpty, seen.insert(cookie.name).inserted else { continue }
        pairs.append("\(cookie.name)=\(cookie.value)")
      }
      let header = pairs.joined(separator: "; ")
      DispatchQueue.main.async {
        guard let self else { return }
        guard header.count >= 40 else {
          self.probing = false
          return
        }
        self.finish(ok: true, cancelled: false, cookie: header, error: nil)
      }
    }
  }

  private func finish(ok: Bool, cancelled: Bool, cookie: String?, error: String?) {
    guard !finished else { return }
    finished = true
    timer?.invalidate()
    timer = nil
    var payload: [String: Any] = ["ok": ok, "cancelled": cancelled]
    if let cookie, ok { payload["cookie"] = cookie }
    if let error { payload["error"] = error }
    completion(.success(payload))
    if ok {
      dismiss(animated: true)
    }
  }
}
