import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.NODE_ENV = 'test';
process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), 'nacio-test-'));
process.env.ADMIN_USER = 'admin';
process.env.ADMIN_PASSWORD = 'admin-test-123';
process.env.RETENTION_DAYS = '30';

const { buildApp } = await import('../src/app.js');

const app = await buildApp();
const dataDir = process.env.DATA_DIR;

interface Res<T = any> {
  status: number;
  body: T;
}

async function api<T = any>(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  url: string,
  payload?: unknown,
  token?: string,
): Promise<Res<T>> {
  const response = await app.inject({
    method,
    url,
    payload: payload as never,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  return { status: response.statusCode, body: response.json() as T };
}

const state: {
  adminToken: string;
  inviteCode: string;
  user1: { id: string; token: string; username: string };
  user2: { id: string; token: string; username: string };
  conversationId: string;
  groupId: string;
} = {
  adminToken: '',
  inviteCode: '',
  user1: { id: '', token: '', username: 'alumno.uno' },
  user2: { id: '', token: '', username: 'alumno.dos' },
  conversationId: '',
  groupId: '',
};

before(async () => {
  await app.ready();
});

after(async () => {
  await app.close();
  rmSync(dataDir!, { recursive: true, force: true });
});

test('health responde', async () => {
  const res = await api('GET', '/health');
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
});

test('el admin inicia sesión', async () => {
  const res = await api('POST', '/api/auth/login', { username: 'admin', password: 'admin-test-123' });
  assert.equal(res.status, 200);
  assert.equal(res.body.user.role, 'admin');
  state.adminToken = res.body.accessToken;
});

test('el admin crea una invitación', async () => {
  const res = await api(
    'POST',
    '/api/admin/invites',
    { course: '1A', maxUses: 5, expiresInDays: 30 },
    state.adminToken,
  );
  assert.equal(res.status, 201);
  state.inviteCode = res.body.invite.code;
  assert.equal(state.inviteCode.length, 8);
});

test('dos alumnos se registran con el código', async () => {
  const one = await api('POST', '/api/auth/register', {
    code: state.inviteCode,
    username: state.user1.username,
    displayName: 'Alumno Uno',
    password: 'password123',
  });
  assert.equal(one.status, 201, JSON.stringify(one.body));
  state.user1.id = one.body.user.id;
  state.user1.token = one.body.accessToken;

  const two = await api('POST', '/api/auth/register', {
    code: state.inviteCode,
    username: state.user2.username,
    displayName: 'Alumno Dos',
    password: 'password123',
  });
  assert.equal(two.status, 201, JSON.stringify(two.body));
  state.user2.id = two.body.user.id;
  state.user2.token = two.body.accessToken;
});

test('el código de invitación se agota', async () => {
  const res = await api('POST', '/api/admin/invites', { maxUses: 1, expiresInDays: 1 }, state.adminToken);
  const code = res.body.invite.code as string;

  const first = await api('POST', '/api/auth/register', {
    code,
    username: 'alumno.tres',
    displayName: 'Alumno Tres',
    password: 'password123',
  });
  assert.equal(first.status, 201);

  const second = await api('POST', '/api/auth/register', {
    code,
    username: 'alumno.cuatro',
    displayName: 'Alumno Cuatro',
    password: 'password123',
  });
  assert.equal(second.status, 400);
});

test('solicitud y aceptación de contacto', async () => {
  const request = await api('POST', '/api/contacts', { username: state.user2.username }, state.user1.token);
  assert.equal(request.status, 201);

  const pending = await api('GET', '/api/contacts', undefined, state.user2.token);
  assert.equal(pending.body.contacts[0].state, 'pending');
  assert.equal(pending.body.contacts[0].direction, 'incoming');

  const accept = await api('POST', `/api/contacts/${state.user1.id}/accept`, {}, state.user2.token);
  assert.equal(accept.status, 200);

  const list = await api('GET', '/api/contacts', undefined, state.user1.token);
  assert.equal(list.body.contacts[0].state, 'accepted');
  assert.equal(list.body.contacts[0].user.id, state.user2.id);
});

test('se abre un chat privado y llega el mensaje', async () => {
  const created = await api('POST', '/api/conversations/dm', { userId: state.user2.id }, state.user1.token);
  assert.equal(created.status, 201, JSON.stringify(created.body));
  state.conversationId = created.body.conversation.id;

  const sent = await api(
    'POST',
    `/api/conversations/${state.conversationId}/messages`,
    { body: 'Hola, ¿cómo va?' },
    state.user1.token,
  );
  assert.equal(sent.status, 201);

  const received = await api(
    'GET',
    `/api/conversations/${state.conversationId}/messages`,
    undefined,
    state.user2.token,
  );
  assert.equal(received.status, 200);
  assert.equal(received.body.messages.at(-1).body, 'Hola, ¿cómo va?');
  assert.equal(received.body.messages.at(-1).sender.id, state.user1.id);

  const conversations = await api('GET', '/api/conversations', undefined, state.user2.token);
  const conv = conversations.body.conversations.find((c: any) => c.id === state.conversationId);
  assert.equal(conv.unread, 1);

  await api('POST', `/api/conversations/${state.conversationId}/read`, {}, state.user2.token);
  const after = await api('GET', '/api/conversations', undefined, state.user2.token);
  assert.equal(after.body.conversations.find((c: any) => c.id === state.conversationId).unread, 0);
});

test('se crea un grupo y todos reciben el mensaje', async () => {
  const created = await api(
    'POST',
    '/api/conversations/group',
    { name: '1A Turno Mañana', memberIds: [state.user2.id] },
    state.user1.token,
  );
  assert.equal(created.status, 201, JSON.stringify(created.body));
  state.groupId = created.body.conversation.id;
  assert.equal(created.body.conversation.members.length, 2);

  const sent = await api(
    'POST',
    `/api/conversations/${state.groupId}/messages`,
    { body: 'Nos vemos en el recreo' },
    state.user1.token,
  );
  assert.equal(sent.status, 201);

  const list = await api('GET', '/api/conversations', undefined, state.user2.token);
  const group = list.body.conversations.find((c: any) => c.id === state.groupId);
  assert.ok(group);
  assert.equal(group.lastMessage.body, 'Nos vemos en el recreo');
});

test('un usuario bloqueado no puede escribir', async () => {
  await api('POST', `/api/contacts/${state.user2.id}/block`, {}, state.user1.token);
  const sent = await api(
    'POST',
    `/api/conversations/${state.conversationId}/messages`,
    { body: 'no debería pasar' },
    state.user2.token,
  );
  assert.equal(sent.status, 403);
});

test('el panel admin ve estadísticas y usuarios', async () => {
  const stats = await api('GET', '/api/admin/stats', undefined, state.adminToken);
  assert.equal(stats.status, 200);
  assert.ok(stats.body.stats.users >= 4);

  const users = await api('GET', '/api/admin/users', undefined, state.adminToken);
  assert.equal(users.status, 200);
  assert.ok(users.body.users.some((u: any) => u.username === state.user1.username));
});

test('un alumno no entra al panel admin', async () => {
  const res = await api('GET', '/api/admin/stats', undefined, state.user1.token);
  assert.equal(res.status, 403);
});
