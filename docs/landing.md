# The landing page

Back to the [README](../README.md).

`site/index.html` is Mergeline's one-page site: the sentence, `npx mergeline` with a copy button, **Try the demo**, the 30-second GIF, the loop in four verbs, why it's different, the phone, the **team tier waitlist**, and the Bridge view as a small teaser at the bottom. It is one static file with its styles and script inline. It loads nothing from other sites, sets no cookies and has no analytics; its Content-Security-Policy says so.

Open it straight from disk to read it (`open site/index.html`): the pictures come from `docs/img/`.

## Build and publish

```bash
MERGELINE_WAITLIST_URL=https://<your endpoint> \
MERGELINE_DEMO_URL=https://demo.<your domain>/ \
MERGELINE_REPO_URL=https://github.com/<org>/mergeline \
npm run build:site
```

It writes `dist/site/index.html` and copies the three pictures it shows to `dist/site/img/`. Upload that folder to any static host (GitHub Pages, Cloudflare Pages, Netlify, or a bucket behind a CDN). Each address must be `https`, or the build stops.

| Variable | What it does | Unset |
| --- | --- | --- |
| `MERGELINE_WAITLIST_URL` | The form POSTs JSON here, and the page's CSP allows that origin and no other | The form checks its input and says nothing was sent |
| `MERGELINE_DEMO_URL` | **Try the demo** opens the hosted read-only demo ([the demo](demo.md#the-hosted-demo), [Fly](fly.md)) | **Try the demo** shows `npx mergeline --demo` with a copy button |
| `MERGELINE_REPO_URL` | **Source** in the top bar | The npm page |

## The waitlist

The form sends exactly this, nothing more:

```json
{ "email": "lead@example.com", "team": "5-20", "price": true, "source": "landing" }
```

`team` is one of `1`, `2-4`, `5-20`, `21-50`, `50+`. `price` is the "send me the price when it's set" box: count it, it's the team tier's first price signal ([the metrics](metrics.md)). The consent box must be ticked before anything is sent.

The endpoint is yours to run. Keep it in the EU, store the four fields and the time, and nothing else: no IP addresses in the record, no tracking pixels in the follow-up email. Answer it with CORS for the site's origin (`Access-Control-Allow-Origin`, and `content-type` in `Access-Control-Allow-Headers` for the preflight). A form service in the EU that accepts JSON works too; check its data processing terms first. Delete a person's details when they ask; the page promises that.

## Tests

`tests/landing.test.ts` opens the page in headless Chromium: nothing loaded from elsewhere, the first screen holds the sentence, the command, the demo and the waitlist, the form's checks, what a built page sends, phone width without sideways scrolling, and dark mode. It also checks the build's addresses and CSP, and that the copy is plain ASCII.

The older consulting page in `business/landing/` (pilots and workshops) is a separate offer and stays as it was.
