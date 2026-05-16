Render deployment notes — server only

1) Connect the server repo

- In Render, create a new Web Service.
- Set the environment to "Node" and choose the repository.
- Set the root directory to `server`.

2) Configure build and start

- Build Command: `npm run build`
- Start Command: `npm start`
- Port: leave blank or set to `5000` (Render sets `PORT` automatically)

3) Environment variables

Add the required env vars in Render settings:
- `MONGODB_URI`
- `CLIENT_URL` = `https://<your-client-vercel-domain>.vercel.app`
- `OPENAI_API_KEY` or any other API keys your backend uses
- `NODE_ENV` = `production`
- Add any other secrets used by your services

4) Keep backend alive

- Render may scale down or idle after inactivity. Use the server endpoint `GET /ping` to keep the instance warm.
- In Render, create a Scheduled Job or use an external uptime monitor to call:
  `https://<your-render-service>.onrender.com/ping`
- Schedule it every 10 minutes.

5) CORS configuration

- The server already reads `CLIENT_URL` from environment variables and allows requests from that origin.
- If you have multiple allowed frontends, also set `ALLOWED_ORIGINS` as a comma-separated list.

6) Debugging

- If the server fails to start, check Render logs and ensure the build command succeeded.
- If `/ping` returns a `200` JSON response, the backend is reachable.
- If client requests fail from Vercel, make sure `CLIENT_URL` uses the exact Vercel deploy URL.
