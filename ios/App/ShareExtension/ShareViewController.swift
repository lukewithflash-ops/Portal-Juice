import UIKit
import UniformTypeIdentifiers

/// Share a slip screenshot, text or link from DraftKings, PrizePicks, Photos, etc. into Portal Juice.
/// The item is handed to portaljuice.app (/api/share, 15-minute one-read hand-off), then the app opens
/// the Log page's slip reader with it: app.portaljuice://share?id=…
final class ShareViewController: UIViewController {
    private let label = UILabel()
    private let spinner = UIActivityIndicatorView(style: .large)
    private let dark = UIColor(red: 6 / 255, green: 3 / 255, blue: 14 / 255, alpha: 1)
    private let neon = UIColor(red: 0.69, green: 0.36, blue: 1, alpha: 1)

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = dark
        overrideUserInterfaceStyle = .dark
        label.text = "Sending to Portal Juice…"
        label.textColor = .white
        label.font = .systemFont(ofSize: 17, weight: .bold)
        label.numberOfLines = 0
        label.textAlignment = .center
        spinner.color = neon
        spinner.startAnimating()
        let stack = UIStackView(arrangedSubviews: [spinner, label])
        stack.axis = .vertical
        stack.spacing = 16
        stack.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            stack.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            stack.leadingAnchor.constraint(greaterThanOrEqualTo: view.leadingAnchor, constant: 24),
        ])
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        Task { await run() }
    }

    private func run() async {
        let providers = (extensionContext?.inputItems as? [NSExtensionItem] ?? []).flatMap { $0.attachments ?? [] }
        var body: [String: String] = [:]
        for p in providers where body["image"] == nil {
            if p.hasItemConformingToTypeIdentifier(UTType.image.identifier), let img = await loadImage(p), let data = jpeg(img) {
                body["image"] = "data:image/jpeg;base64," + data.base64EncodedString()
            }
        }
        for p in providers {
            if body["url"] == nil, p.hasItemConformingToTypeIdentifier(UTType.url.identifier),
               let u = try? await p.loadItem(forTypeIdentifier: UTType.url.identifier) as? URL, !u.isFileURL {
                body["url"] = u.absoluteString
            }
            if body["text"] == nil, p.hasItemConformingToTypeIdentifier(UTType.plainText.identifier),
               let t = try? await p.loadItem(forTypeIdentifier: UTType.plainText.identifier) as? String {
                body["text"] = t
            }
        }
        if body.isEmpty { return fail("Nothing to share. Share a slip screenshot, its text or its link.") }
        do {
            var req = URLRequest(url: URL(string: "https://portaljuice.app/api/share")!)
            req.httpMethod = "POST"
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try JSONSerialization.data(withJSONObject: body)
            req.timeoutInterval = 30
            let (data, _) = try await URLSession.shared.data(for: req)
            let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]
            guard let id = json?["id"] as? String else {
                return fail((json?["error"] as? String) ?? "Portal Juice didn’t take that. Try again.")
            }
            await MainActor.run { self.openApp(URL(string: "app.portaljuice://share?id=\(id)")!) }
        } catch {
            fail("No connection. Try again when you’re online.")
        }
    }

    private func loadImage(_ p: NSItemProvider) async -> UIImage? {
        guard let item = try? await p.loadItem(forTypeIdentifier: UTType.image.identifier) else { return nil }
        if let i = item as? UIImage { return i }
        if let d = item as? Data { return UIImage(data: d) }
        if let u = item as? URL, let d = try? Data(contentsOf: u) { return UIImage(data: d) }
        return nil
    }

    /// Max 1600px JPEG, stepping quality down to stay under the hand-off size cap.
    private func jpeg(_ img: UIImage) -> Data? {
        let scale = min(1, 1600 / max(img.size.width, img.size.height))
        let size = CGSize(width: img.size.width * scale, height: img.size.height * scale)
        let fmt = UIGraphicsImageRendererFormat.default()
        fmt.scale = 1
        let out = UIGraphicsImageRenderer(size: size, format: fmt).image { _ in img.draw(in: CGRect(origin: .zero, size: size)) }
        for q in [0.8, 0.6, 0.45, 0.3] as [CGFloat] {
            if let d = out.jpegData(compressionQuality: q), d.count < 640_000 { return d }
        }
        return nil
    }

    @MainActor private func openApp(_ url: URL) {
        var r: UIResponder? = self
        while let x = r {
            // UIApplication.open is unavailable to extensions at compile time; call it through the runtime.
            let sel = NSSelectorFromString("openURL:options:completionHandler:")
            if x is UIApplication, x.responds(to: sel), let imp = x.method(for: sel) {
                typealias Open = @convention(c) (AnyObject, Selector, URL, NSDictionary, Any?) -> Void
                unsafeBitCast(imp, to: Open.self)(x, sel, url, NSDictionary(), nil)
                break
            }
            r = x.next
        }
        extensionContext?.completeRequest(returningItems: nil)
    }

    private func fail(_ msg: String) {
        DispatchQueue.main.async {
            self.spinner.stopAnimating()
            self.label.text = msg
            DispatchQueue.main.asyncAfter(deadline: .now() + 2.5) {
                self.extensionContext?.cancelRequest(withError: NSError(domain: "app.portaljuice.share", code: 1))
            }
        }
    }
}
