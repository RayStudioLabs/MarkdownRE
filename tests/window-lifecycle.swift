import PDFKit
import Vision
// AppKit lifecycle regression: use the real document window and owner, without
// showing a window or touching any user documents.
let testApp = NSApplication.shared
testApp.setActivationPolicy(.prohibited)
let testDelegate = AppDelegate()
testDelegate.server = try ResourceServer(resources: URL(fileURLWithPath: CommandLine.arguments[1]))
// The loading cover must remain until the WebView reports rendered content.
testDelegate.setupMenus()
let appMenu = testApp.mainMenu?.items.first?.submenu
let aboutItem = appMenu?.items.first
precondition(aboutItem?.title == "关于 MarkdownRE" && aboutItem?.action == #selector(AppDelegate.showAbout(_:)) && aboutItem?.target === testDelegate, "About menu is missing")
precondition(appMenu?.items.contains(where: { $0.title == "设为 .md 默认打开程序…" && $0.action == #selector(AppDelegate.setDefaultMarkdownApplication(_:)) && $0.target === testDelegate }) == true, "Default Markdown application menu is missing")
testDelegate.showAbout(nil)
precondition(testApp.windows.contains(where: { $0 is NSPanel }), "About panel did not open")
testApp.windows.filter { $0 is NSPanel }.forEach { $0.close() }
print("About menu and native panel: opened successfully")
let helpMenu = testApp.mainMenu?.items.last?.submenu
precondition(helpMenu?.title == "帮助" && helpMenu?.items.contains(where: { $0.title == "Markdown 语法" }) == true, "Help menu is missing")
let fileMenu = testApp.mainMenu?.items.first(where: { $0.submenu?.title == "文件" })?.submenu
precondition(fileMenu?.items.contains(where: { $0.title == "导出为 PDF…" && $0.action == #selector(AppDelegate.exportPDF(_:)) }) == true, "PDF export menu is missing")
let formatPanel = NSSavePanel()
formatPanel.nameFieldStringValue = "example.md"
let formatChooser = SaveFormatChooser(panel: formatPanel)
formatChooser.popup.selectItem(at: 1)
_ = NSApp.sendAction(formatChooser.popup.action!, to: formatChooser, from: formatChooser.popup)
precondition(formatPanel.allowedContentTypes == [.pdf] && formatPanel.nameFieldStringValue == "example.pdf", "Save As did not switch to PDF")
formatChooser.popup.selectItem(at: 0)
_ = NSApp.sendAction(formatChooser.popup.action!, to: formatChooser, from: formatChooser.popup)
precondition(formatPanel.nameFieldStringValue == "example.md", "Save As did not switch back to Markdown")
let helpURL = URL(fileURLWithPath: CommandLine.arguments[1]).appendingPathComponent("help.html")
let helpWindow = MarkdownHelpWindow(url: helpURL, theme: "solarized-dark")
precondition(helpWindow.window.title == "Markdown 语法" && !helpWindow.window.isReleasedWhenClosed)
let helpDeadline = Date(timeIntervalSinceNow: 8)
var helpTitle: String?
while helpTitle != "Markdown 语法" && Date() < helpDeadline {
    var checked = false
    helpWindow.web.evaluateJavaScript("document.querySelector('h1')?.textContent || ''") { result, _ in
        helpTitle = result as? String
        checked = true
    }
    while !checked && Date() < helpDeadline { RunLoop.main.run(until: Date(timeIntervalSinceNow: 0.05)) }
    if helpTitle != "Markdown 语法" { RunLoop.main.run(until: Date(timeIntervalSinceNow: 0.1)) }
}
precondition(helpTitle == "Markdown 语法", "Help page did not load")
helpWindow.window.performClose(nil)
print("Help menu and Markdown guide: loaded successfully")
let previousTheme = preferences.string(forKey: "theme")
preferences.set("solarized-dark", forKey: "theme")
let fixtureURL = URL(fileURLWithPath: FileManager.default.currentDirectoryPath).appendingPathComponent("build/lifecycle-test/startup.md")
try "# 启动测试\n\n公式 $x^2$".write(to: fixtureURL, atomically: true, encoding: .utf8)
let startTime = Date()
let startupDocument = try DocumentWindow(server: testDelegate.server, url: fixtureURL)
testDelegate.track(startupDocument)
precondition(!startupDocument.loadingView.isHidden, "Loading cover must be visible initially")
let deadline = Date(timeIntervalSinceNow: 12)
while !startupDocument.loadingView.isHidden && Date() < deadline {
    RunLoop.main.run(until: Date(timeIntervalSinceNow: 0.005))
}
precondition(startupDocument.ready && startupDocument.loadingView.isHidden, "WebView did not finish startup")
print("WebView startup measured: \(Int(Date().timeIntervalSince(startTime) * 1000)) ms (off-screen test)")
var actualTheme: String?
var actualBackground: String?
var evaluationFinished = false
startupDocument.web.evaluateJavaScript("[document.documentElement.dataset.theme, getComputedStyle(document.documentElement).backgroundColor]") { result, error in
    if let values = result as? [String], values.count == 2 {
        actualTheme = values[0]
        actualBackground = values[1]
    }
    evaluationFinished = true
}
let evaluationDeadline = Date(timeIntervalSinceNow: 5)
while !evaluationFinished && Date() < evaluationDeadline {
    RunLoop.main.run(until: Date(timeIntervalSinceNow: 0.1))
}
precondition(actualTheme == "dark" && actualBackground == "rgb(0, 43, 54)", "Saved dark theme was not applied before startup completed")
var previewTitle: String?
let previewDeadline = Date(timeIntervalSinceNow: 8)
while previewTitle != "启动测试" && Date() < previewDeadline {
    var checked = false
    startupDocument.web.evaluateJavaScript("document.querySelector('#preview h1')?.textContent || ''") { result, _ in
        previewTitle = result as? String
        checked = true
    }
    while !checked && Date() < previewDeadline { RunLoop.main.run(until: Date(timeIntervalSinceNow: 0.05)) }
    if previewTitle != "启动测试" { RunLoop.main.run(until: Date(timeIntervalSinceNow: 0.1)) }
}
precondition(previewTitle == "启动测试", "Document preview did not load")
print("Document preview loaded in \(Int(Date().timeIntervalSince(startTime) * 1000)) ms (off-screen test)")
let imageURL = fixtureURL.deletingLastPathComponent().appendingPathComponent("icon.png")
try Data(contentsOf: URL(fileURLWithPath: "macos/assets/MarkdownDocument.png")).write(to: imageURL)
let exportText = "# PDF export validation\n\nFormula: $x^2+y^2=z^2$\n\n| Name | Value |\n|---|---|\n| Example | 42 |\n\n![local image](icon.png)\n\n" + (1...50).map { "## Section \($0)\n\nParagraph with **bold** and `code`.\n\n" }.joined() + "End of exported document."
startupDocument.send(["type":"document", "text":exportText, "base":testDelegate.server.origin + "doc/\(startupDocument.id)/"])
let pdfURL = fixtureURL.deletingLastPathComponent().appendingPathComponent("export-check.pdf")
var exportResult: Bool?
startupDocument.exportPDF(to: pdfURL) { exportResult = $0 }
let exportDeadline = Date(timeIntervalSinceNow: 30)
while exportResult == nil && Date() < exportDeadline { RunLoop.main.run(until: Date(timeIntervalSinceNow: 0.05)) }
precondition(exportResult == true, "PDF export failed or timed out")
guard let pdf = PDFDocument(url: pdfURL) else { fatalError("Exported PDF could not be read") }
precondition(pdf.pageCount > 1, "Long document did not paginate")
let extracted = (0..<pdf.pageCount).compactMap { pdf.page(at: $0)?.string }.joined(separator: "\n")
precondition(extracted.contains("PDF export validation") && extracted.contains("End of exported document") && extracted.contains("Example"), "Export lost document content")
precondition(!extracted.contains("窗口布局和主题"), "Toolbar leaked into export")
print("PDF export: \(pdf.pageCount) pages, full document and table present")
func exportTableFixture(_ markdown: String, name: String) -> PDFDocument {
    startupDocument.send(["type":"document", "text":markdown, "base":testDelegate.server.origin + "doc/\(startupDocument.id)/"])
    let url = fixtureURL.deletingLastPathComponent().appendingPathComponent(name + ".pdf")
    var result: Bool?
    startupDocument.exportPDF(to: url) { result = $0 }
    let deadline = Date(timeIntervalSinceNow: 30)
    while result == nil && Date() < deadline { RunLoop.main.run(until: Date(timeIntervalSinceNow: 0.05)) }
    precondition(result == true, "Table fixture export failed")
    guard let document = PDFDocument(url: url) else { fatalError("Table fixture PDF is invalid") }
    return document
}
let filler = (1...18).map { "Filler paragraph \($0).\n\n" }.joined()
let shortTable = "| ShortHeadA | ShortHeadB |\n|---|---|\n" + (1...4).map { "| ShortRow\($0) | Value |\n" }.joined()
let shortPDF = exportTableFixture("# Short table\n\n" + filler + shortTable, name: "table-short")
// PDF text extractors may include text outside a clipping region. Inspect the
// rendered page instead, so the assertions match what readers actually see.
func visibleText(_ page: PDFPage) -> String {
    let bounds = page.bounds(for: .mediaBox)
    let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: Int(bounds.width * 2), pixelsHigh: Int(bounds.height * 2), bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    let context = NSGraphicsContext(bitmapImageRep: bitmap)!.cgContext
    context.setFillColor(NSColor.white.cgColor)
    context.fill(CGRect(x: 0, y: 0, width: bounds.width * 2, height: bounds.height * 2))
    context.scaleBy(x: 2, y: 2)
    page.draw(with: .mediaBox, to: context)
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = false
    try! VNImageRequestHandler(cgImage: bitmap.cgImage!).perform([request])
    return (request.results ?? []).compactMap { $0.topCandidates(1).first?.string }.joined(separator: "\n")
}
let shortPages = (0..<shortPDF.pageCount).map { visibleText(shortPDF.page(at: $0)!) }
let shortHeaders = shortPages.filter { $0.contains("ShortHeadA") }
precondition(shortHeaders.count == 1 && shortHeaders[0].contains("ShortRow1") && shortHeaders[0].contains("ShortRow4"), "A page-sized table must remain on one page")
let sectionFiller = (1...16).map { "Opening filler \($0).\n\n" }.joined()
let sectionText = "# Document\n\n" + sectionFiller + "## TopicHeading\n\nChapter introduction.\n\n" + shortTable + "\n## NextHeading\n\nNext paragraph.\n"
let sectionPDF = exportTableFixture(sectionText, name: "heading-section")
let sectionPages = (0..<sectionPDF.pageCount).map { visibleText(sectionPDF.page(at: $0)!) }
let topicPages = sectionPages.filter { $0.contains("TopicHeading") }
precondition(topicPages.count == 1 && topicPages[0].contains("Chapter introduction") && topicPages[0].contains("ShortHeadA") && topicPages[0].contains("ShortRow4"), "A short chapter must keep its heading, introduction and table together")
let narrativePDF = exportTableFixture("# Document\n\n" + sectionFiller + "## NarrativeHeading\n\nFirst chapter paragraph.\n\nSecond chapter paragraph.\n", name: "heading-paragraphs")
let narrativePages = (0..<narrativePDF.pageCount).map { visibleText(narrativePDF.page(at: $0)!) }
let narrative = narrativePages.filter { $0.contains("NarrativeHeading") }
precondition(narrative.count == 1 && narrative[0].contains("First chapter paragraph") && narrative[0].contains("Second chapter paragraph"), "A short text chapter must stay together")
print("PDF sections: heading, introduction and short table kept together")
let nestedTail = (1...30).map { "Later paragraph \($0).\n\n" }.joined()
let nestedText = "# Document\n\n" + sectionFiller + "## ParentHeading\n\nParent introduction.\n\n### ChildHeading\n\n" + shortTable + "\n### LaterHeading\n\n" + nestedTail
let nestedPDF = exportTableFixture(nestedText, name: "heading-nested")
let nestedPages = (0..<nestedPDF.pageCount).map { visibleText(nestedPDF.page(at: $0)!) }
let parentPages = nestedPages.filter { $0.contains("ParentHeading") }
precondition(nestedPDF.pageCount > 2 && parentPages.count == 1 && parentPages[0].contains("Parent introduction") && parentPages[0].contains("ChildHeading") && parentPages[0].contains("ShortHeadA") && parentPages[0].contains("ShortRow4"), "Parent heading and introduction must stay with the first subsection")
print("PDF nested sections: parent heading and introduction kept with first subsection")
let longTable = "| LongHeadA | LongHeadB |\n|---|---|\n" + (1...90).map { "| LongRow\($0) | Value |\n" }.joined()
let longPDF = exportTableFixture("# Long table\n\n" + filler + "## LongHeading\n\n" + longTable, name: "table-long")
let longPages = (0..<longPDF.pageCount).map { visibleText(longPDF.page(at: $0)!) }
let tablePages = longPages.filter { $0.contains("LongRow") }
precondition(tablePages.count > 1, "Long table did not span pages")
precondition(longPages.allSatisfy { $0.contains("LongHeadA") == $0.contains("LongRow") }, "Each table page must show a header and body row together")
precondition(longPages.contains { $0.contains("LongHeading") && $0.contains("LongHeadA") && $0.contains("LongRow1") }, "A long chapter heading must stay with its opening table rows")
let nestedLongPDF = exportTableFixture("# Document\n\n" + sectionFiller + "## ParentLong\n\nParent introduction.\n\n### ChildLong\n\n" + longTable, name: "heading-nested-long")
let nestedLongPages = (0..<nestedLongPDF.pageCount).map { visibleText(nestedLongPDF.page(at: $0)!) }
precondition(nestedLongPages.contains { $0.contains("ParentLong") && $0.contains("Parent introduction") && $0.contains("ChildLong") && $0.contains("LongHeadA") && $0.contains("LongRow1") }, "Parent and child headings must stay with the opening of a long table")
let rowPattern = try NSRegularExpression(pattern: "LongRow([0-9]+)")
let allTableText = longPages.joined(separator: "\n") as NSString
let rows = rowPattern.matches(in: allTableText as String, range: NSRange(location: 0, length: allTableText.length)).compactMap { Int(allTableText.substring(with: $0.range(at: 1))) }
// OCR occasionally confuses individual digits; check the page-boundary rows
// and overall row count without requiring perfect character recognition.
precondition(rows.count >= 87 && [1, 20, 21, 40, 41, 60, 61, 80, 81, 90].allSatisfy(rows.contains), "Table boundary rows are missing; recognized \(rows)")
print("PDF tables: short table kept intact; long-table headers repeated on \(tablePages.count) pages")
let snapshotStart = Date()
var snapshotFinished = false
var snapshotError: Error?
var snapshotHasImage = false
startupDocument.web.takeSnapshot(with: nil) { image, error in
    snapshotHasImage = image != nil
    snapshotError = error
    snapshotFinished = true
}
let snapshotDeadline = Date(timeIntervalSinceNow: 3)
while !snapshotFinished && Date() < snapshotDeadline { RunLoop.main.run(until: Date(timeIntervalSinceNow: 0.01)) }
precondition(snapshotFinished && snapshotHasImage && snapshotError == nil, "WebView could not prepare the first frame")
print("Off-screen first-frame snapshot prepared in \(Int(Date().timeIntervalSince(snapshotStart) * 1000)) ms")
if let previousTheme = previousTheme { preferences.set(previousTheme, forKey: "theme") }
else { preferences.removeObject(forKey: "theme") }
startupDocument.window.performClose(nil)
RunLoop.main.run(until: Date(timeIntervalSinceNow: 0.1))
precondition(testDelegate.windows.isEmpty)
print("WebView startup: rendered content released the loading cover")
for iteration in 0..<5 {
    weak var releasedDocument: DocumentWindow?
    autoreleasepool {
        let document = try! DocumentWindow(server: testDelegate.server, url: nil)
        releasedDocument = document
        precondition(!document.window.isReleasedWhenClosed)
        testDelegate.track(document)
        document.window.performClose(nil)
    }
    RunLoop.main.run(until: Date(timeIntervalSinceNow: 0.1))
    precondition(testDelegate.windows.isEmpty, "Closed document was not removed on iteration \(iteration)")
    precondition(releasedDocument == nil, "Closed document was retained on iteration \(iteration)")
}
print("Window lifecycle: 5 close operations completed without a crash or retained documents")
