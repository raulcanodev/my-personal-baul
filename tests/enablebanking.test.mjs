import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, verify } from 'node:crypto';
import { enableToken, enableAccountId, mapEnableTransaction, createEnableBankingAdapter } from '../src/server/finance/providers/enablebanking.ts';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const credentials = { appId: 'test-app', privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }) };
const accounts = [
  { uid: 'eur', identification_hash: 'same-iban', currency: 'EUR', name: 'Revolut' },
  { uid: 'usd', identification_hash: 'same-iban', currency: 'USD', name: 'Revolut' },
];
const session = { ...credentials, sessionId: 'session', bank: { name: 'Revolut', country: 'PT' }, accounts, validUntil: new Date(Date.now()+86400000).toISOString() };
const transaction = { entry_reference: 'stable', transaction_id: 'unstable', status: 'BOOK', booking_date: '2026-11-01', transaction_amount: { amount: '12.34', currency: 'EUR' }, credit_debit_indicator: 'DBIT', creditor: { name: 'Shop' } };

test('signs an RS256 JWT with the expected audience and short expiry', async () => {
  const [header, body, signature] = (await enableToken(credentials)).split('.');
  assert.equal(JSON.parse(Buffer.from(header,'base64url')).kid,'test-app');
  const claims=JSON.parse(Buffer.from(body,'base64url'));
  assert.equal(claims.aud,'api.enablebanking.com');
  assert.equal(claims.exp-claims.iat,300);
  assert.ok(verify('RSA-SHA256',Buffer.from(`${header}.${body}`),publicKey,Buffer.from(signature,'base64url')));
});

test('keeps currencies distinct and preserves account IDs on renewal', () => {
  assert.notEqual(enableAccountId(accounts[0]),enableAccountId(accounts[1]));
  assert.equal(enableAccountId(accounts[0]),enableAccountId({...accounts[0],uid:'renewed'}));
});

test('uses stable entry references, debit signs and valid dates', () => {
  assert.equal(mapEnableTransaction(transaction).amount,-12.34);
  assert.equal(mapEnableTransaction({...transaction,credit_debit_indicator:'CRDT'}).amount,12.34);
  assert.equal(mapEnableTransaction({...transaction,transaction_id:'changed'}).externalId,'stable');
  assert.throws(()=>mapEnableTransaction({...transaction,entry_reference:undefined}),/identificador estable/);
  assert.throws(()=>mapEnableTransaction({...transaction,booking_date:'bad'}),/no válido/);
});

test('paginates booked transactions without exposing credentials in URL', async () => {
  const original=globalThis.fetch;
  let calls=0;
  globalThis.fetch=async (url,init) => {
    calls++;
    const parsed=new URL(url);
    assert.equal(parsed.origin,'https://api.enablebanking.com');
    assert.equal(parsed.searchParams.get('transaction_status'),'BOOK');
    assert.equal(parsed.searchParams.get('date_from'),'2026-01-01');
    assert.ok(init.headers.Authorization.startsWith('Bearer '));
    assert.equal(init.redirect,'manual');
    if(calls===1) return Response.json({transactions:[transaction],continuation_key:'a+/='});
    assert.equal(parsed.searchParams.get('continuation_key'),'a+/=');
    return Response.json({transactions:[{...transaction,entry_reference:'second'},{...transaction,status:'PDNG'}]});
  };
  try {
    const result=await createEnableBankingAdapter().fetchTransactions({apiKey:JSON.stringify(session),accountId:enableAccountId(accounts[0]),fromDate:new Date('2026-01-01')});
    assert.equal(result.transactions.length,2);
    assert.equal(calls,2);
  } finally { globalThis.fetch=original; }
});

test('rejects repeated pagination and expired consents', async () => {
  const original=globalThis.fetch;
  globalThis.fetch=async()=>Response.json({transactions:[],continuation_key:'repeated'});
  try {
    await assert.rejects(createEnableBankingAdapter().fetchTransactions({apiKey:JSON.stringify(session),accountId:enableAccountId(accounts[0])}),/repetido/);
    await assert.rejects(createEnableBankingAdapter().fetchBalances({apiKey:JSON.stringify({...session,validUntil:'2020-01-01'})}),/caducado/);
  } finally { globalThis.fetch=original; }
});

test('uses booked balances without summing available and booked balances',async()=>{
  const original=globalThis.fetch;
  globalThis.fetch=async(url)=>{
    const currency=url.includes('/eur/')?'EUR':'USD';
    return Response.json({balances:[{balance_type:'CLAV',balance_amount:{amount:'90',currency}},{balance_type:'CLBD',balance_amount:{amount:'100',currency}}]});
  };
  try {
    const result=await createEnableBankingAdapter().fetchBalances({apiKey:JSON.stringify(session)});
    assert.deepEqual(result.balances.map(x=>x.balance),[100,100]);
    assert.equal(new Set(result.balances.map(x=>x.accountId)).size,2);
  } finally { globalThis.fetch=original; }
});


test('rejects redirects without forwarding credentials to another host',async()=>{
  const original=globalThis.fetch;
  globalThis.fetch=async(_url,init)=>{
    assert.equal(init.redirect,'manual');
    return new Response(null,{status:302,headers:{Location:'https://example.com'}});
  };
  try {
    await assert.rejects(createEnableBankingAdapter().fetchBalances({apiKey:JSON.stringify(session)}),/error 302/);
  } finally { globalThis.fetch=original; }
});
