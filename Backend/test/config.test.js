const { strict: assert } = require('assert');
const { test } = require('node:test');
const path = require('path');

const CONFIG_PATH = path.resolve(__dirname, '../config.js');

function reloadModule(env = {}) {
  // backup keys we'll change
  const backups = {};
  Object.keys(env).forEach(k => { backups[k] = process.env[k]; process.env[k] = env[k]; });

  // ensure NODE_ENV is set to development for safe reload unless overridden
  if (!process.env.NODE_ENV) process.env.NODE_ENV = 'development';

  // clear require cache and re-require
  delete require.cache[require.resolve(CONFIG_PATH)];
  const mod = require(CONFIG_PATH);

  // restore backed-up env values
  Object.keys(env).forEach(k => {
    if (backups[k] === undefined) delete process.env[k];
    else process.env[k] = backups[k];
  });

  return mod;
}

function withEnv(key, value, fn) {
  process.env[key] = value;
  try {
    return fn();
  } finally {
    delete process.env[key];
  }
}

test('getEnv accepts boolean validator (true -> returns value)', () => {
  const mod = reloadModule({ NODE_ENV: 'development' });
  const v = withEnv('TEST_BOOL', 'ok', () =>
    mod._internals.getEnv('TEST_BOOL', undefined, { validate: () => true })
  );
  assert.equal(v, 'ok');
});

test('getEnv accepts boolean validator (false -> returns undefined)', () => {
  const mod = reloadModule({ NODE_ENV: 'development' });
  const v = withEnv('TEST_BOOL2', 'bad', () =>
    mod._internals.getEnv('TEST_BOOL2', undefined, { validate: () => false })
  );
  assert.equal(v, undefined);
});

test('getEnv accepts object validator (invalid -> undefined)', () => {
  const mod = reloadModule({ NODE_ENV: 'development' });
  const v = withEnv('TEST_OBJ', 'x', () =>
    mod._internals.getEnv('TEST_OBJ', undefined, { validate: () => ({ valid: false, message: 'nope' }) })
  );
  assert.equal(v, undefined);
});

test('getEnv accepts object validator (valid -> returns value)', () => {
  const mod = reloadModule({ NODE_ENV: 'development' });
  const v = withEnv('TEST_OBJ2', 'y', () =>
    mod._internals.getEnv('TEST_OBJ2', undefined, { validate: () => ({ valid: true, message: '' }) })
  );
  assert.equal(v, 'y');
});

test('getEnv handles unexpected validator return (-> undefined)', () => {
  const mod = reloadModule({ NODE_ENV: 'development' });
  const v = withEnv('TEST_BAD', 'x', () =>
    mod._internals.getEnv('TEST_BAD', undefined, { validate: () => 12345 })
  );
  assert.equal(v, undefined);
});

test('getPositiveNumber returns default on invalid numbers', () => {
  const mod = reloadModule({ NODE_ENV: 'development' });
  const val = withEnv('PORT', 'not-a-number', () =>
    mod._internals.getPositiveNumber('PORT', 3000)
  );
  assert.equal(val, 3000);
});

test('getPositiveNumber returns parsed value on valid numbers', () => {
  const mod = reloadModule({ NODE_ENV: 'development' });
  const val = withEnv('PORT', '8080', () =>
    mod._internals.getPositiveNumber('PORT', 3000)
  );
  assert.equal(val, 8080);
});

test('adminEmails parsing filters invalid and lowercases', () => {
  const emails = 'Good@Ex.com, invalidemail, ,Another@EX.COM';
  const mod = reloadModule({ NODE_ENV: 'development', ADMIN_EMAILS: emails });
  // module export is the config object
  assert.deepEqual(mod.business.adminEmails, ['good@ex.com', 'another@ex.com']);
});
