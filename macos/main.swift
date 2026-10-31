import AppKit
import WebKit
import UniformTypeIdentifiers

let preferences = UserDefaults.standard

let languageNames: [(String, String)] = [("zh-Hans","简体中文"),("zh-Hant","繁體中文"),("en","English"),("de","Deutsch"),("fr","Français"),("es","Español"),("ja","日本語"),("ko","한국어"),("pt-BR","Português (Brasil)"),("it","Italiano")]
let translations: [String: [String: String]] = {
    let paths = [Bundle.main.resourceURL?.appendingPathComponent("web/locales.json"), URL(fileURLWithPath: FileManager.default.currentDirectoryPath).appendingPathComponent("web-dist/locales.json")].compactMap { $0 }
    for path in paths {
        if let data = try? Data(contentsOf: path), let value = try? JSONDecoder().decode([String: [String: String]].self, from: data) { return value }
    }
    return [:]
}()
func resolvedLanguage(_ preference: String? = nil) -> String {
    let value = preference ?? preferences.string(forKey: "language") ?? "system"
    if languageNames.contains(where: { $0.0 == value }) { return value }
    for raw in Locale.preferredLanguages {
        let tag = raw.replacingOccurrences(of: "_", with: "-").lowercased()
        let parts = tag.split(separator: "-").map(String.init)
        guard let base = parts.first else { continue }
        if base == "zh" { return parts.contains("hant") ? "zh-Hant" : parts.contains("hans") ? "zh-Hans" : parts.contains(where: { ["tw","hk","mo"].contains($0) }) ? "zh-Hant" : "zh-Hans" }
        if base == "pt" { return "pt-BR" }
        if languageNames.contains(where: { $0.0 == base }) { return base }
    }
    return "en"
}
func tr(_ key: String) -> String { translations[resolvedLanguage()]?[key] ?? translations["en"]?[key] ?? key }

// Backgrounds match the iTerm2 color presets represented in the Web UI.
let nativeThemes: [String: (dark: Bool, rgb: (CGFloat, CGFloat, CGFloat))] = [
    "dark-background": (true, (0, 0, 0)),
    "light-background": (false, (255, 255, 255)),
    "smoooooth": (true, (21, 25, 31)),
    "solarized-dark": (true, (0, 43, 54)),
    "solarized-light": (false, (253, 246, 227)),
    "tango-dark": (true, (0, 0, 0)),
    "tango-light": (false, (255, 255, 255)),
]

// Render a separate, toolbar-free WebView, then paginate its vector PDF into A4 pages.
final class PDFExporter: NSObject, WKNavigationDelegate {
    private let web = WKWebView(frame: NSRect(x: 0, y: 0, width: 499, height: 746))
    private let destination: URL
    private let completion: (Result<Void, Error>) -> Void
    private let pageWidth: CGFloat = 595.28, pageHeight: CGFloat = 841.89, margin: CGFloat = 48

