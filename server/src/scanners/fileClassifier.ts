const TEST_DIR_RE =
  /(?:^|\/)(?:__tests__|__fixtures__|fixtures|testdata|tests|src\/test)\//i;

const TEST_FILE_RE =
  /(?:^|\/)(?:test_[^/]+\.py|[^/]+_test\.go|[^/]+\.(?:test|spec)\.[^/.]+|[^/]+(?:Test|Tests|IT)\.(?:java|kt))$/i;

export function isTestOrFixtureFile(relativePath: string): boolean {
  return TEST_DIR_RE.test(relativePath) || TEST_FILE_RE.test(relativePath);
}
