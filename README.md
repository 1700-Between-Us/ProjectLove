# 两地之间 · Between Us

给异地情侣的一份小小日常。第一版采用原生 JavaScript、CSS 和 PWA，不依赖框架或数据库服务；运行、测试、构建都不需要安装 npm 依赖。

## 第一版包含什么

- 纪念日：新增、编辑、删除，单次日期或每年重复，显示倒计时 / 已过去天数。2 月 29 日在非闰年按 2 月 28 日计算。
- 悄悄话：纯文本留言、时间、未读 / 已读、本人删除；文本会转义，不执行 HTML。
- 心情：自行选择状态，可补充一句话；未设置时不会推测心情。
- 好习惯：为双方建立习惯、本人每日打卡 / 撤销、本周次数、连续天数；停用后保留记录。
- 对方城市天气：手动输入城市，显示温度、天气、体感和今日高低温；不申请定位权限。
- 奖励与积分：**只在首页预留位置，第二版再实现，没有积分或奖惩逻辑。**
- 自适应桌面与手机；PWA 图标、独立窗口和公开界面资源的离线缓存。

## 本地体验

需要 Node.js 20 或更新版本：

```sh
npm run dev
```

打开 <http://127.0.0.1:4174/>。终端需保持运行，按 Ctrl+C 停止。

开发时还可打开 <http://127.0.0.1:4174/tests/responsive.html>，同时检查 390px 与 320px 的真实 iframe 视口。该验收页不会进入部署产物。

默认进入带有虚构人物和样例数据的「本地体验空间」。修改只写入当前浏览器，不会自动上传，也不会同步到另一台设备。顶部切换使用者可演示双方视角，设置中的「恢复体验数据」会重置此设备的演示数据。

```sh
npm test
npm run build
```

构建结果在 `dist/`。每次构建会重新生成这个目录，只包含公开应用资源；**不要把自己的资料、令牌或备份放进 dist。** 源码无需构建也能运行。`scripts/generate-icons.mjs` 是可选图标开发工具，只有重做图标时才需要自行提供 sharp 包路径，普通使用不需要。

## GitHub 方案与费用

```text
公开代码仓库 → GitHub Actions → GitHub Pages（PWA 界面）
                                     ↓ 用户各自在页面内授权
                          GitHub REST API
                                     ↓
                    私有数据仓库（双方的文本 JSON）
```

不是通过互相 fork 同步日常，而是两个人读写**同一个私有数据仓库、同一分支**。代码版本用 Git；文本数据也有 Git 历史。无需租腾讯 CloudBase、VPS 或另买数据库，文本不依赖你家电脑持续开机。

小规模非商业两人使用可以先采用 GitHub Free：公开代码仓库的 Pages、组织下的私有数据仓库。仍须遵守 GitHub 的 Pages、Actions、API 限额及相关条款；免费条件和限额可能变化。GitHub Pages 本身不提供数据库、私密访问或账号密码后端。

### 重要：双人独立 Token 的仓库归属

**推荐：私有数据仓库归一个 GitHub Organization，双方都是该组织的成员，并被授予该仓库的写权限。** 不要只把另一人加成外部协作者。

GitHub 官方列出的 fine-grained PAT 限制包括：以 outside / repository collaborator 身份向他人仓库贡献内容。因此，个人账号拥有私有仓库、另一人仅为 collaborator 的方式，不能默认保证双方都能用限权 fine-grained PAT 写入。

本 demo 不建议共享仓库拥有者的令牌。Classic PAT 的 `repo` 权限可覆盖更广泛的私有仓库，不能把它当成同等安全的默认替代。

参考：[GitHub personal access token 官方说明（含限制）](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)。

## 零基础操作手册：双端同步、上线和安装

这一节从空白开始，带你完成下面这条路线：

```text
创建 GitHub Organization
        ↓
创建私有数据仓库，并给两个人写入权限
        ↓
两个人分别创建自己的 Token
        ↓
用 GitHub Desktop 上传公开网页代码
        ↓
用 GitHub Pages 发布网站
        ↓
两台设备连接同一个私有数据仓库
        ↓
安装为手机或电脑 PWA
```

第一次配置建议使用电脑完成。GitHub 页面如果显示英文，可以直接按本手册中的英文菜单名称查找。

### 开始前准备

请先确认：

