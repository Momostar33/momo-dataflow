# Contributing

Please include the action, expected and actual behavior, browser/version, and a minimal fictional JSON example when reporting a problem. Do not include credentials, internal business designs or browser storage dumps.

Keep changes within the current design-workbench scope. Discuss changes to data identity, persistence, JSON compatibility, evaluation of formulas or workflow execution before implementing them. New functionality needs a clear contract and independent acceptance cases.

Run `npm test`, `npm run typecheck` and `npm run build`. Type checking covers the public application entry and its dependencies, not unused inherited modules. Changes to dependency locks should be intentional. Preserve StackRender copyright notices and the GNU AGPLv3 license, and record meaningful downstream modifications and dates.
