#define _POSIX_C_SOURCE 200809L
#include "stress.h"
#include "curl_util.h"
#include "dynbuf.h"
#include "http_response.h"
#include "json.h"
#include "proxy_networking.h"
#include <assert.h>
#include <curl/curl.h>
#include <pthread.h>
#include <stdatomic.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

#define STRESS_MAX_VUS 256
#define STRESS_MAX_STEPS 16
#define STRESS_MAX_VARS 32
#define STRESS_MAX_EXTRACTS 8
#define STRESS_MAX_HEADER_LINES 64
#define STRESS_VAR_NAME 64
#define STRESS_VAR_VALUE 1024
#define STRESS_URL 2048
#define STRESS_BODY 8192
#define STRESS_HEADERS 4096
#define STRESS_PATH 128
#define STRESS_METHOD 8
#define STRESS_ERR_SIZE 256
#define STRESS_VU_RESP_MAX (256 * 1024)
#define STRESS_MAX_TOKENS 1024
#define STRESS_FAIL_BACKOFF_US 10000L
#define STRESS_FAIL_FAST_MIN 20L
#define STRESS_MAX_REQS 1000000L
#define STRESS_MAX_WAIT_MS 60000L
#define STRESS_MAX_TIMEOUT_MS 300000L

typedef struct
{
    char var[STRESS_VAR_NAME];
    char path[STRESS_PATH];
} Extract;

typedef struct
{
    char method[STRESS_METHOD];
    char url[STRESS_URL];
    char body[STRESS_BODY];
    char headers[STRESS_HEADERS];
    Extract extracts[STRESS_MAX_EXTRACTS];
    int n_extracts;
} Step;

typedef struct
{
    char name[STRESS_VAR_NAME];
    char value[STRESS_VAR_VALUE];
} Var;

typedef struct
{
    int vus;
    long reqs;
    long wait_ms;
    long timeout_ms;
    Var vars[STRESS_MAX_VARS];
    int n_vars;
    Step steps[STRESS_MAX_STEPS];
    int n_steps;
} Flow;

static void copy_str(char *dst, const char *src, size_t dstsz)
{
    assert(dst != NULL);
    assert(src != NULL);
    size_t i = 0;
    for (; src[i] != '\0' && i + 1 < dstsz; i++)
    {
        dst[i] = src[i];
    }
    dst[i] = '\0';
}

