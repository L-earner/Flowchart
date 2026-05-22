# Deployment & Installation Guide — Audit Process Flow Diagram Generator

This document covers everything the technical team needs to install and run this application in a corporate environment.

---

## What This Application Is

A full-stack web application that converts audit process documentation (text, Word, or PDF files) into interactive flowcharts using AI. Auditors paste or upload process notes; the app calls OpenAI's GPT-4o model and renders the result as a Mermaid.js diagram that can be exported as PDF, PNG, or SVG.

**Architecture overview:**

```
Browser → Express server (Node.js) → OpenAI API (external)
```

In production, the Express server serves both the API and the compiled frontend from a single process on a single port.

---

## 1. Runtime Requirements

| Requirement | Minimum | Recommended |
|---|---|---|
| **Node.js** | 18.x | 20.x LTS |
| **npm** | 9.x | 10.x (ships with Node 20) |
| Database | None | — |
| Message queue | None | — |
| Docker | Not required | — |

> **Note on Node 22:** `pdfjs-dist` v5 officially targets Node 22. It runs on Node 20 with a harmless console warning; PDF parsing still works correctly.

---

## 2. External API Dependency — OpenAI

**This is a hard requirement.** The application has no local AI fallback.

| Detail | Value |
|---|---|
| Provider | OpenAI |
| Model | `gpt-4o` |
| SDK | `openai` npm package v6.37.x |
| Endpoint | `https://api.openai.com` |
| Protocol | HTTPS (port 443) |
| Direction | **Outbound from the server** (not from user browsers) |

### What you need

- An OpenAI platform account with billing enabled
- An API key with access to `gpt-4o`
- Firewall rule allowing outbound HTTPS from the server host to `api.openai.com:443`

### Cost profile

Each diagram generation or refinement sends one API call to `gpt-4o` with up to 4,096 output tokens. Costs depend on usage volume — refer to OpenAI's current pricing at `platform.openai.com/pricing`.

---

## 3. Environment Variables

Create a `.env` file in the project root (do **not** commit this file):

```env
# Required
OPENAI_API_KEY=your_openai_api_key_here

# Optional — defaults to 3001
PORT=3001
```

In production, prefer injecting these via your secrets manager (Azure Key Vault, AWS Secrets Manager, HashiCorp Vault, etc.) rather than a file on disk.

> **Security note:** The repository currently contains a `.env` file with a hardcoded API key. That key should be considered compromised — rotate it immediately on the OpenAI platform before deploying. Ensure `.env` is listed in `.gitignore` and never committed to source control.

---

## 4. Network & Port Requirements

### Server-side outbound

| Destination | Port | Protocol | Purpose |
|---|---|---|---|
| `api.openai.com` | 443 | HTTPS | AI diagram generation |
| `registry.npmjs.org` | 443 | HTTPS | Package installation (build time only) |

### Exposed ports

| Mode | Ports |
|---|---|
| Development | `5175` (Vite frontend) + `3001` (API server) |
| Production | Single port — `3001` by default, configurable via `PORT` env var |

In production only one port needs to be exposed. Put it behind a reverse proxy (nginx, IIS, Apache) for TLS termination.

### Browser-side outbound (user machines)

| Destination | Port | Purpose | Notes |
|---|---|---|---|
| `fonts.googleapis.com` | 443 | Google Fonts CSS | Loads the Inter font. App is functional without it — text falls back to system sans-serif. **Self-hosting option available — see Section 8.** |
| `fonts.gstatic.com` | 443 | Google Fonts files | Same as above |

---

## 5. Installation & Build

```bash
# 1. Clone the repository
git clone <repo-url>
cd Process-Flow-Agent

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# Edit .env — set OPENAI_API_KEY and optionally PORT

# 4. Build the frontend
npm run build
# Output goes to: dist/

# 5. Start the production server
npm start
# Serves API + frontend on http://localhost:3001 (or configured PORT)
```

### Available npm scripts

| Command | Description |
|---|---|
| `npm run dev` | Start API server (port 3001) + Vite frontend (port 5175) concurrently — development only |
| `npm run build` | TypeScript compile + Vite production build → `dist/` |
| `npm start` | Serve production build via Express (`NODE_ENV=production`) |
| `npm run server` | Start Express API server only |
| `npm run lint` | Run ESLint |

---

## 6. npm Package Dependencies

All packages are installed from `registry.npmjs.org` at build time. If your environment uses a private npm mirror (Artifactory, Nexus, Verdaccio), all packages below must be available there.

### Production dependencies

| Package | Version | Purpose |
|---|---|---|
| `react` / `react-dom` | 19.2.x | UI framework |
| `express` | 5.2.x | Backend API server |
| `openai` | 6.37.x | OpenAI API SDK |
| `mermaid` | 11.15.x | Primary Mermaid.js diagram renderer |
| `@xyflow/react` | 12.10.x | Interactive canvas / node-drag editor |
| `d3` | 7.9.x | D3.js diagram rendering mode |
| `@dagrejs/dagre` | 3.0.x | Automatic graph layout engine |
| `flowchart.js` | 1.18.x | Flowchart DSL renderer |
| `mammoth` | 1.12.x | Parses `.docx` Word document uploads |
| `pdfjs-dist` | 5.7.x | Parses `.pdf` file uploads |
| `jspdf` | 4.2.x | PDF export |
| `html-to-image` | 1.11.x | Renders DOM elements to PNG/PDF for export |
| `html2canvas` | 1.4.x | HTML-to-canvas utility |
| `file-saver` | 2.0.x | Triggers browser file downloads |
| `react-dropzone` | 15.0.x | Drag-and-drop file upload UI |
| `cors` | 2.8.x | CORS middleware for Express |
| `concurrently` | 9.2.x | Run multiple processes simultaneously (dev) |
| `nodemon` | 3.1.x | Auto-restart on file change (dev) |

