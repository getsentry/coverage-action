# Coverage Action

![build](https://github.com/getsentry/coverage-action/actions/workflows/build.yml/badge.svg)

Self-hosted coverage and test reporting with GitHub Actions. Uses GitHub Artifacts for storage — no external service or Codecov token required.

## Quick Start

```yaml
name: Test

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Run tests with coverage
        run: npm test -- --coverage
      
      - name: Coverage Action
        uses: getsentry/coverage-action@0.3.8
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
```

## Supported Coverage Formats

| Format | File Patterns | Languages/Tools |
|--------|--------------|-----------------|
| **Clover XML** | `clover.xml` | Istanbul/NYC (JS/TS), PHPUnit, OpenClover |
| **Cobertura XML** | `coverage.xml`, `cobertura.xml` | coverage.py (Python), Coverlet (.NET), PHPUnit |
| **JaCoCo XML** | `jacoco.xml` | Java, Kotlin, Scala |
| **LCOV** | `lcov.info`, `*.lcov` | c8, lcov (C/C++), grcov (Rust), gcov |
| **Istanbul JSON** | `coverage-final.json` | Jest, Vitest, NYC (JS/TS) |
| **Go Coverage** | `coverage.out`, `cover.out` | `go test -coverprofile` |
| **Codecov JSON** | `codecov.json` | cargo-llvm-cov (Rust), custom tools |

## Inputs

### Core Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `token` | GitHub token for API access and artifacts | **Yes** | — |
| `base-branch` | Base branch to compare results against | No | Auto-detected |
| `enable-tests` | Enable test results reporting | No | `true` |
| `enable-coverage` | Enable coverage reporting | No | `true` |
| `post-pr-comment` | Post results as a PR comment | No | `false` |
| `comment-key` | Namespace the PR comment per step so steps sharing this action post separate comments instead of overwriting each other | No | — |
| `title` | Heading of the PR comment and Job Summary | No | `Coverage Results 📊` |

### Coverage File Discovery (Codecov-style)

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `files` | Comma-separated list of coverage files | No | — |
| `directory` | Folder to search for coverage files | No | `.` |
| `exclude` | Comma-separated patterns to exclude | No | — |
| `coverage-format` | Format hint: `auto`, `clover`, `cobertura`, `jacoco`, `lcov`, `istanbul`, `go`, `codecov` | No | `auto` |
| `disable-search` | Disable auto-search, use only explicit `files` | No | `false` |

### Behavior Flags (Codecov-style)

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `fail-ci-if-error` | Fail if coverage processing errors (e.g., parsing failures, missing files) | No | `false` |
| `handle-no-reports-found` | Don't fail if no coverage found | No | `false` |
| `verbose` | Enable verbose logging | No | `false` |

### Status Checks & Thresholds

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `target-project` | Target project coverage % (or `auto` to use base branch coverage) | No | — |
| `threshold-project` | Allowed project coverage drop % (only used when target is `auto`) | No | — |
| `target-patch` | Target patch coverage % for changed lines | No | `80` |
| `fail-on-error` | Fail CI if coverage thresholds are not met (distinct from `fail-ci-if-error`) | No | `false` |

When thresholds are not configured, status checks report coverage metrics without enforcing pass/fail.

### Grouping & Identification

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `flags` | Comma-separated flags to tag coverage (e.g., `unittests,frontend`) | No | — |
| `name` | Custom name for this coverage upload. Also used to differentiate artifacts in matrix builds | No | — |

### Test Results

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `junit-xml-pattern` | Glob pattern for JUnit XML files | No | `./**/*.junit.xml` |

## Outputs

### Test Outputs

| Output | Description |
|--------|-------------|
| `total-tests` | Total number of tests run |
| `passed-tests` | Number of passed tests |
| `failed-tests` | Number of failed tests |
| `test-pass-rate` | Percentage of tests that passed |
| `tests-added` | Tests added compared to base branch |
| `tests-removed` | Tests removed compared to base branch |
| `tests-fixed` | Tests changed from failing to passing |
| `tests-broken` | Tests changed from passing to failing |

### Coverage Outputs

| Output | Description |
|--------|-------------|
| `line-coverage` | Line coverage percentage |
| `branch-coverage` | Branch coverage percentage |
| `coverage-change` | Change in line coverage vs base branch |
| `branch-coverage-change` | Change in branch coverage vs base branch |
| `coverage-improved` | Whether coverage improved (`true`/`false`) |
| `coverage-format` | The detected/used coverage format |

## Usage Examples

### Basic Usage (Auto-detect)

```yaml
- name: Coverage Action
  uses: getsentry/coverage-action@0.3.8
  with:
    token: ${{ secrets.GITHUB_TOKEN }}
```

### Explicit Files (Codecov-style)

```yaml
- name: Coverage Action
  uses: getsentry/coverage-action@0.3.8
  with:
    token: ${{ secrets.GITHUB_TOKEN }}
    files: ./coverage/lcov.info,./backend/coverage.xml
    disable-search: true
    flags: unittests
    name: my-coverage
    verbose: true
```

### Python with Cobertura

```yaml
- name: Run tests
  run: pytest --cov=src --cov-report=xml

- name: Coverage Action
  uses: getsentry/coverage-action@0.3.8
  with:
    token: ${{ secrets.GITHUB_TOKEN }}
    directory: ./
    coverage-format: cobertura
    fail-ci-if-error: true
```

### Java with JaCoCo

```yaml
- name: Build and test
  run: ./gradlew test jacocoTestReport

- name: Coverage Action
  uses: getsentry/coverage-action@0.3.8
  with:
    token: ${{ secrets.GITHUB_TOKEN }}
    files: ./build/reports/jacoco/test/jacocoTestReport.xml
    coverage-format: jacoco
```

### Go Coverage

```yaml
- name: Run tests
  run: go test -coverprofile=coverage.out ./...

- name: Coverage Action
  uses: getsentry/coverage-action@0.3.8
  with:
    token: ${{ secrets.GITHUB_TOKEN }}
    files: ./coverage.out
    coverage-format: go
```

### Rust with cargo-llvm-cov

```yaml
- name: Install cargo-llvm-cov
  uses: taiki-e/install-action@cargo-llvm-cov

- name: Run tests with coverage
  run: cargo llvm-cov --codecov --output-path codecov.json

- name: Coverage Action
  uses: getsentry/coverage-action@0.3.8
  with:
    token: ${{ secrets.GITHUB_TOKEN }}
    files: ./codecov.json
    coverage-format: codecov
```

### JavaScript/TypeScript with LCOV

```yaml
- name: Run tests
  run: npm test -- --coverage --coverageReporters=lcov

- name: Coverage Action
  uses: getsentry/coverage-action@0.3.8
  with:
    token: ${{ secrets.GITHUB_TOKEN }}
    directory: ./coverage
    coverage-format: lcov
```

### Monorepo with Flags

```yaml
- name: Frontend Coverage
  uses: getsentry/coverage-action@0.3.8
  with:
    token: ${{ secrets.GITHUB_TOKEN }}
    directory: ./frontend/coverage
    flags: frontend
    name: frontend-coverage

- name: Backend Coverage
  uses: getsentry/coverage-action@0.3.8
  with:
    token: ${{ secrets.GITHUB_TOKEN }}
    directory: ./backend/coverage
    flags: backend
    name: backend-coverage
```

### Matrix Builds

When running coverage in a matrix strategy (e.g., multiple Python versions), use the `name` input to give each matrix entry a unique artifact name and avoid upload conflicts:

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        python-version: ["3.10", "3.11", "3.12", "3.13"]
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-python@v5
        with:
          python-version: ${{ matrix.python-version }}

      - name: Run tests
        run: pytest --cov=src --cov-report=xml

      - name: Coverage Action
        uses: getsentry/coverage-action@0.3.8
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          files: coverage.xml
          name: py${{ matrix.python-version }}
```

### Coverage Thresholds with Status Checks

Use built-in threshold enforcement with GitHub status checks:

```yaml
- name: Coverage Action
  uses: getsentry/coverage-action@0.3.8
  with:
    token: ${{ secrets.GITHUB_TOKEN }}
    target-project: auto          # Use base branch coverage as target
    threshold-project: 1          # Allow up to 1% coverage drop
    target-patch: 80              # Require 80% coverage on changed lines
    fail-on-error: true           # Fail CI if thresholds not met
```

This creates two status checks (`codecov/project` and `codecov/patch`) that:
- Appear on commits and PRs
- Can be required via branch protection rules
- Provide clear pass/fail feedback

## How It Works

### 1. File Discovery

The action searches for coverage files using:
- **Explicit files**: If `files` input is provided
- **Auto-discovery**: Searches `directory` for known coverage file patterns
- **Format detection**: Auto-detects format from file content

### 2. Parsing & Aggregation

Multiple coverage files are parsed and aggregated:
- Supports mixing formats (e.g., frontend LCOV + backend Cobertura)
- Calculates unified line, branch, and method coverage

### 3. Artifact Storage

Results are stored as GitHub Artifacts:
- `codecov-coverage-results-{branch}[-{name}][-{flags}]` — Aggregated coverage data
- `codecov-test-results-{branch}` — Aggregated test results

When using the `name` input, it is appended to the artifact name to avoid conflicts in matrix builds.

### 4. Base Branch Comparison

On PRs or feature branches:
1. Auto-detects the repository's default branch (or uses the explicit `base-branch` input)
2. Downloads latest results from base branch
3. Compares current vs baseline
4. Calculates deltas

### 5. Reporting

- **Job Summary**: Always generated in Actions UI
- **PR Comment**: Optional detailed comment on PRs

### 6. Status Checks

The action creates GitHub commit status checks that appear on commits and PRs:

| Status Context | Description |
|----------------|-------------|
| `codecov/project` | Overall project coverage status (pass/fail based on target) |
| `codecov/patch` | Coverage for changed lines in the PR |

These status checks:
- Show as green checkmarks or red X marks on commits and PRs
- Can be used in **branch protection rules** to require coverage thresholds
- Provide immediate feedback on coverage quality

## Status Badges

Display your CI status in your README using GitHub's workflow badge:

```markdown
![CI](https://github.com/{owner}/{repo}/actions/workflows/{workflow}.yml/badge.svg)
```

## Test Results

### Supported Format

| Format | Typical File | Common Test Frameworks |
|--------|--------------|----------------------|
| JUnit XML | `*.junit.xml` | Jest, Vitest, Mocha, pytest, JUnit, NUnit, PHPUnit |

### Configuration Examples

**Jest / Vitest:**
```json
{
  "reporters": ["default", ["jest-junit", { "outputFile": "report.junit.xml" }]]
}
```

**pytest:**
```bash
pytest --junitxml=report.junit.xml
```

## Coverage Configuration Examples

### JavaScript/TypeScript (Jest/Vitest)

```json
{
  "coverageReporters": ["lcov", "clover", "json"]
}
```

### Python (pytest-cov)

```bash
pytest --cov=src --cov-report=xml  # Cobertura format
```

### Java (Gradle + JaCoCo)

```groovy
jacocoTestReport {
    reports {
        xml.required = true
    }
}
```

### Go

```bash
go test -coverprofile=coverage.out ./...
```

### Rust (cargo-llvm-cov)

```bash
# Install cargo-llvm-cov
cargo install cargo-llvm-cov

# Generate Codecov JSON format
cargo llvm-cov --codecov --output-path codecov.json

# Or generate LCOV format
cargo llvm-cov --lcov --output-path lcov.info
```

### .NET (Coverlet)

```bash
dotnet test --collect:"XPlat Code Coverage"
# or
dotnet test /p:CollectCoverage=true /p:CoverletOutputFormat=cobertura
```

## Configuration File

You can configure status check thresholds using a `.github/coverage.yml` file in your repository. Action inputs take precedence over the config file, allowing you to override settings per-workflow.

```yaml
# .github/coverage.yml
coverage:
  status:
    project:
      target: 80        # Target coverage percentage (or "auto" to use base branch)
      threshold: 1      # Allowed coverage drop when using "auto" (supports "1%" or 1)
      informational: false  # When true, status check reports but never fails the build
    patch:
      target: 90        # Target coverage for changed lines
      informational: false
  ignore:
    - "**/*.test.ts"    # Patterns to exclude from coverage
    - "**/fixtures/**"

# Enable PR comments from config (alternative to post-pr-comment input)
comment: true

# Report display settings
config:
  files: changed   # all (default) | changed | none
```

| Option | Description |
|--------|-------------|
| `status.project.target` | Target project coverage % (number or `"auto"`) |
| `status.project.threshold` | Allowed drop from base branch when target is `"auto"`. Supports number (`1`) or string (`"1%"`) |
| `status.project.informational` | When `true`, status check reports but never fails the build (advisory mode) |
| `status.patch.target` | Target coverage % for changed lines |
| `status.patch.informational` | When `true`, patch status check is advisory-only |
| `ignore` | Glob patterns to exclude from coverage calculations |
| `comment` | Enable PR comments. Set to `true` or `false` |
| `config.files` | Control file table scope in reports (Job Summary + PR comments). Values: `all` (default), `changed`, `none` |

### Codecov YAML Compatibility

This action also supports the standard Codecov YAML format with nested `default` keys:

```yaml
# .github/codecov.yml (Codecov-compatible format)
coverage:
  status:
    project:
      default:
        target: auto
        threshold: 10%    # Percentage strings are supported
        informational: true
    patch:
      default:
        target: 80
  ignore:
    - "tests/**"

comment: true

config:
  files: changed
```

Both formats work identically—use whichever style you prefer.

### Report File List Mode

Use `config.files` to control the "Files with missing lines" section in both Job Summary and PR comments:

- `all` (default): show all files with missing/partial lines
- `changed`: show only non-deleted files from the PR diff
- `none`: hide the section entirely

## Permissions

```yaml
permissions:
  contents: read        # Read repository contents
  actions: read         # Read workflow runs and artifacts
  pull-requests: write  # Post PR comments (if enabled)
  statuses: write       # Create commit status checks
```

> **Note**: On pull requests from forks, `GITHUB_TOKEN` has restricted permissions regardless of the workflow's `permissions` block. PR comments and commit status checks will be skipped gracefully with a warning in this case. Coverage results and Job Summary are still generated.

## Migration from Codecov

If you're migrating from the official Codecov action:

| Codecov Input | This Action |
|---------------|-------------|
| `fail_ci_if_error` | `fail-ci-if-error` |
| `files` | `files` |
| `directory` | `directory` |
| `exclude` | `exclude` |
| `flags` | `flags` |
| `name` | `name` |
| `verbose` | `verbose` |
| `handle-no-reports-found` | `handle-no-reports-found` |

**Note**: This action doesn't require a Codecov token—it uses GitHub's native artifacts for storage.
