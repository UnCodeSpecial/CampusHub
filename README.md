# CampusHub

A secure, full-stack web application for managing personal notes, built with Node.js and Express. Features Google OAuth 2.0 authentication and a layered security architecture.

---

## Features

- **Google OAuth 2.0 login** — users authenticate via their Google account; no passwords stored
- **Personal notes** — create, edit, and delete notes tied to your account
- **Per-user data isolation** — users can only access their own notes, enforced server-side
- **Session management** — secure HTTP-only cookies with configurable expiry
- **CSRF protection** — token-based validation on all state-changing requests
- **Rate limiting** — prevents brute-force and abuse on all endpoints
- **HTTP security headers** — configured via Helmet (CSP, XSS protection, etc.)
- **Input validation** — server-side length and type checks on all user input

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js |
| Framework | Express.js |
| Auth | Google OAuth 2.0 (via Google Cloud Platform) |
| Sessions | express-session |
| Security | Helmet, express-rate-limit, CSRF tokens |
| Frontend | HTML, CSS, Vanilla JavaScript |
| HTTP client | node-fetch |

---

## Project Structure

```
campushub/
├── server.js        # Express server, routes, auth, and API
├── public/
│   └── index.html   # Frontend UI
├── .env             # Environment variables (not committed)
├── .gitignore
└── package.json
```

---

## Getting Started

### Prerequisites

- Node.js v18+
- A Google Cloud project with OAuth 2.0 credentials ([instructions](https://developers.google.com/identity/protocols/oauth2))

### Installation

```bash
git clone https://github.com/YOUR_USERNAME/campushub.git
cd campushub
npm install
```

### Environment Variables

Create a `.env` file in the root directory:

```env
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/google/callback
SESSION_SECRET=your_session_secret
```

### Run Locally

```bash
node server.js
```

Then open [http://localhost:3000](http://localhost:3000) in your browser.

---

## API Endpoints

| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| GET | `/auth/google` | Initiate Google OAuth flow | No |
| GET | `/auth/google/callback` | OAuth callback handler | No |
| GET | `/me` | Get current user info | Yes |
| GET | `/csrf` | Get CSRF token | Yes |
| POST | `/logout` | End session | Yes |
| GET | `/api/notes` | Get all notes for current user | Yes |
| POST | `/api/notes` | Create a new note | Yes |
| PUT | `/api/notes/:id` | Update a note | Yes |
| DELETE | `/api/notes/:id` | Delete a note | Yes |

---

## Security Overview

This project was built with security as a primary focus. Key implementations:

- **OAuth 2.0 state parameter** — prevents CSRF during the login flow by validating a random state token on callback
- **CSRF tokens** — all POST, PUT, and DELETE requests require a valid `x-csrf-token` header matched against the session
- **HTTP-only cookies** — session cookies are inaccessible to JavaScript, mitigating XSS-based session theft
- **Helmet middleware** — sets secure HTTP response headers including Content Security Policy
- **Rate limiting** — caps requests at 100 per minute per IP to limit abuse
- **Authorization checks** — every note operation verifies the requesting user owns the resource before proceeding

---

## Notes

- Data is stored in-memory for demo purposes — restarting the server clears all notes
- For production use, replace the in-memory store with a persistent database (PostgreSQL, MongoDB, etc.)
- Set `cookie.secure: true` and use HTTPS in any production deployment
