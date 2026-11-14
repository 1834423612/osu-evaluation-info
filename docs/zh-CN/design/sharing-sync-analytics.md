# 分享、收藏同步与统计设计

[English](../../design/sharing-sync-analytics.md) · 简体中文

状态：待实施方案，研究日期为 2026-11-14。本文不代表分享、账号或同步功能已经上线。下面的运行情况均为当日观察。

## 现有实现与已观察的问题

课程、班次、教师、大纲收藏目前保存在带版本号的浏览器存储中，没有账号收藏服务。课程上限为 100 项，其他类型各有上限。收藏快照会移除选课人数等实时数据。大纲通知绑定具体文档版本，迁移时必须保留这一语义。

课程详情已经通过 course、detailTab、ratingSource、focusSection 等 URL 参数保存状态。但接收者的搜索结果窗口里可能没有这门课，因此还需要独立的实体解析入口；单纯复制卡片所在页面的地址不能保证正确打开。

根布局加载一个 tracker 组件和独立 recorder。tracker 已带 data-errors、data-performance，缺少应用版本和部署环境。package.json 中的 0.1.0 不适合作为实际部署版本，项目已有随构建注入的 SHA。

2026-11-14 的只读检查结果：

- 回放、热图采样均为 100%，输入遮罩为 moderate，最长录制 1,200,000 毫秒，即 20 分钟，blockSelector 为空。
- 普通 tracker 请求返回 4,776 字节，不支持 window.umamiConfig / captureException；绕过缓存后返回 9,300 字节，支持这些功能。recorder 的缓存和新响应也不同，只有新响应支持 umamiConfig。缓存约已有 23 小时。这证明存在旧脚本交付路径，不能单凭这个判断服务器安装的准确版本。
- 仅分析了两段近期录制的数据结构，没有导出访客标识或输入内容。完整快照内未发现重复 rrweb 节点 ID；仍可能存在逻辑控件重复、样式缺失或增量变更顺序问题。
- 新的桌面、手机首页检查中，主课程搜索框只有一个可见实例，没有横向溢出。手机还存在一个尺寸为零的筛选搜索框。本次检查不覆盖所有面板交互状态。
- Umami 3.4.1 声明 rrweb ^2.0.1、rrweb-player 2.0.0-alpha.20；3.5.0 改为 rrweb ^2.1.7、rrweb-player 2.1.7。升级值得验证，但不等于已证明能修复全部回放问题。

现有 before-send 只处理 tracker 的 URL 查询参数。recorder 有独立发送路径，不经过这个钩子。执行后移除 next/script 元素，也不会停止已经运行的 recorder。账号、恢复和临时转存页面上线前，需要明确处理这两处。

## 页面与权限

| 入口 | 行为 | 权限和期限 |
| --- | --- | --- |
| 分享当前页面、课程 | 优先调用系统分享，不支持时复制链接；保留课程、学期、校区、班次及详情上下文 | 普通公开标准链接；可选带来源统计的链接 |
| 分享收藏清单 | 独立 /share/... 页面；紧凑混合列表；全部或部分转存 | 只读快照，可撤销，明确可见范围和有效期 |
| 临时转存 | 无需账号，将选中本地项目传到另一设备 | 到期失效、单个接收方领取；安全长链接或设备配对 |
| 账号同步 | 持续同步勾选的数据类别 | 通行密钥账号、设备会话、用户控制开关 |
| 本地历史 | 已提交的搜索、实际打开的课程 | 默认本地；可清除、关闭，历史同步另行选择 |

公开分享不授予修改权。接收者转存后拥有独立副本，发布者后续修改不能静默改动接收者收藏。发布者可以明确发布新快照。多人协作编辑、实时订阅需要另外的权限和冲突规则。

