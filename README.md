# 课堂签到管理

GitHub Pages 提供免登录的示例页面。真实管理页面由本机服务提供，并且只绑定 127.0.0.1。生产表格标识和腾讯文档授权由运行环境传入。

## 本机管理

设置环境变量 `TENCENT_DOCS_CONFIG_FILE`（指向含 `client_id`、`open_id` 和 `access_token` 的 JSON 文件）或 `TENCENT_DOCS_CONFIG`，并设置 `SOURCE_LINK_ID`、`DESTINATION_LINK_ID`。运行 `node server.mjs` 后访问 http://127.0.0.1:6214/。

日期、课次与开课时间、名单，以及是否签到，均从腾讯签到原表读取。管理页每次只更新所选单元格并回读确认。

## 自动缺勤上报

仓库 Actions 设置 `TENCENT_DOCS_CONFIG`、`SOURCE_LINK_ID` 和 `DESTINATION_LINK_ID` 为 Secrets，设置 `REPORT_START_DATE` 为变量。任务安排在北京时间周一至周五 19:30，按本次读取的腾讯签到表汇总当天已开课的正式课次。模拟测试及有手工内容的签到格会跳过。如果托管任务延迟到 19:30 这一分钟以外，会跳过填报，防止使用其他时间的签到状态。任务不补报历史课次。重复任务串行执行，系统添加的记录以「签到系统自动缺勤」备注识别。

Actions 的手动运行默认仅计算统计。需要实际写入时勾选「写入缺勤表」。如腾讯文档令牌到期，需要更新仓库中的 Secret。GitHub 托管任务可能延时。