static int parse_flow(const char *js, size_t len, Flow *f)
{
    assert(js != NULL);
    assert(f != NULL);
    static JsonTok toks[STRESS_MAX_TOKENS];
    int nt = json_parse(js, len, toks, STRESS_MAX_TOKENS);
    if (nt < 1 || toks[0].type != JSON_OBJ)
    {
        return -1;
    }
    memset(f, 0, sizeof(*f));
    f->vus = 10;
    f->reqs = 10;
    f->wait_ms = 0;
    f->timeout_ms = 10000;
    int v = json_obj_get(js, toks, nt, 0, "vus");
    if (v >= 0)
    {
        f->vus = (int)json_tok_long(js, &toks[v]);
    }
    v = json_obj_get(js, toks, nt, 0, "reqs");
    if (v >= 0)
    {
        f->reqs = json_tok_long(js, &toks[v]);
    }
    v = json_obj_get(js, toks, nt, 0, "wait_ms");
    if (v >= 0)
    {
        f->wait_ms = json_tok_long(js, &toks[v]);
    }
    v = json_obj_get(js, toks, nt, 0, "timeout_ms");
    if (v >= 0)
    {
        f->timeout_ms = json_tok_long(js, &toks[v]);
    }
    if (f->vus < 1)
    {
        f->vus = 1;
    }
    if (f->vus > STRESS_MAX_VUS)
    {
        f->vus = STRESS_MAX_VUS;
    }
    if (f->reqs < 1)
    {
        f->reqs = 1;
    }
    if (f->reqs > STRESS_MAX_REQS)
    {
        f->reqs = STRESS_MAX_REQS;
    }
    if (f->wait_ms < 0)
    {
        f->wait_ms = 0;
    }
    if (f->wait_ms > STRESS_MAX_WAIT_MS)
    {
        f->wait_ms = STRESS_MAX_WAIT_MS;
    }
    if (f->timeout_ms <= 0)
    {
        f->timeout_ms = 10000;
    }
    if (f->timeout_ms > STRESS_MAX_TIMEOUT_MS)
    {
        f->timeout_ms = STRESS_MAX_TIMEOUT_MS;
    }
    int vobj = json_obj_get(js, toks, nt, 0, "vars");
    if (vobj >= 0 && toks[vobj].type == JSON_OBJ)
    {
        int idx = 0;
        for (int i = vobj + 1;
             i < nt && toks[i].start < toks[vobj].end &&
             f->n_vars < STRESS_MAX_VARS;
             i++)
        {
            if (toks[i].parent != vobj)
            {
                continue;
            }
            if ((idx & 1) == 0)
            {
                json_copy_str(js, &toks[i], f->vars[f->n_vars].name,
                              STRESS_VAR_NAME);
            }
            else
            {
                json_copy_str(js, &toks[i], f->vars[f->n_vars].value,
                              STRESS_VAR_VALUE);
                f->n_vars++;
            }
            idx++;
        }
    }
    int sarr = json_obj_get(js, toks, nt, 0, "steps");
    if (sarr < 0 || toks[sarr].type != JSON_ARR)
    {
        return -1;
    }
    for (int i = sarr + 1;
         i < nt && toks[i].start < toks[sarr].end && f->n_steps < STRESS_MAX_STEPS;
         i++)
    {
        if (toks[i].parent != sarr || toks[i].type != JSON_OBJ)
        {
            continue;
        }
        Step *st = &f->steps[f->n_steps];
        int m = json_obj_get(js, toks, nt, i, "method");
        if (m >= 0)
        {
            json_copy_str(js, &toks[m], st->method, sizeof(st->method));
        }
        else
        {
            copy_str(st->method, "GET", sizeof(st->method));
        }
        int u = json_obj_get(js, toks, nt, i, "url");
        if (u >= 0)
        {
            json_copy_str(js, &toks[u], st->url, sizeof(st->url));
        }
        int b = json_obj_get(js, toks, nt, i, "body");
        if (b >= 0)
        {
            json_copy_str(js, &toks[b], st->body, sizeof(st->body));
        }
        int h = json_obj_get(js, toks, nt, i, "headers");
        if (h >= 0)
        {
            json_copy_str(js, &toks[h], st->headers, sizeof(st->headers));
        }
        int ex = json_obj_get(js, toks, nt, i, "extract");
        if (ex >= 0 && toks[ex].type == JSON_ARR)
        {
            for (int j = ex + 1;
                 j < nt && toks[j].start < toks[ex].end &&
                 st->n_extracts < STRESS_MAX_EXTRACTS;
                 j++)
            {
                if (toks[j].parent != ex || toks[j].type != JSON_OBJ)
                {
                    continue;
                }
                int vv = json_obj_get(js, toks, nt, j, "var");
                int pp = json_obj_get(js, toks, nt, j, "json");
                if (vv >= 0 && pp >= 0)
                {
                    json_copy_str(js, &toks[vv],
                                  st->extracts[st->n_extracts].var,
                                  STRESS_VAR_NAME);
                    json_copy_str(js, &toks[pp],
                                  st->extracts[st->n_extracts].path,
                                  STRESS_PATH);
                    st->n_extracts++;
                }
            }
        }
        if (st->url[0] != '\0')
        {
            f->n_steps++;
        }
    }
    return f->n_steps > 0 ? 0 : -1;
}

static void subst(const char *tmpl, const Var *vars, int nvars, char *out,
                  size_t outsz)
{
    assert(tmpl != NULL);
    assert(out != NULL);
    size_t o = 0;
    size_t i = 0;
    while (tmpl[i] != '\0' && o + 1 < outsz)
    {
        if (tmpl[i] == '{' && tmpl[i + 1] == '{')
        {
            char name[STRESS_VAR_NAME];
            size_t nn = 0;
            size_t j = i + 2;
            while (tmpl[j] != '\0' && !(tmpl[j] == '}' && tmpl[j + 1] == '}') &&
                   nn + 1 < sizeof(name))
            {
                name[nn++] = tmpl[j++];
            }
            name[nn] = '\0';
            if (tmpl[j] == '}' && tmpl[j + 1] == '}')
            {
                const char *val = "";
                for (int k = 0; k < nvars; k++)
                {
                    if (strcmp(vars[k].name, name) == 0)
                    {
                        val = vars[k].value;
                        break;
                    }
                }
                for (size_t x = 0; val[x] != '\0' && o + 1 < outsz; x++)
                {
                    out[o++] = val[x];
                }
                i = j + 2;
                continue;
            }
        }
        out[o++] = tmpl[i++];
    }
    out[o] = '\0';
}

