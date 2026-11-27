# Momo DataFlow

**把业务流程、参与的表和字段关联，放在同一张设计工作台里。**

Momo DataFlow is a local-first workbench for business flows, data tables and field relationships. It is **based on StackRender**, with an independently maintained business-design interface. See [source attribution](NOTICE.md).

> Version **0.1.0-beta.1 — preview**. The original StackRender ERD window is not exposed in this edition. Formulas and triggers describe business logic; they are not executed.

## What you can do

- 管理表名、说明名、备注、字段和类型模板；金额模板固定两位小数，模板更新先预览再确认批量应用。
- 为采购、收货、订单结算等业务分别建立流程；添加步骤、开始/结束和判断节点，只拉入该流程参与的表。
- 保存多条件字段匹配、直接映射和四则公式说明；同一张表可在不同步骤引用。
- 查看只读关系总览及表所在的业务模块。
- 手动保存或自动保存至当前浏览器的本地SQLite，默认每5分钟自动保存。
- 导入适配好的JSON设计包，也可直接编辑源JSON后整理新版本供审阅。

## Run locally

Prerequisites: Node.js (recommend **Node 24 LTS**), npm, and a modern Chromium browser. Node 25.8.0 was used for this release's local checks; older supported versions have not been re-tested here.

```sh
git clone https://github.com/Momostar33/momo-dataflow.git
cd momo-dataflow
npm ci
npm run dev
```

Open **http://127.0.0.1:4327**. This preview uses a different port and SQLite filename from the author's Momo Plus workspace. Keep the same browser profile and address for the same local data. Stopping the terminal stops the app server; saved browser data remains.

First use: click **新建设计库**, enter a name, then add tables and fields. The first release creates MySQL-design catalogs. This does not connect to an external MySQL server. Alternatively import the [fictional example](docs/usage/examples/design-package-v1.example.json) through **导入设计包**.

For a production bundle:

```sh
npm run build
npm run preview
```

There is no hosted service, login, real-time collaboration or desktop installer in this release.

## Data and JSON boundaries

Designs are stored in the browser for this origin. Clearing site data removes them. Git tracks source files and explicitly committed JSON files, not browser drawings.

Source JSON and the browser database do **not** automatically synchronize. Package v1 imports a new design library; it does not overwrite or merge an existing library. It imports ordinary step groups and field equality conditions. Formula mappings and flow transitions can be edited in the workbench, but cannot be imported through package v1 yet. Full package export/round-trip and version merging are not implemented in this preview. Keep source JSON when preparing designs for review and use appropriate local backups for anything important.

The app visualizes relationships; it does not run formulas, workflow jobs, business APIs, SQL migrations or AI coding agents. Removing the original ERD window does not remove the need for table and field metadata.

## Documentation

- [使用说明 / User guide](docs/usage/USER_GUIDE.md)
- [Design package JSON format](docs/usage/DESIGN_PACKAGE_JSON.md)
- [Importable fictional example](docs/usage/examples/design-package-v1.example.json)
- [Release notes](CHANGELOG.md)
- [Contributing and scope](CONTRIBUTING.md)

## Development

```sh
npm test
npm run build
```

`npm run typecheck` checks the public application entry dependency graph. Unused upstream modules retained for provenance are outside that entry graph; this is not a claim that the complete inherited legacy tree is type-clean. Bundling and automated tests are not a substitute for business validation. Do not import real business data or credentials into issue reports or examples.

## License and upstream

Based on [StackRender](https://github.com/stackrender/stackrender), an AGPLv3 project. Existing upstream notices and the license are retained. Momo DataFlow modifications are dated in [NOTICE.md](NOTICE.md). Distributed under **GNU AGPL v3**, without warranty; see [LICENSE](LICENSE). This is an independent derivative, not an official StackRender product.
