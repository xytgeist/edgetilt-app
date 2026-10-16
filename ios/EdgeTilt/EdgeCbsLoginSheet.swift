import UIKit
import WebKit

/// CBS Fantasy login in its own WKWebView. Password is never read.
/// Returns the member access token plus football league ids found on My Teams.
enum EdgeCbsLoginSheet {
  static func present(completion: @escaping (Result<[String: Any], Error>) -> Void) {
    DispatchQueue.main.async {
      guard let presenter = topViewController() else {
        completion(.success(["ok": false, "error": "Could not open CBS login."]))
        return
      }
      let controller = EdgeCbsLoginController(completion: completion)
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

final class EdgeCbsLoginController: UIViewController, WKNavigationDelegate, WKUIDelegate {
  private let completion: (Result<[String: Any], Error>) -> Void
  private var finished = false
  private var timer: Timer?
  private var openedMyTeams = false
  private var openedLeague = false
  private var myTeamsScans = 0

  private lazy var webView: WKWebView = {
    let config = WKWebViewConfiguration()
    config.websiteDataStore = .nonPersistent()
    config.allowsInlineMediaPlayback = true
    let script = WKUserScript(
      source: EdgeCbsLoginController.hookSource,
      injectionTime: .atDocumentStart,
      forMainFrameOnly: false
    )
    config.userContentController.addUserScript(script)
    let view = WKWebView(frame: .zero, configuration: config)
    view.navigationDelegate = self
    view.uiDelegate = self
    view.customUserAgent =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"
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
    title = "CBS"
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
    if let url = URL(string: "https://www.cbssports.com/login?redirectUrl=https%3A%2F%2Fwww.cbssports.com%2Ffantasy%2Fgames%2Fmy-teams%2F") {
      webView.load(URLRequest(url: url))
    }
    timer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
      self?.harvest()
    }
  }

  override func viewDidDisappear(_ animated: Bool) {
    super.viewDidDisappear(animated)
    if isBeingDismissed || navigationController?.isBeingDismissed == true {
      finish(ok: false, cancelled: true, token: nil, leagues: [], error: nil)
    }
  }

  deinit { timer?.invalidate() }

  @objc private func cancelTapped() {
    finish(ok: false, cancelled: true, token: nil, leagues: [], error: nil)
    dismiss(animated: true)
  }

  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    harvest()
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

  private func harvest() {
    if finished { return }
    webView.configuration.websiteDataStore.httpCookieStore.getAllCookies { [weak self] cookies in
      guard let self else { return }
      let loggedIn = cookies.contains { $0.name == "pid" && $0.value.count > 6 }
      self.webView.evaluateJavaScript(EdgeCbsLoginController.scanSource) { result, _ in
        guard let self2 = self as EdgeCbsLoginController? else { return }
        if self2.finished { return }
        let parsed = Self.parseScan(result)
        let url = self2.webView.url?.absoluteString ?? ""
        let onLogin = url.contains("/login")
        if loggedIn && onLogin && !self2.openedMyTeams {
          self2.openedMyTeams = true
          if let next = URL(string: "https://www.cbssports.com/fantasy/games/my-teams/") {
            self2.webView.load(URLRequest(url: next))
          }
          return
        }
        if url.contains("/fantasy/games/my-teams") {
          self2.myTeamsScans += 1
        }
        if parsed.token.isEmpty, let first = parsed.leagues.first, !self2.openedLeague, self2.myTeamsScans > 0 {
          self2.openedLeague = true
          let dest: String
          if first.allSatisfy({ $0.isNumber }) {
            dest = "https://www.cbssports.com/fantasy/football/league/\(first)/"
          } else {
            dest = "https://\(first).football.cbssports.com/"
          }
          if let next = URL(string: dest) {
            self2.webView.load(URLRequest(url: next))
          }
          return
        }
        let ready = parsed.token.count >= 16 && (parsed.leagues.isEmpty == false || self2.myTeamsScans >= 2)
        if ready {
          self2.finish(ok: true, cancelled: false, token: parsed.token, leagues: parsed.leagues, error: nil)
          self2.dismiss(animated: true)
        } else if loggedIn && self2.myTeamsScans >= 4 && parsed.token.isEmpty && parsed.leagues.isEmpty {
          self2.finish(
            ok: false,
            cancelled: false,
            token: nil,
            leagues: [],
            error: "No CBS football league showed up on My Teams."
          )
          self2.dismiss(animated: true)
        }
      }
    }
  }

  private static func parseScan(_ result: Any?) -> (token: String, leagues: [String]) {
    let text = result as? String ?? ""
    guard let data = text.data(using: .utf8),
          let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    else { return ("", []) }
    let token = (json["token"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    let leagues = (json["leagues"] as? [String]) ?? []
    return (token, leagues)
  }

  private func finish(ok: Bool, cancelled: Bool, token: String?, leagues: [String], error: String?) {
    if finished { return }
    finished = true
    timer?.invalidate()
    var payload: [String: Any] = ["ok": ok, "cancelled": cancelled]
    if let error, !error.isEmpty { payload["error"] = error }
    if ok, let token {
      payload["access_token"] = token
      payload["league_ids"] = leagues
    }
    completion(.success(payload))
  }

  private static let hookSource = """
  (function(){
    if (window.__edgeCbsHook) return;
    window.__edgeCbsHook = true;
    window.__edgeCbs = window.__edgeCbs || { token: '', leagues: [] };
    function take(url, auth) {
      try {
        var u = String(url || '');
        var m = u.match(/[?&]access_token=([^&]+)/);
        if (m && m[1]) window.__edgeCbs.token = decodeURIComponent(m[1]);
        var authText = String(auth || '');
        if (authText.toLowerCase().indexOf('bearer ') === 0) {
          window.__edgeCbs.token = authText.slice(7).trim();
        }
      } catch (e) {}
    }
    var orig = window.fetch;
    if (orig) {
      window.fetch = function(input, init) {
        try {
          var url = typeof input === 'string' ? input : (input && input.url);
          var headers = init && init.headers;
          var auth = headers && (headers.Authorization || headers.authorization);
          take(url, auth);
        } catch (e) {}
        return orig.apply(this, arguments);
      };
    }
    var open = XMLHttpRequest.prototype.open;
    var setHeader = XMLHttpRequest.prototype.setRequestHeader;
    XMLHttpRequest.prototype.open = function(method, url) {
      this.__edgeUrl = url;
      return open.apply(this, arguments);
    };
    XMLHttpRequest.prototype.setRequestHeader = function(name, value) {
      if (String(name).toLowerCase() === 'authorization') take(this.__edgeUrl, value);
      else take(this.__edgeUrl, '');
      return setHeader.apply(this, arguments);
    };
  })();
  """

  private static let scanSource = """
  (function(){
    var bag = window.__edgeCbs || { token: '', leagues: [] };
    var html = document.documentElement ? document.documentElement.innerHTML : '';
    var found = html.match(/var token = "([^"]+)"/) || html.match(/access_token["'\\s:=]+["']([A-Za-z0-9._~%-]{16,})/);
    if (found && found[1] && !bag.token) bag.token = found[1];
    var ids = bag.leagues ? bag.leagues.slice() : [];
    var links = document.querySelectorAll('a[href]');
    for (var i = 0; i < links.length; i++) {
      var href = links[i].href || '';
      var sub = href.match(/https?:\\/\\/([a-z0-9-]+)\\.football\\.cbssports\\.com/i);
      if (sub && sub[1] && sub[1] !== 'www') ids.push(sub[1]);
      var num = href.match(/\\/fantasy\\/football\\/league\\/(\\d+)/i);
      if (num && num[1]) ids.push(num[1]);
    }
    var seen = {};
    var leagues = [];
    for (var j = 0; j < ids.length; j++) {
      if (!ids[j] || seen[ids[j]]) continue;
      seen[ids[j]] = true;
      leagues.push(ids[j]);
      if (leagues.length >= 20) break;
    }
    bag.leagues = leagues;
    window.__edgeCbs = bag;
    return JSON.stringify({ token: bag.token || '', leagues: leagues });
  })()
  """
}
