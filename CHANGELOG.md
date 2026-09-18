## 0.4.1

### Bug Fixes 🐛

#### Deps

- Upgrade adm-zip to 0.6.1 by @MathurAditya724 in [#111](https://github.com/getsentry/coverage-action/pull/111)
- Update js-yaml and align Vitest packages by @MathurAditya724 in [#107](https://github.com/getsentry/coverage-action/pull/107)
- Resolve Dependabot alerts by @MathurAditya724 in [#101](https://github.com/getsentry/coverage-action/pull/101)

#### Website

- Restore dashboard data loading and deep links by @MathurAditya724 in [#106](https://github.com/getsentry/coverage-action/pull/106)
- Validate GitHub repository URLs by @MathurAditya724 in [#102](https://github.com/getsentry/coverage-action/pull/102)

#### Other

- (comment) Clarify patch coverage results by @MathurAditya724 in [#110](https://github.com/getsentry/coverage-action/pull/110)
- (status) Report on PR head commit and diff against merge commit by @jared-outpost in [#108](https://github.com/getsentry/coverage-action/pull/108)
- Use Coverage branding in reports and dashboard by @MathurAditya724 in [#109](https://github.com/getsentry/coverage-action/pull/109)

## 0.4.0

### Bug Fixes 🐛

#### Action

- Resolve pull request coverage refs by @MathurAditya724 in [#100](https://github.com/getsentry/coverage-action/pull/100)
- Reference renamed coverage repository by @MathurAditya724 in [#98](https://github.com/getsentry/coverage-action/pull/98)

#### Other

- (patch) Skip zero-hit comment lines in patch coverage by @betegon in [#80](https://github.com/getsentry/coverage-action/pull/80)

### Internal Changes 🔧

- (deps) Consolidate Dependabot updates by @MathurAditya724 in [#99](https://github.com/getsentry/coverage-action/pull/99)

## 0.3.8

### New Features ✨

- (comment) Add comment-key input for per-step PR comment namespacing by @null0rUndefined in [#88](https://github.com/getsentry/codecov-action/pull/88)

### Bug Fixes 🐛

- Bump fast-xml-parser to ^5.5.10 to fix entity expansion limit on large JUnit XML by @mydea in [#77](https://github.com/getsentry/codecov-action/pull/77)
- Add `coverage.cobertura.xml` to default discovery patterns by @jpnurmi in [#76](https://github.com/getsentry/codecov-action/pull/76)

### Documentation 📚

- Document comment-key input in README by @MathurAditya724 in [#91](https://github.com/getsentry/codecov-action/pull/91)

### Internal Changes 🔧

#### Deps Dev

- Bump vite from 7.2.6 to 7.3.5 by @dependabot in [#86](https://github.com/getsentry/codecov-action/pull/86)
- Bump vitest from 4.0.15 to 4.1.0 by @dependabot in [#84](https://github.com/getsentry/codecov-action/pull/84)

#### Other

- (deps) Bump fast-xml-parser and js-yaml, rebuild bundle by @MathurAditya724 in [#92](https://github.com/getsentry/codecov-action/pull/92)
- (junit) Guard entity expansion limit on large reports by @MathurAditya724 in [#90](https://github.com/getsentry/codecov-action/pull/90)

### Other

- license: add Apache-2.0 license by @sentry-junior in [#81](https://github.com/getsentry/codecov-action/pull/81)

## 0.3.7

### Bug Fixes 🐛

- Restore release branch CI trigger with concurrency group by @MathurAditya724 in [50346018](https://github.com/getsentry/codecov-action/commit/50346018713cd2af5ca575f3090f97095b27d118)

### Other

- Update .craft.yml by @MathurAditya724 in [f43d9dd5](https://github.com/getsentry/codecov-action/commit/f43d9dd5d9477f04fc3f34c20f0c1f83706f0474)
- Update .craft.yml by @MathurAditya724 in [845691d4](https://github.com/getsentry/codecov-action/commit/845691d4fa0de95c6aad0beb7c9d1e69759aa422)
- Update build.yml by @MathurAditya724 in [a2ddfa3d](https://github.com/getsentry/codecov-action/commit/a2ddfa3d8ec074e2410ae55c97eead83c253ba9d)

## 0.3.3

### Bug Fixes 🐛

- Add statusProvider to prevent release workflow from blocking itself by @MathurAditya724 in [a793b59e](https://github.com/getsentry/codecov-action/commit/a793b59e8c3e515484754748c9dbdd43c22c6aa4)

## 0.3.1

- Update CHANGELOG.md by @MathurAditya724 in [78a2a4a5](https://github.com/getsentry/codecov-action/commit/78a2a4a5077c33de3a587b64d3462d98b49f9217)

## 0.3.0

### New Features ✨

- Deploy website to GitHub Pages on release by @MathurAditya724 in [#68](https://github.com/getsentry/codecov-action/pull/68)

### Bug Fixes 🐛

- Trigger CI on release branches by @MathurAditya724 in [24ef6ffd](https://github.com/getsentry/codecov-action/commit/24ef6ffd690604208d64c9e2208d03abe6f00dfd)
- Show full file paths with links to PR diff in coverage table by @MathurAditya724 in [#67](https://github.com/getsentry/codecov-action/pull/67)
- Show patch-specific uncovered lines in PR comment by @MathurAditya724 in [#65](https://github.com/getsentry/codecov-action/pull/65)
- Correct patch coverage calculation and baseline artifact lookup by @MathurAditya724 in [#56](https://github.com/getsentry/codecov-action/pull/56)
- Informational mode, input overrides, and floating point precision by @BYK in [#54](https://github.com/getsentry/codecov-action/pull/54)
- Updated the codecov config in CI by @MathurAditya724 in [fda17cfc](https://github.com/getsentry/codecov-action/commit/fda17cfc37e16a0cc23f61685813390bfee7daf3)

### Internal Changes 🔧

#### Deps

- Bump lucide-react from 0.555.0 to 1.6.0 by @dependabot in [#60](https://github.com/getsentry/codecov-action/pull/60)
- Bump @tanstack/react-query from 5.90.21 to 5.95.2 by @dependabot in [#61](https://github.com/getsentry/codecov-action/pull/61)
- Bump react-router-dom from 7.13.1 to 7.13.2 by @dependabot in [#62](https://github.com/getsentry/codecov-action/pull/62)
- Bump fast-xml-parser from 5.4.1 to 5.5.7 by @dependabot in [#52](https://github.com/getsentry/codecov-action/pull/52)
- Bump react-router-dom from 7.10.1 to 7.13.1 by @dependabot in [#38](https://github.com/getsentry/codecov-action/pull/38)
- Bump fast-xml-parser from 5.3.8 to 5.4.1 by @dependabot in [#37](https://github.com/getsentry/codecov-action/pull/37)
- Bump react and @types/react by @dependabot in [#39](https://github.com/getsentry/codecov-action/pull/39)

#### Other

- (ci) Upgrade action runtime from node20 to node24 by @BYK in [#53](https://github.com/getsentry/codecov-action/pull/53)
- Add workflow to check dist/index.js is up to date by @MathurAditya724 in [#57](https://github.com/getsentry/codecov-action/pull/57)

### Other

- Update .gitignore by @MathurAditya724 in [c3ef86d1](https://github.com/getsentry/codecov-action/commit/c3ef86d18a5f499a466d547322a0382839c4eb99)
