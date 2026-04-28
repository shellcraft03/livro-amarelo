# Upgrade Next.js to `latest`

This branch updates `next` to `latest` to address a security advisory in the previous version.

Changes:
- Updated `package.json` to set `next` to `latest`.
- (After running `npm install`) commit will include `package-lock.json` updates.

Testing instructions:

1. Install dependencies locally:

```bash
npm install
```

2. Run the development server:

```bash
npm run dev
```

3. Smoke test the app:
- Open http://localhost:3000
- Ingest a small text sample in the "Ingest Text" box and click "Ingest".
- Ask a simple question to ensure the `/api/query` and embeddings work (ensure `OPENAI_API_KEY` is set).

4. Run `npm audit` to verify vulnerabilities are resolved, and check for breaking changes.

If the site fails to start after the upgrade, review the Next.js upgrade guide and changelog:
https://nextjs.org/docs/upgrading

To create the PR locally (if not created automatically by CI/CLI), run:

```bash
git checkout -b fix/upgrade-next
git add package.json package-lock.json UPGRADE_NEXT.md
git commit -m "chore: upgrade Next.js to latest"
git push -u origin fix/upgrade-next
```

Then open a PR on GitHub or use the GitHub CLI:

```bash
gh pr create --fill --title "chore: upgrade Next.js to latest" --body-file UPGRADE_NEXT.md
```