    init(html: String, base: URL, destination: URL, completion: @escaping (Result<Void, Error>) -> Void) {
        self.destination = destination; self.completion = completion
        super.init()
        web.navigationDelegate = self
        web.loadHTMLString(html, baseURL: base)
    }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { completion(.failure(error)) }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { completion(.failure(error)) }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        let script = """
        await Promise.all(Array.from(document.images, image => image.complete ? Promise.resolve() :
          Promise.race([new Promise(resolve => { image.addEventListener('load', resolve, {once:true}); image.addEventListener('error', resolve, {once:true}); }), new Promise(resolve => setTimeout(resolve, 10000))])));
        if (document.fonts?.ready) await document.fonts.ready;
        const spans = [];
        const walker = document.createTreeWalker(document.querySelector('#preview'), NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
          const range = document.createRange(); range.selectNodeContents(walker.currentNode);
          for (const r of range.getClientRects()) if (r.height > 0) spans.push([r.top, r.bottom]);
        }
        for (const e of document.querySelectorAll('#preview img, #preview svg, #preview tr')) {
          const r = e.getBoundingClientRect(); if (r.height > 0) spans.push([r.top, r.bottom]);
        }
        const tables = Array.from(document.querySelectorAll('#preview table')).map(table => {
          const bounds = table.getBoundingClientRect();
          const head = table.tHead?.getBoundingClientRect();
          const firstRow = table.tBodies[0]?.rows[0]?.getBoundingClientRect();
          return head && firstRow ? [bounds.top, bounds.bottom, head.bottom, firstRow.bottom] : null;
        }).filter(Boolean);
        const blocks = Array.from(document.querySelector('#preview').children);
        const headings = blocks.flatMap((heading, index) => {
          if (!/^H[1-6]$/.test(heading.tagName)) return [];
          const top = heading.getBoundingClientRect().top;
          const level = Number(heading.tagName[1]);
          let last = heading, next = null, firstNested = -1, sectionEnd = blocks.length;
          for (let i = index + 1; i < blocks.length; i++) {
            const element = blocks[i];
            if (/^H[1-6]$/.test(element.tagName)) {
              if (Number(element.tagName[1]) <= level) { sectionEnd = i; break; }
              if (firstNested < 0) firstNested = i;
            }
            if (element.getBoundingClientRect().height > 0) { if (!next) next = element; last = element; }
          }
          const bottom = last.getBoundingClientRect().bottom;
          let keep = heading.getBoundingClientRect().bottom;
          if (next) {
            const rect = next.getBoundingClientRect();
            if (next.tagName === 'TABLE') {
              const row = next.tBodies[0]?.rows[0]?.getBoundingClientRect();
              keep = rect.bottom - top <= 745 ? rect.bottom : (row?.bottom ?? rect.bottom);
            } else keep = rect.top + Math.min(rect.height, 60);
          }
          if (firstNested >= 0) {
            const childLevel = Number(blocks[firstNested].tagName[1]);
            let childLast = blocks[firstNested], childOpening = null;
            for (let i = firstNested + 1; i < sectionEnd; i++) {
              const element = blocks[i];
              if (/^H[1-6]$/.test(element.tagName) && Number(element.tagName[1]) <= childLevel) break;
              const rect = element.getBoundingClientRect();
              if (rect.height > 0) { if (!childOpening) childOpening = element; childLast = element; }
            }
            const childBottom = childLast.getBoundingClientRect().bottom;
            let nestedKeep = childBottom;
            if (nestedKeep - top > 745 && childOpening) {
              const rect = childOpening.getBoundingClientRect();
              nestedKeep = childOpening.tagName === 'TABLE'
                ? (childOpening.tBodies[0]?.rows[0]?.getBoundingClientRect().bottom ?? rect.bottom)
                : rect.top + Math.min(rect.height, 60);
            }
            if (nestedKeep - top <= 745) keep = Math.max(keep, nestedKeep);
          }
          return [[top, bottom, keep]];
        });
        return { height: Math.max(1, document.documentElement.scrollHeight), spans, tables, headings };
        """
        web.callAsyncJavaScript(script, arguments: [:], in: nil, in: .page) { [weak self] result in
            guard let self = self else { return }
            switch result {
            case .failure(let error): self.completion(.failure(error))
            case .success(let value):
                guard let metrics = value as? [String: Any], let height = metrics["height"] as? Double, height > 0,
                      let spans = metrics["spans"] as? [[Double]], let tables = metrics["tables"] as? [[Double]],
                      let headings = metrics["headings"] as? [[Double]] else { self.fail(tr("previewMeasureFailed")); return }
                let config = WKPDFConfiguration()
                config.rect = CGRect(x: 0, y: 0, width: self.pageWidth - self.margin * 2, height: height)
                self.web.createPDF(configuration: config) { result in
                    do {
                        let data = try result.get()
                        try self.writePages(data: data, height: CGFloat(height), spans: spans, tables: tables, headings: headings)
                        self.completion(.success(()))
                    } catch { self.completion(.failure(error)) }
                }
            }
        }
    }
    private func fail(_ message: String) { completion(.failure(NSError(domain: "MarkdownRE.PDF", code: 1, userInfo: [NSLocalizedDescriptionKey: message]))) }
    private func writePages(data: Data, height: CGFloat, spans: [[Double]], tables: [[Double]], headings: [[Double]]) throws {
        guard let provider = CGDataProvider(data: data as CFData), let source = CGPDFDocument(provider), let page = source.page(at: 1) else { throw NSError(domain: "MarkdownRE.PDF", code: 2, userInfo: [NSLocalizedDescriptionKey: tr("pdfReadFailed")]) }
        let output = NSMutableData()
        guard let consumer = CGDataConsumer(data: output as CFMutableData) else { throw NSError(domain: "MarkdownRE.PDF", code: 3) }
        var media = CGRect(x: 0, y: 0, width: pageWidth, height: pageHeight)
        guard let context = CGContext(consumer: consumer, mediaBox: &media, nil) else { throw NSError(domain: "MarkdownRE.PDF", code: 4) }
        let available = pageHeight - margin * 2
        var start: CGFloat = 0
        while start < height {
            let continued = tables.first { table in
                table.count == 4 && Double(start) >= table[2] - 0.5 && Double(start) < table[1] - 0.5
            }
            let headerHeight = continued.map { CGFloat($0[2] - $0[0]) } ?? 0
            let repeatedHeight = headerHeight < available - 40 ? headerHeight : 0
            var end = min(start + available - repeatedHeight, height)
            if end < height {
                // A table that fits on a page moves intact; a long table starts only
                // when its first body row fits alongside the header.
                for table in tables where table.count == 4 {
                    let top = CGFloat(table[0]), bottom = CGFloat(table[1]), firstRowBottom = CGFloat(table[3])
                    if top > start + 2 && top < end && bottom > end &&
                        (bottom - top <= available || firstRowBottom > end) { end = top - 1 }
                }
                // Avoid cutting text lines and reasonably sized pictures/table rows.
                for _ in 0..<100 {
                    let crossing = spans.compactMap { pair -> CGFloat? in
                        guard pair.count == 2, pair[0] < Double(end), pair[1] > Double(end), pair[1] - pair[0] < Double(available) else { return nil }
                        return CGFloat(pair[0])
                    }.min()
                    guard let boundary = crossing, boundary > start + 40 else { break }
                    end = boundary
                }
                // A nearby line or image can move the break back into the first
                // row, so check again after adjusting the proposed boundary.
                for table in tables where table.count == 4 {
                    let top = CGFloat(table[0]), firstRowBottom = CGFloat(table[3])
                    if top > start + 2 && top < end && firstRowBottom > end { end = top - 1 }
                }
                // Keep a section together when it fits on a page; for longer
                // sections, at least keep the heading with its opening content.
                // Walk backwards so moving a nested heading also pulls its
                // parent heading along when they were consecutive.
                for heading in headings.reversed() where heading.count == 3 {
                    let top = CGFloat(heading[0]), bottom = CGFloat(heading[1]), opening = CGFloat(heading[2])
                    let required = bottom - top <= available ? bottom : opening
                    if top > start + 2 && top < end && required > end { end = top - 1 }
                }
            }
            context.beginPDFPage(nil)
            if let table = continued, repeatedHeight > 0 {
                context.saveGState()
                context.clip(to: CGRect(x: margin, y: margin + available - repeatedHeight, width: pageWidth - margin * 2, height: repeatedHeight))
                context.translateBy(x: margin, y: margin + available - height + CGFloat(table[0]))
                context.drawPDFPage(page); context.restoreGState()
            }
            context.saveGState()
            let fragmentHeight = end - start
            context.clip(to: CGRect(x: margin, y: margin + available - repeatedHeight - fragmentHeight, width: pageWidth - margin * 2, height: fragmentHeight))
            context.translateBy(x: margin, y: margin + available - repeatedHeight - height + start)
            context.drawPDFPage(page); context.restoreGState(); context.endPDFPage()
            start = end
        }
        context.closePDF()
        try (output as Data).write(to: destination, options: .atomic)
    }
}

