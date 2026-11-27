# Momo DataFlow 设计包 JSON v1

更新日期：2026-11-27。源码合同：[`design-import.ts`](../../src/studio/domain/design-import.ts)，界面限制：[`design-import-dialog.tsx`](../../src/studio/components/design-import-dialog.tsx)。这是当前已实现格式说明；未知扩展不当成已支持。

[English](DESIGN_PACKAGE_JSON_EN.md) · [机器可读 Schema](design-package-v1.schema.json) · [智能体说明](AGENT_GUIDE.md) · [任务模板](templates/design-package-task.md)

## 1. 文件与用途

使用 UTF-8、合法 JSON，无注释/尾逗号，建议扩展名 `.stackrender.json`。可直接编辑文件，保留稳定实体ID并同步引用；不是修改浏览器运行存储。最小完整例子见 [design-package-v1.example.json](examples/design-package-v1.example.json)，其中只有虚构结构。

格式标识 `stackrender-design-package` 和建议扩展名保留用于兼容已有设计包，不代表本版开放原 StackRender ERD 或 SQL 导入入口。

设计包描述表结构和业务模块，不含业务行、密码、Token、真实连接配置或执行脚本。实际业务 JSON 保存在业务项目，不放入工具公共示例。SQL类型只作设计元数据，不产生DDL。

## 2. 两种JSON不能混用

| 格式 | 位置/用途 | 当前支持 |
|---|---|---|
| `format: stackrender-design-package`，`version: 1` | 顶部“导入设计包” | MySQL类型目录、表/字段/备注、普通步骤分组、局部表引用、等值字段条件、索引和有证据的物理关系 |
| `BusinessDocument.schemaVersion: 2` | 应用内部业务文档 | 类型模板、映射表达式、开始/结束/判断、流程连线等；不能直接当包v1上传 |
| DrawDB、draw.io、原StackRender其他导出格式 | 外部来源材料；本版无对应原生导入入口 | 顶部设计包导入不会自动转换；先明确适配，不只改扩展名 |

包v1中 `steps[].kind` 只可省略或为 `step`；`transitions` 只可省略或空数组；`rules[].mappings` 必须为空数组。非空规则至少有一条有效匹配条件。界面编辑的公式/触发只保存说明、不计算；v1禁止导入这些内容，不能通过混入内部JSON规避校验。

## 3. 顶层字段

所有下列字段均应提供；空集合用 `[]`，不能省略。

| 字段 | 类型/要求 |
|---|---|
| `format` | 固定字符串 `stackrender-design-package` |
| `version` | 固定数字 `1` |
| `packageId` | 非空版本标识字符串；不是数据库实体ID，不作为覆盖/去重凭证 |
| `name` | 非空包名称，用于导入预览 |
| `capturedAt` | 非空字符串，建议ISO8601及明确时区；结构采集时间不要冒充本次整理时间 |
| `note` | 非空来源、范围、确认状态、限制说明 |
| `database` | `{id, name, dialect: "mysql"}`；name为新设计库名称 |
| `tables` | 表定义数组 |
| `flows` | 业务流程/模块数组 |
| `refs` | 步骤中的表引用数组 |
| `rules` | 同一流程内字段条件数组 |
| `relationships` | 物理关系数组；无明确证据时空数组 |
| `indexes` | 索引元数据数组 |

所有实体ID使用合法UUID，包内跨实体类别不得重复，也不能碰撞现有工作区ID。数据库/表/字段/流程/步骤/引用/规则/条件/物理关系/索引都有自己的ID。来源格式只在表内唯一的fieldId适配时必须加表命名空间，例如 UUIDv5(namespace, tableId + fieldId)。

表名包内唯一、字段名表内唯一。同一表跨模块出现只增加ref，不重新定义同一个表。

## 4. 表、字段和SQL类型

`tables[]` 必需：`id, name, label, note, columns`。`columns`非空。`name`为技术名称，推荐完整`schema.table`；`label`为中文说明名；`note`说明职责、粒度、来源/状态和候选精简。label/note可空字符串，来源说明不建议省略。

`columns[]`：

| 字段 | 要求 |
|---|---|
| `id, name, type` | UUID、非空技术字段名、非空SQL基础类型名 |
| `note` | 字符串；写来源/单位/币种/确认与精简建议，不填执行指令 |
| `label` | 可选中文显示名 |
| `primary, nullable` | 必需布尔值 |
| `defaultValue` | 必需字符串或null，数字默认值也用字符串 |
| `precision, scale, maxLength` | 各必需非负安全整数或null；scale≤precision（两者都非空时） |
| `unique, unsigned, autoIncrement` | 可选布尔值 |
| `collate` | 可选字符串或null |

`DECIMAL(18,2)`应写 `type:"decimal", precision:18, scale:2, maxLength:null`；`VARCHAR(100)`写 `type:"varchar", maxLength:100, precision:null, scale:null`。不是把完整参数串塞进type。类型按MySQL类型库名称/声明的synonyms匹配（不区分大小写）；未知类型保留原说明并令typeId为空，不自动转换为字符串。

新设计金额模板固定两位，但原结构快照应保留真实原精度；两者分别说明，不能在“读取结构”时静默改源定义。数量、汇率等类型由具体业务合同决定，工具说明不跨项目新增规则。

