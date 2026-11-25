# 课堂签到管理

GitHub Pages 提供免登录的示例页面。真实管理页面由本机服务提供，并且只绑定 127.0.0.1。生产表格标识和腾讯文档授权由运行环境传入。

## 本机管理

设置环境变量 `TENCENT_DOCS_CONFIG_FILE`（指向含 `client_id`、`open_id` 和 `access_token` 的 JSON 文件）或 `TENCENT_DOCS_CONFIG`，并设置 `SOURCE_LINK_ID`、`DESTINATION_LINK_ID`。运行 `node server.mjs` 后访问 http://127.0.0.1:6214/。

日期、课次与开课时间、名单，以及是否签到，均从腾讯签到原表读取。管理页每次只更新所选单元格并回读确认。

## 自动缺勤上报

仓库 Actions 设置 `TENCENT_DOCS_CONFIG`、`SOURCE_LINK_ID` 和 `DESTINATION_LINK_ID` 为 Secrets，设置 `REPORT_START_DATE` 为变量。任务在北京时间 20:00 执行，20:17 补跑一次。上报跳过模拟测试列、当天尚未开课的课次和非空的手工签到值。原表只有开课时间，因此以 20:00 为日结时间。任务在最近三天内补跑并同步签到更正。超过该窗口的历史更正由填报人处理。重复任务串行执行，系统添加的记录以「签到系统自动缺勤」备注识别。

Actions 的手动运行默认仅计算统计。需要实际写入时勾选「写入缺勤表」。如腾讯文档令牌到期，需要更新仓库中的 Secret。GitHub 托管任务可能延时。
