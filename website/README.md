# agentic-fm Website

Project website for [agentic-fm](https://github.com/petrowsky/agentic-fm), built with [Astro](https://astro.build) and [Tailwind CSS](https://tailwindcss.com).

**Live:** [https://agentic-fm.com](https://agentic-fm.com)

## Local Development

```bash
cd website
npm install
npm run dev
```

The dev server starts at `http://localhost:4321/`.

## Build

```bash
npm run build
```

Output goes to `website/dist/`. Preview locally:

```bash
npm run preview
```

## Deployment

The site deploys automatically via GitHub Actions on push to `main`. The workflow is in `.github/workflows/deploy.yml`.

To enable GitHub Pages:

1. Go to **Settings > Pages** in the GitHub repository
2. Under **Source**, select **GitHub Actions**
3. Push to `main` — the workflow runs and deploys to `https://agentic-fm.com`

## Structure

```
website/
├── public/
│   └── favicon.svg                 # Site favicon
├── src/
│   ├── components/
│   │   ├── Header.astro            # Navigation + dark mode toggle
│   │   ├── Footer.astro            # Site footer
│   │   ├── Hero.astro              # Landing page hero section
│   │   ├── FeatureGrid.astro       # Feature cards grid
│   │   ├── CTA.astro               # Call-to-action section
│   │   ├── PageHeader.astro        # Shared inner page header
│   │   └── WebviewDemo.astro       # Webviewer demo component
│   ├── layouts/
│   │   └── Base.astro              # Root layout (SEO, fonts, dark mode)
│   ├── pages/
│   │   ├── index.astro             # Landing page
│   │   ├── docs.astro              # Documentation
│   │   ├── philosophy.astro        # AI interaction philosophy
│   │   ├── installation.astro      # Setup guide
│   │   ├── contributing.astro      # Contribution guide
│   │   ├── themes.astro            # Themes page
│   │   └── webviewer.astro         # Webviewer page
│   └── styles/
│       └── global.css              # Tailwind + custom theme
├── astro.config.mjs
├── package.json
└── tsconfig.json
```

## Tech Stack

- **Astro 5** — static site generator
- **Tailwind CSS 4** — utility-first CSS via the Vite plugin
- **GitHub Pages** — hosting
- **GitHub Actions** — CI/CD
