import Foundation
import Network
import UniformTypeIdentifiers

// A random per-launch URL capability prevents unrelated local processes from guessing document paths.
final class ResourceServer {
    let token = UUID().uuidString
    private let listener: NWListener
    private let queue = DispatchQueue(label: "MarkdownRE.resources")
    private let lock = NSLock()
    private var folders: [String: URL] = [:]
    private(set) var port: UInt16 = 0
    private let resources: URL

    init(resources: URL) throws {
        self.resources = resources.standardizedFileURL.resolvingSymlinksInPath()
        let params = NWParameters.tcp
        params.requiredLocalEndpoint = .hostPort(host: "127.0.0.1", port: .any)
        listener = try NWListener(using: params, on: .any)
        let ready = DispatchSemaphore(value: 0)
        listener.stateUpdateHandler = { [weak self] state in
            switch state {
            case .ready: self?.port = self?.listener.port?.rawValue ?? 0; ready.signal()
            case .failed: ready.signal()
            default: break
            }
        }
        listener.newConnectionHandler = { [weak self] connection in self?.accept(connection) }
        listener.start(queue: queue)
        guard ready.wait(timeout: .now() + 5) == .success, port != 0 else { throw NSError(domain: "ResourceServer", code: 1) }
    }
    var origin: String { "http://127.0.0.1:\(port)/\(token)/" }
    func setFolder(_ folder: URL?, for id: String) {
        lock.lock(); defer { lock.unlock() }
        folders[id] = folder?.standardizedFileURL.resolvingSymlinksInPath()
    }
    private func accept(_ connection: NWConnection) {
        connection.start(queue: queue)
        connection.receive(minimumIncompleteLength: 1, maximumLength: 16384) { [weak self] data, _, _, _ in
            guard let self = self, let data = data, let request = String(data: data, encoding: .utf8), let first = request.components(separatedBy: "\r\n").first else { connection.cancel(); return }
            let parts = first.split(separator: " ")
            guard parts.count >= 2, parts[0] == "GET", let path = String(parts[1]).split(separator: "?", maxSplits: 1).first?.removingPercentEncoding else { self.reply(connection, status: "400 Bad Request"); return }
            let segments = path.split(separator: "/").map(String.init)
            guard segments.first == self.token, !segments.contains(".."), !segments.contains(".") else { self.reply(connection, status: "403 Forbidden"); return }
            var root = self.resources
            var rest = Array(segments.dropFirst())
            if rest.first == "doc" {
                guard rest.count >= 3 else { self.reply(connection, status: "404 Not Found"); return }
                self.lock.lock(); let folder = self.folders[rest[1]]; self.lock.unlock()
                guard let folder = folder else { self.reply(connection, status: "404 Not Found"); return }
                root = folder; rest.removeFirst(2)
            }
            if rest.isEmpty { rest = ["index.html"] }
            let file = rest.reduce(root) { $0.appendingPathComponent($1) }.standardizedFileURL.resolvingSymlinksInPath()
            guard file.path.hasPrefix(root.path + "/"), let contents = try? Data(contentsOf: file, options: .mappedIfSafe) else { self.reply(connection, status: "404 Not Found"); return }
            let type = UTType(filenameExtension: file.pathExtension)?.preferredMIMEType ?? "application/octet-stream"
            self.reply(connection, status: "200 OK", type: type, body: contents)
        }
    }
    private func reply(_ connection: NWConnection, status: String, type: String = "text/plain", body: Data = Data()) {
        let headers = "HTTP/1.1 \(status)\r\nContent-Type: \(type)\r\nContent-Length: \(body.count)\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nReferrer-Policy: no-referrer\r\nConnection: close\r\n\r\n"
        var response = Data(headers.utf8); response.append(body)
        connection.send(content: response, completion: .contentProcessed { _ in connection.cancel() })
    }
}
