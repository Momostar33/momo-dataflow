# Screenshots / 界面截图

Captured from the actual **Momo DataFlow v0.1.0-beta.4** production preview on 2026-11-27. Native viewport: 1280 × 720; no mock UI or screenshot text replacement. All design metadata is fictional, with no business row data, credentials or private diagrams.

| File | Screen / 页面 |
| --- | --- |
| [flow-en.jpg](flow-en.jpg) | English flow canvas and descriptive formula / 英文流程画布与说明性公式 |
| [flow-zh.jpg](flow-zh.jpg) | The same editor in Chinese / 同一编辑器的中文界面 |
| [catalog-en.jpg](catalog-en.jpg) | Table/field catalog with shared money-template assignments / 表字段及金额模板采用 |
| [templates-en.jpg](templates-en.jpg) | Reusable DECIMAL(18,2) template / 两位小数的金额字段模板 |
| [overview-en.jpg](overview-en.jpg) | Read-only, automatically arranged table relationships / 自动排布的只读表关系 |

The [showcase package](../usage/examples/showcase-purchase.stackrender.json) imports 3 tables, 11 fields, 2 ordinary steps, 3 table references and 2 equality rules. Through the actual UI, the screenshot setup then adds a money template, confirms its application to three amount fields, and adds `line_amount = unit_price × quantity` as a descriptive mapping. These UI additions are not part of the package-v1 payload; do not imply v1 can import templates/formulas/transitions.

Chinese names and notes visible in English screenshots are user-authored demo content, which language switching deliberately preserves. Canvas zoom/pan and the properties-panel scroll position frame the selected relationship; screenshots do not claim every object is simultaneously visible. The overview uses saved data and does not calculate any business values.
