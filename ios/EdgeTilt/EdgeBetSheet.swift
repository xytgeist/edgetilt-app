import UIKit
import WebKit

/// In-app sheet for Kalshi / Polymarket ticket links. Contract: `docs/ios-native-bridge.md` "Bet sheet".
///
/// `UIApplication.open` hands these hosts to the Kalshi / Polymarket apps via universal links, and both apps drop
/// the ticket params. Loading them in our own WKWebView keeps the web ticket flow that works in desktop Safari.
enum EdgeBetSheet {
  private static let hosts = ["kalshi.com", "polymarket.us"]
  /// Served by the web deploy so the board-driving script can be fixed without an IPA.
  private static let polymarketScriptPath = "/native/bet-sheet-polymarket.js"

  static func handles(_ url: URL) -> Bool {
    guard let scheme = url.scheme?.lowercased(), scheme == "https" || scheme == "http",
          let host = url.host?.lowercased()
    else { return false }
    return hosts.contains { host == $0 || host.hasSuffix(".\($0)") }
  }

  static func present(url: URL) {
    DispatchQueue.main.async {
      guard let presenter = topViewController() else {
        UIApplication.shared.open(url, options: [:], completionHandler: nil)
        return
      }
      if let nav = presenter as? UINavigationController,
         let open = nav.viewControllers.first as? EdgeBetSheetController
      {
        open.load(url)
        return
      }
      // The books' mobile web is portrait-only; iPhone landscape rotates back when the sheet closes.
      EdgeOrientationLock.setSheetPortrait(true)
      let controller = EdgeBetSheetController(url: url, autoTapScriptURL: autoTapScriptURL(for: url))
      let nav = UINavigationController(rootViewController: controller)
      nav.modalPresentationStyle = .pageSheet
      if let sheet = nav.sheetPresentationController {
        sheet.detents = [.large()]
        sheet.prefersGrabberVisible = true
      }
      presenter.present(nav, animated: true)
    }
  }

  private static func autoTapScriptURL(for url: URL) -> URL? {
    let host = url.host?.lowercased() ?? ""
    guard host == "polymarket.us" || host.hasSuffix(".polymarket.us") else { return nil }
    return URL(string: polymarketScriptPath, relativeTo: AppConfig.baseURL)?.absoluteURL
  }

  private static func topViewController() -> UIViewController? {
    let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
    let window = scenes.flatMap(\.windows).first(where: \.isKeyWindow)
      ?? scenes.first?.windows.first
    var controller = window?.rootViewController
    while let presented = controller?.presentedViewController {
      controller = presented
    }
    return controller
  }
}

final class EdgeBetSheetController: UIViewController, WKNavigationDelegate, WKUIDelegate {
  private var initialURL: URL
  private var autoTapScriptURL: URL?
  private var autoTapSource: String?
  private var pendingAutoTap = false
  private var progressObservation: NSKeyValueObservation?
  private lazy var webView: WKWebView = {
    let config = WKWebViewConfiguration()
    config.websiteDataStore = .default()
    config.allowsInlineMediaPlayback = true
    // Plain Mobile Safari UA … no EdgeiOS token, so the books serve their normal mobile web.
    config.applicationNameForUserAgent = "Version/18.0 Mobile/15E148 Safari/604.1"
    let view = WKWebView(frame: .zero, configuration: config)
    view.navigationDelegate = self
    view.uiDelegate = self
    view.allowsBackForwardNavigationGestures = true
    return view
  }()
  private let progress = UIProgressView(progressViewStyle: .bar)