typedef struct
{
    _Atomic long completed;
    _Atomic long ok;
    _Atomic long err_client;
    _Atomic long err_server;
    _Atomic long err_conn;
    _Atomic unsigned long long sum_us;
    _Atomic long max_us;
    _Atomic long min_us;
    _Atomic int running;
    _Atomic int cancel;
    _Atomic long vu_ok[STRESS_MAX_VUS];
    _Atomic long start_ms;
    _Atomic long end_ms;

    _Atomic int vus;
    _Atomic int steps;

    char last_error[STRESS_ERR_SIZE];
    Flow flow;
    pthread_mutex_t lock;
} StressJob;

static StressJob g_job = {.lock = PTHREAD_MUTEX_INITIALIZER};

typedef struct
{
    Var vars[STRESS_MAX_VARS];
    int n_vars;
    CURL *curl;
    DynBuf resp;
    char urlbuf[STRESS_URL * 2];
    char bodybuf[STRESS_BODY * 2];
    char hdrbuf[STRESS_HEADERS * 2];
    JsonTok toks[STRESS_MAX_TOKENS];
    int id;
} VUCtx;

static long now_us(void)
{
    struct timespec ts;
    (void)clock_gettime(CLOCK_MONOTONIC, &ts);
    return (long)ts.tv_sec * 1000000L + ts.tv_nsec / 1000L;
}

static long now_ms(void)
{
    return now_us() / 1000L;
}

static void record(long code, long us)
{
    (void)atomic_fetch_add(&g_job.completed, 1L);
    if (code >= 200 && code < 400)
    {
        (void)atomic_fetch_add(&g_job.ok, 1L);
    }
    else if (code >= 400 && code < 500)
    {
        (void)atomic_fetch_add(&g_job.err_client, 1L);
    }
    else if (code >= 500)
    {
        (void)atomic_fetch_add(&g_job.err_server, 1L);
    }
    else
    {
        (void)atomic_fetch_add(&g_job.err_conn, 1L);
    }
    (void)atomic_fetch_add(&g_job.sum_us, (unsigned long long)(us < 0 ? 0 : us));
    long prev = atomic_load(&g_job.max_us);
    while (us > prev)
    {
        if (atomic_compare_exchange_weak(&g_job.max_us, &prev, us))
        {
            break;
        }
    }
    long pmin = atomic_load(&g_job.min_us);
    while (us > 0 && (pmin == 0 || us < pmin))
    {
        if (atomic_compare_exchange_weak(&g_job.min_us, &pmin, us))
        {
            break;
        }
    }
}

static void job_set_error(const char *msg)
{
    assert(msg != NULL);
    (void)pthread_mutex_lock(&g_job.lock);
    size_t o = 0;
    for (size_t i = 0; msg[i] != '\0' && o + 1 < sizeof(g_job.last_error); i++)
    {
        unsigned char c = (unsigned char)msg[i];
        g_job.last_error[o++] =
            (c == '"' || c == '\\' || c < 0x20) ? '\'' : (char)c;
    }
    g_job.last_error[o] = '\0';
    (void)pthread_mutex_unlock(&g_job.lock);
}

static void sleep_us(long us)
{
    if (us <= 0)
    {
        return;
    }
    struct timespec ts;
    ts.tv_sec = (time_t)(us / 1000000L);
    ts.tv_nsec = (long)((us % 1000000L) * 1000L);
    (void)nanosleep(&ts, NULL);
}

