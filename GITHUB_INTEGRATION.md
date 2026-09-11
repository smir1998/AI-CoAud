# GitHub Integration Guide

## Overview

AI CoAudS now supports **real GitHub integration**, allowing you to audit actual repositories, pull requests, and files directly from GitHub. No more manual copy-pasting!

## How It Works

### 1. GitHub URL Detection

The system automatically detects and parses GitHub URLs:

- **Pull Requests**: `https://github.com/owner/repo/pull/123`
- **Repositories**: `https://github.com/owner/repo`
- **Files**: `https://github.com/owner/repo/blob/main/src/file.ts`

### 2. Data Fetching

When you enter a GitHub URL, the system:

1. **Parses the URL** to determine the type (PR, repo, or file)
2. **Fetches metadata** using the GitHub API (no auth required for public repos)
3. **Displays a file browser** showing all files in the PR/repo
4. **Lets you select** which files to audit
5. **Fetches the actual code** for selected files
6. **Runs the agentic AI** on the real code

### 3. What Gets Audited

#### For Pull Requests:
- PR metadata (title, description, author, branches)
- All changed files with diffs
- Full file contents for modified/added files
- Change statistics (+additions, -deletions)

#### For Repositories:
- Repository metadata (description, default branch)
- File tree structure
- Selected file contents
- File sizes and paths

#### For Individual Files:
- Complete file content
- File path and metadata

## Usage Examples

### Example 1: Audit a Pull Request

```
1. Enter: https://github.com/facebook/react/pull/28635
2. Click "Fetch"
3. See all changed files in the PR
4. Select files to audit (or "Select All")
5. Task auto-generates: "Audit PR #28635: Fix XYZ for security vulnerabilities..."
6. Click "Run Agent"
7. Watch the AI analyze the real PR code!
```

### Example 2: Audit a Repository

```
1. Enter: https://github.com/vercel/next.js
2. Click "Fetch"
3. Browse the file tree
4. Select specific files (e.g., security-critical files)
5. Task auto-generates: "Audit the selected files from vercel/next.js..."
6. Click "Run Agent"
```

### Example 3: Audit a Single File

```
1. Enter: https://github.com/expressjs/express/blob/master/lib/router/index.js
2. Click "Fetch"
3. File content loads automatically
4. Task auto-generates: "Audit lib/router/index.js for security vulnerabilities..."
5. Click "Run Agent"
```

## Features

### 🐙 GitHub Input Mode

- **URL Parsing**: Automatically detects PR, repo, or file URLs
- **File Browser**: Interactive file selection with search
- **Status Indicators**: See file status (added, modified, removed)
- **Change Stats**: View additions/deletions for each file
- **Auto-Task Generation**: Intelligent task suggestions based on metadata

### 📊 PR-Specific Features

- **Diff Viewing**: See exact code changes
- **Branch Info**: Source and target branches
- **Author Info**: Who created the PR
- **File Status**: Added, modified, removed, renamed
- **Selective Auditing**: Choose which files to audit

### 🔍 Repository Features

- **File Tree**: Browse entire repository structure
- **Search**: Filter files by name
- **Size Info**: See file sizes before selecting
- **Batch Selection**: Select multiple files at once

## API Rate Limits

### Without Authentication
- **60 requests per hour** per IP address
- Sufficient for casual use
- If you hit the limit, wait an hour or add a token

### With Authentication (Optional)
To increase rate limits, you can add a GitHub personal access token:

1. Go to GitHub → Settings → Developer settings → Personal access tokens
2. Generate a token with `repo` scope (read-only is fine)
3. The system will automatically use it for API calls
4. Rate limit increases to **5,000 requests per hour**

**Note**: The token is stored in browser memory only and never sent anywhere except GitHub's API.

## Security & Privacy

### What We Access
- ✅ Public repository metadata
- ✅ Public file contents
- ✅ Public PR information
- ✅ Public diffs and changes

### What We Don't Access
- ❌ Private repositories (unless you provide a token with access)
- ❌ Your GitHub credentials
- ❌ Any data outside the specified URL

### Data Flow
1. Your browser → GitHub API (to fetch code)
2. Fetched code → AI agent (for analysis)
3. Analysis results → Your browser (displayed in UI)

**No code is sent to any third-party servers except:**
- GitHub API (to fetch the code)
- Your configured LLM provider (Anthropic/OpenAI) for AI analysis

## Troubleshooting

### "GitHub API rate limit exceeded"

**Solution**: 
- Wait an hour for the limit to reset
- Or add a GitHub personal access token (see above)

### "Failed to fetch from GitHub"

**Possible causes**:
- Invalid URL format
- Repository doesn't exist
- Network connectivity issues
- Repository is private (need token)

**Solution**:
- Verify the URL is correct
- Check that the repository is public
- Ensure you have internet access
- For private repos, add a GitHub token

### Files not loading

**Possible causes**:
- File is too large
- Binary file (not text)
- Permission issues

**Solution**:
- Try selecting different files
- Check if the file exists on GitHub
- For large files, the system will show a warning

## Advanced Usage

### Combining with Manual Input

You can switch between GitHub and Manual modes:

1. Start with GitHub mode to fetch a PR
2. Switch to Manual mode to add additional context
3. The context from both modes combines
4. Run the agent on the combined input

### Custom Tasks

While the system auto-generates tasks, you can customize them:

```
Example: "Focus on authentication vulnerabilities in this PR"
Example: "Check for SQL injection in the database layer"
Example: "Review this code for performance issues"
```

### Selective File Auditing

For large PRs or repos:

1. Use the search box to filter files
2. Select only security-critical files
3. Focus the AI on what matters most
4. Save API calls and get faster results

## Technical Details

### GitHub API Endpoints Used

- `GET /repos/{owner}/{repo}/pulls/{pull_number}` - PR metadata
- `GET /repos/{owner}/{repo}/pulls/{pull_number}/files` - PR files
- `GET /repos/{owner}/{repo}/contents/{path}` - File contents
- `GET /repos/{owner}/{repo}` - Repository metadata
- `GET /repos/{owner}/{repo}/git/trees/{branch}` - File tree

### Rate Limiting

The system respects GitHub's rate limits:
- Tracks remaining requests
- Shows warnings when approaching limits
- Gracefully handles rate limit errors

### Caching

Currently, no caching is implemented. Each fetch makes fresh API calls. Future versions may add caching to reduce API usage.

## Future Enhancements

Planned features:
- [ ] GitHub App integration for private repos
- [ ] Webhook support for automatic PR auditing
- [ ] Caching to reduce API calls
- [ ] Batch processing for multiple PRs
- [ ] Export audit results as GitHub comments
- [ ] Integration with GitHub Actions

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Verify your GitHub URL is correct
3. Ensure the repository is public (or provide a token)
4. Check browser console for detailed error messages

---

**Ready to try it?** Enter a GitHub URL in the console and start auditing real code!
