<div align="center">

# Rscoop-Fork
[English](README_en.md) | 简体中文

[Rscoop Doc](https://github.com/AmarBego/Rscoop/blob/main/README.md)

</div>

---

## 关于
 

Rscoop 是一个开源、轻量、全面的 Scoop GUI管理器项目，上游作者AmarBego依然在持续更新维护。
我的Fork仓库添加了上游尚未实现的多个功能，因过度修改暂不计划PR。
由于只有我一人测试，可能会有很多潜在问题无法发现。

~~推荐使用exe而非MSI安装。~~
已将使用NSIS打包替换MSI，推荐使用setup.exe安装，当然也提供了便携版。
安装了旧版本（1.4.7及之前）的请卸载后，安装新版本。

大部分功能已实现，现在有计划添加Scoop本体的快捷安装。不过Scoop安装方式简单又多样，添加到GUI有点冗余了。

## 功能

已实现的功能可参考上游仓库文档，这里仅详细介绍新增的功能。

---

### 🌐 i18n 国际化支持

<details>
<summary>点击展开</summary>
<br>

使用 [Solid-JS i18n](https://primitives.solidjs.community/package/i18n/) 实现了项目国际化。  
目前只有中英切换，部分文本可能有纰漏。<br>
![i18n](docs/assets/images/i18n.png)
>可从右上角语言按钮切换显示语言
</details>

##

### 📲 便携终端（实验）
<details>
<summary>点击展开</summary>
<br>

理论上就是一个Powershell  
添加了自动 `scoop` 前缀模式（可开关）  
输入Scoop命令时可以省略 `scoop` 五个字母和一个空格。~~（气笑了）~~<br>
![Scoop Commands Input Field](docs/assets/images/CommandsInput.gif)

**注意：**
部分情况GUI不能显示一些错误信息，在各种类终端界面都有这个问题。
>位于“诊断”页面
</details>

##

### 🗒️ Scoop 配置文件编辑器

<details>
<summary>点击展开</summary>
<br>

添加了Scoop配置管理组件，快速更改Scoop config文件内容<br>

![ScoopConfig](docs/assets/images/ScoopConfig.png)
>位于“诊断”页面
</details>

##

### ✨ 更好的软件包信息界面

<details>
<summary>点击展开</summary>
<br>

添加了“更改仓库”功能，用于解决 Bucket 失效/改名/调试等问题。  
为“更新”与“卸载”添加二次确认按钮，防止误操作。  
同时对上游`OperationModal`进行了重构，现支持单个面板最小化。<br>

**注意：** 多实例最小化组件 暂时没有解决的头绪，非常不建议同时调用多个Scoop运行，最小化仅用于临时查看其他信息。

![PackageInfo](./docs/assets/images/Packageinfo.gif)

</details>

##

### ⚙️ Scoop 路径自动识别

<details>
<summary>点击展开</summary>
<br>

现在软件可以自动识别Scoop路径，  
并检测Scoop目录结构是否符合GUI预期，防止出现潜在的问题（未经广泛测试）<br>

![AutoDetect](docs/assets/images/AutoDetect.png)
>位于“设置”页面的“管理”分页
</details>

##

### 🔀 更新通道切换

<details>
<summary>点击展开</summary>
<br>

仅供测试，弄出来主要还是练手。Action 工作流经常看的我头大...<br>

**注意：** 切换通道后需要重启才能正确获取更新信息。

![UpdateChannel](docs/assets/images/UpdateChannel.png)

</details>

##

### 💼 Rscoop 配置管理（实验）
<details>
<summary>点击展开</summary>
<br>

完善了软件的Tauri Store插件使用，现在数据会保存在本地
```
C:\Users\<Username>\AppData\Romaing\com.rscoop.app (用户数据)
C:\Users\<Username>\AppData\Local\com.rscoop.app (Webview缓存)
# 卸载软件时可选清理
```
可以调整 Rscoop 日志的保存时间、删除 Rscoop 产生的配置与缓存文件  
**不会**修改 Scoop 本体的任何数据。<br>

![RscoopData](docs/assets/images/RscoopData.png)

</details>

##

### ⬆️ 全局更新按钮
<details>
<summary>点击展开</summary>
<br>

懒人专用，会全局在右下角显示“全部更新”的动画按钮 ~~,动画很Q弹~~。  
当然 Rscoop 目前已实现定时自动 仓库/软件包 更新（由原作者AmarBego添加），所以我提供了这个按钮显示的开关。<br>

![UpdateAllButton](docs/assets/images/UpdateAllButton.png)

</details>

##

### ✨ 大量 UI/结构/逻辑 调整

<details>
<summary>点击展开</summary>
<br>

**搜索页面：**
- 添加了刷新按钮与仓库过滤
- 为搜索列表的软件包添加了对应mainfest.json的更新日期
- 为搜索列表添加了分页功能，防止大量数据导致卡顿（每页上限8个条目）
- "..."

**仓库页面：**
- 优化了布局与附加信息展示
- 重构了本地仓库的获取刷新逻辑
- 为Git仓库更新添加了进度条与取消操作
- "..."

**软件包页面：**
- 优化了排版与视觉效果
- 重构了软件包信息页面，添加多个新功能与信息展示
- "..."

**诊断页面：**
- 添加了上面介绍的多个新功能
- 优化了排版展示，补全了图标

**设置页面：**
- 优化了各个组件的排版
- 为自动更新添加了静默更新，防止OperationModal弹出
- 添加了更新历史记录（实验）
- 重构了Scoop路径识别逻辑，添加了结构验证
- ~~添加了自动启动~~ 上游已合并
- 添加了全局更新按钮的可见性开关
- 关于页面添加了更新通道切换
- 添加了软件数据管理（实验）
- "..."

**后端优化：**
- 重构了核心数据获取与缓存逻辑
- 优化了错误处理与状态管理机制
- 改进了多模块间的通信效率
- "..."

再次感谢AmarBego提供了拥有完善的基础功能的Rscoop。

</details>
