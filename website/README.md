# Coverage Dashboard

A React-based web dashboard for visualizing test results and code coverage metrics from GitHub repositories using [Coverage Action](https://github.com/getsentry/coverage-action).

## Features

- 📊 **Coverage Trends** - Line and branch coverage over time
- ✅ **Test Results** - Pass rates, failures, and test counts
- 🌿 **Branch Comparison** - View metrics for different branches
- ⏰ **Time Filters** - Filter data by time range (7, 30, 90, or 365 days)
- 📈 **Interactive Charts** - Built with Recharts for beautiful visualizations
- 🎨 **Modern UI** - Styled with Tailwind CSS and shadcn/ui components

## Tech Stack

- **React 19** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool
- **React Router** - Client-side routing
- **Tailwind CSS** - Styling
- **shadcn/ui** - UI component library
- **Recharts** - Charts and visualizations
- **Octokit** - GitHub API client
- **date-fns** - Date formatting
- **JSZip** - Artifact parsing

## Getting Started

### Installation

```bash
pnpm install
```

### Development

```bash
pnpm dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Build

```bash
pnpm build
```

### Preview Production Build

```bash
pnpm preview
```

## Usage

### Regression tests

Run `pnpm test` from the repository root for the action, API/parser, and rendered dashboard tests. Dashboard tests use controlled GitHub responses and real ZIP reports; they need no network access or token.

After building the website, run `pnpm --dir website test:build` from the repository root to verify the GitHub Pages fallback and asset paths. Both checks run in CI.

### View Repository Coverage

Navigate to `/:owner/:repo` to view a repository's dashboard:

```
http://localhost:5173/getsentry/coverage-action
```

### Requirements

The repository must:
1. Be accessible to your GitHub token
2. Have Coverage Action configured and running
3. Have workflow runs with unexpired coverage and test result artifacts

Use **Setup Token** in the header to add a Personal Access Token. Artifact downloads require authentication even for public repositories. Fine-grained tokens need **Actions: read** access to the repository and **Contents: read** to list branches in private repositories.

## How It Works

1. **Fetch Branches** - Gets all branches from the repository
2. **Fetch Workflow Runs** - Gets completed workflow runs (including failures) for the selected branch and date range, 50 at a time
3. **Download Artifacts** - Downloads `codecov-test-results-*` and `codecov-coverage-results-*` artifacts
4. **Parse Data** - Extracts test and coverage metrics from artifacts
5. **Visualize** - Displays trends, charts, and tables. Use **Load older runs** to search the next page; an empty first page does not mean older reports are absent.

## Project Structure

```
website/
├── src/
│   ├── components/          # React components
│   │   ├── ui/             # shadcn/ui components
│   │   ├── BranchSelector.tsx
│   │   ├── TimeRangeFilter.tsx
│   │   ├── CoverageChart.tsx
│   │   ├── TestResultsChart.tsx
│   │   ├── RunsTable.tsx
│   │   └── StatCard.tsx
│   ├── pages/              # Page components
│   │   ├── HomePage.tsx
│   │   ├── DashboardPage.tsx
│   │   └── NotFoundPage.tsx
│   ├── services/           # API services
│   │   ├── githubAPI.ts
│   │   └── artifactParser.ts
│   ├── hooks/              # Custom React hooks
│   │   ├── useBranches.ts
│   │   └── useArtifacts.ts
│   ├── types/              # TypeScript types
│   │   └── index.ts
│   ├── App.tsx             # Main app component
│   └── main.tsx            # Entry point
├── package.json
└── vite.config.ts
```

## API Rate Limits

GitHub limits unauthenticated requests to 60 per hour per IP. Each page can require one request per workflow run plus artifact downloads; a token provides a higher limit. Rate-limit and download failures are shown as errors instead of an empty result. Reports that load successfully remain visible, and you can retry failed loads or continue to older runs.

If no reports are found, check the action logs for missing report files and failed uploads. A successful workflow can still contain no coverage artifacts if its configured report path is wrong. GitHub's workflow search and artifact-retention limits also apply.

## Deployment

### GitHub Pages

The build emits `404.html` alongside `index.html`, allowing GitHub Pages to render repository routes when opened directly or refreshed. Deploy both files.

1. Add deployment workflow (`.github/workflows/deploy-dashboard.yml`):

```yaml
name: Deploy Dashboard
on:
  push:
    branches: [main]
    paths: ['website/**']
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v4
      - run: cd website && pnpm install && pnpm run build
      - uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./website/dist
```

2. Enable GitHub Pages in repository settings
3. Access the dashboard at your configured GitHub Pages URL, such as [codecov.sentry.dev](https://codecov.sentry.dev/).

### Other Platforms

- **Vercel**: Connect repository and set root directory to `website/`
- **Netlify**: Deploy from `website/` with build command `pnpm run build`
- **Cloudflare Pages**: Point to `website/dist` directory

## Future Enhancements

- [ ] GitHub OAuth for private repos and higher rate limits
- [ ] Commit comparison view
- [ ] File-level coverage drill-down
- [ ] Export to CSV/PDF
- [ ] Real-time updates via webhooks
- [ ] Coverage badges generation
- [ ] Dark/Light theme toggle (theme switching is ready, just needs UI)

## License

MIT
