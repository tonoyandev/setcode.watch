export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [
      2,
      'always',
      ['contracts', 'indexer', 'watcher', 'app', 'shared', 'infra', 'docs', 'ci', 'deps', 'repo'],
    ],
  },
};
