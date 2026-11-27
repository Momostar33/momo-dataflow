# StackRender 来源说明

Momo DataFlow 基于 [StackRender](https://github.com/stackrender/stackrender) 二次开发。StackRender 原版定位为开源数据库结构图生成器，原 README 介绍了 ERD、表字段控制、索引建议、SQL DDL 导入导出、外键循环检测以及其云端 AI 能力。

本目录的 [STACKRENDER_README.md](STACKRENDER_README.md) 是未改写的原版说明快照，取自本地保留的原始基线 `6eca62716165cd943dc4a2a23c38323a03b25778`，于 2026-11-27 归档供来源对照。该提交标识是本地保留基线，不声明它是上游当前分支。快照中的相对链接、启动端口、Docker 指令和云服务介绍属于原项目上下文，请到原仓库查阅；Momo DataFlow 以根目录 README 的启动步骤和已实现范围为准。

本次修改版通过 StackRender Momo Plus 的已完成修复快照 `078cef7966dd5375dcc4bef383f3ee7cbabb92f3` 整理而来。保留原版表字段基础、SQL 类型库及浏览器本地持久化，在其上加入业务步骤、流程内表引用、字段关系与描述性公式、字段模板以及只读总览。

Momo DataFlow 不开放原版 ERD 窗口；也不将原版 SQL 导入导出、云端 AI、Docker 配置或多数据库使用路径列为本版已验证能力。现有源代码可包含未被公开入口引用的上游模块，这与界面能力不同。

原作者和贡献者版权声明继续保留。原 AGPLv3 许可全文见根目录 [LICENSE](../../LICENSE)，本版修改日期与范围见 [NOTICE](../../NOTICE.md)。这是一份独立衍生版，不是 StackRender 官方发行版。
