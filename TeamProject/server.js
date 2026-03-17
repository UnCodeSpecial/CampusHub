// server.js
import express from "express";
import session from "express-session";
import bodyParser from "body-parser";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import fetch from "node-fetch";
import { v4 as uuidv4 } from "uuid";

const app = express();
const PORT = 3000;

/**
 * TEMP: Hard-coded Google OAuth config for local demo
 * Replace YOUR_GOOGLE_CLIENT_SECRET_HERE with your real client secret
 * from the Google Cloud Console (OAuth 2.0 Client ID for Web Application).
 */
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || "http://localhost:3000/auth/google/callback";
const SESSION_SECRET = process.env.SESSION_SECRET || "dev-session-secret";

console.log("Using GOOGLE_CLIENT_ID:", GOOGLE_CLIENT_ID);

// ===== Basic in-memory "DB" (for demo only) =====
const notes = new Map(); // noteId -> { id, ownerId, title, body, createdAt, updatedAt }

// ===== Middleware =====
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        "default-src": ["'self'"],
        // Allow inline scripts so our <script> in index.html can run init()
        "script-src": ["'self'", "'unsafe-inline'"],
        "style-src": ["'self'", "'unsafe-inline'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

app.use(morgan("dev"));
app.use(cookieParser());
app.use(bodyParser.json());

app.use(
  session({
    name: "campushub.sid",
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: false, // set to true when you use HTTPS (for dev on http, keep false)
      sameSite: "lax",
      maxAge: 30 * 60 * 1000, // 30 minutes
    },
  })
);

// Simple rate limiting
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  limit: 100,
});
app.use(limiter);

// Serve static frontend (public/index.html etc)
app.use(express.static("public"));

// ===== Utility functions =====

function ensureAuthenticated(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  }
  return res.status(401).json({ error: "Unauthorized" });
}

function generateCsrfToken(req) {
  const token = uuidv4();
  req.session.csrfToken = token;
  return token;
}

function verifyCsrf(req, res, next) {
  const method = req.method;
  // Only protect state-changing methods
  if (!["POST", "PUT", "DELETE"].includes(method)) return next();

  const headerToken = req.headers["x-csrf-token"];
  const sessionToken = req.session.csrfToken;

  if (!headerToken || !sessionToken || headerToken !== sessionToken) {
    console.warn("CSRF violation:", {
      method,
      path: req.path,
      user: req.session.user?.email,
    });
    return res.status(403).json({ error: "Invalid CSRF token" });
  }

  return next();
}

// Attach CSRF verifier after session middleware
app.use(verifyCsrf);

// Simple input validation
function validateNoteInput(title, body) {
  if (typeof title !== "string" || typeof body !== "string") {
    return "Title and body must be strings.";
  }
  if (!title.trim()) return "Title cannot be empty.";
  if (!body.trim()) return "Body cannot be empty.";
  if (title.length > 200) return "Title too long (max 200 chars).";
  if (body.length > 5000) return "Body too long (max 5000 chars).";
  return null;
}

// ===== OAuth 2.0 with Google =====

// Step 1: Redirect user to Google
app.get("/auth/google", (req, res) => {
  const state = uuidv4();
  req.session.oauthState = state;

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: "code",
    scope: "openid email profile",
    state,
  });

  const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  res.redirect(url);
});

