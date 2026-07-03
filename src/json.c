#include "json.h"
#include <assert.h>
#include <stdlib.h>
#include <string.h>

static int js_alloc(JsonTok *toks, int max, int *count)
{
    assert(toks != NULL);
    assert(count != NULL);
    if (*count >= max)
    {
        return -1;
    }
    int t = *count;
    toks[t].type = JSON_UNDEF;
    toks[t].start = -1;
    toks[t].end = -1;
    toks[t].parent = -1;
    (*count)++;
    return t;
}

int json_parse(const char *js, size_t len, JsonTok *toks, int max)
{
    assert(js != NULL);
    assert(toks != NULL);
    int count = 0;
    int super = -1;
    for (size_t i = 0; i < len; i++)
    {
        char c = js[i];
        if (c == '{' || c == '[')
        {
            int t = js_alloc(toks, max, &count);
            if (t < 0)
            {
                return -1;
            }
            toks[t].type = (c == '{') ? JSON_OBJ : JSON_ARR;
            toks[t].start = (int)i;
            toks[t].parent = super;
            super = t;
        }
        else if (c == '}' || c == ']')
        {
            JsonType ty = (c == '}') ? JSON_OBJ : JSON_ARR;
            if (super < 0 || toks[super].type != ty)
            {
                return -1;
            }
            toks[super].end = (int)i + 1;
            super = toks[super].parent;
        }
        else if (c == '"')
        {
            int t = js_alloc(toks, max, &count);
            if (t < 0)
            {
                return -1;
            }
            size_t s = i + 1;
            i++;
            while (i < len && js[i] != '"')
            {
                if (js[i] == '\\' && i + 1 < len)
                {
                    i++;
                }
                i++;
            }
            if (i >= len)
            {
                return -1;
            }
            toks[t].type = JSON_STR;
            toks[t].start = (int)s;
            toks[t].end = (int)i;
            toks[t].parent = super;
        }
        else if (c != ' ' && c != '\t' && c != '\r' && c != '\n' && c != ':' &&
                 c != ',')
        {
            int t = js_alloc(toks, max, &count);
            if (t < 0)
            {
                return -1;
            }
            size_t s = i;
            while (i < len)
            {
                char d = js[i];
                if (d == ',' || d == '}' || d == ']' || d == ' ' || d == '\t' ||
                    d == '\r' || d == '\n')
                {
                    break;
                }
                i++;
            }
            toks[t].type = JSON_PRIM;
            toks[t].start = (int)s;
            toks[t].end = (int)i;
            toks[t].parent = super;
            i--;
        }
    }
    if (super != -1)
    {
        return -1;
    }
    return count;
}

void json_copy_str(const char *js, const JsonTok *t, char *out, size_t outsz)
{
    assert(js != NULL);
    assert(t != NULL);
    assert(out != NULL);
    size_t o = 0;
    for (int i = t->start; i < t->end && o + 1 < outsz; i++)
    {
        char c = js[i];
        if (t->type == JSON_STR && c == '\\' && i + 1 < t->end)
        {
            i++;
            char e = js[i];
            switch (e)
            {
            case 'n':
                c = '\n';
                break;
            case 't':
                c = '\t';
                break;
            case 'r':
                c = '\r';
                break;
            default:
                c = e;
                break;
            }
        }
        out[o++] = c;
    }
    out[o] = '\0';
}

int json_obj_get(const char *js, const JsonTok *toks, int ntok, int obj,
                 const char *key)
{
    assert(js != NULL);
    assert(toks != NULL);
    assert(key != NULL);
    if (obj < 0 || toks[obj].type != JSON_OBJ)
    {
        return -1;
    }
    size_t klen = strlen(key);
    int idx = 0;
    for (int i = obj + 1; i < ntok && toks[i].start < toks[obj].end; i++)
    {
        if (toks[i].parent != obj)
        {
            continue;
        }
        if ((idx & 1) == 0 && toks[i].type == JSON_STR)
        {
            int kl = toks[i].end - toks[i].start;
            if (kl >= 0 && (size_t)kl == klen &&
                strncmp(js + toks[i].start, key, klen) == 0)
            {
                return (i + 1 < ntok) ? (i + 1) : -1;
            }
        }
        idx++;
    }
    return -1;
}

int json_path_get(const char *js, const JsonTok *toks, int ntok, int root,
                  const char *path)
{
    assert(path != NULL);
    int cur = root;
    const char *p = path;
    while (*p != '\0' && cur >= 0)
    {
        char seg[JSON_PATH_SEG];
        size_t n = 0;
        while (*p != '\0' && *p != '.' && n + 1 < sizeof(seg))
        {
            seg[n++] = *p++;
        }
        seg[n] = '\0';
        if (*p == '.')
        {
            p++;
        }
        if (toks[cur].type == JSON_OBJ)
        {
            cur = json_obj_get(js, toks, ntok, cur, seg);
        }
        else if (toks[cur].type == JSON_ARR)
        {
            int want = atoi(seg);
            int idx = 0;
            int found = -1;
            for (int i = cur + 1; i < ntok && toks[i].start < toks[cur].end;
                 i++)
            {
                if (toks[i].parent != cur)
                {
                    continue;
                }
                if (idx == want)
                {
                    found = i;
                    break;
                }
                idx++;
            }
            cur = found;
        }
        else
        {
            return -1;
        }
    }
    return cur;
}

long json_tok_long(const char *js, const JsonTok *t)
{
    char b[32];
    json_copy_str(js, t, b, sizeof(b));
    return atol(b);
}
