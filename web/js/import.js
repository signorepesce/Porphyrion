(function () {
    function pid() { return Math.random().toString(36).substr(2, 9); } function pmAuth(auth) {
        if (!auth || !auth.type) return null;
        var t = auth.type, arr = auth[t] || []; function g(k) {
            var f = arr.find(function (x) {
                return x.key === k;
            }); return f ? f.value : '';
        } 
        
        if (t === 'bearer') return { authType: 'bearer', authToken: g('token') };
        if (t === 'basic') return { authType: 'basic', authUser: g('username'), authPass: g('password') };
        if (t === 'apikey') return { authType: 'apikey', apiKey: g('key'), apiVal: g('value'), apiLoc: (g('in') === 'query' ? 'Query' : 'Header') };
        if (t === 'noauth') return { authType: 'none' }; return null;
    } function pmReq(item, folder) {
        var r = item.request;
        if (typeof r === 'string') r = { method: 'GET', url: r }; var method = (r.method || 'GET').toUpperCase();
        var urlRaw = '', params = []; var u = r.url; if (typeof u === 'string') urlRaw = u; else if (u) {
            urlRaw = u.raw || '';
            if (u.query && u.query.length) {
                urlRaw = urlRaw.split('?')[0]; params = u.query.filter(function (q) {
                    return !q.disabled;
                }).map(function (q) { return { k: q.key || '', v: q.value || '' }; });
            } if (u.variable) u.variable.forEach(function (v) {
                urlRaw = urlRaw.split(':' + v.key).join(v.value != null ? v.value : ':' + v.key);
            });
        } var headers = (r.header || []).filter(function (h) { return !h.disabled; }).map(function (h) {
            return { k: h.key || '', v: h.value || '' };
        }); var bodyType = 'none', body = '', form = [{ k: '', v: '' }], gq = '', gv = ''; var b = r.body; if (b && b.mode) {
            if (b.mode === 'raw') {
                var lang = (b.options && b.options.raw && b.options.raw.language) || '';
                body = b.raw || ''; var tr = body.trim(); bodyType = lang === 'json' ? 'json' : lang === 'xml' ? 'xml' : (tr.charAt(0) === '{' || tr.charAt(0) === '[' ? 'json' : 'text');
            } else if (b.mode === 'urlencoded') {
                bodyType = 'form'; form = (b.urlencoded || []).filter(function (x) {
                    return !x.disabled;
                }).map(function (x) { return { k: x.key || '', v: x.value || '' }; });
            } else if (b.mode === 'formdata') {
                bodyType = 'form';
                form = (b.formdata || []).filter(function (x) { return !x.disabled && x.type !== 'file'; }).map(function (x) {
                    return { k: x.key || '', v: x.value || '' };
                });
            } else if (b.mode === 'graphql') {
                bodyType = 'graphql'; gq = (b.graphql && b.graphql.query) || '';
                gv = (b.graphql && b.graphql.variables) || '';
            }
        } if (!form.length) form = [{ k: '', v: '' }]; if (bodyType !== 'none') headers = headers.filter(function (h) {
            return (h.k || '').toLowerCase() !== 'content-type';
        }); if (!headers.length) headers = [{ k: '', v: '' }]; var a = pmAuth(r.auth) || { authType: 'inherit' };
        var e = { id: pid(), name: item.name || urlRaw || 'Request', folder: folder, method: method, url: urlRaw, bodyType: bodyType, body: body, gqlQuery: gq, gqlVars: gv, formGridData: form, paramsGridData: params.length ? params : [{ k: '', v: '' }], headersGridData: headers, authType: 'none', authToken: '', authUser: '', authPass: '', apiKey: '', apiVal: '', apiLoc: 'Header' };
        for (var k in a) e[k] = a[k]; return e;
    } function parsePostman(obj) {
        var out = []; var coll = (obj.info && obj.info.name) ? obj.info.name : 'Imported';
        var cauth = pmAuth(obj.auth); if (cauth && cauth.authType && cauth.authType !== 'none') {
            var fm = { id: pid(), isFolderMeta: true, path: coll };
            for (var k in cauth) fm[k] = cauth[k]; out.push(fm);
        } (function walk(items, path) {
            (items || []).forEach(function (it) {
                if (it.item) {
                    var fp = path ? path + '/' + it.name : it.name;
                    var fa = pmAuth(it.auth); if (fa && fa.authType && fa.authType !== 'none') {
                        var m = { id: pid(), isFolderMeta: true, path: fp };
                        for (var k in fa) m[k] = fa[k]; out.push(m);
                    } walk(it.item, fp);
                } else if (it.request) {
                    out.push(pmReq(it, path));
                }
            });
        })(obj.item, coll); return out;
    } function importVars(obj) {
        var vars = (obj.variable || []).filter(function (v) {
            return v.key;
        }).map(function (v) { return { k: v.key, v: v.value != null ? String(v.value) : '' }; }); if (!vars.length || typeof environments === 'undefined') return;
        var name = (obj.info && obj.info.name) ? obj.info.name : 'Imported'; var ex = environments.find(function (e) {
            return e.name === name;
        }); if (ex) ex.vars = vars; else environments.push({ name: name, vars: vars }); if (typeof saveEnvs === 'function') saveEnvs();
    } function importEnv(obj) {
        if (typeof environments === 'undefined') return false; var vars = (obj.values || []).filter(function (v) {
            return v.key && v.enabled !== false;
        }).map(function (v) { return { k: v.key, v: v.value != null ? String(v.value) : '' }; }); environments.push({ name: obj.name || 'Imported env', vars: vars.length ? vars : [{ k: '', v: '' }] });
        if (typeof saveEnvs === 'function') saveEnvs(); return true;
    } window.importAny = function (text) {
        var t = (text || '').trim();
        if (!t) return false; if (/^\s*curl\b/i.test(t)) return (typeof importCurl === 'function') && importCurl(t);
        var obj; try { obj = JSON.parse(t); } catch (e) {
            return (typeof importCurl === 'function') && importCurl(t);
        } if (obj && obj.values && Array.isArray(obj.values) && !obj.item) return importEnv(obj);
        if (obj && (obj.item || (obj.info && /collection/i.test(obj.info.schema || '')))) {
            var entries = parsePostman(obj);
            if (!entries.length) return false; savedList = savedList.concat(entries); storeSaved();
            renderSaved(); importVars(obj); var first = entries.find(function (e) {
                return !e.isFolderMeta;
            }); if (first) createTab(first); return true;
        } return false;
    }; function wire() {
        var ok = document.getElementById('importOk');
        var ta = document.getElementById('importText'); var modal = document.getElementById('importModal');
        if (!ok || !ta || !modal) return; ok.onclick = function () {
            if (window.importAny(ta.value)) {
                modal.classList.remove('active');
            } else { ta.style.borderColor = 'var(--red)'; }
        }; if (!document.getElementById('importFile')) {
            var f = document.createElement('input');
            f.type = 'file'; f.id = 'importFile'; f.accept = '.json,application/json'; f.style.cssText = 'margin:.1rem 0 .6rem;font-size:.72rem;color:var(--tx);width:100%';
            f.onchange = function () {
                var file = f.files && f.files[0]; if (!file) return; var rd = new FileReader();
                rd.onload = function () {
                    ta.value = String(rd.result); if (window.importAny(ta.value)) modal.classList.remove('active');
                    else ta.style.borderColor = 'var(--red)';
                }; rd.readAsText(file);
            }; ta.parentNode.insertBefore(f, ta.nextSibling);
        }
    } if (document.readyState !== 'loading') wire(); else document.addEventListener('DOMContentLoaded', wire);
})();