final class SaveFormatChooser: NSObject {
    let panel: NSSavePanel
    let view = NSView(frame: NSRect(x: 0, y: 0, width: 340, height: 32))
    let popup = NSPopUpButton(frame: NSRect(x: 76, y: 2, width: 230, height: 26), pullsDown: false)
    init(panel: NSSavePanel) {
        self.panel = panel
        super.init()
        let label = NSTextField(labelWithString: tr("fileFormat"))
        label.frame = NSRect(x: 0, y: 6, width: 76, height: 20)
        popup.addItems(withTitles: ["Markdown (.md)", "PDF (.pdf)"])
        popup.target = self; popup.action = #selector(changed(_:))
        view.addSubview(label); view.addSubview(popup)
        panel.accessoryView = view
        panel.allowedContentTypes = [UTType(filenameExtension: "md") ?? .plainText]
    }
    @objc private func changed(_ sender: NSPopUpButton) {
        let ext = sender.indexOfSelectedItem == 1 ? "pdf" : "md"
        panel.allowedContentTypes = ext == "pdf" ? [.pdf] : [UTType(filenameExtension: "md") ?? .plainText]
        panel.nameFieldStringValue = (panel.nameFieldStringValue as NSString).deletingPathExtension + "." + ext
    }
}

final class DocumentWindow: NSObject, NSWindowDelegate, WKScriptMessageHandler, WKNavigationDelegate {
    let id = UUID().uuidString
    let server: ResourceServer
    let window: NSWindow
    let web: WKWebView
    let loadingView: NSView
    var url: URL?
    var text = ""
    var savedText = ""
    var encoding: String.Encoding = .utf8
    var hasUTF8BOM = false
    var newline = "\n"
    var modifiedAt: Date?
    var ready = false
    private var showRequested = false
    var closed: (() -> Void)?
    private var pdfExporter: PDFExporter?

