# MarkdownRE

MarkdownRE 是 RayStudioLabs 开发的免费开源 Markdown 阅读和编辑器。macOS 使用原生窗口；Windows 和 Linux 使用 Electron 桌面外壳，共享编辑器和预览功能。项目处于早期测试阶段，请保留重要文件的备份。

[下载测试版](https://github.com/RayStudioLabs/MarkdownRE/releases) · [MIT 许可证](LICENSE) · [第三方声明](THIRD_PARTY_NOTICES.md)

支持 Markdown 预览、Monaco 语法高亮编辑、四种窗口布局、主题、数学公式及 PDF 导出。编辑工具栏提供常用 Markdown 格式快捷按钮，点击即可插入或切换格式，无需记住每种语法。安装包目前提供 macOS Apple Silicon 和 Windows/Linux x64 版本；Windows/Linux 当前发布包由 macOS 交叉构建，尚未在对应系统实机验证。

## 界面语言

在系统菜单「显示 / View → 语言 / Language」中，可选择跟随系统或手动切换简体中文、繁体中文、英语、德语、法语、西班牙语、日语、韩语、葡萄牙语（巴西）和意大利语。选择会保存，并同步到打开的窗口。系统语言不受支持时默认使用英语；葡萄牙语地区统一使用巴西葡萄牙语。

应用菜单、工具栏、帮助和常见提示使用共享翻译。Monaco 编辑器自身的部分内置界面仍显示英语，原生系统对话框的系统按钮由操作系统控制。初版译文含机器翻译，欢迎母语使用者提交校对。

## 版本号

使用 `主版本.次版本.修订号`（语义化版本）。兼容的错误修复递增修订号，兼容的新功能递增次版本；不兼容的变更递增主版本。`0.x` 阶段尚未稳定，可能发生不兼容调整；此类调整递增次版本并在发行说明中标明。各平台保持相同版本号，关于窗口仅显示该版本号。

## 本地构建

需要 macOS、Xcode 命令行工具、Node.js 和 npm：

```sh
npm ci
npm test
./scripts/build-macos.sh
open build/MarkdwonRE.app
```

构建脚本产生当前机器架构的本地签名应用，不是公证或发行版。目标系统为 macOS 13 及以上，但尚未完成不同系统版本的实机验证。

`build/MarkdwonRE.app` 固定使用开发标识 `org.markdownre.app.development`，设置与安装版隔离。DMG 中的安装版使用 `org.markdownre.app`。两种构建的文件名都保持 `MarkdwonRE.app`；请通过 DMG 安装，避免用开发副本替换安装版。

### macOS 拖放安装镜像

```sh
./scripts/build-dmg.sh
```

脚本还需要 Python 3.10 或更新版本，并在 `build/dmg-tools/` 中安装固定版本的打包工具。生成的 `build/MarkdownRE-<版本>-<架构>.dmg` 使用与 SleepControl 相同的拖放安装界面；打开后将应用拖到 Applications 文件夹，再推出磁盘映像即可。镜像只支持构建机器的处理器架构。

替换安装后，先从**访达 → 应用程序**双击 `MarkdwonRE.app` 启动一次，再查看系统的应用列表。本地试用包在首次启动前可能仍处于 Launch Services 的 `launch-disabled` 状态；不要通过反复运行 `lsregister -f` 来修复图标，这可能重新触发该状态。

当前构建使用 ad-hoc 签名，未经 Apple 公证；如果 macOS 阻止打开，请先确认安装包来源，再到「系统设置 → 隐私与安全性」中允许打开。

验证开发包与安装镜像的标识、图标及签名：

```sh
./tests/macos-packaging.sh build/MarkdownRE-0.2.0-arm64.dmg
```

该检查只挂载镜像到临时目录，不安装或启动应用。

## 当前状态

通过“文件 → 另存为…”选择 PDF，或使用“文件 → 导出为 PDF…”，可将当前预览导出为浅色、A4 分页的 PDF。能在单页容纳的章节会尽量保持完整；上级标题、简介与第一个小节的开头会尽量放在一起。单页能容纳的表格会保持完整，较长表格按行分页并在续页重复表头。导出包含当前编辑内容，不会保存或更改原 Markdown 文档。远程图片需在导出时能够加载。

原型包含 Swift/AppKit 窗口与文件处理、WKWebView、Monaco 编辑器，以及基于 unified / remark / MathJax 的预览管线。预览管线有初步自动测试；应用的图形交互、文件类型关联、分隔与设置持久化、相对图片和编辑保存等功能仍需端到端测试。公式的 `\\(...\\)` 和 `\\[...\\]` 分隔符、Mermaid、完整的主题自定义等尚待实现或核实。

MarkdownRE 采用 MIT 许可证。应用包含的第三方组件许可见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) 和 [THIRD_PARTY_LICENSES.txt](THIRD_PARTY_LICENSES.txt)。更新依赖后，可运行 `node scripts/generate-third-party-licenses.mjs` 更新许可汇总，并使用 `--check` 验证。

