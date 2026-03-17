// test/app.test.js
import assert from "assert";
import http from "http";

const BASE = "http://localhost:3000";

function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);

    const opts = {
      method: options.method || "GET",
      headers: options.headers || {},
    };

    const req = http.request(url, opts, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve({ status: res.statusCode, body: data }));
    });

    req.on("error", reject);

    if (options.body) {
      req.write(options.body);
    }

    req.end();
  });
}

(async () => {
  console.log("Running basic tests…");

  // 1. Unauthenticated /api/notes should be 401
  {
    const res = await request("/api/notes");
    assert.strictEqual(
      res.status,
      401,
      "Expected 401 for unauthenticated /api/notes"
    );
    console.log("✓ unauthenticated /api/notes => 401");
  }

  // 2. Unauthenticated /me should be 401
  {
    const res = await request("/me");
    assert.strictEqual(res.status, 401, "Expected 401 for unauthenticated /me");
    console.log("✓ unauthenticated /me => 401");
  }

  console.log("Basic tests finished.");
})();