## 5. 流程、步骤与表引用

`flows[]`必需：`flowId, databaseId, name, note, steps`；databaseId必须等于当前新设计库ID。

每个 `steps[]`：`stepId, name, note, x, y, w, h`；坐标/尺寸为有限数字，w/h>0；kind省略或`step`。当前v1不会导入业务顺序/触发线，按步骤编号、分组及备注表达已确认顺序，后续可在界面编辑。

每个 `refs[]`：`refId, flowId, stepId, tableId, x, y, collapsed`；坐标是相对父步骤的位置，collapsed是布尔值。

- 引用的步骤必须属于该flow，表必须属于当前包。
- 可选`visibleFieldIds`只列该表字段ID。省略表示全部字段；`[]`表示当前不显示任何字段；`collapsed:true`折叠表。
- `visibleFieldIds`只控制画布展示，不改变`columns`，不是删字段。
- 表可跨步骤引用；一个步骤可以放多表。布局由文件提供，生成时留出字段展开空间，避免重叠。

## 6. 字段规则：多个条件

每个 `rules[]`：`ruleId, flowId, name, note, logic, conditions, mappings:[]`。logic为`ALL`或`ANY`。

`conditions[]`每条包含：

```json
{
  "id": "条件自己的UUID",
  "left": {"refId": "来源表引用UUID", "fieldId": "来源字段UUID"},
  "right": {"refId": "目标表引用UUID", "fieldId": "目标字段UUID"}
}
```

这段展示属性形状，不是可单独导入的有效UUID示例；可运行值见完整示例文件。

两端ref属于当前规则flow，field属于各自ref指向的表；字段类型须兼容。条件没有自定义SQL运算符，表达等值字段匹配；ALL/ANY组合不等于支持完整SQL谓词。金额分配/来源版本/有效状态/空值/范围等额外限制写note及业务合同，不伪装成已执行JOIN。

不要凭同名字段生成关系，也不要把业务逻辑条件写到物理外键数组。复杂公式需确认后在界面原生映射编辑器配置，包v1不导入映射。

## 7. 索引与物理关系

`indexes[]`：`id, tableId, name, unique, fieldIds`，fieldIds非空、均属于tableId；保留来源列序。元数据用于说明，不执行建索引。

`relationships[]`完整对象：`id, name, sourceTableId, targetTableId, sourceFieldId, targetFieldId, cardinality, onDelete, onUpdate, databaseId, sourceAliasName, targetAliasName, createdAt`。

- name、sourceAliasName、targetAliasName、createdAt可为null；两个端点字段各属于对应表；databaseId等于新设计库ID。
- cardinality：`one_to_one / one_to_many / many_to_one / many_to_many`。
- onDelete/onUpdate：null或`no_action / cascade / set_null / set_default / restrict`。
- 只登记有来源证据的物理关系；复合约束的原始分组/列序/限制需另记note/来源合同，不声称当前单字段模型完整表达所有DDL约束。

## 8. 限制、更新和错误

UI文件上限30MiB；包内表≤2000、模块≤500、规则≤10000、累计字段≤50000；其余主要列表按当前规划器单列表≤50000。较大的结构按业务范围拆，引用不得悬空。当前非空名称/标识字符串检查长度<20000字符；不把该字符限制说成字节/上下文预算。

导入先检查草稿已保存、格式、全局ID/同名库、端点/类型，再事务追加本地目录和业务文档；失败不覆盖旧图，不把部分模型说明当成功。

修改未导入文件时保留实体ID、同步全部引用。对已导入内容，单改packageId不会使旧实体可重复导入：当前无覆盖/增量合并接口；修订应纳入用户修改后另做新名称/独立ID的新库版本，保留源→新实体映射。源JSON与浏览器数据不自动同步。

## 9. Agent交付检查

1. JSON能解析只是第一步；再检查所有引用、ID、类型、同表/同流程范围。
2. 用当前`planDesignImport`在独立工作区快照验证整包；确保输入快照未变、原表保留、重导拒绝。可复用tests/helpers/workspace-fixture.ts中的测试fixture，不连接真实业务数据库。
3. 记录源码版本、输入来源时间、表/字段/模块/规则数量和未支持内容。验证包不需要运行全量业务测试或Mini模型。
4. 检查全字段保留/关键字段隐藏与真实删改是否分清、旧结构/目标设计/候选确认是否明确。
5. 通知用户如何导入/修改；写清是否真的导入浏览器。不得用规划器通过冒充真实页面导入或业务验收。

相关实现：[`business.ts`](../../src/studio/contracts/business.ts)、[`catalog.ts`](../../src/studio/contracts/catalog.ts)、[`rule-validation.ts`](../../src/studio/domain/rule-validation.ts)、[`local-workspace.ts`](../../src/studio/local-workspace.ts)。

## 原生只读校验

运行 `npm run validate:design -- /absolute/path/to/design.stackrender.json`，使用当前原生导入规划器和内存 MySQL 类型库。它校验 ID、引用、类型兼容及 v1 限制，不写浏览器或源文件。通过不等于现有浏览器工作区可导入：实际名称/ID 冲突、持久化基线仍在界面中校验。Schema 描述保守的生成结构，不能替代原生语义检查。
