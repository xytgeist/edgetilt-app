import UIKit
import WebKit

/// ESPN Fantasy login in its own WKWebView. The app webview must not navigate to ESPN
/// (Yahoo login in that webview hard-crashed the IPA). This sheet never reads the password.
/// When espn_s2 and SWID exist, it returns them once and dismisses.
enum EdgeEspnLoginSheet {
  static func present(completion: @escaping (Result<[String: Any], Error>) -> Void) {
    DispatchQueue.main.async {
      guard let presenter = topViewController() else {
        completion(.success(["ok": false, "error": "Could not open ESPN login."]))
        return
      }
      let controller = EdgeEspnLoginController(completion: completion)
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
    }
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

final class EdgeEspnLoginController: UIViewController, WKNavigationDelegate, WKUIDelegate {
  private let completion: (Result<[String: Any], Error>) -> Void
  private var finished = false
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
    title = "ESPN"
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
    if let url = URL(string: "https://www.espn.com/login") {
      webView.load(URLRequest(url: url))
    }
    timer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
      self?.harvestCookies()
    }
  }

  override func viewDidDisappear(_ animated: Bool) {
    super.viewDidDisappear(animated)
    if isBeingDismissed || navigationController?.isBeingDismissed == true {
      finish(ok: false, cancelled: true, espnS2: nil, swid: nil, error: nil)
    }
  }

  deinit {
    timer?.invalidate()
  }

  @objc private func cancelTapped() {
    finish(ok: false, cancelled: true, espnS2: nil, swid: nil, error: nil)
    dismiss(animated: true)
  }

  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    harvestCookies()
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

  private func harvestCookies() {
    webView.configuration.websiteDataStore.httpCookieStore.getAllCookies { [weak self] cookies in
      let s2 = cookies.first(where: { $0.name == "espn_s2" })?.value ?? ""
      var swid = cookies.first(where: { $0.name.caseInsensitiveCompare("SWID") == .orderedSame })?.value ?? ""
      swid = swid.removingPercentEncoding ?? swid
      guard s2.count >= 20 else { return }
      let bare = swid.replacingOccurrences(of: "{", with: "").replacingOccurrences(of: "}", with: "")
      guard bare.count >= 8 else { return }
      let wrapped = swid.hasPrefix("{") ? swid : "{\(bare)}"
      DispatchQueue.main.async {
        self?.finish(ok: true, cancelled: false, espnS2: s2, swid: wrapped, error: nil)
      }
    }
  }

  private func finish(ok: Bool, cancelled: Bool, espnS2: String?, swid: String?, error: String?) {
    guard !finished else { return }
    finished = true
    timer?.invalidate()
    timer = nil
    var payload: [String: Any] = ["ok": ok, "cancelled": cancelled]
    if let espnS2, ok { payload["espn_s2"] = espnS2 }
    if let swid, ok { payload["swid"] = swid }
    if let error { payload["error"] = error }
    completion(.success(payload))
    if ok {
      dismiss(animated: true)
    }
  }
}
