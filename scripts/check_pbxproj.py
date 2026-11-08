#!/usr/bin/env python3
"""本地校验 WeiboAdblock 工程结构（不用 Xcode）。

检查：
  1. project.pbxproj 里每个 `ID /* comment */` 引用都有对应对象定义；
  2. 每个 PBXFileReference 的 path（按所属 group 的 path 拼接）在磁盘上真实存在；
  3. 每个 target 的 buildPhases / dependencies 引用的对象都存在；
  4. UUID 无重复；scheme 里的 BlueprintIdentifier 与 target UUID 一致；
  5. workspace 引用了 WeiboAdblock.xcodeproj。
用法：python3 scripts/check_pbxproj.py   （在仓库根目录运行）
退出码 0 = 全部通过。
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PBXPROJ = os.path.join(ROOT, "WeiboAdblock.xcodeproj", "project.pbxproj")
SCHEME = os.path.join(
    ROOT, "WeiboAdblock.xcodeproj", "xcshareddata", "xcschemes", "WeiboAdblock.xcscheme"
)
WORKSPACE = os.path.join(ROOT, "WeiboAdblock.xcworkspace", "contents.xcworkspacedata")

failures = []


def check(name, cond, detail=""):
    print(("PASS" if cond else "FAIL") + " - " + name + ((" :: " + detail) if detail and not cond else ""))
    if not cond:
        failures.append(name)


def main():
    text = open(PBXPROJ, encoding="utf-8").read()

    # 1. 所有定义的对象 ID（注释可有可无：主 group 在 Xcode 生成的文件里就没有注释）。
    #    必须紧跟 `isa =` 才算定义：PBXProject 的 TargetAttributes 里也有裸 UUID，
    #    那只是引用，不是定义，不能算重复。
    defined = {}
    for m in re.finditer(r"^\s*([0-9A-F]{24})\s*(?:/\*[^*]*\*/\s*)?=\s*\{\s*isa = ", text, re.M):
        defined.setdefault(m.group(1), 0)
        defined[m.group(1)] += 1
    check("pbxproj 对象定义数 > 0", len(defined) > 0, f"found {len(defined)}")
    dupes = [k for k, v in defined.items() if v > 1]
    check("UUID 无重复定义", not dupes, f"dupes: {dupes}")

    # 2. 所有引用都有定义（排除注释行里的、以及 rootObject 行）
    refs = set(re.findall(r"\b([0-9A-F]{24})\b", text))
    missing = sorted(r for r in refs if r not in defined)
    check("全部引用都有对应定义", not missing, f"missing: {missing}")

    # 3. PBXFileReference 的 path 在磁盘上存在
    #    先算 group 的 path：group 对象 -> {id: (name/path, parent)}
    groups = {}
    for m in re.finditer(
        r"^\s*([0-9A-F]{24})\s*(?:/\*[^*]*\*/\s*)?=\s*\{\s*isa = PBXGroup;(.*?)\n\t\t\};",
        text, re.M | re.S,
    ):
        body = m.group(2)
        path_m = re.search(r"\bpath = ([^;]+);", body)
        name_m = re.search(r"\bname = ([^;]+);", body)
        children = re.findall(r"([0-9A-F]{24})\s*/\*", body.split("children = (", 1)[1].split(");", 1)[0]) if "children = (" in body else []
        groups[m.group(1)] = {
            "path": path_m.group(1).strip() if path_m else None,
            "name": name_m.group(1).strip() if name_m else None,
            "children": children,
        }

    def group_path(gid, seen=None):
        # 拼出 group 从根到该节点的相对路径
        seen = seen or set()
        parts = []
        cur = gid
        while cur in groups and cur not in seen:
            seen.add(cur)
            g = groups[cur]
            if g["path"]:
                parts.append(g["path"])
            # 找父 group：哪个 group 的 children 包含 cur
            parent = None
            for pid, pg in groups.items():
                if cur in pg["children"]:
                    parent = pid
                    break
            cur = parent
        return "/".join(reversed(parts))

    filerefs = {}
    for m in re.finditer(
        r"^\s*([0-9A-F]{24})\s*/\* ([^*]*?) \*/\s*=\s*\{\s*isa = PBXFileReference;(.*?)\n\t\t\};",
        text, re.M | re.S,
    ):
        fid, fname, body = m.group(1), m.group(2), m.group(3)
        path_m = re.search(r"\bpath = ([^;]+);", body)
        src_m = re.search(r"sourceTree = ([^;]+);", body)
        filerefs[fid] = {
            "name": fname,
            "path": path_m.group(1).strip().strip('"') if path_m else None,
            "sourceTree": src_m.group(1).strip().strip('"') if src_m else None,
        }
    check("PBXFileReference 解析出条目", len(filerefs) > 0, f"found {len(filerefs)}")

    for fid, fr in filerefs.items():
        if fr["sourceTree"] in ("BUILT_PRODUCTS_DIR", "SDKROOT"):
            continue  # 构建产物 / 系统框架，不在磁盘上
        # 找到包含该 fileref 的 group
        owner = None
        for pid, pg in groups.items():
            if fid in pg["children"]:
                owner = pid
                break
        base = group_path(owner) if owner else ""
        full = os.path.join(ROOT, base, fr["path"]) if fr["path"] else None
        check(f"文件存在: {fr['name']}", bool(full) and os.path.exists(full), f"missing {full}")

    # 4. 每个 target 的 buildPhases / dependencies 引用存在
    for m in re.finditer(
        r"^\s*([0-9A-F]{24})\s*/\* ([^*]*?) \*/\s*=\s*\{\s*isa = PBXNativeTarget;(.*?)\n\t\t\};",
        text, re.M | re.S,
    ):
        tid, tname, body = m.group(1), m.group(2), m.group(3)
        for key in ("buildPhases", "dependencies", "buildConfigurationList"):
            sec = re.search(key + r" = \((.*?)\);", body, re.S)
            ids = re.findall(r"([0-9A-F]{24})", sec.group(1)) if sec else []
            check(f"target {tname} 的 {key} 引用存在", all(i in defined for i in ids),
                  f"bad: {[i for i in ids if i not in defined]}")
        pr = re.search(r"productReference = ([0-9A-F]{24})", body)
        check(f"target {tname} 的 productReference 存在", bool(pr) and pr.group(1) in defined)

    # 5. PBXBuildFile 的 fileRef / productRef 存在
    for m in re.finditer(
        r"^\s*([0-9A-F]{24})\s*/\* ([^*]*?) \*/\s*=\s*\{\s*isa = PBXBuildFile;(.*?)\};",
        text, re.M | re.S,
    ):
        body = m.group(3)
        ref = re.search(r"(?:fileRef|productRef) = ([0-9A-F]{24})", body)
        check(f"PBXBuildFile {m.group(2)} 的引用存在", bool(ref) and ref.group(1) in defined)

    # 6. scheme 的 BlueprintIdentifier 与 target UUID 一致
    scheme = open(SCHEME, encoding="utf-8").read()
    for bp in re.findall(r'BlueprintIdentifier = "([0-9A-F]{24})"', scheme):
        check(f"scheme BlueprintIdentifier {bp} 是已定义的 target", bp in defined)

    # 7. workspace 引用了本工程
    ws = open(WORKSPACE, encoding="utf-8").read()
    check("workspace 引用 WeiboAdblock.xcodeproj", "container:WeiboAdblock.xcodeproj" in ws)

    # 8. rootObject 存在
    root = re.search(r"rootObject = ([0-9A-F]{24})", text)
    check("rootObject 指向已定义的 PBXProject", bool(root) and root.group(1) in defined)

    print("ALL CHECKS PASSED" if not failures else f"{len(failures)} CHECKS FAILED")
    sys.exit(0 if not failures else 1)


if __name__ == "__main__":
    main()