### Build-time only (not shipped to users)

| Package | Version | Purpose |
|---|---|---|
| `vite` | 8.0.x | Frontend build tool / dev server |
| `typescript` | 6.0.x | TypeScript compiler |
| `@vitejs/plugin-react` | 6.0.x | Vite plugin for React + JSX transform |
| `@types/node` | 24.x | Node.js TypeScript types |
| `@types/react` / `@types/react-dom` | 19.x | React TypeScript types |
| `@types/d3` / `@types/dagre` / `@types/file-saver` | various | TypeScript types |
| `eslint` + plugins | 10.x | Code linting |
| `globals` | 17.x | ESLint globals reference |

### Vendored files (self-hosted, no CDN calls)

These files are served directly from `/public/vendor/` — no external network call is made for them:

| File | Library | Purpose |
|---|---|---|
| `raphael.min.js` | Raphaël.js | SVG/VML library required by flowchart.js |
| `flowchart.min.js` | flowchart.js | Local copy of the flowchart DSL renderer |

---

## 7. Version Notes for Software Approval Teams

These dependencies are at unusually recent major versions. Flag these if your organisation requires LTS or formally vetted software releases:

| Package | Version shipped | Note |
|---|---|---|
| **React** | 19.x | Latest major; released late 2024 |
| **Express** | 5.x | Major release 2024; most deployments use Express 4 |
| **TypeScript** | 6.x | Very recent; TypeScript 5.x is more widely vetted |
| **Vite** | 8.x | Very recent build tooling release |

---

## 8. Security Considerations

### Items requiring action before go-live

| Issue | Severity | Action |
|---|---|---|
| Hardcoded API key in `.env` | **Critical** | Rotate the OpenAI key immediately. Use a secrets manager in production. |
| CORS is fully open | **High** | `cors()` is configured with no origin restriction. Lock it to your internal domain before deploying. In `server/index.js`, replace `app.use(cors())` with `app.use(cors({ origin: 'https://your-internal-domain' }))` |
| No authentication layer | **High** | The app has no login or SSO. Any user who can reach the server port can use it. Add an authenticating reverse proxy (e.g. nginx + LDAP/SAML, Azure AD App Proxy, Okta) in front of the application. |
| No HTTPS on the Node server | **Medium** | Express serves plain HTTP. Terminate TLS at your reverse proxy — do not expose the Node port directly. |
| No rate limiting | **Medium** | Every request to `/api/generate` or `/api/refine` triggers an OpenAI API call. Add rate limiting middleware (e.g. `express-rate-limit`) to prevent runaway costs. |
| Google Fonts CDN calls from browsers | **Low / Informational** | User browsers load the Inter font from `fonts.googleapis.com`. This can be blocked by corporate web filters. Self-hosting resolves it (see below). |

### Self-hosting Google Fonts (optional)

To eliminate the Google Fonts network dependency:

1. Download the Inter font files from `fonts.google.com` or `rsms.me/inter`
2. Place the `.woff2` files in `public/fonts/`
3. Replace the `<link>` tags in `index.html` with a local `@font-face` CSS rule pointing to `/fonts/inter.woff2`

### Request size limit

Express is configured with a `10MB` JSON body limit, which accommodates large document uploads. Adjust in `server/index.js` (`express.json({ limit: '10mb' })`) if your policy requires a lower ceiling.

---

## 9. Supported File Input Types

| Format | Extension | Parsed by |
|---|---|---|
| Plain text | `.txt` | Native (no library) |
| Markdown | `.md` | Native (no library) |
| Word document | `.docx` | `mammoth` (client-side) |
| PDF | `.pdf` | `pdfjs-dist` (client-side, dynamically imported) |

All file parsing happens entirely in the user's browser — file contents are not stored on the server. Only the extracted text is sent to the backend.

---

## 10. Corporate Deployment Checklist

- [ ] Node.js 20 LTS installed on the server
- [ ] OpenAI API key provisioned and stored in secrets manager
- [ ] Firewall: outbound HTTPS from server to `api.openai.com:443`
- [ ] Firewall: outbound HTTPS from user browsers to `fonts.googleapis.com` + `fonts.gstatic.com` (or font self-hosted)
- [ ] Private npm mirror has all listed packages available (if not using public registry)
- [ ] All packages reviewed against software approval list
- [ ] `.env` file removed from repository; API key rotated
- [ ] CORS restricted to internal domain in `server/index.js`
- [ ] Authentication layer (reverse proxy / SSO) placed in front of the app
- [ ] TLS termination configured at reverse proxy
- [ ] Rate limiting added to `/api/generate` and `/api/refine` endpoints
- [ ] `PORT` env var set to match internal port allocation standards
- [ ] App tested end-to-end behind the reverse proxy before user rollout
