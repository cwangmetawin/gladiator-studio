# 第六期：待办里的四件小事（2026-10-20）

来由：老板 2026-10-19 23:15Z 说「所有session全力干」。第五期签收后没有进行中的阶段，本会话核对了
`docs/plans/2026-10-15-backlog.md`，挑出不碰红线、不涉及审美的四项，写成 A/B 给 Boss。Boss 2026-10-20 代定 A
（依据老板那句话，早上报老板）。合 main 就是上线正式站，这一步等老板本人。

## 范围

1. **会话确认的竞态**（#31 Codex 复核指出）：后台在 `admin-partners` 回 401 后确认会话。原来调 supabase-js 的
   `getUser()`，遇到 session_not_found 它会清掉当时存着的会话，哪怕那是刚在别的标签页登录的新会话。改成拿处理 401 时
   本地存着的令牌（就是这次请求用的那个，除非别的标签页刚换掉它），去问一个不存会话的独立客户端；只有本地存的还是同一个
   令牌时才在本地登出，登出请求本身失败或读不到会话时都不算登出。
2. **嵌套弹窗的焦点顺序**（第三期 Codex 复核指出）：焦点管理器按挂载先后决定谁在最上层。外层弹窗和它里面的弹窗同时挂载时，
   React 先跑里层的副作用，外层后挂上就被当成最上层（Esc 关外层、Tab 跑到被盖住的控件）。改成按 DOM 包含关系排：外层永远在
   它里面的弹窗下面，外层关闭时回到里层记下的触发按钮。现在的页面里没有能同时挂载的嵌套弹窗，这是预防。
3. **数据库整理（只写迁移文件）**：`v2/supabase/migrations/20261020120000_legacy_grants_and_partner_index.sql`。
   撤掉 public 的 5 张旧表（admins、admin_emails、enquiries、games、site_content）给 anon / authenticated 的
   TRUNCATE、TRIGGER、REFERENCES（行级安全管不到 TRUNCATE，网站也用不到这三种）；给 `partners.created_by` 建索引。
   `storage.objects`、`storage.buckets` 归 Supabase 存储服务管，不动。迁移末尾自查：授权还在或索引没建就报错，整段回滚
   （非属主执行 REVOKE 只给警告不报错）。正式库由老板本人在控制台执行，本会话不碰；执行后跑只读的
   `v2/supabase/tests/legacy_grants.sql` 核对。
4. **待办文档整理**：标出已过时的（GameCoverflow 已删）和已达标的（手机 Lighthouse 正式站中位 80），把本期四项标成第六期。
5. **Careers 没有职位时的页面**（老板 2026-10-20：「career没有open role你是否需要优化下」，三选一里选「A 换成投简历页」）：
   后台把职位清空后，页面显示大标题「Open roles」、「0 open roles」和一片空白，第二章还问「Role Not Listed?」。没有职位时改成
   一章：「No open roles right now」，正文邀请资深人才投简历，按钮「Send your dossier」直接写邮件；不显示章节目录。Team 页的按钮
   在没有职位时写「Work with us」。后台一加职位，页面自动恢复现在的职位列表。单独一个 PR（#33 已上线）。

## 终点（全部满足才算结束）

| # | 验收（可量化） |
|---|----------------|
| ① | 单元测试：只有 401 才去问独立客户端，问的是本地存着的令牌；网站自己的客户端的 `getUser()` 一次都不调；确认期间别处存进了新令牌时不登出、保留后端原话；会话仍有效或问不到时不登出；本地什么都没存时照样回登录页；登出请求失败、读会话出错时不说「已登出」。每条先红后绿，关键判断做变异检查 |
| ② | 单元测试：里层先挂、外层后挂时，焦点留在里层，Tab 不出里层，Esc 先关里层；里层关了焦点到外层；外层关了回到最初的触发按钮。先红后绿 |
| ③ | 本地一次性 Postgres（`v2/supabase/tests/local/run-rls.sh`）：有新迁移时授权检查通过（9 张表上 anon / authenticated 都没有 TRUNCATE、TRIGGER、REFERENCES；5 张旧表的 SELECT/INSERT/UPDATE/DELETE 原样保留；`partners.created_by` 有索引），合作方权限测试仍是 50/50；去掉新迁移时脚本失败。正式库不动 |
| ④ | 待办文档里每条都标明现状 |
| ⑤ | 一个 PR：本地 gate（tsc、eslint、函数和单元测试、构建）全绿；Netlify 预览三项检查 SUCCESS；opus-max 盲审结论 COMPLETE，并单独回答「会不会把还有效的会话错误登出，或者该登出的没登出」；预览上浏览器复测（会话失效回登录页、竞态时保留新登录、整页和游戏弹层的 Esc 和焦点）；入口包只多本期改动本身（共享焦点管理器和会话确认，约 0.2 kB），不新增依赖 |
| ⑤′ | Careers：单元测试覆盖没有职位（只有一章、文案和邮件按钮、没有「0 open roles」和空列表、没有目录）、有职位（和现在一样）、没标题的行不算职位、Team 按钮两种文案；先红后绿。预览上桌面和手机截图（没有职位）给老板过目，并用拦截的数据看一次有职位的样子；老板批准合并，正式站复测 |
| ⑥ | 老板批准合并（= 上线），正式站复测；老板在控制台执行 ③ 的迁移后只读核对授权和索引；老板签收第六期 |

## 回退

一个 PR、一个合并提交。出问题就在 GitHub 上 revert 该合并提交，Netlify 会自动重新部署上一版。迁移撤掉的是网站用不到的
授权，要恢复就 `grant truncate, trigger, references on <表> to anon, authenticated;`；索引可以直接 drop。
