// GitHub API Client - Fetch real code from GitHub repositories
export interface GitHubPR {
  number: number;
  title: string;
  description: string;
  author: string;
  branch: string;
  baseBranch: string;
  files: GitHubFile[];
  additions: number;
  deletions: number;
}

export interface GitHubFile {
  path: string;
  filename: string;
  status: 'added' | 'modified' | 'removed' | 'renamed';
  additions: number;
  deletions: number;
  patch?: string;
  content?: string;
  language?: string;
}

export interface GitHubRepo {
  owner: string;
  name: string;
  defaultBranch: string;
  description: string;
  files: GitHubTreeItem[];
}

export interface GitHubTreeItem {
  path: string;
  type: 'blob' | 'tree';
  size?: number;
}

export type GitHubURLType = 'pr' | 'file' | 'repo' | 'unknown';

export interface ParsedGitHubURL {
  type: GitHubURLType;
  owner: string;
  repo: string;
  prNumber?: number;
  filePath?: string;
  branch?: string;
}

const GITHUB_API = 'https://api.github.com';

export function parseGitHubURL(url: string): ParsedGitHubURL {
  // PR URL: https://github.com/owner/repo/pull/123
  const prMatch = url.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
  if (prMatch) {
    return {
      type: 'pr',
      owner: prMatch[1],
      repo: prMatch[2],
      prNumber: parseInt(prMatch[3]),
    };
  }

  // File URL: https://github.com/owner/repo/blob/branch/path/to/file
  const fileMatch = url.match(/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)/);
  if (fileMatch) {
    return {
      type: 'file',
      owner: fileMatch[1],
      repo: fileMatch[2],
      branch: fileMatch[3],
      filePath: fileMatch[4],
    };
  }

  // Repo URL: https://github.com/owner/repo
  const repoMatch = url.match(/github\.com\/([^/]+)\/([^/]+)\/?$/);
  if (repoMatch) {
    return {
      type: 'repo',
      owner: repoMatch[1],
      repo: repoMatch[2],
    };
  }

  return { type: 'unknown', owner: '', repo: '' };
}

export class GitHubClient {
  private token?: string;

  constructor(token?: string) {
    this.token = token;
  }

  private async fetch(endpoint: string): Promise<any> {
    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github.v3+json',
    };

    if (this.token) {
      headers['Authorization'] = `token ${this.token}`;
    }

    const response = await fetch(`${GITHUB_API}${endpoint}`, { headers });

    if (!response.ok) {
      if (response.status === 403) {
        throw new Error('GitHub API rate limit exceeded. Add a token or wait a few minutes.');
      }
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  async getPullRequest(owner: string, repo: string, prNumber: number): Promise<GitHubPR> {
    // Fetch PR metadata
    const pr = await this.fetch(`/repos/${owner}/${repo}/pulls/${prNumber}`);

    // Fetch PR files
    const files = await this.fetch(`/repos/${owner}/${repo}/pulls/${prNumber}/files`);

    return {
      number: pr.number,
      title: pr.title,
      description: pr.body || '',
      author: pr.user.login,
      branch: pr.head.ref,
      baseBranch: pr.base.ref,
      additions: pr.additions,
      deletions: pr.deletions,
      files: files.map((f: any) => ({
        path: f.filename,
        filename: f.filename.split('/').pop() || f.filename,
        status: f.status,
        additions: f.additions,
        deletions: f.deletions,
        patch: f.patch,
        language: this.detectLanguage(f.filename),
      })),
    };
  }

  async getFileContent(owner: string, repo: string, path: string, branch?: string): Promise<string> {
    const ref = branch ? `?ref=${branch}` : '';
    const response = await this.fetch(`/repos/${owner}/${repo}/contents/${path}${ref}`);
    
    if (response.encoding === 'base64') {
      return atob(response.content);
    }
    
    return response.content;
  }

  async getRepository(owner: string, repo: string): Promise<GitHubRepo> {
    // Fetch repo metadata
    const repoData = await this.fetch(`/repos/${owner}/${repo}`);

    // Fetch file tree
    const tree = await this.fetch(`/repos/${owner}/${repo}/git/trees/${repoData.default_branch}?recursive=1`);

    return {
      owner,
      name: repo,
      defaultBranch: repoData.default_branch,
      description: repoData.description || '',
      files: tree.tree
        .filter((item: any) => item.type === 'blob' || item.type === 'tree')
        .map((item: any) => ({
          path: item.path,
          type: item.type,
          size: item.size,
        })),
    };
  }

  async getPRDiffContent(owner: string, repo: string, prNumber: number): Promise<string> {
    const pr = await this.getPullRequest(owner, repo, prNumber);
    
    let fullContent = `# Pull Request #${pr.number}: ${pr.title}\n\n`;
    fullContent += `**Author:** ${pr.author}\n`;
    fullContent += `**Branch:** ${pr.branch} → ${pr.baseBranch}\n`;
    fullContent += `**Changes:** +${pr.additions} -${pr.deletions}\n\n`;
    
    if (pr.description) {
      fullContent += `## Description\n${pr.description}\n\n`;
    }
    
    fullContent += `## Files Changed\n\n`;
    
    for (const file of pr.files) {
      fullContent += `### ${file.path}\n`;
      fullContent += `**Status:** ${file.status} | **Changes:** +${file.additions} -${file.deletions}\n\n`;
      
      if (file.patch) {
        fullContent += `\`\`\`diff\n${file.patch}\n\`\`\`\n\n`;
      }
      
      // Fetch full file content for modified files
      if (file.status === 'modified' || file.status === 'added') {
        try {
          const content = await this.getFileContent(owner, repo, file.path, pr.branch);
          fullContent += `\n**Full File Content:**\n\`\`\`${file.language || ''}\n${content}\n\`\`\`\n\n`;
        } catch (error) {
          fullContent += `\n*Could not fetch full file content*\n\n`;
        }
      }
    }
    
    return fullContent;
  }

  private detectLanguage(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase();
    const langMap: Record<string, string> = {
      'js': 'javascript',
      'jsx': 'javascript',
      'ts': 'typescript',
      'tsx': 'typescript',
      'py': 'python',
      'rb': 'ruby',
      'java': 'java',
      'cpp': 'cpp',
      'c': 'c',
      'go': 'go',
      'rs': 'rust',
      'php': 'php',
      'cs': 'csharp',
      'swift': 'swift',
      'kt': 'kotlin',
      'scala': 'scala',
      'r': 'r',
      'sql': 'sql',
      'html': 'html',
      'css': 'css',
      'scss': 'scss',
      'json': 'json',
      'yaml': 'yaml',
      'yml': 'yaml',
      'md': 'markdown',
      'sh': 'bash',
      'bash': 'bash',
    };
    return langMap[ext || ''] || 'text';
  }
}

export const githubClient = new GitHubClient();