  init(url: URL, autoTapScriptURL: URL?) {
    initialURL = url
    self.autoTapScriptURL = autoTapScriptURL
    super.init(nibName: nil, bundle: nil)
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .systemBackground
    webView.translatesAutoresizingMaskIntoConstraints = false
    progress.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(webView)
    view.addSubview(progress)
    NSLayoutConstraint.activate([
      webView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
      webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      webView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
      progress.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
      progress.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      progress.trailingAnchor.constraint(equalTo: view.trailingAnchor),
    ])
    progressObservation = webView.observe(\.estimatedProgress, options: [.new]) { [weak self] view, _ in
      self?.progress.progress = Float(view.estimatedProgress)
      self?.progress.isHidden = view.estimatedProgress >= 1
    }

    navigationItem.leftBarButtonItem = UIBarButtonItem(
      systemItem: .done,
      primaryAction: UIAction { [weak self] _ in self?.dismiss(animated: true) }
    )
    navigationItem.rightBarButtonItem = UIBarButtonItem(
      image: UIImage(systemName: "arrow.up.forward.app"),
      primaryAction: UIAction { [weak self] _ in self?.openOutside() }
    )
    load(initialURL)
  }

  override func viewDidDisappear(_ animated: Bool) {
    super.viewDidDisappear(animated)
    if isBeingDismissed || navigationController?.isBeingDismissed == true {
      EdgeOrientationLock.setSheetPortrait(false)
    }
  }

  func load(_ url: URL) {
    initialURL = url
    navigationItem.title = Self.title(for: url)
    pendingAutoTap = autoTapScriptURL != nil
    fetchAutoTapSourceIfNeeded()
    webView.load(URLRequest(url: url))
  }

  private static func title(for url: URL) -> String {
    let host = url.host?.lowercased() ?? ""
    if host.contains("kalshi") { return "Kalshi" }
    if host.contains("polymarket") { return "Polymarket" }
    return host
  }

  private func openOutside() {
    let url = webView.url ?? initialURL
    dismiss(animated: true) {
      UIApplication.shared.open(url, options: [:], completionHandler: nil)
    }
  }

  private func fetchAutoTapSourceIfNeeded() {
    guard autoTapSource == nil, let scriptURL = autoTapScriptURL else { return }
    var request = URLRequest(url: scriptURL, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 8)
    request.setValue("text/javascript", forHTTPHeaderField: "Accept")
    URLSession.shared.dataTask(with: request) { [weak self] data, response, _ in
      guard let data,
            (response as? HTTPURLResponse)?.statusCode == 200,
            let source = String(data: data, encoding: .utf8)
      else { return }
      DispatchQueue.main.async {
        self?.autoTapSource = source
        self?.runAutoTapIfReady()
      }
    }.resume()
  }

  /// Runs once per `load(_:)`, after the first main-frame finish and once the script has arrived.
  private func runAutoTapIfReady() {
    guard pendingAutoTap, let source = autoTapSource, !webView.isLoading, webView.url != nil else { return }
    pendingAutoTap = false
    webView.evaluateJavaScript(source + "\n;void 0;", completionHandler: nil)
  }

  // MARK: - WKNavigationDelegate

  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    runAutoTapIfReady()
  }

  func webView(
    _ webView: WKWebView,
    decidePolicyFor navigationAction: WKNavigationAction,
    decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
  ) {
    guard let url = navigationAction.request.url else {
      decisionHandler(.allow)
      return
    }
    let scheme = url.scheme?.lowercased() ?? ""
    if scheme != "http" && scheme != "https" && scheme != "about" && scheme != "blob" && scheme != "data" {
      // App-store / tel / mailto / app schemes.
      UIApplication.shared.open(url, options: [:], completionHandler: nil)
      decisionHandler(.cancel)
      return
    }
    if navigationAction.targetFrame == nil {
      webView.load(URLRequest(url: url))
      decisionHandler(.cancel)
      return
    }
    decisionHandler(.allow)
  }

  // MARK: - WKUIDelegate

  func webView(
    _ webView: WKWebView,
    createWebViewWith configuration: WKWebViewConfiguration,
    for navigationAction: WKNavigationAction,
    windowFeatures: WKWindowFeatures
  ) -> WKWebView? {
    if let url = navigationAction.request.url {
      webView.load(URLRequest(url: url))
    }
    return nil
  }
}
