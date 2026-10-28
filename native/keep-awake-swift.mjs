// Adds the "keep the screen on while reading" handler to the iPad app's
// AppDelegate.swift (Capacitor's template). The reader posts true/false to a
// "keepAwake" message handler; the app then turns the iPad's auto-lock off
// meanwhile. This also works in Low Power Mode, where iPadOS otherwise turns
// the screen off after 30 seconds. The reader lets go after 15 minutes
// without a touch, and when the comic is closed.
export function addKeepAwake(source) {
  if (source.includes('CloudPanelsKeepAwake')) return source;
  const launch = /(didFinishLaunchingWithOptions[^{]*\{)/;
  if (!launch.test(source)) throw new Error('AppDelegate.swift: application(_:didFinishLaunchingWithOptions:) was not found.');
  let result = source.replace(launch, '$1\n        CloudPanelsKeepAwake.shared.start()');
  if (!/^import WebKit$/m.test(result)) result = `import WebKit\n${result}`;
  return result + SWIFT;
}

const SWIFT = `
// CloudPanels: lets the reader keep the screen awake while a comic is open.
@MainActor
final class CloudPanelsKeepAwake: NSObject, WKScriptMessageHandler {
    static let shared = CloudPanelsKeepAwake()
    private var attached = false
    private var attempts = 0

    func start() {
        NotificationCenter.default.addObserver(self, selector: #selector(attach), name: UIApplication.didBecomeActiveNotification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(attach), name: UIScene.didActivateNotification, object: nil)
        retry()
    }

    // The web view exists only once the app's window is on screen.
    @objc private func retry() {
        attach()
        guard !attached, attempts < 60 else { return }
        attempts += 1
        perform(#selector(retry), with: nil, afterDelay: 0.5)
    }

    @objc private func attach() {
        guard !attached else { return }
        for scene in UIApplication.shared.connectedScenes {
            guard let windowScene = scene as? UIWindowScene else { continue }
            for window in windowScene.windows {
                guard let controller = CloudPanelsKeepAwake.bridgeController(in: window.rootViewController),
                      let webView = controller.bridge?.webView else { continue }
                webView.configuration.userContentController.add(self, name: "keepAwake")
                attached = true
                return
            }
        }
    }

    private static func bridgeController(in controller: UIViewController?) -> CAPBridgeViewController? {
        guard let controller = controller else { return nil }
        if let bridge = controller as? CAPBridgeViewController { return bridge }
        for child in controller.children {
            if let found = bridgeController(in: child) { return found }
        }
        return bridgeController(in: controller.presentedViewController)
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        let on = (message.body as? Bool) ?? ((message.body as? NSNumber)?.boolValue ?? false)
        UIApplication.shared.isIdleTimerDisabled = on
    }
}
`;
