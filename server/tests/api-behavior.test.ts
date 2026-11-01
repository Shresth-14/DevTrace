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

test('a blocked CORS origin gets a 403 JSON error with no stack trace', async () => {
  const res = await request(app).get('/health').set('Origin', 'http://evil.example');
  assert.equal(res.status, 403);
  assert.equal(res.body.error, 'Forbidden');
  assert.doesNotMatch(res.text, /\bat \S+ \(/, 'no stack frames in the response');
});

test('an allowed origin still works', async () => {
  const res = await request(app).get('/health').set('Origin', 'http://localhost:3000');
  assert.equal(res.status, 200);
  assert.equal(res.headers['access-control-allow-origin'], 'http://localhost:3000');
});

test('AI endpoints require a signed-in user', async () => {
  for (const [method, path] of [
    ['get', '/api/v1/ai/status'],
    ['post', '/api/v1/ai/chat'],
    ['post', '/api/ai/chat/stream'],
  ] as const) {
    const res = await request(app)[method](path).send({});
    assert.equal(res.status, 401, `${method.toUpperCase()} ${path}`);
  }
  const bad = await request(app).get('/api/v1/ai/status').set('Authorization', 'Bearer not-a-token');
  assert.equal(bad.status, 401);
});
