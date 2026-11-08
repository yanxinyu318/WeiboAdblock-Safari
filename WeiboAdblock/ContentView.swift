import SwiftUI

/// 容器 App 本身不播放、不联网、不存数据，只是一张说明书：
/// 真正干活的是内嵌的 Safari 扩展，在 Safari 里打开微博时自动运行。
struct ContentView: View {
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("微博去广告")
                    .font(.largeTitle)
                    .bold()
                Text("版本 1.0.0")
                    .foregroundStyle(.secondary)

                Text("这是一个 Safari 扩展的容器 App。扩展装好后，在 Safari 里打开微博，信息流里的广告、热推、推广微博会被自动移除，热搜里的推广条目也会去掉。")
                    .font(.body)

                Text("怎么开启")
                    .font(.headline)
                Text("1. 打开“设置”>“Safari 浏览器”>“扩展”。\n2. 找到“微博去广告”，打开开关。\n3. 点进“微博去广告”，把网站访问权限设为“所有网站”（只对 weibo.com / weibo.cn 生效）。\n4. 回到 Safari 打开微博即可。")
                    .font(.body)

                Text("右下角的小气泡")
                    .font(.headline)
                Text("刷微博时右下角会显示“已屏蔽 N 条”。点一下暂停，再点一下恢复；双击可以把气泡藏起来。")
                    .font(.body)

                Text("失效了怎么办")
                    .font(.headline)
                Text("微博改版后角标文字或页面结构变了，扩展可能失效。那时等新版，或把失效时的截图和现象告诉作者。")
                    .font(.body)

                Text("本扩展只在你自己的浏览器里隐藏广告展示，不改账号、不碰数据、不发任何请求。")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
            .padding()
        }
    }
}