static void run_extracts(VUCtx *vc, const Step *s)
{
    assert(vc != NULL);
    assert(s != NULL);
    if (vc->resp.len == 0 || vc->resp.data == NULL)
    {
        return;
    }
    int nt = json_parse(vc->resp.data, vc->resp.len, vc->toks, STRESS_MAX_TOKENS);
    if (nt < 1)
    {
        return;
    }
    for (int e = 0; e < s->n_extracts; e++)
    {
        int t = json_path_get(vc->resp.data, vc->toks, nt, 0, s->extracts[e].path);
        if (t < 0)
        {
            continue;
        }
        char val[STRESS_VAR_VALUE];
        json_copy_str(vc->resp.data, &vc->toks[t], val, sizeof(val));
        int found = 0;
        for (int k = 0; k < vc->n_vars; k++)
        {
            if (strcmp(vc->vars[k].name, s->extracts[e].var) == 0)
            {
                copy_str(vc->vars[k].value, val, STRESS_VAR_VALUE);
                found = 1;
                break;
            }
        }
        if (!found && vc->n_vars < STRESS_MAX_VARS)
        {
            copy_str(vc->vars[vc->n_vars].name, s->extracts[e].var,
                     STRESS_VAR_NAME);
            copy_str(vc->vars[vc->n_vars].value, val, STRESS_VAR_VALUE);
            vc->n_vars++;
        }
    }
}

static long run_step(VUCtx *vc, const Step *s)
{
    assert(vc != NULL);
    assert(s != NULL);
    subst(s->url, vc->vars, vc->n_vars, vc->urlbuf, sizeof(vc->urlbuf));
    subst(s->body, vc->vars, vc->n_vars, vc->bodybuf, sizeof(vc->bodybuf));
    subst(s->headers, vc->vars, vc->n_vars, vc->hdrbuf, sizeof(vc->hdrbuf));
    char resolved[STRESS_URL * 2];
    resolve_url(vc->urlbuf, resolved, sizeof(resolved));
    dynbuf_reset(&vc->resp);
    curl_easy_reset(vc->curl);
    (void)curl_easy_setopt(vc->curl, CURLOPT_URL, resolved);
    (void)curl_easy_setopt(vc->curl, CURLOPT_WRITEFUNCTION, curl_write_dynbuf);
    (void)curl_easy_setopt(vc->curl, CURLOPT_WRITEDATA, &vc->resp);
    (void)curl_easy_setopt(vc->curl, CURLOPT_TIMEOUT_MS, g_job.flow.timeout_ms);
    (void)curl_easy_setopt(vc->curl, CURLOPT_NOSIGNAL, 1L);
    struct curl_slist *hdrs =
        curl_append_header_lines(NULL, vc->hdrbuf, STRESS_MAX_HEADER_LINES);
    if (hdrs)
    {
        (void)curl_easy_setopt(vc->curl, CURLOPT_HTTPHEADER, hdrs);
    }
    curl_setup_method(vc->curl, s->method, vc->bodybuf, strlen(vc->bodybuf));
    long t0 = now_us();
    CURLcode rc = curl_easy_perform(vc->curl);
    long us = now_us() - t0;
    long code = 0;
    if (rc == CURLE_OK)
    {
        (void)curl_easy_getinfo(vc->curl, CURLINFO_RESPONSE_CODE, &code);
    }
    if (hdrs)
    {
        curl_slist_free_all(hdrs);
    }
    record(code, us);
    if (rc != CURLE_OK)
    {
        char emsg[STRESS_ERR_SIZE];
        (void)snprintf(emsg, sizeof(emsg), "%s (%.150s)",
                       curl_easy_strerror(rc), resolved);
        job_set_error(emsg);
    }
    else if (code >= 400)
    {
        char emsg[STRESS_ERR_SIZE];
        (void)snprintf(emsg, sizeof(emsg), "HTTP %ld (%.150s)", code,
                       resolved);
        job_set_error(emsg);
    }
    if (code >= 200 && code < 400)
    {
        (void)atomic_fetch_add(&g_job.vu_ok[vc->id], 1L);
    }
    if (rc == CURLE_OK && s->n_extracts > 0)
    {
        run_extracts(vc, s);
    }
    return code;
}

static void think_wait(long us)
{
    long slept = 0;
    while (slept < us && !atomic_load(&g_job.cancel))
    {
        long chunk = us - slept;
        if (chunk > 100000L)
        {
            chunk = 100000L;
        }
        sleep_us(chunk);
        slept += chunk;
    }
}

