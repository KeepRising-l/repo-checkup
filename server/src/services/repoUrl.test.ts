import { describe, expect, it } from 'vitest';
import { parseRepoUrl, RepoUrlError } from './repoUrl.js';

describe('parseRepoUrl', () => {
  it('parses standard GitHub, GitCode, and Gitee URLs', () => {
    expect(parseRepoUrl('https://github.com/KeepRising-l/repo-checkup')).toEqual({
      platform: 'github',
      host: 'github.com',
      owner: 'KeepRising-l',
      repo: 'repo-checkup',
      cloneUrl: 'https://github.com/KeepRising-l/repo-checkup.git',
      webUrl: 'https://github.com/KeepRising-l/repo-checkup',
    });

    expect(parseRepoUrl('https://gitcode.com/keeprising/repo-checkup.git')).toEqual({
      platform: 'gitcode',
      host: 'gitcode.com',
      owner: 'keeprising',
      repo: 'repo-checkup',
      cloneUrl: 'https://gitcode.com/keeprising/repo-checkup.git',
      webUrl: 'https://gitcode.com/keeprising/repo-checkup',
    });

    expect(parseRepoUrl('https://www.gitee.com/foo/bar/')).toEqual({
      platform: 'gitee',
      host: 'gitee.com',
      owner: 'foo',
      repo: 'bar',
      cloneUrl: 'https://gitee.com/foo/bar.git',
      webUrl: 'https://gitee.com/foo/bar',
    });
  });

  it('extracts branch from /tree/<branch> including slashes and /-/tree/<branch>', () => {
    expect(
      parseRepoUrl('https://github.com/owner/repo/tree/main'),
    ).toMatchObject({
      requestedBranch: 'main',
    });

    expect(
      parseRepoUrl('https://github.com/owner/repo/tree/feature/v2-ui'),
    ).toMatchObject({
      requestedBranch: 'feature/v2-ui',
    });

    expect(
      parseRepoUrl('https://gitcode.com/owner/repo/-/tree/release%2F1.0'),
    ).toMatchObject({
      requestedBranch: 'release/1.0',
    });
  });

  it('rejects unsupported platforms, non-https URLs, credentials, and invalid branches', () => {
    expect(() => parseRepoUrl('http://github.com/a/b')).toThrowError(RepoUrlError);
    expect(() => parseRepoUrl('https://gitlab.com/a/b')).toThrowError(RepoUrlError);
    expect(() => parseRepoUrl('https://user:pass@github.com/a/b')).toThrowError(
      RepoUrlError,
    );
    expect(() => parseRepoUrl('https://github.com/a/b/issues')).toThrowError(
      RepoUrlError,
    );
    expect(() =>
      parseRepoUrl('https://github.com/a/b/tree/..%2Fbad'),
    ).toThrowError(RepoUrlError);
    expect(() =>
      parseRepoUrl('https://github.com/a/b/tree/-flag'),
    ).toThrowError(RepoUrlError);
  });
});
