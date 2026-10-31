import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import '../src/tests/setup-env';
import { createApp } from '../src/app';

const app = createApp();

test('unknown route returns 404', async () => {
  const res = await request(app).get('/does-not-exist');
  assert.equal(res.status, 404);
});

test('malformed JSON body returns 400, not 500', async () => {
  const res = await request(app)
    .post('/health')
    .set('Content-Type', 'application/json')
    .send('{"broken": ');
  assert.equal(res.status, 400);
});

test('oversized JSON body is rejected with 413', async () => {
  const big = JSON.stringify({ data: 'x'.repeat(200 * 1024) });
  const res = await request(app)
    .post('/health')
    .set('Content-Type', 'application/json')
    .send(big);
  assert.equal(res.status, 413);
});