// Step 2: Google redirects back with ?code=
app.get("/auth/google/callback", async (req, res) => {
  const { code, state } = req.query;

  console.log("Callback hit with code/state:", code ? "YES" : "NO", state);

  if (!code || !state || state !== req.session.oauthState) {
    console.error("Invalid OAuth state or missing code");
    return res.status(400).send("Invalid OAuth state");
  }

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: GOOGLE_REDIRECT_URI,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      console.error("Token exchange failed", text);
      return res.status(500).send("OAuth token exchange failed");
    }

    const tokenData = await tokenRes.json();
    const idToken = tokenData.id_token;

    const payload = JSON.parse(
      Buffer.from(idToken.split(".")[1], "base64").toString("utf8")
    );

    const user = {
      sub: payload.sub,
      email: payload.email,
      name: payload.name,
    };

    // Set session data
    req.session.user = user;
    generateCsrfToken(req);

    console.log("LOGIN:", user.email, "sub:", user.sub);
    console.log("Session right after login:", req.session);

    // IMPORTANT: explicitly save the session before redirect
    req.session.save((err) => {
      if (err) {
        console.error("Error saving session:", err);
        return res.status(500).send("Session save error");
      }
      return res.redirect("/");
    });
  } catch (err) {
    console.error("OAuth callback error:", err);
    res.status(500).send("OAuth callback error");
  }
});

// Current user info
app.get("/me", (req, res) => {
  console.log("HIT /me. Session is:", req.session);
  if (req.session && req.session.user) {
    return res.json({ user: req.session.user });
  }
  return res.status(401).json({ error: "Unauthorized" });
});

// CSRF token endpoint
app.get("/csrf", ensureAuthenticated, (req, res) => {
  const token = req.session.csrfToken || generateCsrfToken(req);
  res.json({ csrfToken: token });
});

// Logout
app.post("/logout", ensureAuthenticated, (req, res) => {
  const email = req.session.user?.email;
  req.session.destroy((err) => {
    if (err) {
      console.error("Error destroying session:", err);
      return res.status(500).json({ error: "Logout failed" });
    }
    res.clearCookie("campushub.sid");
    console.log("LOGOUT:", email);
    res.json({ ok: true });
  });
});

// ===== Notes API =====

// Get all notes for current user
app.get("/api/notes", ensureAuthenticated, (req, res) => {
  const ownerId = req.session.user.sub;
  const userNotes = Array.from(notes.values()).filter(
    (n) => n.ownerId === ownerId
  );
  res.json(userNotes);
});

// Create a note
app.post("/api/notes", ensureAuthenticated, (req, res) => {
  const { title, body } = req.body;
  const error = validateNoteInput(title, body);
  if (error) return res.status(400).json({ error });

  const id = uuidv4();
  const now = new Date().toISOString();
  const note = {
    id,
    ownerId: req.session.user.sub,
    title: title.trim(),
    body: body.trim(),
    createdAt: now,
    updatedAt: now,
  };

  notes.set(id, note);
  console.log("CREATE_NOTE:", req.session.user.email, id);

  res.status(201).json(note);
});

// Update a note
app.put("/api/notes/:id", ensureAuthenticated, (req, res) => {
  const id = req.params.id;
  const { title, body } = req.body;
  const note = notes.get(id);
  if (!note || note.ownerId !== req.session.user.sub) {
    console.warn(
      "UNAUTHORIZED_NOTE_UPDATE:",
      id,
      "user:",
      req.session.user.email
    );
    return res.status(403).json({ error: "Forbidden" });
  }

  const error = validateNoteInput(title, body);
  if (error) return res.status(400).json({ error });

  note.title = title.trim();
  note.body = body.trim();
  note.updatedAt = new Date().toISOString();
  notes.set(id, note);

  console.log("UPDATE_NOTE:", req.session.user.email, id);

  res.json(note);
});

// Delete a note
app.delete("/api/notes/:id", ensureAuthenticated, (req, res) => {
  const id = req.params.id;
  const note = notes.get(id);
  if (!note || note.ownerId !== req.session.user.sub) {
    console.warn(
      "UNAUTHORIZED_NOTE_DELETE:",
      id,
      "user:",
      req.session.user.email
    );
    return res.status(403).json({ error: "Forbidden" });
  }

  notes.delete(id);
  console.log("DELETE_NOTE:", req.session.user.email, id);
  res.json({ ok: true });
});

// ===== Start server =====
app.listen(PORT, () => {
  console.log(`CampusHub running on http://localhost:${PORT}`);
});
