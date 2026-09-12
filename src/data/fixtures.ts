/* Sample PR diffs. These are not scripted results — the same rule engine,
   LLM pass, refactor and review stages that run on live GitHub PRs run on
   these exact texts. Swap in any public owner/repo#pr to audit real code. */

export interface Fixture {
  id: string;
  label: string;
  repo: string;
  prNumber: number;
  title: string;
  author: string;
  sha: string;
  base: string;
  head: string;
  url: string;
  diff: string;
}

export const FIXTURES: Fixture[] = [
  {
    id: "auth",
    label: "acme/api-service #142 — vulnerable auth PR",
    repo: "acme/api-service",
    prNumber: 142,
    title: "Add user login endpoint",
    author: "jdoe",
    sha: "9f3c2ab1d44e07c5",
    base: "main",
    head: "feature/login",
    url: "https://github.com/acme/api-service/pull/142",
    diff: `diff --git a/auth.py b/auth.py
--- a/auth.py
+++ b/auth.py
@@ -8,6 +8,24 @@
 import hashlib
 import jwt
 
+SECRET_KEY = "super-secret-key-123"
+
+
+def login(username, password, cursor):
+    cursor.execute(f"SELECT id, role FROM users WHERE name = '{username}' AND pw = '{password}'")
+    row = cursor.fetchone()
+    if row is None:
+        return None
+    digest = hashlib.md5(password.encode()).hexdigest()
+    if digest != row[2]:
+        return None
+    token = jwt.encode({"uid": row[0]}, SECRET_KEY, algorithm="HS256")
+    return token
+
+
+def decode_token(token):
+    return jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
diff --git a/config.py b/config.py
--- a/config.py
+++ b/config.py
@@ -1,3 +1,9 @@
 import os
+import random
 
+AWS_ACCESS_KEY_ID = "AKIAIOSFODNN7EXAMPLE"
+DEBUG = True
+
+
+def make_session_token():
+    token = str(random.randint(100000, 999999))  # TODO: harden security before launch
+    return token
diff --git a/requirements.txt b/requirements.txt
--- a/requirements.txt
+++ b/requirements.txt
@@ -1,3 +1,4 @@
 flask==3.0.0
+pyyaml==5.3.1
 requests==2.31.0
`,
  },
  {
    id: "upload",
    label: "acme/file-store #87 — upload handler PR",
    repo: "acme/file-store",
    prNumber: 87,
    title: "Allow profile picture uploads",
    author: "msmith",
    sha: "4b71ee90caf35d02",
    base: "main",
    head: "feature/uploads",
    url: "https://github.com/acme/file-store/pull/87",
    diff: `diff --git a/upload.py b/upload.py
--- a/upload.py
+++ b/upload.py
@@ -3,4 +3,34 @@
 import pickle
 import requests
 
+UPLOAD_ROOT = "/var/uploads"
+
+
+def handle_upload(request, db, cache={}, retries=3):
+    filename = request.args.get("name")
+    target = os.path.join(UPLOAD_ROOT, filename)
+    payload = request.get_data()
+    if len(payload) == 0:
+        return {"error": "empty"}, 400
+    if len(payload) > 10_000_000:
+        return {"error": "too large"}, 413
+    meta = pickle.loads(request.headers.get("X-Meta", b""))
+    print("upload token:", request.headers.get("X-Token"))
+    for attempt in range(retries):
+        try:
+            with open(target, "wb") as fh:
+                fh.write(payload)
+            break
+        except Exception:
+            pass
+    db.execute("INSERT INTO uploads (name, owner) VALUES ('%s', '%s')" % (filename, meta.get("user")))
+    if meta.get("avatar"):
+        cache[meta["user"]] = target
+    if request.args.get("mirror") == "1":
+        requests.post("http://mirror.internal/ingest", data=payload, verify=False)
+    try:
+        os.chmod(target, 0o777)
+    except OSError:
+        pass
+    return {"path": target, "meta": meta}, 201
`,
  },
  {
    id: "docs",
    label: "acme/docs-site #23 — clean docs PR",
    repo: "acme/docs-site",
    prNumber: 23,
    title: "Document the onboarding flow",
    author: "alee",
    sha: "e2d8a41b77f09c13",
    base: "main",
    head: "docs/onboarding",
    url: "https://github.com/acme/docs-site/pull/23",
    diff: `diff --git a/docs/onboarding.md b/docs/onboarding.md
--- /dev/null
+++ b/docs/onboarding.md
@@ -0,0 +1,14 @@
+# Onboarding
+
+Welcome to the team. This guide walks through your first week.
+
+## Day one
+
+- Request access to the staging cluster.
+- Pair with your onboarding buddy on a small fix.
+- Read the incident response runbook.
+
+## Day two to five
+
+- Ship a documentation improvement.
+- Join the architecture review on Thursday.
`,
  },
];