static void *vu_main(void *arg)
{
    VUCtx *vc = (VUCtx *)arg;
    assert(vc != NULL);
    if (vc->curl == NULL)
    {
        return NULL;
    }
    long budget = g_job.flow.reqs;
    long wait_us = g_job.flow.wait_ms * 1000L;
    long sent = 0;
    while (sent < budget && !atomic_load(&g_job.cancel))
    {
        vc->n_vars = g_job.flow.n_vars;
        for (int i = 0; i < vc->n_vars && i < STRESS_MAX_VARS; i++)
        {
            vc->vars[i] = g_job.flow.vars[i];
        }
        for (int s = 0; s < g_job.flow.n_steps && sent < budget; s++)
        {
            if (atomic_load(&g_job.cancel))
            {
                break;
            }
            long code = run_step(vc, &g_job.flow.steps[s]);
            sent++;
            if (code == 0)
            {
                long comp = atomic_load(&g_job.completed);
                if (comp >= STRESS_FAIL_FAST_MIN &&
                    atomic_load(&g_job.err_conn) == comp)
                {
                    atomic_store(&g_job.cancel, 1);
                }
                else
                {
                    sleep_us(STRESS_FAIL_BACKOFF_US);
                }
                break;
            }
            if (wait_us > 0 && sent < budget)
            {
                think_wait(wait_us);
            }
        }
    }
    return NULL;
}

static void *manager_main(void *arg)
{
    (void)arg;
    int n = g_job.flow.vus;
    VUCtx *vcs = calloc((size_t)n, sizeof(*vcs));
    pthread_t *tids = calloc((size_t)n, sizeof(*tids));
    int created = 0;
    if (vcs != NULL && tids != NULL)
    {
        for (int i = 0; i < n; i++)
        {
            vcs[i].curl = curl_easy_init();
            vcs[i].id = i;
            (void)dynbuf_init(&vcs[i].resp, STRESS_VU_RESP_MAX);
            if (pthread_create(&tids[i], NULL, vu_main, &vcs[i]) != 0)
            {
                break;
            }
            created++;
        }
        for (int i = 0; i < created; i++)
        {
            (void)pthread_join(tids[i], NULL);
        }
    }
    if (vcs != NULL)
    {
        for (int i = 0; i < n; i++)
        {
            if (vcs[i].curl != NULL)
            {
                curl_easy_cleanup(vcs[i].curl);
            }
            dynbuf_free(&vcs[i].resp);
        }
        free(vcs);
    }
    free(tids);
    atomic_store(&g_job.end_ms, now_ms());
    atomic_store(&g_job.running, 0);
    return NULL;
}

static void stress_start(int sock, const HttpRequest *req)
{
    if (!req->body || req->body_len == 0)
    {
        send_text(sock, 400, "{\"error\":\"Empty flow\"}");
        return;
    }
    (void)pthread_mutex_lock(&g_job.lock);
    if (atomic_load(&g_job.running))
    {
        (void)pthread_mutex_unlock(&g_job.lock);
        send_text(sock, 409, "{\"error\":\"A run is already in progress\"}");
        return;
    }
    if (parse_flow(req->body, req->body_len, &g_job.flow) != 0)
    {
        (void)pthread_mutex_unlock(&g_job.lock);
        send_text(sock, 400, "{\"error\":\"Invalid flow\"}");
        return;
    }
    atomic_store(&g_job.completed, 0);
    atomic_store(&g_job.ok, 0);
    atomic_store(&g_job.err_client, 0);
    atomic_store(&g_job.err_server, 0);
    atomic_store(&g_job.err_conn, 0);
    atomic_store(&g_job.sum_us, 0);
    atomic_store(&g_job.max_us, 0);
    atomic_store(&g_job.min_us, 0);
    for (int i = 0; i < STRESS_MAX_VUS; i++)
    {
        atomic_store(&g_job.vu_ok[i], 0L);
    }
    atomic_store(&g_job.cancel, 0);
    g_job.last_error[0] = '\0';
    atomic_store(&g_job.vus, g_job.flow.vus);
    atomic_store(&g_job.steps, g_job.flow.n_steps);
    atomic_store(&g_job.start_ms, now_ms());
    atomic_store(&g_job.end_ms, 0);
    atomic_store(&g_job.running, 1);
    pthread_t mgr;
    if (pthread_create(&mgr, NULL, manager_main, NULL) != 0)
    {
        atomic_store(&g_job.running, 0);
        (void)pthread_mutex_unlock(&g_job.lock);
        send_text(sock, 500, "{\"error\":\"Cannot start run\"}");
        return;
    }
    (void)pthread_detach(mgr);
    (void)pthread_mutex_unlock(&g_job.lock);
    send_text(sock, 200, "{\"status\":\"started\"}");
}

