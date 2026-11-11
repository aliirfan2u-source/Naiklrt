/* Sambungkan app ke Firebase Realtime Database (nod "to-onboard").
   Menyediakan antara muka claude.use('db') yang digunakan oleh app. */
(function () {
  var ROOT = 'to-onboard';
  var CFG = {
    apiKey: 'unused',
    projectId: 'to-on-board',
    databaseURL: 'https://to-on-board-default-rtdb.asia-southeast1.firebasedatabase.app'
  };
  var DEV = (function () { try { return localStorage.getItem('fbdev') || (function () { var v = 'd' + Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem('fbdev', v); return v; })(); } catch (e) { return 'd' + Math.random().toString(36).slice(2); } })();
  var dbp = null;

  function getDB() {
    if (dbp) return dbp;
    dbp = new Promise(function (res, rej) {
      try {
        if (typeof firebase === 'undefined') return rej(new Error('Firebase SDK tidak dimuatkan'));
        var app = firebase.apps.length ? firebase.app() : firebase.initializeApp(CFG);
        res(app.database());
      } catch (e) { rej(e); }
    });
    dbp.catch(function () { dbp = null; });
    return dbp;
  }

  // Kunci RTDB tidak boleh ada . $ # [ ] /
  function enc(k) { return String(k).replace(/[%.$#\[\]\/]/g, function (c) { return '%' + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0'); }); }
  function dec(k) { return String(k).replace(/%([0-9A-F]{2})/g, function (_, h) { return String.fromCharCode(parseInt(h, 16)); }); }
  function parse(v) { try { return v && typeof v.j === 'string' ? JSON.parse(v.j) : null; } catch (e) { return null; } }
  function wrapErr(e) { var c = e && e.code ? String(e.code) : ''; var x = new Error(e && e.message || String(e)); x.code = /permission/i.test(c) ? 'permission-denied' : (c || 'unavailable'); return x; }
  function path(p) { var a = String(p).split('/'); return ROOT + '/' + a.map(enc).join('/'); }

  function docRef(p) {
    var parts = String(p).split('/');
    var full = ROOT + '/' + enc(parts[0]) + '/' + enc(parts.slice(1).join('/'));
    return {
      set: function (obj) {
        return getDB().then(function (db) { return db.ref(full).set({ j: JSON.stringify(obj) }); }).catch(function (e) { throw wrapErr(e); });
      },
      delete: function () {
        return getDB().then(function (db) { return db.ref(full).remove(); }).catch(function (e) { throw wrapErr(e); });
      },
      get: function () {
        return getDB().then(function (db) { return db.ref(full).once('value'); }).then(function (s) {
          var v = s.val();
          return { exists: s.exists(), id: dec(s.key), data: function () { return parse(v); } };
        }).catch(function (e) { throw wrapErr(e); });
      },
      acquire: function (o) {
        o = o || {};
        var holder = o.holder || DEV, ttl = o.ttlMs || 1000;
        return getDB().then(function (db) {
          return db.ref(ROOT + '/_lease/' + enc(parts[0]) + '__' + enc(parts.slice(1).join('/'))).transaction(function (cur) {
            var now = Date.now();
            if (cur && cur.exp > now && cur.holder !== holder) return; // batal: dipegang peranti lain
            return { holder: holder, exp: now + ttl };
          }, null, false);
        }).then(function (r) { return { acquired: !!r.committed }; }).catch(function () { return { acquired: true }; });
      }
    };
  }

  function colRef(c) {
    return {
      onSnapshot: function (ok, fail) {
        var ref = null, cb = null, dead = false;
        getDB().then(function (db) {
          if (dead) return;
          ref = db.ref(ROOT + '/' + enc(c));
          cb = ref.on('value', function (snap) {
            var docs = [];
            snap.forEach(function (ch) {
              var v = ch.val(), id = dec(ch.key);
              docs.push({ id: id, data: function () { return parse(v); } });
            });
            ok({ docs: docs });
          }, function (e) { if (fail) fail(wrapErr(e)); });
        }).catch(function (e) { if (fail) fail(wrapErr(e)); });
        return function () { dead = true; try { if (ref && cb) ref.off('value', cb); } catch (e) {} };
      }
    };
  }

  var api = { collection: colRef, doc: docRef };
  window.claude = window.claude || {};
  window.claude.use = function (name) {
    if (name !== 'db') return Promise.reject(new Error('Tidak disokong: ' + name));
    return getDB().then(function () { return api; });
  };
  window.__fbshim = { enc: enc, dec: dec };
})();
