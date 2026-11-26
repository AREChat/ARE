import sys, os
os.environ.setdefault("ARE_SRC", "/home/claude/r3/AREDA")
os.environ.setdefault("ARE_PORT", "8791")
os.environ.setdefault("ARE_SW", "block")
sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
from h import *

res = []
def check(n, ok, note=""):
    res.append(bool(ok)); print(("OK  " if ok else "NG  ") + n + ((" : " + str(note)) if note else ""))

EXTRA = r"""
try{ Object.defineProperty(navigator, "standalone", {value:true}); }catch(e){}
const fx = window.__fx;
fx.persist = true;
fx.tables.chat_rooms.push({id:'r3', is_group:true, name:'テスト班', created_by:'u-me', created_at:'2026-10-28T00:00:00Z'});
fx.tables.chat_rooms.push({id:'r4', is_group:true, name:'よその班', created_by:'u1', created_at:'2026-10-27T00:00:00Z'});
fx.tables.chat_room_members.push({room_id:'r3', user_id:'u-me'},{room_id:'r3', user_id:'u1'},{room_id:'r3', user_id:'u2'},{room_id:'r4', user_id:'u-me'},{room_id:'r4', user_id:'u1'});
fx.tables.messages = [];
fx.tables.room_items = [];
fx.tables.scheduled_messages = [];
fx.tables.user_diary = [];
fx.rpc.my_access = function(){ return {points: 500, admin:false, trial_ends:null, streak:1}; };
fx.rpc.is_current_user_admin = function(){ return false; };
fx.rpc.claim_daily_bonus = function(){ return {gained:0, points:500, streak:1}; };
fx.rpc.send_message = function(a){ const id='mx'+Math.random(); fx.tables.messages.push({id, room_id:a.p_room_id, sender_id:'u-me', content:a.p_content, created_at:new Date().toISOString(), edited_at:null, expires_at:null, is_auto_reply:false}); return id; };
let seq = 1;
const T = () => fx.tables.room_items;
const memberOf = (room) => fx.tables.chat_room_members.some(m => m.room_id === room && m.user_id === 'u-me');
fx.rpc.item_add = function(a){
  if(!a.p_room || !memberOf(a.p_room)) throw new Error('not_allowed');
  const kind = a.p_kind, d = a.p_data || {};
  if(!['card','card_note','task','duty','pack','trip'].includes(kind)) throw new Error('item_kind_invalid');
  if(Array.isArray(d)) throw new Error('item_data_invalid');
  const title = String(a.p_title||'').trim(), body = String(a.p_body||'').trim();
  if(kind === 'card_note'){
    const par = T().find(r => r.id === a.p_parent && r.kind === 'card'); if(!par) throw new Error('item_parent_invalid'); if(par.done) throw new Error('item_closed');
    if(!body || body.length > 200) throw new Error('item_text_invalid');
    const mine = T().find(r => r.parent_id === a.p_parent && r.created_by === 'u-me'); if(mine){ mine.body = body; return mine.id; }
    const row = {id:'n'+(seq++), room_id:a.p_room, kind, parent_id:a.p_parent, title:'', body, data:d, done:false, done_by:null, created_by:'u-me', created_at:new Date(Date.now()+seq).toISOString()}; T().push(row); return row.id;
  }
  if(!title || title.length > 100) throw new Error('item_title_invalid');
  if(body.length > 500) throw new Error('item_text_invalid');
  const cap = kind === 'card' ? 30 : 300;
  if(T().filter(r => r.room_id === a.p_room && r.kind === kind).length >= cap) throw new Error('too_many_rows');
  const row = {id:'i'+(seq++), room_id:a.p_room, kind, parent_id:null, title, body, data:d, done:false, done_by:null, created_by:'u-me', created_at:new Date(Date.now()+seq).toISOString()}; T().push(row); return row.id;
};
fx.rpc.item_update = function(a){ const r = T().find(x => x.id === a.p_id); if(!r) throw new Error('not_allowed'); if(a.p_title != null) r.title = a.p_title; if(a.p_body != null) r.body = a.p_body; if(a.p_data != null) r.data = a.p_data; };
fx.rpc.item_set_done = function(a){ const r = T().find(x => x.id === a.p_id); if(!r) throw new Error('not_allowed'); r.done = !!a.p_done; r.done_by = a.p_done ? 'u-me' : null; };
fx.rpc.item_remove = function(a){
  const r = T().find(x => x.id === a.p_id); if(!r) throw new Error('not_allowed');
  if(r.created_by !== 'u-me' && (fx.tables.chat_rooms.find(c => c.id === r.room_id) || {}).created_by !== 'u-me') throw new Error('not_allowed');
  fx.tables.room_items = T().filter(x => x.id !== a.p_id && x.parent_id !== a.p_id);
};
fx.rpc.schedule_capsule = function(a){
  const t = new Date(a.p_send_at).getTime(), now = Date.now();
  if(!(t >= now + 3600000 && t <= now + 1095*86400000)) throw new Error('send_at_out_of_range');
  const j = JSON.parse(a.p_content); if(j.type !== 'capsule') throw new Error('capsule_invalid');
  const id = 's' + (seq++); fx.tables.scheduled_messages.push({id, room_id:a.p_room_id, sender_id:'u-me', content:a.p_content, send_at:a.p_send_at, status:'pending'}); return id;
};
fx.rpc.cancel_scheduled_message = function(a){ fx.tables.scheduled_messages = fx.tables.scheduled_messages.filter(x => x.id !== a.p_id); };
fx.rpc.schedule_message = function(a){ const id = 's' + (seq++); fx.tables.scheduled_messages.push({id, room_id:a.p_room_id, sender_id:'u-me', content:a.p_content, send_at:a.p_send_at, status:'pending'}); return id; };
fx.secret = {on:false, code:null, phrase:null};
fx.rpc.secret_room_status = function(a){ return fx.secret.on ? {on:true, code:fx.secret.code} : {on:false}; };
fx.rpc.secret_room_set = function(a){ const p = String(a.p_phrase||'').trim(); if(p.length < 4 || p.length > 30) throw new Error('secret_phrase_invalid'); fx.secret = {on:true, code:fx.secret.code || 'ABCD2345', phrase:p}; return fx.secret.code; };
fx.rpc.secret_room_clear = function(a){ fx.secret = {on:false, code:null, phrase:null}; };
fx.rpc.secret_room_join = function(a){
  fx.joinTries = (fx.joinTries || 0) + 1;
  if(fx.joinTries > 5) throw new Error('rate_limited');
  if(fx.secret.on && String(a.p_code).toUpperCase() === fx.secret.code && a.p_phrase === fx.secret.phrase){
    if(!memberOf('r4x')){ fx.tables.chat_rooms.push({id:'r4x', is_group:true, name:'ひみつの部屋', created_by:'u1', created_at:'2026-11-01T00:00:00Z'}); fx.tables.chat_room_members.push({room_id:'r4x', user_id:'u-me'},{room_id:'r4x', user_id:'u1'}); }
    return 'r4x';
  }
  return null;   // 本物のサーバーは、まちがいのとき null を返す（回数を数えるため）
};
"""

def open_chat(p, width=390, height=760, extra="", touch=True):
    browser, ctx, page, logs = new_page(p, width=width, height=height, extra_fx=EXTRA + extra, touch=touch)
    page.goto(BASE + "/chat.html"); page.wait_for_selector("#roomList"); page.wait_for_timeout(1800)
    return browser, ctx, page, logs

def enter(page, rid):
    page.evaluate("(rid) => { const r = state.rooms.find(x => x.id === rid); selectRoom(r, r.partner); }", rid)
    page.wait_for_timeout(700)

def sheet_text(page):
    return page.inner_text("#profileSheet")

def click_t(page, sel):
    page.locator("#profileSheet " + sel).first.click(); page.wait_for_timeout(350)

def errors(page, logs):
    return [l for l in logs if l[0] == "pageerror"] + page.evaluate("window.__fakeErrors")
