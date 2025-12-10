# Release Notes 1.5.0

## [1.5.0] - 2025-12-11

<details>
<summary>简体中文 (点击展开)</summary>

##

#### 非常多的新内容，已总结到README，这里再简略展示一遍

## 国际化支持
- **功能**：集成 Solid-JS i18n 实现中英文双语界面
- **操作**：通过右上角语言按钮切换显示语言
- **状态**：目前仅支持中英文，部分文本可能有纰漏

## 便携终端（实验）
- **功能**：内置 PowerShell 环境，支持 scoop 前缀自动填充
- **特性**：
  - 可省略 `scoop` 前缀输入命令
  - 提供自动补全开关
  - 可用于添加私人仓库

## Scoop 配置文件编辑器
- **功能**：快速查看与编辑 Scoop 配置文件

## 软件包信息界面优化
- **新增功能**：
  - 仓库切换：解决 Bucket 失效/改名/调试问题
  - 操作二次确认：防止误更新或卸载
- **界面优化**：
  - 支持操作面板最小化
  - 重构 `OperationModal` 组件
- **注意**：不建议同时运行多个 Scoop 实例时使用最小化功能

## Scoop 路径自动识别
- **功能**：自动识别 Scoop 安装路径
- **特性**：检测目录结构是否符合 GUI 预期
- **位置**：“设置”页面的“管理”分页

## 更新通道切换
- **功能**：支持切换不同更新通道（仅供测试）

## Rscoop 配置管理（实验性）
- **功能**：完善本地数据存储机制
- **数据位置**：
  - `C:\Users\<Username>\AppData\Roaming\com.rscoop.app`（用户数据）
  - `C:\Users\<Username>\AppData\Local\com.rscoop.app`（Webview 缓存）
- **管理功能**：
  - 调整日志保存时间
  - 删除 Rscoop 配置与缓存文件
- **补充**：不会修改 Scoop 本体的任何数据

## 全局更新按钮
- **功能**：全局右下角显示“全部更新”动画按钮
- **特性**：
  - 提供显示/隐藏开关
  - 动画效果
- **注意**：Rscoop 已实现定时自动更新功能

## 大量 UI/结构/逻辑调整
### 搜索页面
- 添加刷新按钮与仓库过滤
- 显示软件包 manifest.json 更新日期
- 添加分页功能（每页上限 8 个条目）

### 仓库页面
- 优化布局与附加信息展示
- 重构本地仓库获取刷新逻辑
- 为 Git 仓库更新添加进度条与取消操作

### 软件包页面
- 优化排版与视觉效果
- 重构软件包信息页面

### 诊断页面
- 新增多个功能模块
- 优化排版展示，补全图标

### 设置页面
- 优化各组件排版
- 新增静默更新选项
- 添加更新历史记录（实验性）
- 重构 Scoop 路径识别逻辑
- 添加全局更新按钮可见性开关
- 关于页面添加更新通道切换
- 添加软件数据管理（实验性）

## 后端优化
- 重构核心数据获取与缓存逻辑
- 优化错误处理与状态管理机制
- 改进多模块间的通信效率

</details>

##

<details>
<summary>English Version (Click to expand)</summary>

# Release Notes 1.4.7

#### Many new features. They have been summarized in the README.Here is a brief overview.

## Internationalization Support
- **Feature**: Integrated Solid-JS i18n for bilingual English/Chinese interface.
- **Operation**: Switch display language via the button in the top-right corner.
- **Status**: Currently supports only English and Chinese. Some text may contain inaccuracies.

## Portable Terminal (Beta)
- **Feature**: Built-in PowerShell environment with automatic `scoop` prefix filling.
- **Features**:
  - Allows entering commands without the `scoop` prefix.
  - Provides a switch to toggle auto-completion.
  - Can be used to add private Bucket.

## Scoop Configuration File Editor
- **Feature**: Quickly view and edit Scoop configuration files.

## Improved Package Information Interface
- **New Features**:
  - Repository Switching: Resolve issues with invalid/renamed/debugging Buckets.
  - Operation Confirmation: Prevents accidental updates or uninstalls.
- **Interface Improvements**:
  - Supports minimizing operation panels.
  - Refactored the `OperationModal` component.
- **Note**: It is not recommended to use the minimize feature while running multiple Scoop instances simultaneously.

## Automatic Scoop Path Detection
- **Feature**: Automatically detects the Scoop installation path.
- **Features**: Checks if the directory structure meets GUI expectations.
- **Location**: "Management" tab in the "Settings" page.

## Update Channel Switching
- **Feature**: Supports switching between different update channels (for testing only).

## Rscoop Configuration Management (Experimental)
- **Feature**: Improved local data storage mechanism.
- **Data Locations**:
  - `C:\Users\<Username>\AppData\Roaming\com.rscoop.app` (User Data)
  - `C:\Users\<Username>\AppData\Local\com.rscoop.app` (Webview Cache)
- **Management Functions**:
  - Adjust log retention period.
  - Delete Rscoop configuration and cache files.
- **Note**: Does not modify any data of the Scoop itself.

## Global Update Button
- **Feature**: An animated "Update All" button is displayed globally in the bottom-right corner.
- **Features**:
  - Provides a visibility toggle.
  - Includes animation effects.
- **Note**: Rscoop already implements scheduled automatic updates.

## Extensive UI/Structure/Logic Adjustments
### Search Page
- Added refresh button and repository filtering.
- Displays the update date of the package's `manifest.json`.
- Added pagination (up to 8 entries per page).

### Buckets Page
- Optimized layout and additional information display.
- Refactored logic for fetching and refreshing local Buckets.
- Added progress bars and cancel operations for Git repository updates.

### Packages Page
- Optimized layout and visual effects.
- Refactored the package information page.

### Doctor Page
- Added multiple new functional modules.
- Optimized layout display and completed icons.

### Settings Page
- Optimized component layouts.
- Added silent update option.
- Added update history (experimental).
- Refactored Scoop path detection logic.
- Added visibility toggle for the global update button.
- Added update channel switching on the About page.
- Added software data management (experimental).

## Backend Optimization
- Refactored core data fetching and caching logic.
- Optimized error handling and state management mechanisms.
- Improved communication efficiency between modules.

---
</details>