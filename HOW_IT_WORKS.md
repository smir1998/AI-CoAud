# How AI CoAudS Knows What to Audit

## The Problem You Asked About

> "How will it know which repo or file to audit?"

Great question! Initially, the system only accepted manually pasted code. Now it has **full GitHub integration** that automatically fetches and audits real code from GitHub.

## The Solution: GitHub Integration

### Three Ways to Specify What to Audit

#### 1. 🐙 GitHub URL (Recommended)

Simply paste a GitHub URL and the system does the rest:

```
Pull Request: https://github.com/facebook/react/pull/28635
Repository:   https://github.com/vercel/next.js
File:         https://github.com/expressjs/express/blob/master/lib/router/index.js
```

**What happens:**
1. System detects the URL type (PR/repo/file)
2. Fetches metadata from GitHub API
3. Shows you a file browser
4. You select which files to audit
5. System fetches the actual code
6. AI agent audits the real code

#### 2. ✍️ Manual Input

Paste code directly:
- Copy code from your editor
- Paste into the "Code Context" area
- AI audits what you pasted

#### 3. 🎯 Smart Task Generation

When you use GitHub mode, the system **automatically generates** an intelligent task:

**For PRs:**
```
"Audit PR #28635: Fix memory leak in useEffect for security vulnerabilities, 
code quality issues, and best practices."
```

**For Repos:**
```
"Audit the selected files from vercel/next.js for security vulnerabilities 
and code quality."
```

**For Files:**
```
"Audit lib/router/index.js for security vulnerabilities and code quality issues."
```

You can always edit the auto-generated task to focus on specific concerns.

## Technical Implementation

### GitHub Client (`src/lib/github.ts`)

```typescript
// Parses GitHub URLs
parseGitHubURL(url) → { type: 'pr' | 'repo' | 'file', owner, repo, ... }

// Fetches data from GitHub API
getPullRequest(owner, repo, prNumber) → PR metadata + files
getRepository(owner, repo) → Repo metadata + file tree
getFileContent(owner, repo, path) → File contents
```

### GitHub Input Component (`src/components/GitHubInput.tsx`)

```typescript
// UI for GitHub integration
- URL input with validation
- File browser with search
- Select/deselect files
- Change statistics display
- Auto-task generation
```

### Console Integration (`src/components/Console.tsx`)

```typescript
// Two input modes
inputMode: 'github' | 'manual'

// GitHub mode
<GitHubInput onContentReady={(content, metadata) => {
  setContext(content);
  setTask(autoGenerateTask(metadata));
}} />

// Manual mode
<textarea value={context} onChange={...} />
```

## Data Flow

```
User enters GitHub URL
         ↓
System parses URL type
         ↓
Fetches metadata from GitHub API
         ↓
Displays file browser
         ↓
User selects files
         ↓
Fetches actual code content
         ↓
Auto-generates task description
         ↓
User clicks "Run Agent"
         ↓
AI agent audits the real code
         ↓
Results displayed in console
```

## Example Walkthrough

### Auditing a Pull Request

**Step 1: Enter URL**
```
https://github.com/facebook/react/pull/28635
```

**Step 2: System Fetches**
- PR title: "Fix memory leak in useEffect"
- Author: "developer123"
- Branch: "fix/memory-leak" → "main"
- Files changed: 5 files
- Changes: +42 lines, -18 lines

**Step 3: File Browser Shows**
```
☑ src/components/Chat.tsx       modified  +25 -10
☑ src/hooks/useEffect.ts        modified  +12 -5
☐ src/utils/helpers.ts          modified  +3  -2
☑ src/types/index.ts            modified  +2  -1
☐ package.json                  modified  +0  -0
```

**Step 4: Auto-Generated Task**
```
"Audit PR #28635: Fix memory leak in useEffect for security vulnerabilities, 
code quality issues, and best practices. Focus on the 3 selected files."
```

**Step 5: Run Agent**
- AI fetches full content of selected files
- Analyzes for security issues
- Checks code quality
- Suggests improvements
- Displays results in real-time

## Security & Privacy

### What We Access
✅ Public repository metadata  
✅ Public file contents  
✅ Public PR information  
✅ Public diffs and changes  

### What We Don't Access
❌ Private repositories (without token)  
❌ Your GitHub credentials  
❌ Data outside the specified URL  

### API Rate Limits
- **60 requests/hour** without authentication
- **5,000 requests/hour** with GitHub token (optional)

## Comparison: Before vs After

### Before (Manual Only)
```
❌ Copy code from GitHub
❌ Paste into text area
❌ Manually write task description
❌ No context about PR/repo
❌ Can't see diffs
❌ No file selection
```

### After (GitHub Integration)
```
✅ Paste GitHub URL
✅ Auto-fetch all code
✅ Auto-generate task
✅ Full PR/repo context
✅ See diffs and changes
✅ Select specific files
✅ View change statistics
✅ Browse file tree
```

## Advanced Features

### Selective Auditing
For large PRs/repos, select only security-critical files:
- Authentication modules
- API endpoints
- Database queries
- Payment processing

### Combined Context
Switch between modes:
1. Fetch PR with GitHub mode
2. Switch to Manual mode
3. Add additional context
4. Run agent on combined input

### Custom Focus
Edit auto-generated task:
```
"Focus on SQL injection vulnerabilities in the database layer"
"Check for authentication bypass in the login flow"
"Review for performance issues in the rendering pipeline"
```

## Future Enhancements

### Planned Features
- [ ] GitHub App for private repos
- [ ] Webhook auto-audit on PR creation
- [ ] Post results as PR comments
- [ ] Batch audit multiple PRs
- [ ] Cache results to save API calls
- [ ] GitHub Actions integration

## Summary

**Q: How does it know what to audit?**

**A: You tell it via GitHub URL!**

1. Paste a GitHub URL (PR, repo, or file)
2. System fetches the real code
3. You select which files to audit
4. AI audits the actual code
5. Results appear in real-time

No more manual copy-pasting. No more guessing. Just paste a URL and go! 🚀

---

**Try it now:** Enter `https://github.com/facebook/react` in the console and see it in action!