- 你和女朋友分别拥有一个 GitHub 账号，并且都能正常登录、接收 GitHub 邮件。
- 电脑中已有本项目文件夹：`D:\Ethan's Work\ProjectLove`。
- 安装 [GitHub Desktop](https://desktop.github.com/)，登录准备发布代码的 GitHub 账号。
- 准备一个密码管理器或安全的离线位置临时保存 Token。**不要把 Token 发到聊天、微信或邮件，不要截屏，也不要写进代码文件。**

接下来会创建两个不同的仓库。请不要混淆：

| 仓库 | 推荐名称 | 可见性 | 存放内容 |
|---|---|---|---|
| 网页代码仓库 | `project-love` | **Public** | PWA 的公开代码，用于 GitHub Pages |
| 情侣数据仓库 | `our-days-data` | **Private** | 纪念日、留言、心情和打卡 JSON |

免费 Organization 的 GitHub Pages 要求网页代码仓库为 Public。页面界面会公开，但情侣数据保存在另一个 Private 仓库，没有 Token 的人无法读取。

### 第 1 步：创建两人共同的 Organization

如果你已经创建了 Organization，可以直接进入第 2 步。

1. 登录 GitHub，点击右上角头像。
2. 点击 **Settings**。
3. 在左侧找到 **Organizations**。
4. 点击 **New organization**。
5. 选择 **GitHub Free**。
6. 填写一个没有被占用的 Organization 名称，例如 `ethan-and-lin`。这个名称以后就是应用里的“仓库拥有者”。
7. 填写联系邮箱，按页面提示完成创建。

官方参考：[创建 GitHub Organization](https://docs.github.com/en/organizations/collaborating-with-groups-in-organizations/creating-a-new-organization-from-scratch)。

### 第 2 步：邀请另一人成为正式成员

这一步很重要。另一人必须是 Organization 的 **Member**，不要只把她设成 outside collaborator。

1. 打开刚创建的 Organization 首页。
2. 点击顶部 **People**。
3. 点击 **Invite member**。
4. 输入对方的 GitHub 用户名或注册邮箱。
5. Role 选择普通的 **Member**，不需要给 Owner 权限。
6. 发送邀请。
7. 对方打开 GitHub 邮件或 GitHub 通知，点击接受邀请。
8. 回到 Organization 的 **People** 页面，确认两个人都显示为成员。

如果对方一直没有接受邀请，后面的 Token 和私有仓库权限都可能无法正常工作。

官方参考：[邀请成员加入 Organization](https://docs.github.com/en/organizations/managing-membership-in-your-organization/inviting-users-to-join-your-organization)。

### 第 3 步：创建 Private 情侣数据仓库

1. 打开 Organization 首页。
2. 点击 **Repositories**，再点击 **New repository**。
3. Owner 必须选择你们的 Organization，不要选个人账号。
4. Repository name 填写 `our-days-data`，也可以使用其他英文名称。名称中不要使用空格。
5. Visibility 选择 **Private**。
6. 打开 **Add a README file**。这一步用于初始化仓库，不能跳过。
7. 点击 **Create repository**。
8. 创建完成后查看仓库首页，确认能看到 `README.md`，并记住默认分支名。通常是 `main`。

不要手动建立 `couple-data` 文件夹。应用第一次连接后会自动创建需要的数据文件。

### 第 4 步：给双方数据仓库写入权限

Organization Owner 默认可以管理仓库，但仍建议明确检查另一人的权限。

1. 进入 `our-days-data` 仓库。
2. 点击 **Settings**。
3. 左侧点击 **Collaborators & teams**。GitHub 可能要求再次输入密码。
4. 点击 **Add people**。
5. 搜索并选择对方的 GitHub 用户名。
6. Role 选择 **Write**。
7. 点击 **Add ... to this repository**。
8. 在 Manage access 列表中确认两个人都能访问，其中对方显示 **Write**。

不要给不相关的人权限，也不需要把对方设置成 Organization Owner。

官方参考：[管理 Organization 仓库访问权限](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/managing-teams-and-people-with-access-to-your-repository)。

### 第 5 步：两个人分别创建 Fine-grained Token

下面的操作两个人都要在**自己的 GitHub 账号**中各做一次。不要共用同一个 Token。

1. 点击 GitHub 右上角头像 → **Settings**。
2. 将左侧页面滚动到底部，点击 **Developer settings**。
3. 点击 **Personal access tokens** → **Fine-grained tokens**。
4. 点击 **Generate new token**。GitHub 可能要求输入密码或进行二次验证。
5. Token name 填写便于识别的名称，例如：
   - 你的手机：`ProjectLove-Ethan-Phone`
   - 对方手机：`ProjectLove-Partner-Phone`
6. Expiration 建议先选择 90 天。到期后重新创建即可。
7. **Resource owner** 选择你们的 Organization。不要选个人账号。
8. Repository access 选择 **Only select repositories**。
9. 在仓库列表中只勾选 `our-days-data`。
10. 展开 **Repository permissions**。
11. 找到 **Contents**，选择 **Read and write**。
12. 其他权限保持默认，不要额外开放 Administration、Actions、Secrets 等权限。
13. 点击 **Generate token**。
14. 复制页面显示的 Token，并放进密码管理器。GitHub 通常只完整显示一次，关闭页面后无法再次查看。

Token 类似一把只允许读写指定数据仓库的钥匙。它不是 GitHub 密码，也不应该出现在网页代码仓库里。

如果你还要在电脑上长期使用，可以为电脑单独创建一个 Token，例如 `ProjectLove-Ethan-PC`。这样手机丢失时可以只撤销手机 Token，不影响电脑。

### 第 6 步：如果 Token 显示 Pending，批准请求

Organization 如果要求审批 Fine-grained Token，新 Token 会显示 **Pending**。Pending 状态下无法访问私有数据仓库。

由 Organization Owner 操作：

1. 点击 GitHub 右上角头像 → **Organizations**。
2. 点击你们的 Organization。
3. 点击 **Settings**。
4. 左侧找到 **Personal access tokens** → **Pending requests**。
5. 打开待审批 Token。
6. 确认它只请求 `our-days-data`，并且只有 **Contents: Read and write**。
7. 点击 **Approve**。
8. 对方回到 Fine-grained tokens 页面，确认状态不再是 Pending。

如果没有 Pending requests，通常表示该 Token 不需要额外审批，可以继续。

官方参考：[审批 Organization 的 Token 请求](https://docs.github.com/en/organizations/managing-programmatic-access-to-your-organization/managing-requests-for-personal-access-tokens-in-your-organization)。

### 第 7 步：使用 GitHub Desktop 发布公开网页代码

这一步只需要由负责维护代码的人操作一次。

1. 打开 GitHub Desktop，并确认已登录 GitHub。
2. 点击菜单 **File** → **Add local repository**。
3. 点击 **Choose...**，选择：`D:\Ethan's Work\ProjectLove`。
4. 如果提示“这个目录不是 Git repository”，点击页面提供的 **create a repository** 链接。
5. 创建本地仓库时：
   - Name 使用 `ProjectLove` 或保持自动填写的名称。
   - Local path 确认最终指向现有的 `D:\Ethan's Work\ProjectLove`，不要生成 `ProjectLove\ProjectLove` 双层文件夹。
   - Git ignore 不需要另外选择，项目已经包含 `.gitignore`。
   - 如果看到 Initialize this repository with a README 选项，请不要勾选；项目已经有自己的 `README.md`。
   - License 选择 None。
6. 回到 GitHub Desktop 左下角：
   - 先确认 Changes 列表中能看到 `app.js`、`index.html` 等项目文件。如果列表为空或路径不对，先不要发布，重新检查 Local path。
   - Summary 填写 `First version`。
   - 点击 **Commit to main**。
7. 点击顶部 **Publish repository**。
8. 在 Publish Repository 窗口中：
   - Name 填写 `project-love`。
   - Organization 选择你们的 Organization。
   - **取消勾选** `Keep this code private`，确保网页代码仓库是 Public。
9. 点击 **Publish Repository**。
10. 发布完成后点击 **View on GitHub**，确认仓库属于 Organization，并且标签显示 **Public**。

请在 GitHub 仓库的文件列表中确认至少能看到：

- `index.html`
- `app.js`
- `styles.css`
- `manifest.webmanifest`
- `.github/workflows/pages.yml`

看不到 `.github/workflows/pages.yml` 时不要继续部署，否则 GitHub 不知道如何构建网站。

官方参考：[使用 GitHub Desktop 发布仓库](https://docs.github.com/en/desktop/overview/creating-your-first-repository-using-github-desktop)。

### 第 8 步：打开 GitHub Pages

1. 在浏览器打开刚发布的 `project-love` 仓库。
2. 点击仓库顶部 **Settings**。
3. 在左侧 **Code and automation** 区域点击 **Pages**。
4. 找到 **Build and deployment**。
5. Source 选择 **GitHub Actions**。
6. 不需要选择 GitHub 推荐的模板，因为项目已经有 `.github/workflows/pages.yml`。
7. 点击仓库顶部 **Actions**。
8. 左侧选择 **Publish PWA**。
9. 如果已经有自动运行的任务，等待它结束；如果没有，点击 **Run workflow**，Branch 选择 `main`，再点击绿色的 **Run workflow**。
10. 等待几分钟。任务旁边出现绿色对勾表示测试、构建和部署成功。

如果第一次任务在开启 Pages 之前已经失败，开启 Pages 后重新运行一次即可。

官方参考：[使用 GitHub Actions 配置 GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site#publishing-with-a-custom-github-actions-workflow)。

### 第 9 步：取得正式网站地址

1. 回到代码仓库 **Settings** → **Pages**。
2. 页面顶部会显示网站地址，点击 **Visit site**。
3. 常见地址格式为：

   ```text
   https://Organization名称.github.io/project-love/
   ```

4. 把这个网站地址收藏，并发给女朋友。可以分享网站地址，**不要分享 Token**。
5. 打开后应该看到“两地之间”的首页，而不是 GitHub 文件列表。

首次发布可能需要几分钟，GitHub 官方说明在个别情况下可能需要最多约 10 分钟。刚部署完成时看到 404，可以等待一会儿再刷新。

官方参考：[查看已经发布的 GitHub Pages 网站](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site#viewing-your-published-site)。

### 第 10 步：第一台设备连接私有数据仓库

建议由你先连接。可以先在电脑浏览器测试，确认成功后再安装手机 PWA。

1. 打开刚获得的 GitHub Pages 网站。
2. 点击右上角齿轮，或者页面底部的 **数据与同步设置**。
3. 在“这台设备的使用者”中选择你对应的档案，例如档案 1。
4. 填写两个人的昵称和城市。
5. 在“GitHub 私有仓库”中填写：

   | 页面字段 | 应该填写什么 | 示例 |
   |---|---|---|
   | 仓库拥有者 | Organization 名称 | `ethan-and-lin` |
   | 仓库名称 | Private 数据仓库名 | `our-days-data` |
   | Fine-grained Token | 你自己的 Token | `github_pat_...` |
   | 分支 | 数据仓库默认分支 | `main` |

   表格中的 `github_pat_...` 只是格式示意，请粘贴 GitHub 实际生成的完整长字符串。

6. 点击 **连接私有仓库**。
7. 出现“私有仓库已连接，数据已同步”表示成功。
8. 返回设置页面，顶部应显示 `Organization名称/our-days-data`，侧边栏应显示“私有仓库已连接”。

第一次连接只会在空数据仓库中补齐两份档案，不会把本地演示中的虚构留言、习惯或纪念日上传。

### 第 11 步：第二台设备连接同一个仓库

由女朋友在她的设备上操作：

1. 打开完全相同的 GitHub Pages 网站地址。
2. 打开 **数据与同步设置**。
3. “这台设备的使用者”选择**另一份档案**。如果你用了档案 1，她就选择档案 2。
4. 仓库拥有者、仓库名称和分支填写与你相同的内容。
5. Fine-grained Token 填写她用自己 GitHub 账号创建的 Token，不要填写你的 Token。
6. 点击 **连接私有仓库**。
7. 连接成功后检查昵称和城市。第二台设备会采用仓库中已有的档案，不会用本机演示资料覆盖它们。

两台设备上的四项仓库信息应当是：

```text
相同：Organization 名、数据仓库名、分支
不同：各自的 Token、各自选择的使用者档案
```

### 第 12 步：进行一次完整的双端同步测试

按顺序测试，不要一次同时修改很多内容：

1. 设备 A 写一条“同步测试 1”的悄悄话。
2. 设备 B 等待约 30 秒，或点击顶部刷新按钮。
3. 设备 B 应当看到这条留言。
4. 设备 B 打开留言簿，使留言变为已读。
5. 设备 A 点击刷新，应当看到“对方已读”。
6. 设备 B 修改自己的心情，设备 A 刷新后确认显示正确。
7. 设备 A 新增一个测试习惯并打卡，设备 B 刷新后确认显示正确。
8. 设备 B 新增一个纪念日，设备 A 刷新后确认显示正确。

以上全部成功，双端同步就配置完成了。测试内容可以在页面中删除；GitHub 仓库的历史提交仍会保留曾经写入的内容。

**目前项目尚未使用你们的真实账号完成这次双账号 / 双设备联调。** 自动化测试使用的是模拟 GitHub 响应，因此正式使用前请务必完成上述测试。

### 第 13 步：安装为手机或电脑 PWA

请使用正式的 `https://...github.io/...` 网站安装。`http://127.0.0.1` 只适合本机开发，普通局域网 HTTP 地址通常不能完整安装 PWA。

#### iPhone / iPad

1. 使用 **Safari** 打开正式网站。不要使用微信内置浏览器。
2. 点击 Safari 的 **分享**按钮。如果新版本 Safari 显示“页面菜单”，先点击页面菜单，再点击分享。
3. 向下滚动，点击 **添加到主屏幕**。
4. 如果页面提供 **作为网页 App 打开**，保持开启。
5. 名称保持“两地之间”，点击右上角 **添加**。
6. 回到主屏幕，点击“两地之间”图标。
7. 在打开的 PWA 中重新进入设置并连接私有仓库。

如果分享菜单中没有“添加到主屏幕”，滚动到底部点击 **编辑操作**，把“添加到主屏幕”加入菜单。

官方参考：[Apple：在 iPhone 上将网站变为 App](https://support.apple.com/zh-cn/guide/iphone/iphea86e5236/ios)。

#### Android 手机

不同品牌的菜单名称可能略有差异，推荐使用最新版 Chrome：

1. 使用 **Chrome** 打开正式网站，不要使用微信或其他 App 的内置浏览器。
2. 点击右上角三个点菜单。
3. 点击 **安装应用**。有些版本显示为 **添加到主屏幕**，进入后再选择安装。
4. 按提示点击 **安装**。
5. 回到桌面，打开“两地之间”。
6. 在打开的 PWA 中重新连接私有仓库。

#### Windows / macOS 电脑

Chrome：

1. 用 Chrome 打开正式网站。
2. 如果地址栏右侧出现安装图标，点击它，再点击 **安装**。
3. 如果没有安装图标：右上角三个点 → **投放、保存和分享** → **将网页安装为应用**。

Edge：

1. 用 Edge 打开正式网站。
2. 点击右上角三个点 → **应用**或 **更多工具** → **将此站点安装为应用**。
3. 安装后可以选择固定到任务栏或开始菜单。

官方参考：[Chrome 安装 Web 应用](https://support.google.com/chrome/answer/9658361)；[Edge 安装网站应用](https://support.microsoft.com/edge/install-manage-or-uninstall-apps-in-microsoft-edge)。

### 第 14 步：以后怎样发布新版本

以后我修改完项目代码后，你只需要用 GitHub Desktop 发布更新：

1. 打开 GitHub Desktop，选择 `ProjectLove` 仓库。
2. 左侧会显示发生变化的文件。
3. 左下角 Summary 写本次更新说明，例如 `Improve anniversary page`。
4. 点击 **Commit to main**。
5. 点击顶部 **Push origin**。
6. 打开 GitHub 仓库的 **Actions**，等待 **Publish PWA** 变成绿色对勾。
7. 重新打开 PWA；如果仍显示旧界面，完全关闭后再打开，或在浏览器中刷新一次。

不需要手动上传 `dist` 文件夹，GitHub Actions 会自动测试、构建和部署。

### 常见问题排查

#### 提示“数据仓库尚未初始化”

进入 `our-days-data` 仓库，确认仓库首页存在 `README.md`。如果没有，点击 **Add file** → **Create new file**，创建 `README.md` 并提交到 `main`。

#### 提示“Token 无效或已过期”

- 检查 Token 是否复制完整，没有多余空格。
- 检查 Token 是否已经到期或被撤销。
- 重新创建 Fine-grained Token，不要使用 GitHub 登录密码代替。

#### 提示“没有操作权限”或出现 403

- 确认 Token 的 Resource owner 是 Organization。
- 确认 Token 选中了 `our-days-data`。
- 确认 **Contents** 是 **Read and write**。
- 确认 Token 不再处于 Pending。
- 确认对方是 Organization Member，并拥有数据仓库 Write 权限。

#### 提示“找不到仓库或分支”或出现 404

- “仓库拥有者”应填写 Organization 名，不是个人昵称或邮箱。
- 仓库名称只填 `our-days-data`，不要填写完整网址。
- 分支通常填写 `main`，以数据仓库首页显示的分支为准。
- 确认数据仓库是 Organization 下的仓库，并且 Token 获得了访问权限。

#### GitHub Actions 显示红色叉号

1. 确认网页代码仓库是 **Public**。
2. 确认 Settings → Pages → Source 已选择 **GitHub Actions**。
3. 确认仓库存在 `.github/workflows/pages.yml`。
4. 点击失败任务，展开红色步骤查看错误。
5. 修正后回到 **Actions** → **Publish PWA** → **Run workflow** 再运行一次。

#### Pages 地址显示 404

- 首次部署先等待几分钟。
- 在 Actions 中确认 Publish PWA 已经是绿色对勾。
- 到 Settings → Pages 使用 **Visit site**，不要凭记忆手写地址。
- 确认网址末尾包含代码仓库名，例如 `/project-love/`。

#### 两台设备看到不同的数据

- 检查两台设备填写的 Organization、数据仓库和分支是否完全相同。
- 检查两台设备是否都显示“私有仓库已连接”，而不是“本地体验空间”。
- 点击顶部刷新按钮后再检查。
- 确认两台设备选择了不同的使用者档案。

#### 安装后又回到本地体验空间

这是当前第一版的正常行为。Token 只保存在页面内存中，刷新、完全关闭或浏览器回收页面后可能需要重新输入。仓库名称和设备视角仍会保留，但 Token 不会永久写入设备。

#### 找不到“安装应用”或“添加到主屏幕”

- 确认打开的是 GitHub Pages 的 HTTPS 地址，而不是本机地址。
- iPhone 使用 Safari，Android 使用 Chrome。
- 不要使用微信、QQ 等内置浏览器。
- 刷新网页或重新打开浏览器后再试。

### 同步的实际行为

- 页面处于前台时约每 30 秒检查一次，也可以手动刷新；这不是即时聊天，没有后台推送。
- 弹窗、保存操作或未发出的留言草稿存在时，会暂停相应后台同步，避免打断输入。草稿只留在当前页面内存。
- 同一条记录被两台设备同时修改时可能产生冲突。应用不会静默覆盖；先同步最新内容，再重新提交。
- 没有网络时可以打开已经缓存的界面和使用本地演示，但不能可靠地离线修改远程资料后自动补传。
- 每次远程保存都会在数据仓库产生一次 Git 提交，因此适合两个人的轻量文本记录，不适合高频聊天或大量文件。

## 账号与隐私边界

- **第一版不是自建的账号密码系统。** GitHub 账号 + 各自 PAT 提供仓库授权；不存储你们的 GitHub 密码，也没有应用自有注册 / 找回密码。
- Token 只在当前页的内存中，关闭或刷新后重新输入。不会放进 localStorage、URL、Git 文件、构建产物或 Service Worker 缓存。仓库名、组织名和视角会保存在设备本地。
- 连接后的私有内容只留在页面内存，不主动缓存到本地；断开会回到独立的本地演示数据。浏览器或操作系统自身的内存、调试记录等不属于端到端加密保证。
- 两份档案是**基于双方信任的自选展示视角**，不是服务器验证的角色权限。获得仓库写权限的人可读取、更改全部文本；界面上“自己的状态 / 打卡”限制不是安全隔离。
- 私有仓库并非端到端加密。GitHub 和持有仓库权限的人可读取数据；删掉页面中的记录，也不会自动清除 Git 历史。请勿在此存储高度敏感内容。
- 这套纯静态方案的代价是手动 Token 登录、GitHub 网络可用性、轮询延迟和权限限制。如果以后要像成熟 App 一样用账号密码登录、自动记住登录、独立角色权限、推送或可靠离线同步，应增加真正的认证 / 后端服务。

## 天气服务

天气来自 [Open-Meteo](https://open-meteo.com/)，城市检索使用它的 Geocoding API。请求只发送填写的城市名和由检索结果获得的城市级坐标，不附加 GitHub 令牌或情侣留言。重名城市可能匹配到错误地区，可用更明确的城市名重新设置；当前 demo 未做候选城市选择。

免费公开接口适用于符合其条件的非商业使用，有调用限额；商业化需另行确认方案。天气数据遵循其归属与许可要求，参见 [许可与数据来源](https://open-meteo.com/en/licence) 和 [服务条款](https://open-meteo.com/en/terms)。当前数据、地名来源及更新时间以该服务为准，天气不是安全或出行承诺。

## 代码导航与第二版

`app.js` 管理页面、交互和数据状态；`github-store.mjs` 封装 GitHub 存取；`date-utils.mjs` 处理日期和连续打卡；`styles.css` 管理响应式界面；`sw.js` 仅缓存公开资源；`tests/` 包含日期、存储、状态隔离与 PWA 测试。

第二版候选：你们敲定的奖励 / 积分规则、正式账号登录、城市候选选择、提醒通知、可选的安全会话保存。积分规则尚未确定，第一版没有预先实现。