static void stress_status(int sock)
{
    int running = atomic_load(&g_job.running);
    long completed = atomic_load(&g_job.completed);
    long ok = atomic_load(&g_job.ok);
    long e4 = atomic_load(&g_job.err_client);
    long e5 = atomic_load(&g_job.err_server);
    long ec = atomic_load(&g_job.err_conn);
    unsigned long long sum = atomic_load(&g_job.sum_us);
    long maxus = atomic_load(&g_job.max_us);
    long ref = running ? now_ms() : atomic_load(&g_job.end_ms);
    long elapsed = ref - atomic_load(&g_job.start_ms);
    if (elapsed < 1)
    {
        elapsed = 1;
    }
    long minus = atomic_load(&g_job.min_us);
    double rps = (double)completed * 1000.0 / (double)elapsed;
    double avg_ms =
        completed > 0 ? (double)sum / (double)completed / 1000.0 : 0.0;
    int nv = atomic_load(&g_job.vus);
    if (nv > STRESS_MAX_VUS)
    {
        nv = STRESS_MAX_VUS;
    }
    if (nv < 0)
    {
        nv = 0;
    }
    char err[STRESS_ERR_SIZE];
    (void)pthread_mutex_lock(&g_job.lock);
    copy_str(err, g_job.last_error, sizeof(err));
    (void)pthread_mutex_unlock(&g_job.lock);

    char pu[3072];
    size_t po = 0;
    pu[0] = '\0';
    for (int i = 0; i < nv; i++)
    {
        long c = atomic_load(&g_job.vu_ok[i]);
        int w = snprintf(pu + po, sizeof(pu) - po, "%s%ld", i ? "," : "", c);
        if (w < 0 || (size_t)w >= sizeof(pu) - po)
        {
            break;
        }
        po += (size_t)w;
    }
    pu[po] = '\0';
    char json[4096];
    (void)snprintf(
        json, sizeof(json),
        "{\"running\":%d,\"elapsed_ms\":%ld,\"completed\":%ld,\"ok\":%ld,"
        "\"err_client\":%ld,\"err_server\":%ld,\"err_conn\":%ld,\"rps\":%.1f,"
        "\"avg_ms\":%.1f,\"min_ms\":%ld,\"max_ms\":%ld,\"vus\":%d,\"steps\":%d,"
        "\"last_error\":\"%s\",\"per_user\":[%s]}",
        running, elapsed, completed, ok, e4, e5, ec, rps, avg_ms,
        minus > 0 ? minus / 1000L : 0L, maxus / 1000L, nv,
        atomic_load(&g_job.steps), err, pu);
    send_text(sock, 200, json);
}

static void stress_stop(int sock)
{
    atomic_store(&g_job.cancel, 1);
    send_text(sock, 200, "{\"status\":\"stopping\"}");
}

void stress_handle(int sock, const HttpRequest *req)
{
    assert(req != NULL);
    if (strcmp(req->method, "POST") == 0 &&
        strcmp(req->path, "/stress/start") == 0)
    {
        stress_start(sock, req);
    }
    else if (strcmp(req->method, "GET") == 0 &&
             strcmp(req->path, "/stress/status") == 0)
    {
        stress_status(sock);
    }
    else if (strcmp(req->method, "POST") == 0 &&
             strcmp(req->path, "/stress/stop") == 0)
    {
        stress_stop(sock);
    }
    else
    {
        send_text(sock, 404, "{\"error\":\"Unknown stress route\"}");
    }
}
