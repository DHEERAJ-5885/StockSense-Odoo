/* StockSense authentication, shared by Auth.dc.html and StockSense.dc.html.
 *
 * Modes (SSAuth.mode after SSAuth.ready()):
 *   'supabase' - config.js has a URL + anon key: real accounts in Supabase Auth
 *   'local'    - no config, or ?local=1: demo users kept in the browser (localStorage), demo OTP 482913
 *   'offline'  - Supabase is configured but its library could not be loaded
 * Every failure is thrown as an Error whose message is safe to show to the user.
 */
(function () {
  'use strict';
  if (window.SSAuth) return; // the page framework can run head scripts twice; keep the first instance
  var SESSION_KEY = 'stocksense.session', USERS_KEY = 'stocksense.users', LOCAL_FLAG = 'stocksense.local';
  var SDK_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js';
  var DEMO_OTP = '482913';
  var MGR = 'Inventory Manager', STAFF = 'Warehouse Staff';
  var ROLE_UI = { admin: MGR, manager: MGR, staff: STAFF };
  var UI_ROLE = {}; UI_ROLE[MGR] = 'manager'; UI_ROLE[STAFF] = 'staff';
  var DEMO_USERS = [
    { loginId: 'priya.nair', name: 'Priya Nair', email: 'priya.nair@stocksense.app', role: MGR, password: 'Priya@2026' },
    { loginId: 'ravi.mehta', name: 'Ravi Mehta', email: 'ravi.mehta@stocksense.app', role: MGR, password: 'Ravi@2026' },
    { loginId: 'anya.khan', name: 'Anya Khan', email: 'anya.khan@stocksense.app', role: STAFF, password: 'Anya@2026' }
  ];

  var mode = 'local', client = null, readyPromise = null, sessionOnly = false, resetToken = '';
  var fail = function (msg) { return new Error(msg); };
  var invalid = function () { return fail('Invalid Login Id or Password'); };

  // ---------- session cache (name/role shown in the app) ----------
  function saveSession(user, remember) {
    var json = JSON.stringify({ loginId: user.loginId || '', name: user.name, email: user.email, role: user.role });
    try { window.sessionStorage.setItem(SESSION_KEY, json); if (remember) window.localStorage.setItem(SESSION_KEY, json); else window.localStorage.removeItem(SESSION_KEY); } catch (e) { /* storage blocked */ }
  }
  function readSession() {
    var stores = ['sessionStorage', 'localStorage'];
    for (var i = 0; i < stores.length; i++) { try { var u = JSON.parse(window[stores[i]].getItem(SESSION_KEY)); if (u && u.name) return u; } catch (e) { /* next */ } }
    return null;
  }
  function clearSession() { try { window.sessionStorage.removeItem(SESSION_KEY); window.localStorage.removeItem(SESSION_KEY); } catch (e) { /* nothing */ } }

  // ---------- Supabase ----------
  // Keep the Supabase session in sessionStorage unless the user ticked "Keep me signed in".
  var storage = {
    getItem: function (k) { var v = window.sessionStorage.getItem(k); return v !== null ? v : window.localStorage.getItem(k); },
    setItem: function (k, v) { if (sessionOnly || window.sessionStorage.getItem(k) !== null) { window.sessionStorage.setItem(k, v); window.localStorage.removeItem(k); } else window.localStorage.setItem(k, v); },
    removeItem: function (k) { window.sessionStorage.removeItem(k); window.localStorage.removeItem(k); }
  };
  function loadScript(src) {
    return new Promise(function (ok, no) { var s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = function () { no(new Error('Could not load ' + src)); }; document.head.appendChild(s); });
  }
  function ready() {
    if (readyPromise) return readyPromise;
    readyPromise = (async function () {
      try { if (/[?&]local=1/.test(window.location.search)) window.sessionStorage.setItem(LOCAL_FLAG, '1'); } catch (e) { /* ignore */ }
      var forceLocal = false; try { forceLocal = window.sessionStorage.getItem(LOCAL_FLAG) === '1'; } catch (e) { /* ignore */ }
      if (!window.STOCKSENSE_CONFIG) { try { await loadScript('config.js'); } catch (e) { /* no config: local mode */ } }
      var cfg = window.STOCKSENSE_CONFIG || {};
      if (forceLocal || !cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) { mode = 'local'; return mode; }
      try {
        if (!window.supabase) await loadScript(SDK_URL);
        client = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, { auth: { storage: storage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
        mode = 'supabase';
      } catch (e) { mode = 'offline'; }
      return mode;
    })();
    return readyPromise;
  }
  function needSupabase() { if (mode === 'offline') throw fail('Can’t reach the sign-in service. Check your internet connection and reload.'); }
  function missingFn(err) { return !!err && (err.code === 'PGRST202' || err.code === '42883' || /could not find the function|not find the function/i.test(err.message || '')); }
  function netError(err) { return !!err && (err.name === 'AuthRetryableFetchError' || /failed to fetch|networkerror|load failed/i.test(err.message || '')); }
  function serviceError(err) {
    if (netError(err)) return fail('Can’t reach the sign-in service. Check your internet connection and try again.');
    if (missingFn(err)) return fail('Sign-in by Login ID isn’t set up yet. Ask an admin to run Database/migrations/003_frontend_auth.sql, or sign in with your email address.');
    return fail((err && err.message) || 'Something went wrong. Try again.');
  }
  async function profileUser(authUser) {
    var meta = authUser.user_metadata || {}; var p = null;
    try { var r = await client.from('profiles').select('login_id, full_name, role').eq('id', authUser.id).maybeSingle(); p = r && r.data; } catch (e) { /* fall back to metadata */ }
    return { loginId: (p && p.login_id) || meta.login_id || '', name: (p && p.full_name) || meta.full_name || authUser.email, email: authUser.email, role: ROLE_UI[(p && p.role) || meta.role] || STAFF };
  }

  // ---------- StockSense backend (password-reset codes are emailed by the server with Nodemailer) ----------
  async function backend(path, body) {
    var base = ((window.STOCKSENSE_CONFIG || {}).API_URL || 'http://localhost:5000').replace(/\/$/, '');
    var res;
    try { res = await fetch(base + '/api/auth/' + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); }
    catch (e) { throw fail('The StockSense server isn’t running, so the code can’t be sent. Start it with “npm start” in the backend folder.'); }
    var json = null; try { json = await res.json(); } catch (e) { /* not JSON */ }
    if (!res.ok || !json || json.success === false) throw fail((json && json.message) || 'Something went wrong. Try again.');
    return json;
  }

  // ---------- local (browser-only) users ----------
  var memUsers = null;
  async function sha(pw) {
    var text = 'stocksense:' + pw;
    try { var b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)); return Array.from(new Uint8Array(b)).map(function (x) { return x.toString(16).padStart(2, '0'); }).join(''); }
    catch (e) { var h = 5381; for (var i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) >>> 0; return 'x' + h.toString(16); }
  }
  function readUsers() { if (memUsers) return memUsers; try { return JSON.parse(window.localStorage.getItem(USERS_KEY)) || {}; } catch (e) { return {}; } }
  function writeUsers(u) { memUsers = u; try { window.localStorage.setItem(USERS_KEY, JSON.stringify(u)); } catch (e) { /* kept in memory */ } }
  async function loadUsers() {
    var users = readUsers(), changed = false;
    for (var i = 0; i < DEMO_USERS.length; i++) { var d = DEMO_USERS[i]; if (!users[d.loginId]) { users[d.loginId] = { loginId: d.loginId, name: d.name, email: d.email, role: d.role, pw: await sha(d.password) }; changed = true; } }
    if (changed || !memUsers) writeUsers(users);
    return users;
  }
  var pub = function (u) { return { loginId: u.loginId, name: u.name, email: u.email, role: u.role }; };

  // ---------- public API ----------
  var api = {
    get mode() { return mode; },
    ready: ready, saveSession: saveSession, readSession: readSession, clearSession: clearSession,
    demoOtp: DEMO_OTP, demoUsers: DEMO_USERS.map(function (d) { return { loginId: d.loginId, password: d.password, role: d.role }; }),

    // Login ID (or, in Supabase mode, an email) + password -> user
    signIn: async function (login, password, remember) {
      await ready(); needSupabase(); var id = String(login || '').trim();
      if (!id || !password) throw invalid();
      var user;
      if (mode === 'supabase') {
        sessionOnly = !remember; var email = id;
        if (id.indexOf('@') < 0) {
          var look = await client.rpc('email_for_login', { p_login_id: id.toLowerCase() });
          if (look.error) throw serviceError(look.error);
          if (!look.data) throw invalid();
          email = look.data;
        }
        var res = await client.auth.signInWithPassword({ email: email, password: password });
        if (res.error) {
          if (/not confirmed/i.test(res.error.message)) throw fail('Please confirm your email first — open the link we sent you, then sign in.');
          if (/invalid login|invalid credentials/i.test(res.error.message)) throw invalid();
          throw serviceError(res.error);
        }
        user = await profileUser(res.data.user);
      } else {
        var users = await loadUsers(), u = users[id.toLowerCase()];
        if (!u || u.pw !== await sha(password)) throw invalid();
        user = pub(u);
      }
      saveSession(user, remember);
      return user;
    },

    // -> { user } when signed straight in, { needsConfirmation: true } when the email must be confirmed first
    signUp: async function (a) {
      await ready(); needSupabase(); var loginId = a.loginId.trim().toLowerCase(), email = a.email.trim().toLowerCase();
      if (mode === 'supabase') {
        sessionOnly = !a.remember;
        var chk = await client.rpc('login_id_available', { p_login_id: loginId });
        if (chk.error && !missingFn(chk.error)) throw serviceError(chk.error);
        if (!chk.error && chk.data === false) throw fail('That Login ID is already taken.');
        var res = await client.auth.signUp({ email: email, password: a.password,
          options: { data: { full_name: a.name.trim(), login_id: loginId, role: UI_ROLE[a.role] || 'staff' }, emailRedirectTo: window.location.origin + window.location.pathname } });
        if (res.error) {
          if (/already (been )?registered|already exists/i.test(res.error.message)) throw fail('An account with this email already exists.');
          if (/database error saving/i.test(res.error.message)) throw fail('That Login ID is already taken.');
          if (/rate limit|too many|seconds/i.test(res.error.message)) throw fail('Too many attempts — wait a minute and try again.');
          throw serviceError(res.error);
        }
        if (res.data.user && res.data.user.identities && res.data.user.identities.length === 0) throw fail('An account with this email already exists.');
        if (!res.data.session) return { needsConfirmation: true };
        var made = await profileUser(res.data.user); saveSession(made, a.remember); return { user: made };
      }
      var users = await loadUsers();
      if (users[loginId]) throw fail('That Login ID is already taken.');
      if (Object.keys(users).some(function (k) { return users[k].email.toLowerCase() === email; })) throw fail('An account with this email already exists.');
      var nu = { loginId: loginId, name: a.name.trim(), email: email, role: a.role, pw: await sha(a.password) };
      users[loginId] = nu; writeUsers(users); saveSession(pub(nu), a.remember);
      return { user: pub(nu) };
    },

    // Forgot password: 1) email a code  2) check the code  3) set the new password
    sendResetCode: async function (email) {
      await ready(); needSupabase(); email = email.trim().toLowerCase();
      if (mode === 'supabase') { resetToken = ''; await backend('forgot-password', { email: email }); return true; }
      var users = await loadUsers();
      if (!Object.keys(users).some(function (k) { return users[k].email.toLowerCase() === email; })) throw fail('No account uses that email.');
      return true;
    },
    verifyResetCode: async function (email, code) {
      await ready(); needSupabase();
      if (mode === 'supabase') { var r = await backend('verify-reset-code', { email: email.trim().toLowerCase(), code: code }); resetToken = r.data.resetToken; return true; }
      if (code !== DEMO_OTP) throw fail('That code doesn’t match. Check the latest email and try again.');
      return true;
    },
    setNewPassword: async function (email, password) {
      await ready(); needSupabase();
      if (mode === 'supabase') {
        await backend('reset-password', { email: email.trim().toLowerCase(), resetToken: resetToken, password: password });
        resetToken = ''; clearSession(); return true;
      }
      var users = await loadUsers(), em = email.trim().toLowerCase();
      var key = Object.keys(users).filter(function (k) { return users[k].email.toLowerCase() === em; })[0];
      if (!key) throw fail('No account uses that email.');
      users[key] = Object.assign({}, users[key], { pw: await sha(password) }); writeUsers(users); return true;
    },

    // ---- used by the app once signed in ----
    requireSession: async function () {
      await ready(); if (mode !== 'supabase') return !!readSession();
      try { var r = await client.auth.getSession(); return !!(r.data && r.data.session) && !!readSession(); } catch (e) { return !!readSession(); }
    },
    signOut: async function () {
      try { await ready(); if (mode === 'supabase') await client.auth.signOut(); } catch (e) { /* still leave */ }
      clearSession();
    },
    changePassword: async function (current, next) {
      await ready(); needSupabase(); var me = readSession(); if (!me) throw fail('Please sign in again.');
      if (mode === 'supabase') {
        var chk = await client.auth.signInWithPassword({ email: me.email, password: current });
        if (chk.error) throw /invalid/i.test(chk.error.message) ? fail('Your current password is incorrect.') : serviceError(chk.error);
        var up = await client.auth.updateUser({ password: next });
        if (up.error) throw serviceError(up.error);
        return true;
      }
      var users = await loadUsers(), u = users[(me.loginId || '').toLowerCase()];
      if (!u || u.pw !== await sha(current)) throw fail('Your current password is incorrect.');
      users[u.loginId] = Object.assign({}, u, { pw: await sha(next) }); writeUsers(users); return true;
    },
    updateName: async function (name) {
      await ready(); var me = readSession(); if (!me) return;
      if (mode === 'supabase') {
        var u = await client.auth.getUser();
        if (u.data && u.data.user) { var r = await client.from('profiles').update({ full_name: name }).eq('id', u.data.user.id); if (r.error) throw serviceError(r.error); }
      } else {
        var users = await loadUsers(), key = (me.loginId || '').toLowerCase(); if (users[key]) { users[key] = Object.assign({}, users[key], { name: name }); writeUsers(users); }
      }
      var remembered = false; try { remembered = window.localStorage.getItem(SESSION_KEY) !== null; } catch (e) { /* ignore */ }
      saveSession(Object.assign({}, me, { name: name }), remembered);
    },

    // test hook: run the Supabase code paths against a fake client
    __useClient: function (fake) { client = fake; mode = 'supabase'; readyPromise = Promise.resolve('supabase'); }
  };
  window.SSAuth = api;
})();