    init(server: ResourceServer, url: URL?) throws {
        self.server = server
        self.url = url
        if let url = url {
            let data = try Data(contentsOf: url)
            let raw: String
            if data.starts(with: [0xef,0xbb,0xbf]), let value = String(data: data.dropFirst(3), encoding: .utf8) { hasUTF8BOM = true; raw = value }
            else if let utf8 = String(data:data, encoding:.utf8) { raw = utf8 }
            else if (data.starts(with: [0xff, 0xfe]) || data.starts(with: [0xfe, 0xff])), let utf16 = String(data:data, encoding:.utf16) { encoding = .utf16; raw = utf16 }
            else { throw NSError(domain:"MarkdownRE", code:2, userInfo:[NSLocalizedDescriptionKey:tr("encodingError")]) }
            let withoutCRLF = raw.replacingOccurrences(of:"\r\n", with:"")
            if raw.contains("\r\n") && (withoutCRLF.contains("\n") || withoutCRLF.contains("\r")) { throw NSError(domain:"MarkdownRE",code:3,userInfo:[NSLocalizedDescriptionKey:tr("mixedNewlines")]) }
            if raw.contains("\r\n") { newline = "\r\n" } else if raw.contains("\r") && !raw.contains("\n") { newline = "\r" } else if raw.contains("\r") { throw NSError(domain:"MarkdownRE",code:3,userInfo:[NSLocalizedDescriptionKey:tr("mixedNewlines")]) }
            text = raw.replacingOccurrences(of:"\r\n",with:"\n").replacingOccurrences(of:"\r",with:"\n")
            savedText = text
            modifiedAt = try? url.resourceValues(forKeys:[.contentModificationDateKey]).contentModificationDate
        }
        let configuration = WKWebViewConfiguration()
        let controller = WKUserContentController()
        let savedTheme = preferences.string(forKey: "theme") ?? "solarized-light"
        let legacyTheme = savedTheme == "dark" ? "solarized-dark" : (savedTheme == "light" ? "solarized-light" : savedTheme)
        let themeID = nativeThemes[legacyTheme] == nil ? "solarized-light" : legacyTheme
        let initialTheme = nativeThemes[themeID]!
        let rgb = initialTheme.rgb
        let initialScript = """
            window.__markdownREInitialTheme = '\(themeID)';
            window.__markdownREInitialLanguage = '\(resolvedLanguage())';
            document.documentElement.dataset.theme = '\(initialTheme.dark ? "dark" : "light")';
            document.documentElement.style.setProperty('--background', 'rgb(\(Int(rgb.0)), \(Int(rgb.1)), \(Int(rgb.2)))');
            """
        controller.addUserScript(WKUserScript(source: initialScript, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        configuration.userContentController = controller
        web = WKWebView(frame:.zero, configuration:configuration)
        loadingView = NSView(frame: .zero)
        window = NSWindow(contentRect:NSRect(x:0,y:0,width:1100,height:750),styleMask:[.titled,.closable,.miniaturizable,.resizable],backing:.buffered,defer:false)
        // Swift ARC owns this window; AppKit must not release it on close.
        window.isReleasedWhenClosed = false
        super.init()
        controller.add(self, name:"app")
        web.navigationDelegate = self
        let container = NSView(frame: window.contentView?.bounds ?? .zero)
        web.frame = container.bounds
        web.autoresizingMask = [.width, .height]
        loadingView.frame = container.bounds
        loadingView.autoresizingMask = [.width, .height]
        loadingView.wantsLayer = true
        container.addSubview(web)
        container.addSubview(loadingView)
        window.delegate = self
        window.contentView = container
        window.minSize = NSSize(width:600,height:400)
        window.center()
        window.titlebarAppearsTransparent = true
        applyTheme(preferences.string(forKey: "theme") ?? "solarized-light")
        window.setFrameAutosaveName("DocumentWindow")
        updateTitle()
        server.setFolder(url?.deletingLastPathComponent(), for:id)
        web.load(URLRequest(url:URL(string:server.origin)!))
        DispatchQueue.main.asyncAfter(deadline: .now() + 15) { [weak self] in
            guard let self = self, !self.loadingView.isHidden, self.showRequested else { return }
            self.reveal()
            self.showError(tr("editorFailed"))
        }
    }
    func applyTheme(_ value: String) {
        let themeID = value == "dark" ? "solarized-dark" : (value == "light" ? "solarized-light" : value)
        let theme = nativeThemes[themeID] ?? nativeThemes["solarized-light"]!
        window.appearance = NSAppearance(named: theme.dark ? .darkAqua : .aqua)
        let rgb = theme.rgb
        let background = NSColor(srgbRed: rgb.0 / 255, green: rgb.1 / 255, blue: rgb.2 / 255, alpha: 1)
        window.backgroundColor = background
        web.underPageBackgroundColor = background
        loadingView.layer?.backgroundColor = background.cgColor
    }
    func show() {
        showRequested = true
        if loadingView.isHidden { window.makeKeyAndOrderFront(nil); NSApp.activate(ignoringOtherApps:true) }
    }
    private func reveal() {
        loadingView.isHidden = true
        if showRequested { show() }
    }
    private func showPreparedContent() {
        let snapshot = WKSnapshotConfiguration()
        snapshot.afterScreenUpdates = true
        web.takeSnapshot(with: snapshot) { [weak self] image, _ in
            guard let self = self, !self.loadingView.isHidden else { return }
            guard self.showRequested, let image = image,
                  let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
                self.reveal()
                return
            }
            // Present the already-drawn toolbar on the first window frame while
            // WebKit commits its view to the newly visible window.
            self.loadingView.layer?.contents = cgImage
            self.loadingView.layer?.contentsGravity = .resize
            self.window.makeKeyAndOrderFront(nil)
            NSApp.activate(ignoringOtherApps: true)
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) { [weak self] in
                self?.loadingView.isHidden = true
                self?.loadingView.layer?.contents = nil
            }
        }
    }
    func updateTitle() { window.title = url?.lastPathComponent ?? (tr("untitled") + ".md"); window.isDocumentEdited = text != savedText; window.representedURL = url }
    func send(_ message: [String:Any], completion: ((Bool) -> Void)? = nil) {
        guard ready, let data = try? JSONSerialization.data(withJSONObject:message), let json = String(data:data,encoding:.utf8) else { completion?(false); return }
        web.evaluateJavaScript("window.receiveNative(\(json))") { _, error in
            if let error = error { NSLog("Web bridge: %@",error.localizedDescription) }
            completion?(error == nil)
        }
    }
    func loadIntoWeb() {
        let settings: [String: Any] = ["type":"preferences", "language":resolvedLanguage(), "horizontal":preferences.object(forKey:"horizontal") as? Double ?? 0.5,"vertical":preferences.object(forKey:"vertical") as? Double ?? 0.5,"theme":preferences.string(forKey:"theme") ?? "solarized-light"]
        send(settings) { [weak self] success in
            guard let self = self else { return }
            guard success else { self.reveal(); self.showError(tr("settingsFailed")); return }
            self.send(["type":"document","text":self.text,"base":self.server.origin + "doc/\(self.id)/"]) { [weak self] success in
                guard let self = self else { return }
                if !success { self.reveal(); self.showError(tr("documentFailed")) }
            }
        }
    }
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame, let data = message.body as? [String:Any], let type = data["type"] as? String else { return }
        switch type {
        case "ready": ready = true; loadIntoWeb()
        case "displayReady": showPreparedContent()
        case "openDocument": (NSApp.delegate as? AppDelegate)?.openDocument(nil)
        case "saveDocument": _ = save()
        case "changed": if let value = data["text"] as? String { text = value; updateTitle() }
        case "ratios":
            for key in ["horizontal","vertical"] { if let number = data[key] as? Double, (0.15...0.85).contains(number) { preferences.set(number,forKey:key) } }
        case "theme":
            if let theme = data["theme"] as? String, nativeThemes[theme] != nil {
                preferences.set(theme, forKey: "theme")
                let app = NSApp.delegate as? AppDelegate
                for document in app?.windows ?? [] {
                    document.applyTheme(theme)
                    document.send(["type": "theme", "theme": theme])
                }
                app?.markdownHelp?.applyTheme(theme)
            }
        case "openLink":
            if let href = data["href"] as? String, let link = URL(string:href,relativeTo:url?.deletingLastPathComponent())?.absoluteURL, ["http","https","mailto","file"].contains(link.scheme?.lowercased() ?? "") { NSWorkspace.shared.open(link) }
        default: break
        }
    }
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let target = action.request.url else { decisionHandler(.cancel); return }
        if target.absoluteString.hasPrefix(server.origin) { decisionHandler(.allow) } else { decisionHandler(.cancel) }
    }
    func exportPDF(to file: URL, completion: ((Bool) -> Void)? = nil) {
        guard ready else { showError(tr("previewNotReady")); completion?(false); return }
        web.callAsyncJavaScript("return await window.preparePDFExport();", arguments: [:], in: nil, in: .page) { [weak self] result in
            guard let self = self else { completion?(false); return }
            switch result {
            case .failure(let error):
                self.showError("\(tr("preparePdfFailed")): \(error.localizedDescription)")
                completion?(false)
            case .success(let value):
                guard let html = value as? String, let base = URL(string: self.server.origin) else { self.showError(tr("pdfContentFailed")); completion?(false); return }
                self.pdfExporter = PDFExporter(html: html, base: base, destination: file) { [weak self] result in
                    self?.pdfExporter = nil
                    switch result {
                    case .success: completion?(true)
                    case .failure(let error): self?.showError("\(tr("pdfExportFailed")): \(error.localizedDescription)"); completion?(false)
                    }
                }
            }
        }
    }
    func choosePDFExport() {
        let panel = NSSavePanel()
        panel.nameFieldStringValue = (url?.deletingPathExtension().lastPathComponent ?? tr("untitled")) + ".pdf"
        panel.allowedContentTypes = [.pdf]
        panel.canCreateDirectories = true
        if panel.runModal() == .OK, let file = panel.url { exportPDF(to: file) }
    }
    func save(asNew: Bool = false) -> Bool {
        var destination = url
        if destination == nil || asNew {
            let panel = NSSavePanel(); panel.nameFieldStringValue = url?.lastPathComponent ?? (tr("untitled") + ".md"); panel.canCreateDirectories = true
            let chooser = asNew ? SaveFormatChooser(panel: panel) : nil
            if !asNew { panel.allowedContentTypes = [UTType(filenameExtension: "md") ?? .plainText] }
            let response = panel.runModal()
            guard response == .OK, let selected = panel.url else { return false }; destination = selected
            if chooser?.popup.indexOfSelectedItem == 1 { exportPDF(to: selected); return false }
        }
        guard let file = destination else { return false }
        if !asNew, file == url, let oldDate = modifiedAt, let current = try? file.resourceValues(forKeys:[.contentModificationDateKey]).contentModificationDate, current != oldDate {
            let alert = NSAlert(); alert.messageText = tr("changedExternally"); alert.informativeText = tr("confirmOverwrite"); alert.addButton(withTitle:tr("cancel")); alert.addButton(withTitle:tr("overwrite"))
            if alert.runModal() != .alertSecondButtonReturn { return false }
        }
        let output = text.replacingOccurrences(of:"\n",with:newline)
        guard var data = output.data(using:encoding) else { showError(tr("saveEncoding")); return false }
        if hasUTF8BOM { data.insert(contentsOf:[0xef,0xbb,0xbf],at:0) }
        do {
            try data.write(to:file,options:.atomic)
            url = file; savedText = text; modifiedAt = try? file.resourceValues(forKeys:[.contentModificationDateKey]).contentModificationDate
            server.setFolder(file.deletingLastPathComponent(),for:id); updateTitle()
            (NSApp.delegate as? AppDelegate)?.recordRecent(file)
            return true
        } catch { showError("\(tr("saveFailed")): \(error.localizedDescription)"); return false }
    }
    func confirmClose() -> Bool {
        guard text != savedText else { return true }
        let alert = NSAlert(); alert.messageText = tr("saveChanges"); alert.informativeText = tr("loseChanges"); alert.addButton(withTitle:tr("save")); alert.addButton(withTitle:tr("cancel")); alert.addButton(withTitle:tr("discard"))
        switch alert.runModal() { case .alertFirstButtonReturn: return save(); case .alertThirdButtonReturn: return true; default: return false }
    }
    func windowShouldClose(_ sender: NSWindow) -> Bool { confirmClose() }
    func windowWillClose(_ notification: Notification) { showRequested = false; server.setFolder(nil,for:id); web.configuration.userContentController.removeScriptMessageHandler(forName:"app"); closed?() }
    func showError(_ message: String) { let alert = NSAlert(); alert.messageText = message; alert.runModal() }
}

