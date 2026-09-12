// GitHub Input Component - Fetch and browse GitHub repositories and PRs
import { useState, useEffect } from 'react';
import { 
  parseGitHubURL, 
  githubClient, 
  type ParsedGitHubURL, 
  type GitHubPR, 
  type GitHubRepo,
  type GitHubFile 
} from '../lib/github';

interface GitHubInputProps {
  onContentReady: (content: string, metadata: any) => void;
  disabled?: boolean;
}

export function GitHubInput({ onContentReady, disabled }: GitHubInputProps) {
  const [url, setUrl] = useState('');
  const [parsed, setParsed] = useState<ParsedGitHubURL | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [pr, setPr] = useState<GitHubPR | null>(null);
  const [repo, setRepo] = useState<GitHubRepo | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (url) {
      const parsed = parseGitHubURL(url);
      setParsed(parsed);
    } else {
      setParsed(null);
      setPr(null);
      setRepo(null);
    }
  }, [url]);

  const handleFetch = async () => {
    if (!parsed || parsed.type === 'unknown') {
      setError('Please enter a valid GitHub URL');
      return;
    }

    setLoading(true);
    setError(undefined);

    try {
      if (parsed.type === 'pr') {
        const prData = await githubClient.getPullRequest(
          parsed.owner,
          parsed.repo,
          parsed.prNumber!
        );
        setPr(prData);
        setSelectedFiles(new Set(prData.files.map(f => f.path)));
      } else if (parsed.type === 'repo') {
        const repoData = await githubClient.getRepository(parsed.owner, parsed.repo);
        setRepo(repoData);
      } else if (parsed.type === 'file') {
        const content = await githubClient.getFileContent(
          parsed.owner,
          parsed.repo,
          parsed.filePath!,
          parsed.branch
        );
        onContentReady(content, {
          type: 'file',
          path: parsed.filePath,
          owner: parsed.owner,
          repo: parsed.repo,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch from GitHub');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectFile = (path: string) => {
    const newSelected = new Set(selectedFiles);
    if (newSelected.has(path)) {
      newSelected.delete(path);
    } else {
      newSelected.add(path);
    }
    setSelectedFiles(newSelected);
  };

  const handleSelectAll = () => {
    if (!pr) return;
    if (selectedFiles.size === pr.files.length) {
      setSelectedFiles(new Set());
    } else {
      setSelectedFiles(new Set(pr.files.map(f => f.path)));
    }
  };

  const handleSubmit = async () => {
    if (!parsed) return;

    setLoading(true);
    setError(undefined);

    try {
      if (parsed.type === 'pr' && pr) {
        const selectedFilesList = pr.files.filter(f => selectedFiles.has(f.path));
        
        let fullContent = `# Pull Request #${pr.number}: ${pr.title}\n\n`;
        fullContent += `**Repository:** ${parsed.owner}/${parsed.repo}\n`;
        fullContent += `**Author:** ${pr.author}\n`;
        fullContent += `**Branch:** ${pr.branch} → ${pr.baseBranch}\n`;
        fullContent += `**Files Selected:** ${selectedFilesList.length} of ${pr.files.length}\n\n`;
        
        if (pr.description) {
          fullContent += `## Description\n${pr.description}\n\n`;
        }
        
        for (const file of selectedFilesList) {
          fullContent += `## ${file.path}\n`;
          fullContent += `**Status:** ${file.status} | **Changes:** +${file.additions} -${file.deletions}\n\n`;
          
          if (file.patch) {
            fullContent += `### Diff\n\`\`\`diff\n${file.patch}\n\`\`\`\n\n`;
          }
          
          // Fetch full file content
          try {
            const content = await githubClient.getFileContent(
              parsed.owner,
              parsed.repo,
              file.path,
              pr.branch
            );
            fullContent += `### Full Content\n\`\`\`${file.language || ''}\n${content}\n\`\`\`\n\n`;
          } catch (error) {
            fullContent += `*Could not fetch full file content*\n\n`;
          }
        }
        
        onContentReady(fullContent, {
          type: 'pr',
          pr: pr,
          selectedFiles: selectedFilesList,
          owner: parsed.owner,
          repo: parsed.repo,
        });
      } else if (parsed.type === 'repo' && repo) {
        // For repos, fetch selected files
        const selectedPaths = Array.from(selectedFiles);
        let fullContent = `# Repository: ${parsed.owner}/${parsed.repo}\n\n`;
        fullContent += `**Description:** ${repo.description}\n`;
        fullContent += `**Files Selected:** ${selectedPaths.length}\n\n`;
        
        for (const path of selectedPaths) {
          try {
            const content = await githubClient.getFileContent(
              parsed.owner,
              parsed.repo,
              path
            );
            fullContent += `## ${path}\n\`\`\`\n${content}\n\`\`\`\n\n`;
          } catch (error) {
            fullContent += `## ${path}\n*Could not fetch content*\n\n`;
          }
        }
        
        onContentReady(fullContent, {
          type: 'repo',
          repo: repo,
          selectedFiles: selectedPaths,
          owner: parsed.owner,
          repoName: parsed.repo,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process GitHub content');
    } finally {
      setLoading(false);
    }
  };

  const filteredFiles = pr 
    ? pr.files.filter(f => 
        f.path.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : repo
    ? repo.files.filter(f => 
        f.type === 'blob' && 
        f.path.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : [];

  return (
    <div className="space-y-4">
      {/* URL Input */}
      <div>
        <label className="block text-xs font-medium text-ink-300 mb-2">
          GitHub URL (PR, Repository, or File)
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://github.com/owner/repo/pull/123"
            className="input-modern flex-1"
            disabled={disabled || loading}
          />
          <button
            onClick={handleFetch}
            disabled={disabled || loading || !parsed || parsed.type === 'unknown'}
            className="btn-primary whitespace-nowrap"
          >
            {loading ? '⏳ Loading...' : '📥 Fetch'}
          </button>
        </div>
        {parsed && parsed.type !== 'unknown' && (
          <div className="mt-2 text-xs text-ink-400">
            Detected: <span className="text-orchid font-semibold">{parsed.type.toUpperCase()}</span>
            {' • '}{parsed.owner}/{parsed.repo}
            {parsed.prNumber && ` • PR #${parsed.prNumber}`}
            {parsed.filePath && ` • ${parsed.filePath}`}
          </div>
        )}
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* PR Files Browser */}
      {pr && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink-200">
              Pull Request #{pr.number}: {pr.title}
            </h3>
            <button
              onClick={handleSelectAll}
              className="text-xs text-orchid hover:text-orchid-light"
            >
              {selectedFiles.size === pr.files.length ? 'Deselect All' : 'Select All'}
            </button>
          </div>
          
          <div className="text-xs text-ink-400">
            by <span className="text-ink-200">{pr.author}</span> • 
            {' '}{pr.branch} → {pr.baseBranch} • 
            {' '}<span className="text-emx">+{pr.additions}</span> / <span className="text-rosex">-{pr.deletions}</span>
          </div>

          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search files..."
            className="input-modern w-full text-sm"
          />

          <div className="max-h-64 overflow-y-auto scroll-modern border border-ink-700/50 rounded-lg">
            {filteredFiles.map((file: any) => (
              <label
                key={file.path}
                className="flex items-center gap-2 px-3 py-2 hover:bg-ink-800/50 cursor-pointer border-b border-ink-700/30 last:border-b-0"
              >
                <input
                  type="checkbox"
                  checked={selectedFiles.has(file.path)}
                  onChange={() => handleSelectFile(file.path)}
                  className="rounded"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-ink-200 truncate">{file.path}</div>
                  <div className="text-xs text-ink-400">
                    <span className={`inline-block px-1.5 py-0.5 rounded text-xs mr-2 ${
                      file.status === 'added' ? 'bg-emx/20 text-emx' :
                      file.status === 'modified' ? 'bg-amberx/20 text-amberx' :
                      file.status === 'removed' ? 'bg-rosex/20 text-rosex' :
                      'bg-ink-700 text-ink-300'
                    }`}>
                      {file.status}
                    </span>
                    <span className="text-emx">+{file.additions}</span>
                    {' / '}
                    <span className="text-rosex">-{file.deletions}</span>
                  </div>
                </div>
              </label>
            ))}
          </div>

          <div className="text-xs text-ink-400">
            Selected: {selectedFiles.size} of {pr.files.length} files
          </div>

          <button
            onClick={handleSubmit}
            disabled={loading || selectedFiles.size === 0}
            className="btn-primary w-full"
          >
            {loading ? '⏳ Processing...' : `🚀 Audit ${selectedFiles.size} File${selectedFiles.size !== 1 ? 's' : ''}`}
          </button>
        </div>
      )}

      {/* Repository Files Browser */}
      {repo && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-ink-200">
            Repository: {parsed?.owner}/{parsed?.repo}
          </h3>
          
          {repo.description && (
            <div className="text-xs text-ink-400">{repo.description}</div>
          )}

          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search files..."
            className="input-modern w-full text-sm"
          />

          <div className="max-h-64 overflow-y-auto scroll-modern border border-ink-700/50 rounded-lg">
            {filteredFiles.map((file: any) => (
              <label
                key={file.path}
                className="flex items-center gap-2 px-3 py-2 hover:bg-ink-800/50 cursor-pointer border-b border-ink-700/30 last:border-b-0"
              >
                <input
                  type="checkbox"
                  checked={selectedFiles.has(file.path)}
                  onChange={() => handleSelectFile(file.path)}
                  className="rounded"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-ink-200 truncate">{file.path}</div>
                  {file.size && (
                    <div className="text-xs text-ink-400">
                      {(file.size / 1024).toFixed(1)} KB
                    </div>
                  )}
                </div>
              </label>
            ))}
          </div>

          <div className="text-xs text-ink-400">
            Selected: {selectedFiles.size} files
          </div>

          <button
            onClick={handleSubmit}
            disabled={loading || selectedFiles.size === 0}
            className="btn-primary w-full"
          >
            {loading ? '⏳ Processing...' : `🚀 Audit ${selectedFiles.size} File${selectedFiles.size !== 1 ? 's' : ''}`}
          </button>
        </div>
      )}
    </div>
  );
}
