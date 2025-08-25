# site-qa (RareSkills)

**What this does**
- Crawls `https://rareskills.io/sitemap.xml` to list all pages.
- Opens each page on desktop and mobile.
- Checks for:
  - broken requests/images, console errors
  - MathJax issues (unrendered TeX, MathJax error boxes)
  - layout shift (before vs 3s after load) via pixel diff
  - accessibility violations (axe-core)

**Run in GitHub Actions**
1. Create a new public repo and upload this folder.
2. Go to the **Actions** tab → **Site QA** → **Run workflow**.
3. Download the **playwright-report** artifact and open `index.html`.