final class MarkdownHelpWindow: NSObject, WKNavigationDelegate {
    let window: NSWindow
    let web: WKWebView
    private var selectedTheme: String

    init(url: URL, theme: String) {
        selectedTheme = theme
        let configuration = WKWebViewConfiguration()
        configuration.userContentController.addUserScript(WKUserScript(source: "window.__markdownREInitialLanguage=\'\(resolvedLanguage())\';", injectionTime: .atDocumentStart, forMainFrameOnly: true))
        web = WKWebView(frame: .zero, configuration: configuration)
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 820, height: 700),
                          styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        window.isReleasedWhenClosed = false
        super.init()
        window.title = tr("syntax")
        window.minSize = NSSize(width: 480, height: 400)
        window.center()
        window.contentView = web
        web.navigationDelegate = self
        applyTheme(theme)
        if url.isFileURL { web.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent()) } else { web.load(URLRequest(url: url)) }
    }
    func applyTheme(_ themeID: String) {
        selectedTheme = themeID
        let normalized = themeID == "dark" ? "solarized-dark" : (themeID == "light" ? "solarized-light" : themeID)
        let theme = nativeThemes[normalized] ?? nativeThemes["solarized-light"]!
        window.appearance = NSAppearance(named: theme.dark ? .darkAqua : .aqua)
        let rgb = theme.rgb
        let background = NSColor(srgbRed: rgb.0 / 255, green: rgb.1 / 255, blue: rgb.2 / 255, alpha: 1)
        window.backgroundColor = background
        web.underPageBackgroundColor = background
        let foreground = normalized == "solarized-dark" ? "#839496" : normalized == "solarized-light" ? "#657b83" : theme.dark ? "#e0e0e0" : "#252a30"
        let script = "document.documentElement.dataset.theme='\(theme.dark ? "dark" : "light")'; document.documentElement.style.setProperty('--background','rgb(\(Int(rgb.0)), \(Int(rgb.1)), \(Int(rgb.2)))'); document.documentElement.style.setProperty('--text','\(foreground)');"
        web.evaluateJavaScript(script, completionHandler: nil)
    }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { applyTheme(selectedTheme) }
    func applyLanguage() {
        window.title = tr("syntax")
        web.evaluateJavaScript("window.__markdownREInitialLanguage='\(resolvedLanguage())'; window.setHelpLanguage?.(window.__markdownREInitialLanguage)", completionHandler: nil)
    }
    func show() { window.makeKeyAndOrderFront(nil); NSApp.activate(ignoringOtherApps: true) }
}

