# Windows / Linux 构建验证（2026-10-31）

当前版本：0.1.0，目标架构：x64。

- `npm test`：46 项通过，包含格式命令、渲染、滚动同步、主题，以及新增的编码/换行符往返、原子保存、外部修改保护、目录越界和符号链接检查。
- `npm run test:desktop`：在 macOS 上运行共享 Electron 外壳，验证打开、编辑、保存、预览、相对路径图片、渲染进程没有 Node.js、未保存时取消关闭。
- Linux：使用 Debian 12 x64 容器和 Xvfb 运行实际打包的 Linux 可执行文件，通过相同桌面集成测试。宿主为 Apple Silicon，通过容器的 x64 兼容运行；并非各发行版的物理桌面测试。测试容器使用 `--no-sandbox`，发行版程序默认保留沙箱。
- Windows：交叉构建 NSIS 安装程序及 ZIP；已核对 x64 PE 文件和包内源码。尚未在 Windows 系统上执行安装或桌面集成测试。
- 包内 `main.cjs`、文件模块、preload、入口 HTML 与工作区一致。

产物：Windows `.exe`/`.zip`，Linux `.AppImage`/`.tar.gz`。均为未签名测试版；`release/SHA256SUMS.txt` 提供校验和。

`.github/workflows/desktop.yml` 已配置 Windows 和 Ubuntu 原生 runner 的单元测试、桌面集成测试及打包，但尚未推送或运行远程工作流。
