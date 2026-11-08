# BUILD_NOTES — 打包与排错记录

## 本地能验的（在 Linux 上，不用 Xcode）

```bash
# 1. 所有 plist 能解析
python3 -c "import plistlib,glob; [plistlib.load(open(f,'rb')) for f in glob.glob('**/Info.plist', recursive=True)]; print('plists OK')"
# 2. manifest.json 是合法 JSON，且字段符合要求
python3 -m json.tool WeiboAdblockExtension/Resources/manifest.json
# 3. content.js 语法
node --check WeiboAdblockExtension/Resources/content.js
# 4. pbxproj 结构：所有引用的对象都存在、所有 fileRef 的文件都在磁盘上
python3 scripts/check_pbxproj.py   # 见下
```

`check_pbxproj.py` 的逻辑：用正则从 `project.pbxproj` 里抽出全部 24 位大写十六进制 ID，检查每处 `XXXX /* ... */` 引用都有对应定义；再检查每个 `PBXFileReference` 的 `path`（按所属 group 的 path 拼接）在磁盘上存在；最后检查两个 target 的 build phase 引用都指向已定义的 phase。

## CI 打包（GitHub Actions，xcode-27）

手动触发：仓库 > Actions > Build Unsigned IPA > Run workflow。一次通常 10–20 分钟。

```bash
gh run list --repo yanxinyu318/WeiboAdblock-Safari --workflow build-unsigned-ipa.yml
gh run watch <run-id> --repo yanxinyu318/WeiboAdblock-Safari
gh run download <run-id> --repo yanxinyu318/WeiboAdblock-Safari -n WeiboAdblock-unsigned-ipa
```

## 常见失败与修法

- `error: No scheme found` / `The project does not have a scheme`
  scheme 文件不在共享位置。确认 `WeiboAdblock.xcodeproj/xcshareddata/xcschemes/WeiboAdblock.xcscheme` 已提交，且 scheme 里的 BlueprintIdentifier 与 `project.pbxproj` 里的 target UUID 一致（App：825E7358FE3C4A6583AB4AF9；扩展：5EEAE6F2EEF741379A1A8F44）。
- `error: Unable to resolve build file` / `PBXBuildFile ... fileRef ... was not found`
  `project.pbxproj` 里有悬空引用。跑 `check_pbxproj.py`，按输出补文件或删引用。
- `error: Signing for "WeiboAdblock" requires a development team`
  签名没关掉。检查三处：pbxproj 里三个配置表都有 `CODE_SIGNING_ALLOWED = NO` / `CODE_SIGNING_REQUIRED = NO`；workflow 的 xcodebuild 命令行也带了这两个参数；`TargetAttributes` 里 `DevelopmentTeam = ""`。
- `error: No such file or directory: .../WeiboAdblock.app`
  构建产物路径不对。确认 `APP_NAME` 和 scheme 名、产物名一致；看 xcodebuild 日志里 `BUILD SUCCEEDED` 后 `Products/Release-iphoneos/` 下实际的 `.app` 名字。
- `error: Safari Web Extension ... manifest.json not found` / 扩展装上但不生效
  `manifest.json` / `content.js` 没进 appex 的 Resources。检查扩展 target 的 Resources phase 里有这两个文件的 BuildFile，`manifest.json` 里 `content_scripts[0].js` 写的是 `content.js`，`matches` 覆盖了要去的域名。
- `error: Provisioning profile ... doesn't include the ... entitlement`
  扩展 target 不应引用任何 entitlements 文件。本工程没有配 entitlements；如果报错里提到 entitlements，检查是不是有人在配置里加了 `CODE_SIGN_ENTITLEMENTS`。
- `xcodebuild: error: SDK "iphoneos" cannot be located`
  runner 镜像问题，换 runner 或等 GitHub 修复，与工程无关。
- 构建成功但下载的 IPA 里没有 appex
  容器 App 的 `Embed App Extensions` 阶段丢了。检查 pbxproj：App target 的 buildPhases 包含 `PBXCopyFilesBuildPhase`（dstSubfolderSpec = 13），且 App target 的 dependencies 里有指向扩展 target 的 `PBXTargetDependency`。

## 版本号规则

- `MARKETING_VERSION`（1.0.0）在 workflow 的 env 里改；`CURRENT_PROJECT_VERSION` 由 CI 用 commit 数自动生成。
- 改了 `content.js` 的判定逻辑后，同步改 `manifest.json` 的 `version` 和 `README.md` 的版本记录。