final class AppDelegate: NSObject, NSApplicationDelegate, NSMenuDelegate {
    // AppKit can add these system commands after the menu is created. Filter
    // them when the Edit menu opens, including when the system rebuilds it.
    private func removeUnwantedEditItems(_ menu: NSMenu) {
        let autoFillTitles: Set<String> = ["autofill", "auto fill", "自动填充", "自動填充", "自動填入"]
        for item in menu.items {
            let action = item.action.map(NSStringFromSelector) ?? ""
            let title = item.title.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            if action == "startDictation:" || action == "orderFrontCharacterPalette:" || (item.submenu != nil && autoFillTitles.contains(title)) {
                menu.removeItem(item)
            }
        }
    }
    func menuNeedsUpdate(_ menu: NSMenu) { removeUnwantedEditItems(menu) }
    func menuWillOpen(_ menu: NSMenu) { removeUnwantedEditItems(menu) }

    var server: ResourceServer!
    var windows: [DocumentWindow] = []
    var recentMenu = NSMenu(title:tr("recent"))
    var markdownHelp: MarkdownHelpWindow?
    var recents: [String] { preferences.stringArray(forKey:"recent") ?? [] }
    func applicationWillFinishLaunching(_ notification: Notification) {
        if preferences.string(forKey: "theme") == "pastel-dark" {
            preferences.set("dark-background", forKey: "theme")
        }
        do {
            guard let root = Bundle.main.resourceURL?.appendingPathComponent("web") else { throw NSError(domain:"MarkdownRE",code:1) }
            server = try ResourceServer(resources:root)
        } catch { let a=NSAlert(); a.messageText="\(tr("startupFailed")): \(error.localizedDescription)";a.runModal();NSApp.terminate(nil) }
        setupMenus()
    }
    func applicationDidFinishLaunching(_ notification: Notification) {
        DispatchQueue.main.asyncAfter(deadline:.now()+0.3) { if self.windows.isEmpty { self.newDocument(nil) } }
    }
    func application(_ application: NSApplication, open urls: [URL]) { for url in urls { open(url) } }
    func application(_ sender: NSApplication, openFile filename: String) -> Bool { open(URL(fileURLWithPath:filename)); return true }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }
    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply { for doc in windows where !doc.confirmClose() { return .terminateCancel }; return .terminateNow }
    var active: DocumentWindow? { windows.first { $0.window === NSApp.keyWindow } }
    func open(_ url: URL?) {
        if let url = url, let existing = windows.first(where: { $0.url?.standardizedFileURL == url.standardizedFileURL }) { existing.show(); return }
        do {
            let doc = try DocumentWindow(server:server,url:url)
            track(doc)
            doc.show(); if let url = url { recordRecent(url) }
        } catch { let a=NSAlert(); a.messageText=tr("openFailed"); a.informativeText=error.localizedDescription;a.runModal() }
    }
    func track(_ doc: DocumentWindow) {
        windows.append(doc)
        doc.closed = { [weak self, weak doc] in
            // Keep the document and its window alive until AppKit finishes the close callback.
            DispatchQueue.main.async { [weak self, weak doc] in
                guard let self = self, let doc = doc else { return }
                self.windows.removeAll { $0 === doc }
            }
        }
    }
    func recordRecent(_ url: URL) { var items=recents.filter {$0 != url.path}; items.insert(url.path,at:0); preferences.set(Array(items.prefix(50)),forKey:"recent"); updateRecent() }
    @objc func newDocument(_ sender: Any?) { open(nil) }
    @objc func openDocument(_ sender: Any?) { let p=NSOpenPanel();p.allowedContentTypes=[.plainText];p.allowsMultipleSelection=true;if p.runModal() == .OK { p.urls.forEach { open($0) } } }
    @objc func openRecent(_ sender: NSMenuItem) { guard let path=sender.representedObject as? String else{return}; if FileManager.default.fileExists(atPath:path) { open(URL(fileURLWithPath:path)) } else { let a=NSAlert();a.messageText=tr("missingFile");a.informativeText=path;a.addButton(withTitle:tr("removeRecent"));a.addButton(withTitle:tr("cancel"));if a.runModal() == .alertFirstButtonReturn {preferences.set(recents.filter{$0 != path},forKey:"recent");updateRecent()} } }
    @objc func save(_ sender: Any?) { _ = active?.save() }
    @objc func saveAs(_ sender: Any?) { _ = active?.save(asNew:true) }
    @objc func exportPDF(_ sender: Any?) { active?.choosePDFExport() }
    @objc func setDefaultMarkdownApplication(_ sender: Any?) {
        guard let markdown = UTType(filenameExtension: "md") else {
            let alert = NSAlert()
            alert.messageText = tr("fileTypeFailed")
            alert.informativeText = tr("setDefaultHint")
            alert.runModal()
            return
        }
        NSWorkspace.shared.setDefaultApplication(at: Bundle.main.bundleURL, toOpen: markdown) { error in
            DispatchQueue.main.async {
                let alert = NSAlert()
                if let error = error {
                    alert.messageText = tr("setDefaultFailed")
                    alert.informativeText = error.localizedDescription
                } else {
                    alert.messageText = tr("setDefaultSuccess")
                    alert.informativeText = tr("setDefaultDetail")
                }
                alert.runModal()
            }
        }
    }
    @objc func showAbout(_ sender: Any?) {
        let paragraph = NSMutableParagraphStyle()
        paragraph.alignment = .center
        let credits = NSAttributedString(
            string: tr("aboutDetail"),
            attributes: [.font: NSFont.systemFont(ofSize: 12), .foregroundColor: NSColor.secondaryLabelColor, .paragraphStyle: paragraph]
        )
        NSApp.orderFrontStandardAboutPanel(options: [.credits: credits])
        NSApp.activate(ignoringOtherApps: true)
    }
    @objc func showMarkdownHelp(_ sender: Any?) {
        if let help = markdownHelp { help.show(); return }
        guard let page = URL(string: server.origin + "help.html") else {
            let alert = NSAlert(); alert.messageText = tr("helpFailed"); alert.runModal(); return
        }
        let help = MarkdownHelpWindow(url: page, theme: preferences.string(forKey: "theme") ?? "solarized-light")
        markdownHelp = help
        help.show()
    }
    @objc func layout(_ sender: NSMenuItem) { if let value = sender.representedObject as? String { active?.send(["type":"layout","layout":value]) } }
    func updateRecent() { recentMenu.removeAllItems();for path in recents { let item=NSMenuItem(title:URL(fileURLWithPath:path).lastPathComponent,action:#selector(openRecent(_:)),keyEquivalent:"");item.target=self;item.representedObject=path;item.toolTip=path;recentMenu.addItem(item) } }
    @objc func chooseLanguage(_ sender: NSMenuItem) {
        guard let language = sender.representedObject as? String,
              language == "system" || languageNames.contains(where: { $0.0 == language }) else { return }
        preferences.set(language, forKey: "language")
        setupMenus()
        for document in windows { document.updateTitle(); document.send(["type":"language", "language":resolvedLanguage()]) }
        markdownHelp?.applyLanguage()
    }
    func setupMenus() {
        let bar=NSMenu(); NSApp.mainMenu=bar
        let app=NSMenuItem();bar.addItem(app);let appMenu=NSMenu();app.submenu=appMenu
        let about = NSMenuItem(title:tr("about"),action:#selector(showAbout(_:)),keyEquivalent:"")
        about.target = self; appMenu.addItem(about); appMenu.addItem(.separator())
        let defaultApp = NSMenuItem(title:tr("defaultApp"),action:#selector(setDefaultMarkdownApplication(_:)),keyEquivalent:"")
        defaultApp.target = self; appMenu.addItem(defaultApp); appMenu.addItem(.separator())
        appMenu.addItem(withTitle:tr("quitApp"),action:#selector(NSApplication.terminate(_:)),keyEquivalent:"q")
        let file=NSMenuItem();bar.addItem(file);let fm=NSMenu(title:tr("file"));file.submenu=fm
        func add(_ menu:NSMenu,_ title:String,_ action:Selector,_ key:String,_ modifiers:NSEvent.ModifierFlags = [.command]) { let item=NSMenuItem(title:title,action:action,keyEquivalent:key);item.target=self;item.keyEquivalentModifierMask=modifiers;menu.addItem(item) }
        add(fm,tr("new"),#selector(newDocument(_:)),"n");add(fm,tr("open"),#selector(openDocument(_:)),"o")
        recentMenu = NSMenu(title:tr("recent"));let recent=NSMenuItem(title:tr("recent"),action:nil,keyEquivalent:"");recent.submenu=recentMenu;fm.addItem(recent);updateRecent()
        fm.addItem(.separator());add(fm,tr("save"),#selector(save(_:)),"s");add(fm,tr("saveAs"),#selector(saveAs(_:)),"s",[.command,.shift]);add(fm,tr("exportPdf"),#selector(exportPDF(_:)),"");fm.addItem(.separator());fm.addItem(withTitle:tr("close"),action:#selector(NSWindow.performClose(_:)),keyEquivalent:"w")
        let edit=NSMenuItem();bar.addItem(edit);let em=NSMenu(title:tr("edit"));em.delegate=self;edit.submenu=em
        for (title,action,key) in [(tr("undo"),Selector(("undo:")),"z"),(tr("cut"),#selector(NSText.cut(_:)),"x"),(tr("copy"),#selector(NSText.copy(_:)),"c"),(tr("paste"),#selector(NSText.paste(_:)),"v"),(tr("selectAll"),#selector(NSText.selectAll(_:)),"a")] { em.addItem(withTitle:title,action:action,keyEquivalent:key) }
        let view=NSMenuItem();bar.addItem(view);let vm=NSMenu(title:tr("view"));view.submenu=vm
        for (title,value,key) in [(tr("preview"),"preview","1"),(tr("editor"),"editor","2"),(tr("horizontal"),"horizontal","3"),(tr("vertical"),"vertical","4")] { let item=NSMenuItem(title:title,action:#selector(layout(_:)),keyEquivalent:key);item.target=self;item.representedObject=value;vm.addItem(item) }
        vm.addItem(.separator())
        let languageItem = NSMenuItem(title:tr("language"),action:nil,keyEquivalent:"");let languageMenu = NSMenu(title:tr("language"));languageItem.submenu=languageMenu;vm.addItem(languageItem)
        let selected = preferences.string(forKey:"language") ?? "system"
        for (id,name) in [("system",tr("systemLanguage"))] + languageNames {
            let item=NSMenuItem(title:name,action:#selector(chooseLanguage(_:)),keyEquivalent:"");item.target=self;item.representedObject=id;item.state = id == selected ? .on : .off;languageMenu.addItem(item)
        }
        let help=NSMenuItem();bar.addItem(help);let hm=NSMenu(title:tr("help"));help.submenu=hm
        add(hm,tr("syntax"),#selector(showMarkdownHelp(_:)),"")
    }
}
let app=NSApplication.shared
let delegate=AppDelegate()
app.delegate=delegate
app.setActivationPolicy(.regular)
app.run()
