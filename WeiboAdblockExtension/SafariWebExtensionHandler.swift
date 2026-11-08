import SafariServices
import os.log

/// Safari Web Extension 的原生桥接（标准模板）。
/// 本扩展的去广告逻辑全部在 Resources/content.js 里跑，
/// 不需要原生侧收发消息，这里只保留模板实现以备后用。
class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {
    func beginRequest(with context: NSExtensionContext) {
        let item = context.inputItems[0] as! NSExtensionItem
        let message = item.userInfo?[SFExtensionMessageKey] as? [String: Any]
        os_log(.default, "Received message from browser.runtime.sendNativeMessage: %@", message as! CVarArg)
        let response = NSExtensionItem()
        response.userInfo = [SFExtensionMessageKey: ["Response to": message as Any]]
        context.completeRequest(returningItems: [response], completionHandler: nil)
    }
}