收藏清单支持课程、班次、教师、大纲，复用现有身份与来源标签。管理功能包括命名清单、扁平标签、搜索、排序、多选、移动、删除、JSON 导入导出、去重、导入预览和短期撤销。先采用浅层组织，不引入复杂多层目录。参考 [Linkwarden](https://docs.linkwarden.app/usage/collections) 对收藏组织、公开阅读、私有状态的区分。

分享默认剥离实时选课人数、私人备注、账号标识、浏览历史、通知已读状态和多余缓存。教师邮箱仅在单独选择公开联系信息时加入。待确认的 RMP 教师保留来源 ID 和警示，不按姓名强行合并。大纲分享引用文档身份和可用归档版本，不复制任意 HTML。

分享页显示标题、各类项目数、到期时间、来源／身份标签和明确的勾选操作。导入预览区分新增、已有、发生变化、暂不可用。官方已不可查询的课程保留快照，标注归档或不可用。结果分别统计选中、导入、跳过、失败、仍待完成的项目。

分享页拥有独立布局和元数据，不在详情抽屉下面再加载一份搜索页。可以复用现有详情抽屉，但实体解析、关闭和返回行为属于分享页。分享页设置 noindex 和严格的来源策略。私密能力链接、临时转存页不加载第三方统计或回放。社交预览仅展示用户明确发布的字段。

收藏页工具栏紧凑排列标题／数量、本地／云端状态及带文字的“选择、分享、导入”。选择模式显示复选框与数量，嵌套按钮不能误触选中或另开一层。复用站内浅色表面、细边框，主操作克制使用绯红色。身份／来源置于标题下，管理操作独立一行。桌面弹窗限制宽度，手机使用考虑安全区的抽屉，明确一个滚动主体。冲突选项桌面并列、手机堆叠。触屏目标保留 44 像素，不因此放大所有可见图标；固定操作栏不能遮住最后一项。

## 六位数字码与临时转存

六位十进制数字只有 1,000,000 种可能，约 19.9 位熵。昵称不能作为登录凭据，六位码也不能作为长期私密账号密钥。

- 长期分享链接使用至少 128 位密码学随机令牌，建议默认 256 位。服务器只保存带密钥摘要，不保存原令牌。每次读取均检查权限、到期和撤销，包括缓存、预览。
- 六位公开别名仅用于用户明确同意公开的内容，设置短期限、创建配额、全局在用数量限制，并说明可被猜中。别名不提供账号访问权。
- 私密六位配对码 10 分钟失效。发送方批准具体接收会话后，接收方才能读取数据。接收方另持高熵秘密，短码只定位待处理配对。
- 无人值守的私密转存使用安全长链接或二维码。建议有效期为 15 分钟、1 小时、24 小时、7 天，默认 1 小时。六位配对码不延长至一周。
- 对挑战、来源会话、可信网络地址、服务整体预算进行跨进程的原子限流；仅靠进程内计数不足。错误响应保持一致，可疑尝试再触发额外验证。
- 预览 GET 不消耗转存。领取使用事务性 POST，绑定接收会话并建立短暂可恢复租约。相同接收方断线后可以重试，另一接收方不能抢走已领取任务。客户端确认本地持久写入后才标记完成。
- 撤销后禁止继续读取；定时清理过期数据。公开短码回收设冷却期；安全长链接绑定原始快照，不能因为数字码复用而指向未来的新清单。
- 匿名创建者获得独立的撤销管理凭据，遗失后只能等待到期。限制内容大小、创建次数和保留期。

设备配对参考 [RFC 8628](https://datatracker.ietf.org/doc/html/rfc8628#section-5.1) 的短用户码、高熵设备秘密、限流、有效期和明确批准原则。本项目实现的是转存协议，不声称自行实现 OAuth 授权服务器。

转存链接、能力令牌、恢复资料和认证头必须排除在代理日志、统计、错误内容和回放之外。把令牌放进 URL fragment 并不能防止客户端脚本或 DOM 录制读取。本地历史也不记录这些秘密。

## 无密码账号

建议采用自托管 Better Auth、现有 PostgreSQL 和通行密钥插件，不自行实现 WebAuthn 验证。关闭传统密码注册。

首次使用生成不透明的待注册凭据，完成用户验证后才创建账号。昵称可重复、可修改，不用昵称查询私密数据。[Better Auth 支持通行密钥优先注册](https://better-auth.com/docs/plugins/passkey)。

生产环境使用固定的准确 origin 和稳定 RP ID；localhost 为独立开发身份。不信任任意转发的主机头。服务器只存凭据公钥及必需的 WebAuthn 元数据，不接收指纹图片、面容或设备解锁 PIN。普通账号不代表已核实 OSU 身份。

支持添加多把通行密钥、查看和撤销设备会话。依赖云端存储前提供恢复设置：第二把密钥、一次性恢复码的哈希，或已验证邮箱的登录链接。邮箱方式依赖可用邮件服务及限流。若部署已有可信 OIDC 提供方，可另接入；本次检查的应用环境没有配置认证提供方和邮件发送变量。

使用库管理的安全 HttpOnly Cookie、来源与 CSRF 验证、短期挑战、防重放。业务接口仍需逐条检查所有权，认证库不会自动替自定义同步／分享接口授权。绑定其他身份必须由已登录用户明确发起，不能因为邮箱或姓名相同就自动合并。参考 [Better Auth 安全说明](https://better-auth.com/docs/reference/security)、[邮箱登录链接](https://better-auth.com/docs/plugins/magic-link)。

默认匿名、本地使用，不因访问网站自动注册。登录与同意上传本地收藏是两个操作。

## 同步协议

采用逐项操作协议、IndexedDB 本地待发送队列、服务器游标及项目版本。不能用整份数组按最后一次写入覆盖。

每次操作包含幂等键、账号／工作区、设备 ID、设备内序号、实体键、操作类型和基准版本。服务器验证所有权，在事务内处理有限批次，返回成功、拒绝、冲突项目及新的服务器序号。无关项目可成功提交，冲突项目继续保留。同步顺序以服务器序号为准，不信任设备时钟。

| 情况 | 处理结果 |
| --- | --- |
| 首次登录，两端都有内容 | 预览并集，按实体身份去重；服务器确认保存前保留本地原件 |
| 两台设备分别新增 | 两边都保留 |
| 同一导入或请求重试 | 返回原结果，不重复收藏或增加人气 |
| 一台删除，旧设备再上线 | 保留删除标记，旧快照不能恢复该项目 |
| 用户见到删除后主动重新收藏 | 针对已观察的删除版本发起新的明确操作 |
| 同时删除与编辑 | 保存两种状态作为冲突，不静默丢弃任一操作 |
| 修改不同且可安全合并的字段 | 按字段合并 |
| 同时修改同一个清单名或备注 | 保留两个版本，选择本地、云端或保留两份 |
| 设备时间错误 | 不丢数据；时间仅作为展示信息 |
| 部分失败或本地空间不足 | 保留待处理内容，显示可操作的错误，不假报同步完成 |
| 本地读取损坏或失败 | 视为数据暂不可用，不能当作权威的空收藏 |
| 退出、切换账号、关闭同步 | 隔离本地及账号工作区，不把 A 的私有缓存传给 B |

建议删除标记与操作回执至少保留 180 天。设备离线超过受支持游标期限后，执行全量核对并让用户审阅旧的待发送修改，不能直接重放旧新增。压缩历史时记录最低有效游标。账号删除、设备撤销优先于离线队列。

大纲文档版本和用户确认状态独立保存。分享导入不继承发布者的已读状态。同一账号跨设备，仅用户对具体已观察版本的明确确认才能清除提醒，旧设备不能清掉更新版本的提醒。

已登录修改后防抖同步，断网恢复、标签页重新可见时同步；限制批次和请求量，不依赖常驻连接或高频后台轮询。同账号多标签页通过 BroadcastChannel 或主标签租约协调。Web Lock 只改善本地调度，正确性仍依赖服务器幂等和事务。重试使用有上限的指数退避。

用户可按设备停用同步，历史记录单独选择。暂停上传保留队列，恢复时预览冲突。退出时可选择保留设备副本或清理该账号本地缓存；清空云端是独立操作。

[Automerge 的冲突说明](https://automerge.org/docs/reference/documents/conflicts/)体现了一个原则：自动达到一致不等于解决了所有用户意图冲突。当前少量类型明确的收藏数据，首版无需引入完整协作文档 CRDT 运行时。

## 数据存储、接口与性能

用户数据使用独立 schema，与官方课程、教学评价、大纲归档分离。认证库维护认证表；业务数据复用已有受限 PostgreSQL 连接池，或明确预算独立适配器连接数。

| 逻辑表 | 用途与约束 |
| --- | --- |
| 账号、凭据、会话、设备 | 不透明 ID、凭据唯一性、撤销和恢复 |
| 清单、收藏、清单成员 | 按所有者、类型、规范实体键去重；放入多个清单不重复收藏 |
| 操作、回执、删除标记、冲突 | 操作 ID 唯一；账号／服务器游标索引；准确基准版本 |
| 分享快照、能力凭据、短码别名 | 内容版本不可变，权限、有效期、撤销；不依赖公开列表 |
| 转存及领取 | 秘密摘要、领取会话、租约、完成状态 |
| 事件事务队列、实体聚合 | 去重业务事实，异步更新人气 |
| 安全事件、诊断报告 | 独立保留期、受限访问、删除和同意记录 |

接口按分享创建／撤销／读取、转存创建／批准／领取／确认、同步推送／拉取／冲突解决、账号与设备管理分组。修改操作校验严格结构、数量和大小上限、同源及权限。导入导出带格式版本和确定性迁移。标题、链接、备注均视为不可信输入，不渲染任意 HTML，不由服务器抓取任意 URL。

使用游标分页和账号／实体索引，只锁受影响账号或项目，不锁课程目录。快照精简且不可变。人气消费事务事件队列批量聚合，不在每次点击时争用一个总计行。统计故障不能导致浏览或已确认收藏失败。

私密分享、转存使用 no-store。公开缓存有明确撤销失效路径，每次访问重新检查权限。备份的私人数据也遵循保留政策。传输加密及访问控制不等于端到端加密。

待实际测量的建议目标：每批最多 100 项操作，同步请求体最多 256 KiB，轻量事件批次最多 16 KiB，用户操作不全表扫描课程；在实际服务器与连接池上进行数百客户端压力测试。增加本地收藏上限前先实现分页和配额迁移，不能静默截断导入数据。

## 历史记录与人气口径

最近搜索只记录已提交内容，课程历史只记录实际打开。建议默认最多 100 条搜索、200 条课程访问、保留 90 天；连续重复去重，保存学期／校区。逐键输入、悬停、预加载、自动分页、能力链接不加入历史。提供单项删除、全部清除、关闭、导出。历史上云单独选择。

| 指标 | 定义 |
| --- | --- |
| 链接预览 | 元数据请求，区分可识别机器人，不当作真人打开 |
| 分享打开 | 客户端确认公开分享已渲染，在有限访问窗口内去重 |
| 转存使用 | 成功领取／导入完成，不是预览 |
| 实体收藏数 | 当前有效的所有者／实体唯一收藏；多设备、多清单只算一次 |
| 匿名收藏 | 设备级观测，单独标注，不混成账号人数 |
| 搜索结果点击率 | 同一请求 ID 下，实际课程打开数除以已记录的结果曝光 |
| 导入项目数 | 成功新增并持久化的项目，排除已有项和重试 |

一个账号不保证对应一个自然人，IP 和浏览器指纹也做不到。设备估计不能写成人数。本地模式无法给服务器提供权威完整收藏清单；关闭统计、离线和滥用都使全站真实人数不可精确保证。

使用有类型的产品事件，携带请求 ID、规范实体 ID、规范化已提交关键词、匹配结果和耗时。发送前清除疑似邮箱、令牌及异常长输入。同一次行为不把通用点击与确认后的业务事件重复相加。高基数运行数据放进应用统计库，不塞进无限增长的 Umami 会话属性。

## 浏览器与请求诊断

参考项目的注册表共 133 行：网络 21、出口 6、请求头 9、区域 9、设备 36、浏览器 27、指纹 25。文末逐项列全。有些数值只是推断，或可被伪造，必须保留来源、置信度和能力状态。

分成三种用途：

1. 产品统计：有限的粗粒度浏览器／设备／语言／时区、搜索结果、课程打开、功能完成。遵循用户统计设置与适用的浏览器隐私信号。
2. 安全审计：可信代理传递的 IP、设备会话撤销、猜码、登录结果。原始 IP 建议保留 7 天，仅管理员可看；长期计数使用轮换密钥摘要。不能相信客户端任意填写的 X-Forwarded-For。
3. 可选诊断：独立的“运行诊断”页面，先预览再明确提交。高熵指纹、扩展探测、出口探测、硬件明细不在普通搜索时运行。位置、传感器、文件探测分别由用户触发。提交报告建议保留 7 天，可调短；精确位置、本地文件原始内容默认排除，单独选择后才允许相应字段。

每项注册稳定 ID、多语言名称、来源、敏感级别、能力要求、同意类别、超时、大小上限和保留期。结果区分可用、不支持、拒绝、阻止、超时、失败，缺失不能填零。保存数值、来源和 schema 版本，而不是仅存一个不透明指纹字符串。

TCP SYN、JA4、HTTP/2 SETTINGS、QUIC 指纹需要受控传输探针；CDN 终止 TLS 后，Next.js 看不到原始连接。Cloudflare 字段依赖可信边缘元数据。DNS、不同目的地出口、跨站测试需要独立受控端点，不静默使用参考项目的公共探测服务。不同浏览器及权限状态支持不同，清单完整不等于每台设备都能获得 133 个值。

可选探测分批在空闲期执行，离开页面取消，滚动时不占主线程，限制报告体积。不上传原始存储内容、其他网站历史、Cookie、私钥、照片文件。存储痕迹仅报告本应用存储能力／用量，不读其他网站数据。诊断不作为账号凭据或自动判定违规的依据。

## Umami 3.5 与回放排查

| 能力 | 网站接入 | Umami 服务或后台 |
| --- | --- | --- |
| 浏览器错误 | 保留 data-errors；错误边界及必要 catch 增加去重、脱敏的主动上报 | 错误分组、发生记录筛选、会话／回放关联 |
| 版本与环境 | 随构建的 SHA，可附版本标签；明确 production/staging/development | 按实际运行应用版本筛选错误 |
| 集中配置 | 单一初始化来源，记录脚本属性优先于 umamiConfig | 版本一致的 tracker 与 recorder |
| 身份 | 许可后使用统计专用不透明账号标识；退出／切换安全重置 | distinct ID 与会话归属；不传邮箱、凭据 ID、恢复码 |
| 回放与热图 | 单实例、敏感区域阻止、同意开关；验证自定义控件、portal、iframe、滚动容器 | 采样、时长、遮罩、新播放器与导航、热图修复 |
| 性能 | 保留性能采集；产品事件记录确认后的搜索／同步耗时 | 后台／预渲染 CWV 和报表改进 |
| API | 可复现审计仍用明确时间范围；兼容 period 和 visitId | 错误接口、收紧的 API 权限及更新的客户端约定 |
| 会话隐私与网络 | 站内身份与统计 salt 分离，有目的地采用受支持轮换 | 明确 APP_SECRET、TRUSTED_PROXIES，可选 ENABLE_CLIENT_SALT |
| 报表与安全 | 搜索→课程→收藏／导入的目标、漏斗、路径、留存、看板及读取权限 | 图表／日历／时区、管理员安全／2FA、撤销、缓存／查询修复 |

完整接入包含服务端和后台功能，增加脚本属性不能代替迁移、管理员配置或正确录制。收入、链接、像素为已有的可选功能，不是需要无目的全部打开的新浏览器属性。不伪造交易事件，不为凑功能开放原始统计。

服务、tracker、recorder 按版本一起升级。检查显式 APP_SECRET、Node >=20.19、PostgreSQL 的 27_add_error_tracking 迁移，先备份数据库，移除对已删除公共 /api/config 的依赖。API key 只留服务器，收紧路由权限后重新检查原有 token。

检查的 3.5 tracker 接口提供 identify，没有公开 reset 方法。传 undefined 不是受支持的退出协议。在端到端证明登录、退出、切换账号不会把下一人的活动归到前一账号前，不启用账号关联统计。账号收藏同步和业务统计不依赖这项关联。

tracker、recorder URL 增加明确资源版本，核对反向代理／CDN 缓存键，升级时清理旧脚本缓存。若 CDN 忽略该查询参数，仅增加版本参数无效。应用构建版本与 Umami 资源版本是两个不同值。

回放问题尚未完全定位，实施时按以下顺序验证：

1. 同一份保存事件分别用旧、新播放器复现，再用版本一致的 tracker／recorder／服务重新录制合成测试。
2. 在异常时间点比较真实 DOM、序列化快照、重建 DOM；检查无障碍隐藏控件、响应式副本、portal、样式序列化、Tailwind layer、content-visibility。
3. 检查完整快照、增量顺序、分片恢复、网络失败。画面停止也可能是录制停止，需核对最长时限和脚本等待会话缓存的启动窗口。
4. 比较开关录制时的输入延迟、长任务、变更量和上传大小。先以官方 15% 采样、5 分钟默认值对照；需要稳定复现时单独开放 100% 调试会话。
5. 验证搜索输入法、学期菜单、课程详情、RMP、大纲／iframe、嵌套滚动、前进后退、减少动效、手机布局。回放不运行网站原始业务 JS，必须靠快照、样式、事件正确重建视觉状态。
6. 屏蔽账号、恢复、私密转存、私有收藏内容，确保开关真正停止／开始采集。若上游没有销毁接口，使用明确说明的重新加载与初始化门禁，不能假装删掉 script 即停止。

跨域 iframe 内部、已损坏的旧录制可能无法恢复。不要为了掩盖录制缺陷删掉无障碍控件、把所有面板铺平或取消所有滚动优化；先确认具体不兼容再局部修复。

主要来源：[3.5 发布说明](https://umami.is/blog/umami-v3.5)、[tracker 配置](https://docs.umami.is/docs/tracker-configuration)、[错误采集](https://docs.umami.is/docs/error-tracking)、[回放](https://docs.umami.is/docs/replays)、[3.4.1 依赖](https://github.com/umami-software/umami/blob/v3.4.1/package.json)、[3.5.0 依赖](https://github.com/umami-software/umami/blob/v3.5.0/package.json)、[recorder 发送路径](https://github.com/umami-software/umami/blob/v3.5.0/src/recorder/index.js)。

## 实施边界与验收

每项行为独立使用带 scope 的 Conventional Commit：fix(analytics) 处理缓存／资源版本与采集生命周期；feat(analytics) 接入 3.5；feat(history)；feat(sharing) 的标准链接和公开清单分开；feat(transfer)；feat(auth)；feat(sync)；feat(telemetry) 的产品统计与主动诊断分开；各功能附相关测试，文档另提。这是计划拆分，不是已完成记录。

数据库迁移使用新增结构，与官方同步脚本分离。本地格式首次升级前备份收藏。生产迁移前备份数据库，部署代码不自动执行破坏性迁移。功能分批开放，相应接口和迁移健康后才启用云端入口。

验收必须覆盖：

- 1440 桌面、768 平板、390／320 手机宽度，两种语言、200% 字体缩放、键盘、触屏；选中、分享／导入、过期／撤销、登录／恢复、冲突、离线状态的真实截图。
- 两个浏览器加一个离线设备：并集合并、重试、并发编辑、删除／重新收藏、错误时钟、游标过期、切换账号、响应丢失、存储写入中断。
- 私有对象越权、CSRF／重定向、多进程猜码限制、领取竞争、有效期／撤销、机器人预览、恶意导入、秘密在日志／回放中的脱敏。
- 本地与账号导入均保留大纲更新通知、历史不可用实体；配额不能静默丢项目。
- 重复导入、多个清单、请求重放不增加收藏数；删除重加、匿名转账号有明确且经过验证的统计口径。
- 生产构建与配套 Umami 资源录制、回放完整“搜索→面板→滚动→收藏”链路；比较截图与变更／事件诊断，不只看 HTTP 成功。
- 在隔离 schema 使用合成数据和有限并发，记录实际 CPU、内存、连接池等待、p95 延迟。未测量前不承诺数百用户容量。

实施所需基础条件包括稳定认证域名／RP ID、恢复／邮件能力、托管秘密、可信代理拓扑及可选的专用诊断探针，不能通过弱化协议绕过这些条件。

## 全量诊断注册清单

来源：[Who Are You 注册表](https://github.com/yt1988/who-are-you/blob/cabe524f4cc944dd7c62a30582a395132a4132d6/src/sniffers.mjs)，版本 cabe524f4cc944dd7c62a30582a395132a4132d6，项目使用 MIT 许可。这里记录清单，没有复制探测实现。

模式：B＝仅粗粒度基础统计；S＝受限安全数据；D＝用户主动提交诊断；L＝默认本地展示，单独选择后才加入报告。非基础读数还需要逐项权限和部署能力。方法栏是上游来源描述，出现端点名称不代表生产环境可以直接使用该服务。

### 网络

依赖可信边缘元数据或自控探针；传输指纹需要专门部署。

| ID | 读数 | 上游方法 | 模式 | 额外限制 |
| --- | --- | --- | --- | --- |
| ip | IP 地址 | CF-Connecting-IP | S | 可信代理；原值仅按安全日志保留期保存 |
| geo | 位置 | request.cf.city | B | B 模式仅国家／地区分组 |
| coords | 坐标 | request.cf.latitude | D | 边缘估算，不等于浏览器 GPS |
| isp | 网络（ASN） | request.cf.asOrganization | B | 粗粒度 ASN；可信边缘或本地数据库 |
| tor | Tor 节点 | check.torproject.org exit list | D | — |
| dns | DNS 解析器 | edns.ip-api.com | D | 自控 DNS 检测；主动选择后对外请求 |
| tzip | IP 所在时区 | request.cf.timezone | D | — |
| ptr | 反向解析 | DNS PTR | D | — |
| edge | 最近的数据中心 | request.cf.colo | D | — |
| proto | HTTP 和 TLS | request.cf.tlsVersion | D | 浏览器到边缘的元数据，不是源站 TLS |
| kex | 密钥交换 | /cdn-cgi/trace · kex, sni | D | — |
| warp | Cloudflare WARP | /cdn-cgi/trace · warp | D | — |
| tlsfp | TLS 指纹 | TLS ClientHello | D | 受控 TLS 终止点或授权边缘元数据 |
| tcpfp | TCP/IP 指纹 | probe.1ms.dog · TCP SYN | D | 专用传输探针 |
| ja4 | TLS 指纹（JA4） | probe.1ms.dog · JA4 | D | 专用探针或授权边缘能力 |
| h2fp | HTTP/2 指纹 | probe.1ms.dog · HTTP/2 SETTINGS | D | 专用 HTTP/2 终止探针 |
| quicfp | QUIC 指纹（HTTP/3） | probe.1ms.dog · HTTP/3 · QUIC JA4 | D | 专用 QUIC／HTTP3 探针及 UDP 路径 |
| clock | 你的时钟 | Date.now() | D | — |
| webrtc | WebRTC 地址 | RTCPeerConnection · STUN | D | 自控 STUN；地址敏感 |
| lan | 局域网地址 | WebRTC host candidate | D | 通常隐藏或被 mDNS 替换 |
| v6mac | IPv6 泄露网卡 MAC | IPv6 EUI-64 (ff:fe) | D | 启发式 EUI-64 形态；不能可靠取得 MAC |

### 网络出口

使用独立自控目的地，主动选择后有限请求；CORS 和代理路由可能导致不可读。

| ID | 读数 | 上游方法 | 模式 | 额外限制 |
| --- | --- | --- | --- | --- |
| ex_cn | 国内网站 | myip.ipip.net | D | — |
| ex_intl | 国外 IP 服务 | api.ip.sb | D | — |
| ex_gpt | ChatGPT | chatgpt.com/cdn-cgi/trace | D | — |
| ex_claude | Claude | claude.ai/cdn-cgi/trace | D | — |
| ex_cf | Cloudflare | www.cloudflare.com/cdn-cgi/trace | D | — |
| stack | IPv4 和 IPv6 | Cloudflare Radar · IPv4 / IPv6 | D | — |

### 请求头

只使用可信链路实际收到的头；允许缺失，不补造浏览器提示。

| ID | 读数 | 上游方法 | 模式 | 额外限制 |
| --- | --- | --- | --- | --- |
| h_ua | User-Agent | User-Agent | B | B 仅解析后粗分类；完整字符串仅 D／S |
| h_lang | 语言 | Accept-Language | B | — |
| h_chua | 浏览器品牌 | Sec-CH-UA | B | — |
| h_plat | 平台 | Sec-CH-UA-Platform | B | — |
| ch | Client Hints | Sec-CH-UA-* (Accept-CH) | D | Accept-CH；高熵提示需主动选择 |
| h_enc | 压缩方式 | Accept-Encoding | B | — |
| h_dnt | 请勿追踪（DNT） | DNT · Sec-GPC | B | — |
| h_ref | 来源页面 | Referer · document.referrer | B | 脱敏公开路径；无令牌或查询内容 |
| wba | AI 代理签名 | Signature · Signature-Agent | D | 仅存在签名代理头时；另行验证 |

### 区域设置

依赖浏览器及 API 支持；具有辨识性的详细列表需要诊断同意。

| ID | 读数 | 上游方法 | 模式 | 额外限制 |
| --- | --- | --- | --- | --- |
| langs | 浏览器语言 | navigator.languages | B | — |
| locale | 区域设置 | Intl.DateTimeFormat | B | — |
| tz | 系统时区 | Intl …timeZone | B | — |
| hour | 时钟格式 | Intl …hourCycle | B | — |
| week | 一周从哪天开始 | Intl.Locale weekInfo | D | — |
| fmt | 数字和日期格式 | Intl.NumberFormat | D | — |
| icu | ICU 数据 | Intl.supportedValuesOf | D | — |
| kbd | 键盘布局 | navigator.keyboard | D | 权限／支持限制；不采集实际键入 |
| voices | 朗读语音 | speechSynthesis | D | 本地语音列表有辨识性；可选 |

### 设备

依赖浏览器、权限和隐私设置；能力检查不代表获得设备访问授权。

| ID | 读数 | 上游方法 | 模式 | 额外限制 |
| --- | --- | --- | --- | --- |
| os | 操作系统 | userAgentData | B | — |
| browser | 浏览器 | userAgentData.brands | B | — |
| arch | CPU 架构 | …architecture · bitness | D | — |
| form | 设备形态 | userAgentData formFactors | D | — |
| model | 设备型号 | screen · GPU · Client Hints model | D | — |
| screen | 屏幕 | screen · devicePixelRatio | B | B 对尺寸／DPR 分桶；准确值仅 D |
| hz | 刷新率 | requestAnimationFrame | D | 空闲取样；受省电影响，仅估计 |
| screens | 显示器数量 | screen.isExtended · screenX | D | 窗口管理支持与权限 |
| win | 窗口 | innerWidth · availHeight | B | B 对视口尺寸分桶 |
| scrollbar | 滚动条宽度 | offsetWidth − clientWidth | D | — |
| gpu | 显卡 | WebGL RENDERER | D | — |
| vm | 虚拟机 | WebGL renderer · hypervisor names | D | — |
| webgpu | WebGPU | navigator.gpu adapter.info | D | — |
| gpulim | WebGPU 能力 | GPUAdapter limits · features | D | — |
| glx | WebGL 能力 | WebGL2 · MAX_TEXTURE_SIZE | D | — |
| cpu | CPU 线程 | hardwareConcurrency | D | — |
| mem | 内存 | navigator.deviceMemory | D | — |
| heap | JS 内存上限 | performance.memory | D | — |
| touch | 触控和指针 | maxTouchPoints · pointer | B | — |
| battery | 电池 | navigator.getBattery | D | — |
| geoloc | 精确定位（需授权） | geolocation (on request) | D | 单独用户操作和定位权限 |
| sensors | 运动传感器（需授权） | devicemotion (on request) | D | 单独操作；按需传感器权限 |
| conn | 网络连接 | navigator.connection | D | — |
| media | 摄像头和麦克风 | enumerateDevices | D | 名称可能需要媒体权限；不录音录像 |
| audiohw | 音频硬件 | AudioContext.sampleRate | D | — |
| bio | 生物识别 | PublicKeyCredential | D | 仅可用性；无凭据或生物信息 |
| bt | 蓝牙 | bluetooth.getAvailability | D | — |
| devs | 已授权的设备 | usb · hid · serial getDevices | D | 仅已授权设备；不请求新权限 |
| gamepad | 游戏手柄 | getGamepads (on request) | D | 单独用户操作 |
| xr | VR / AR | navigator.xr.isSessionSupported | D | — |
| codecs | 视频编码格式 | MediaSource.isTypeSupported | D | — |
| rtccodecs | WebRTC 编解码器 | RTCRtpSender.getCapabilities | D | — |
| recmime | 录制格式 | MediaRecorder.isTypeSupported | D | — |
| hwdec | 视频硬件解码 | mediaCapabilities.decodingInfo | D | — |
| drm | DRM | requestMediaKeySystemAccess | D | 可选能力检查；不获取许可证 |
| storage | 存储配额 | storage.estimate | D | — |

### 浏览器

可选检查按需隔离执行，不读取其他来源的私人数据。

| ID | 读数 | 上游方法 | 模式 | 额外限制 |
| --- | --- | --- | --- | --- |
| scheme | 深浅色 | prefers-color-scheme | B | — |
| motion | 动画效果 | prefers-reduced-motion | B | — |
| gamut | 屏幕色域 | color-gamut · dynamic-range | B | — |
| a11y | 辅助功能 | prefers-contrast · forced-colors | B | — |
| sysui | 默认字号和强调色 | font-size: medium · AccentColor | D | — |
| display | 打开方式 | display-mode | B | — |
| dnt | 隐私信号 | doNotTrack · GPC | B | — |
| cookies | Cookie | navigator.cookieEnabled | B | — |
| psb | Privacy Sandbox | browsingTopics · runAdAuction · sharedStorage | D | — |
| perms | 权限 | permissions.query | D | — |
| apis | 敏感接口 | usb · serial · hid · IdleDetector … | D | — |
| pdf | PDF 阅读器 | pdfViewerEnabled | D | — |
| ai | 浏览器内置 AI | LanguageModel · Translator.availability | D | — |
| webdriver | 自动化 | navigator.webdriver | D | — |
| auto | 自动化痕迹 | headless · CDP · Electron traces | D | — |
| idstr | 身份字符串 | navigator.vendor · productSub · plugins | D | — |
| agent | 操作方式 | mousemove → pointerdown · isTrusted | D | — |
| worker | Worker 里的 navigator | Worker · navigator | D | — |
| adblock | 广告拦截 | bait element | D | — |
| trackers | 追踪拦截实测 | 7 tracker scripts (on request) | D | 隔离测试；不在主站源执行第三方代码 |
| ext | 浏览器扩展 | window.ethereum · DOM marks | D | — |
| extwar | 扩展扫描 | chrome-extension:// files | D | 受浏览器／CSP 限制；不能枚举所有扩展 |
| history | 本标签页历史 | history.length | D | 仅 history.length；无已访问网址 |
| exif | 照片里的信息 | a photo's EXIF, read locally | L | 用户选文件后本地预览；仅单独选中的元数据 |
| traces | 存储留痕 | localStorage · IndexedDB · Cache · window.name | L | 仅同源能力／数量，不上传存储原值 |
| xsite | 跨站追踪 | cross.1ms.one · iframe · SameSite=None · CHIPS | D | 独立自控来源与 iframe；受分区限制 |
| fonts | 已装字体 | canvas measureText | D | — |

### 指纹

仅主动选择后限制预算计算；结果可伪造，不作为身份凭据。

| ID | 读数 | 上游方法 | 模式 | 额外限制 |
| --- | --- | --- | --- | --- |
| engine | JS 引擎 | Error.message | D | — |
| engver | 引擎真实版本 | JS feature probes | D | — |
| wasm | WebAssembly | WebAssembly.validate | D | — |
| lies | 谎言检测 | Function.prototype.toString · iframe | D | — |
| cssv | CSS 特性版本 | CSS.supports | D | — |
| smooth | 字体平滑 | canvas text antialiasing | D | — |
| canvas | Canvas | canvas.toDataURL | D | — |
| webgl | WebGL | WebGL getParameter | D | — |
| audio | 音频 | OfflineAudioContext | D | — |
| mathfp | 数学函数指纹 | Math.* → SHA-256 | D | — |
| emoji | 系统 Emoji 版本 | emoji measureText | D | — |
| fontfp | 字体列表 | fonts → SHA-256 | D | — |
| domrect | 元素尺寸（DOMRect） | getClientRects · Range | D | — |
| svgrect | SVG 文字尺寸 | SVG getBBox · getComputedTextLength | D | — |
| textm | 文字度量 | measureText actualBoundingBox | D | — |
| glimg | WebGL 渲染图像 | WebGL readPixels | D | — |
| keys | 引擎接口数 | window · HTMLElement · CSS keys | D | — |
| timer | 计时精度 | performance.now() resolution | D | — |
| callstack | 调用栈深度 | recursion depth | D | 限制 CPU／递归；受限设备跳过 |
| fpid | 综合指纹 | SHA-256 | D | 仅诊断组合值，不作身份 |
| hwid | 硬件编号（跨浏览器） | screen · cores · GPU · fonts → SHA-256 | D | 启发式组合值，不是硬件序列号 |
| etag | 缓存编号（ETag） | HTTP cache · ETag / If-None-Match | D | 专用主动诊断资源；不建立跟踪 ID |
| rand | 防指纹 | canvas × 2 | D | — |
| adsp | 反检测浏览器的破绽 | impossible readings · switcher marks | D | — |
| shield | 防护是谁 | navigator.brave · noise · lies | D | — |