## Windows / Linux 版本

Windows 与 Linux 共用 `desktop/` 中的 Electron 外壳，继续复用 `web/` 的编辑器、预览、主题和工具栏。原 macOS Swift 外壳及 `scripts/build-macos.sh` 保留。

使用 Node.js 24 LTS，在源码目录执行：

```sh
npm ci
npm test
npm run start:desktop
```

桌面版支持多窗口、打开/新建/保存/另存为、退出前保存提示、外部文件修改检测、UTF-8/UTF-16（BOM）与换行符保留、相对路径图片、主题与分栏比例持久化。Windows/Linux 使用 Ctrl 快捷键。Markdown 预览不具有 Node.js 或任意文件访问权限；本地图片仅限当前文档目录及其子目录，符号链接也不能越界。

### 打包

```sh
# 在 Windows 上：NSIS 安装程序 + ZIP 便携包，x64
npm run dist:win
# 在 Linux 上：AppImage + tar.gz 便携包，x64
npm run dist:linux
# macOS 交叉打包便携版：Windows ZIP + Linux tar.gz，x64
npm run dist:portable
```

产物位于 `release/`。Windows ZIP 解压后运行 `MarkdownRE.exe`；Linux tar.gz 解压后运行 `./markdownre`。Linux 需要桌面图形环境和 Chromium 依赖（GTK、NSS、ALSA 等），tar.gz 不是完全静态程序。AppImage 在部分系统还需 FUSE 支持。默认构建没有代码签名。

Windows NSIS 安装程序提供 Markdown 文件类型和 MR 文档图标；如系统已有默认应用，需在 Windows 默认应用设置中选择 MarkdownRE。ZIP 便携版不会安装文件关联。

Linux 桌面环境的文档图标按 MIME 类型和图标主题决定，并不一定跟随默认打开程序。需要 MR 文档图标时，可主动运行源码中的 `desktop/assets/install-linux-document-icons.sh install`；tar.gz 解压版中对应脚本位于 `resources/markdown-document-icons/`。该操作只修改当前用户的 `text/markdown` 图标，可能影响所有 Markdown 文件，即使以后更换默认应用。运行同一脚本的 `uninstall` 可移除这些图标；脚本会拒绝覆盖已有的不同用户图标。部分图标主题或文件管理器的缩略图预览可能优先显示其他图像，可能需要刷新文件管理器。

`.github/workflows/desktop.yml` 在 Windows 与 Ubuntu runner 上分别测试、打包并上传构建产物，不自动发布 Release。ARM64 可使用 electron-builder 的 `--arm64` 参数单独构建，目前交付以 x64 为主。

### 桌面集成验证

```sh
npm run test:desktop
# 无显示器的 Linux CI
xvfb-run -a npm run test:desktop
```

集成测试使用临时文档，覆盖打开、相对路径图片、编辑、保存、预览、未保存关闭时取消；不会修改用户文档。测试会启动真实 Electron 窗口。隔离的 CI 或容器测试中可使用 `ELECTRON_TEST_CONTAINER=1`，正式启动不关闭沙箱。

实现参考：[Electron 安全文档](https://www.electronjs.org/docs/latest/tutorial/security)、[自定义协议](https://www.electronjs.org/docs/latest/api/protocol)、[electron-builder 多平台构建](https://www.electron.build/multi-platform-build)。
