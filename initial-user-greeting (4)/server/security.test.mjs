import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createApplication } from './index.mjs';
import { defaultContent, validateContent } from '../src/lib/content.ts';

test('original educational content survives validation unchanged', () => {
  const validated = validateContent(structuredClone(defaultContent));
  assert.deepEqual(validated.adult, defaultContent.adult);
  assert.deepEqual(validated.kids, defaultContent.kids);
  assert.deepEqual(validated.library, defaultContent.library);
  assert.equal(validated.adult.flatMap(d => d.lessons).length, 18);
  assert.equal(validated.kids.flatMap(d => d.lessons).length, 9);
  const invalid = structuredClone(defaultContent);
  invalid.adult[0].lessons[0].quiz[0].answer = 99;
  assert.throws(() => validateContent(invalid));
});

test('admin permissions, private messages, attachments and persistence', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'nasr-test-'));
  const app = await createApplication({ dataDirectory: directory, initialPassword: 'admin', secureCookies: false });
  const server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await rm(directory, { recursive: true, force: true }); });

  const request = async (endpoint, method = 'GET', body, extra = {}) => {
    const form = body instanceof FormData;
    return fetch(base + endpoint, { method, headers: { 'X-Nasr-Request': '1', ...(!form && body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...extra }, body: body === undefined ? undefined : form ? body : JSON.stringify(body) });
  };
  const headerFor = user => ({ Authorization: `Bearer ${user.accessKey}`, 'X-Profile-ID': user.profile.id });

  assert.equal((await request('/admin/overview')).status, 401);
  assert.equal((await request('/admin/content', 'PUT', { content: defaultContent, label: 'unauthorized' })).status, 401);
  assert.equal((await request('/admin/login', 'POST', { password: 'incorrect' })).status, 401);
  assert.equal((await request('/admin/login', 'POST', { password: 'admin' }, { Origin: 'https://untrusted.example' })).status, 403);
  const login = await request('/admin/login', 'POST', { password: 'admin' });
  assert.equal(login.status, 200);
  const setCookie = login.headers.get('set-cookie');
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /SameSite=Strict/i);
  const adminHeaders = { Cookie: setCookie.split(';')[0] };

  const userA = await (await request('/profiles', 'POST', { profile: { id: randomUUID(), name: 'Test Student A', track: 'adult', status: 'blocked', role: 'admin' } })).json();
  const userB = await (await request('/profiles', 'POST', { profile: { id: randomUUID(), name: 'Test Student B', track: 'kids' } })).json();
  assert.equal(userA.profile.status, 'active');
  assert.equal(userA.profile.role, undefined);
  assert.equal((await request('/profiles/me')).status, 401);
  assert.equal((await request('/admin/overview', 'GET', undefined, headerFor(userA))).status, 401);
  const publicData = await (await request('/public')).json();
  assert.equal(publicData.users, undefined);
  assert.equal(publicData.auth, undefined);

  const phoneWithoutConsent = await request('/profiles/me', 'PUT', { name: 'Test Student A', mobile: '09123456789' }, headerFor(userA));
  assert.equal(phoneWithoutConsent.status, 400);
  const updated = await request('/profiles/me', 'PUT', { name: 'Test Student A', mobile: '09123456789', email: 'student@example.com', consentAt: Date.now() }, headerFor(userA));
  assert.equal(updated.status, 200);

  const form = new FormData();
  form.set('subject', 'Private test message');
  form.set('text', 'The body should be visible only to the sender and administrator.');
  form.append('attachments', new Blob(['%PDF-1.4\nTest PDF data'], { type: 'application/pdf' }), 'example.pdf');
  const messageResponse = await request('/messages', 'POST', form, headerFor(userA));
  assert.equal(messageResponse.status, 201);
  const { message } = await messageResponse.json();
  assert.equal(message.userId, userA.profile.id);
  assert.equal(message.mobile, '09123456789');
  assert.equal((await (await request('/messages/mine', 'GET', undefined, headerFor(userB))).json()).messages.length, 0);
  const attachmentId = message.attachments[0].id;
  assert.equal((await request(`/attachments/${attachmentId}`)).status, 404);
  assert.equal((await request(`/attachments/${attachmentId}`, 'GET', undefined, headerFor(userB))).status, 404);
  assert.equal((await request(`/attachments/${attachmentId}`, 'GET', undefined, headerFor(userA))).status, 200);
  assert.equal((await request(`/attachments/${attachmentId}`, 'GET', undefined, adminHeaders)).status, 200);

  const spoofed = new FormData();
  spoofed.set('subject', 'Spoofed file'); spoofed.set('text', 'This upload must fail.');
  spoofed.append('attachments', new Blob(['<html>not an image</html>'], { type: 'image/png' }), 'bad.png');
  assert.equal((await request('/messages', 'POST', spoofed, headerFor(userA))).status, 400);

  assert.equal((await request(`/admin/messages/${message.id}`, 'PUT', { status: 'replied', reply: 'Administrator reply' }, headerFor(userB))).status, 401);
  assert.equal((await request(`/admin/messages/${message.id}`, 'PUT', { status: 'replied', reply: 'Administrator reply' }, adminHeaders)).status, 200);
  const mine = await (await request('/messages/mine', 'GET', undefined, headerFor(userA))).json();
  assert.equal(mine.messages[0].replies[0].text, 'Administrator reply');

  const newContent = structuredClone(defaultContent);
  newContent.settings.title = 'Test University';
  assert.equal((await request('/admin/content', 'PUT', { content: newContent, label: 'Test title change' }, adminHeaders)).status, 200);
  assert.equal((await (await request('/public')).json()).content.settings.title, 'Test University');
  const overview = await (await request('/admin/overview', 'GET', undefined, adminHeaders)).json();
  assert.equal(overview.users.length, 2);
  assert.equal(overview.revisions.length, 1);
  assert.equal(overview.users[0].accessHash, undefined);

  const blocked = { ...overview.users.find(p => p.id === userA.profile.id), status: 'blocked' };
  assert.equal((await request(`/admin/users/${blocked.id}`, 'PUT', { profile: blocked }, adminHeaders)).status, 200);
  const blockedForm = new FormData(); blockedForm.set('subject', 'Blocked'); blockedForm.set('text', 'Must fail');
  assert.equal((await request('/messages', 'POST', blockedForm, headerFor(userA))).status, 403);

  assert.equal((await request('/admin/password', 'PUT', { current: 'admin', next: 'new-secure-test-password' }, adminHeaders)).status, 200);
  await request('/admin/logout', 'POST', undefined, adminHeaders);
  assert.equal((await request('/admin/overview', 'GET', undefined, adminHeaders)).status, 401);
  assert.equal((await request('/admin/login', 'POST', { password: 'admin' })).status, 401);
  assert.equal((await request('/admin/login', 'POST', { password: 'new-secure-test-password' })).status, 200);

  const restarted = await createApplication({ dataDirectory: directory, initialPassword: 'different-default', secureCookies: false });
  const second = await new Promise(resolve => { const instance = restarted.listen(0, '127.0.0.1', () => resolve(instance)); });
  try {
    const saved = await (await fetch(`http://127.0.0.1:${second.address().port}/api/public`)).json();
    assert.equal(saved.content.settings.title, 'Test University');
  } finally { second.closeAllConnections(); await new Promise(resolve => second.close(resolve)); }
});