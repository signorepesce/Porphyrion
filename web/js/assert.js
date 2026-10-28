// Response assertions. One per line: <subject> <op> [value]
//   subjects: status | time | size | body | header <Name> | json <path>
//   ops:      == != > >= < <= contains !contains exists !exists matches
//   path:     user.id  items[0].name  items.length  ($. prefix optional)
//   value:    200  true  null  "quoted text"  bare text  /regex/i (for matches)
// Lines starting with # are comments.
const ASSERT_RE = /^(status|time|size|body|header\s+\S+|json\s+\S+)\s+(==|!=|>=|<=|>|<|!contains|contains|!exists|exists|matches)\s*(.*)$/;

function assertGetPath(obj, path) {
    const keys = path.replace(/^\$\.?/, '').match(/[^.[\]]+/g) || [];
    return keys.reduce((o, k) => (o === null || o === undefined) ? undefined : o[k], obj);
}

function assertHeader(raw, name) {
    let val; const want = name.toLowerCase();
    (raw || '').split(/\r?\n/).forEach(line => {
        const c = line.indexOf(':');
        if (c > 0 && line.slice(0, c).trim().toLowerCase() === want) val = line.slice(c + 1).trim();
    });
    return val;
}

function assertLiteral(s) {
    s = s.trim();
    if (/^(["']).*\1$/.test(s)) return s.slice(1, -1);
    try { return JSON.parse(s); } catch (e) { return s; }
}

function assertEq(a, e) {
    if (a !== null && typeof a === 'object') return JSON.stringify(a) === JSON.stringify(e);
    return a === e || String(a) === String(e);
}

function assertShow(v) {
    const s = v === undefined ? 'undefined' : JSON.stringify(v);
    return s.length > 80 ? s.slice(0, 77) + '...' : s;
}

// ctx: { status, ms, size, headers (raw "Name: value" lines), body (text) }
function runAsserts(text, ctx) {
    let json, jsonTried = false;
    const results = [];
    (text || '').split(/\r?\n/).forEach(raw => {
        const line = raw.trim();
        if (!line || line[0] === '#') return;
        const m = line.match(ASSERT_RE);
        if (!m) { results.push({ line, pass: false, msg: 'cannot parse' }); return; }
        const [, subj, op, valStr] = m;
        let actual;
        if (subj === 'status') actual = ctx.status;
        else if (subj === 'time') actual = ctx.ms;
        else if (subj === 'size') actual = ctx.size;
        else if (subj === 'body') actual = ctx.body;
        else if (subj.startsWith('header')) actual = assertHeader(ctx.headers, subj.split(/\s+/)[1]);
        else {
            if (!jsonTried) { jsonTried = true; try { json = JSON.parse(ctx.body); } catch (e) { json = undefined; } }
            actual = json === undefined ? undefined : assertGetPath(json, subj.split(/\s+/)[1]);
        }
        const exp = assertLiteral(valStr);
        let pass;
        try {
            switch (op) {
                case 'exists': pass = actual !== undefined; break;
                case '!exists': pass = actual === undefined; break;
                case '==': pass = assertEq(actual, exp); break;
                case '!=': pass = !assertEq(actual, exp); break;
                case '>': pass = Number(actual) > Number(exp); break;
                case '>=': pass = Number(actual) >= Number(exp); break;
                case '<': pass = Number(actual) < Number(exp); break;
                case '<=': pass = Number(actual) <= Number(exp); break;
                case 'contains': case '!contains': {
                    const has = Array.isArray(actual) ? actual.some(x => assertEq(x, exp))
                        : actual !== undefined && actual !== null && String(actual).includes(String(exp));
                    pass = op === 'contains' ? has : !has; break;
                }
                case 'matches': {
                    const rm = String(valStr).trim().match(/^\/(.*)\/([a-z]*)$/);
                    const re = rm ? new RegExp(rm[1], rm[2]) : new RegExp(String(exp));
                    pass = actual !== undefined && re.test(String(actual)); break;
                }
            }
        } catch (e) { results.push({ line, pass: false, msg: e.message }); return; }
        results.push({ line, pass, msg: pass ? '' : 'got ' + assertShow(actual) });
    });
    return results;
}

if (typeof module !== 'undefined') module.exports = { runAsserts, assertGetPath };
