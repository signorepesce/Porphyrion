// node tests/assert_test.js
const assert = require('assert');
const { runAsserts, assertGetPath } = require('../web/js/assert.js');

const ctx = {
    status: 200, ms: 120, size: 64,
    headers: 'HTTP/1.1 200 OK\r\nContent-Type: application/json; charset=utf-8\r\nX-Id: 7\r\n',
    body: JSON.stringify({ user: { id: 42, name: 'Ada' }, items: [{ n: 'a' }, { n: 'b' }], tags: ['x', 'y'], ok: true, nil: null }),
};
const pass = t => runAsserts(t, ctx).map(r => r.pass);

assert.strictEqual(assertGetPath({ a: [{ b: 1 }] }, '$.a[0].b'), 1);
assert.deepStrictEqual(pass('status == 200\nstatus != 404\ntime < 500\nsize >= 64'), [true, true, true, true]);
assert.deepStrictEqual(pass('header content-type contains json\nheader X-Missing !exists\nheader x-id == 7'), [true, true, true]);
assert.deepStrictEqual(pass('json user.id == 42\njson user.name == "Ada"\njson items.length == 2\njson items[1].n == b'), [true, true, true, true]);
assert.deepStrictEqual(pass('json tags contains y\njson tags !contains z\njson ok == true\njson nil == null\njson nil exists'), [true, true, true, true, true]);
assert.deepStrictEqual(pass('json user.name matches /^ad/i\nbody contains "Ada"'), [true, true]);
assert.deepStrictEqual(pass('# comment\n\nstatus == 201\njson user.id > 100\njson nope exists'), [false, false, false]);
const bad = runAsserts('status is 200', ctx)[0];
assert.strictEqual(bad.pass, false); assert.strictEqual(bad.msg, 'cannot parse');
assert.strictEqual(runAsserts('status == 201', ctx)[0].msg, 'got 200');
assert.deepStrictEqual(runAsserts('json a exists', { ...ctx, body: 'not json' }).map(r => r.pass), [false]);
console.log('assert.js: all checks passed');
