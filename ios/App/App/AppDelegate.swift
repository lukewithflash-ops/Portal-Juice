import UIKit
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Override point for customization after application launch.
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        if url.scheme == "app.portaljuice", url.host == "share",
           let id = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.first(where: { $0.name == "id" })?.value {
            openShared(id: id, tries: 0)
        }
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    /// Share Extension hand-off: open the Log page's slip reader with the shared item.
    private func openShared(id: String, tries: Int) {
        let safe = id.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? ""
        guard let web = (window?.rootViewController as? CAPBridgeViewController)?.webView,
              let target = URL(string: "https://portaljuice.app/lines/portfolio?share=\(safe)#add-slip") else {
            if tries < 20 { DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) { self.openShared(id: id, tries: tries + 1) } }
            return
        }
        web.load(URLRequest(url: target))
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

}

/// Portal Juice shell: dark behind the web view (no white bar on pull-down) and no pinch or double-tap zoom.
class PJBridgeViewController: CAPBridgeViewController {
    private let dark = UIColor(red: 6 / 255, green: 3 / 255, blue: 14 / 255, alpha: 1)

    override func viewDidLoad() {
        super.viewDidLoad()
        overrideUserInterfaceStyle = .dark
        view.backgroundColor = dark
        guard let web = webView else { return }
        web.isOpaque = true
        web.backgroundColor = dark
        let scroll = web.scrollView
        scroll.backgroundColor = dark
        // The page handles the notch itself (viewport-fit=cover + env(safe-area-inset-top)), so the scroll view adds no inset.
        scroll.contentInsetAdjustmentBehavior = .never
        scroll.contentInset = .zero
        scroll.bounces = false
        scroll.isScrollEnabled = false
        scroll.alwaysBounceVertical = false
        scroll.alwaysBounceHorizontal = false
        scroll.minimumZoomScale = 1
        scroll.maximumZoomScale = 1
        scroll.bouncesZoom = false
        scroll.pinchGestureRecognizer?.isEnabled = false
    }

    // WebKit can restore bouncing after the first load; pin it off again whenever the view shows.
    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        webView?.scrollView.bounces = false
        webView?.scrollView.alwaysBounceVertical = false
        // The page scrolls inside its own container (#pj-scroll); the web view itself never scrolls, so the header can't move.
        webView?.scrollView.isScrollEnabled = false
    }

    override var preferredStatusBarStyle: UIStatusBarStyle { .lightContent }
}
