Vercel deployment notes — client and server

1) Client (static Vite React app)

- In the Vercel dashboard, create a new project and import this repository.
- Set the project root to `client` (so Vercel runs in `edureach-platform/client`).
- Vercel will run `npm run build`. The existing `build` script runs `tsc -b && vite build`.
- Set environment variables under Project Settings:
  - `VITE_API_URL=https://<your-render-service>.onrender.com/api`
  - `NODE_ENV=production`
- Ensure Node version matches (use Node 18+).

2) Server (Express + TypeScript)

- In the Vercel dashboard, create a second project and set the root to `server` (edureach-platform/server).
- This project uses a serverless wrapper at `api/index.ts` which exports the Express app.
- Ensure you run `npm i` in `server` to install `serverless-http` (added to `dependencies`).
- Vercel will run `npm run vercel-build` (configured to run `tsc`) and build the serverless function.
- Add required environment variables (e.g. `MONGODB_URI`, `OPENAI_API_KEY`, `CLIENT_URL`, etc.) in the Vercel Project Settings.

3) Notes

- This repo can now be deployed as two separate services: `client` on Vercel, and `server` on Render or another Node host.
- The `server` is configured for Render-style deployment with a `Procfile`, `Dockerfile`, and a `/ping` endpoint for keep-alive pings.
- After pushing changes, connect the project in Vercel and trigger a deploy. Monitor the build logs for errors.
