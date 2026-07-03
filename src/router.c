#include "router.h"
#include "call_api.h"
#include "decoder.h"
#include "dynbuf.h"
#include "http_parser.h"
#include "http_response.h"
#include "stress.h"
#include "worker.h"
#include <assert.h>
#include <pthread.h>
#include <stdio.h>
#include <string.h>
#include <sys/socket.h>
#include <sys/time.h>
#include <unistd.h>

#define SOCKET_TIMEOUT_SEC 30
#define REQ_READ_CHUNK 16384

static pthread_mutex_t g_save_lock = PTHREAD_MUTEX_INITIALIZER;

static const struct
{
    const char *route;
    const char *fs_path;
    const char *ct;
} STATIC_FILES[] = {
    {"/", "web/index.html", "text/html"},
    {"/index.html", "web/index.html", "text/html"},
    {"/css/style.css", "web/css/style.css", "text/css"},
    {"/js/app.js", "web/js/app.js", "text/javascript"},
    {"/js/graph.js", "web/js/graph.js", "text/javascript"},
    {"/js/import.js", "web/js/import.js", "text/javascript"},
    {"/js/sync.js", "web/js/sync.js", "text/javascript"},
    {"/resources/hat.png", "resources/hat.png", "image/png"},
    {"/requests.json", "data/requests.json", "application/json"},
};
#define STATIC_FILE_COUNT (int)(sizeof(STATIC_FILES) / sizeof(STATIC_FILES[0]))

int worker_ctx_init(WorkerCtx *ctx)
{
    assert(ctx != NULL);
    if (dynbuf_init(&ctx->reqbuf, WORKER_REQ_MAX) != 0)
    {
        return -1;
    }
    if (callscratch_init(&ctx->call) != 0)
    {
        dynbuf_free(&ctx->reqbuf);
        return -1;
    }
    return 0;
}

void worker_ctx_reset(WorkerCtx *ctx)
{
    assert(ctx != NULL);
    dynbuf_reset(&ctx->reqbuf);
    callscratch_reset(&ctx->call);
}

void worker_ctx_free(WorkerCtx *ctx)
{
    assert(ctx != NULL);
    dynbuf_free(&ctx->reqbuf);
    callscratch_free(&ctx->call);
}

static int read_full_request(int sock, DynBuf *rb, HttpRequest *req)
{
    assert(rb != NULL);
    assert(req != NULL);
    int read_limit = 16 * 1024 * 1024;
    HttpParseResult pr = HTTP_PARSE_NEED_MORE;

    while (read_limit-- > 0)
    {
        if (rb->cap - rb->len < 2)
        {
            if (dynbuf_reserve(rb, rb->cap + REQ_READ_CHUNK) != 0)
            {
                break;
            }
            if (rb->cap - rb->len < 2)
            {
                break;
            }
        }
        size_t space = rb->cap - rb->len - 1;
        int r = (int)read(sock, rb->data + rb->len, space);
        if (r <= 0)
        {
            if (rb->len == 0)
            {
                return r;
            }
            break;
        }
        rb->len += (size_t)r;
        rb->data[rb->len] = '\0';
        pr = http_parse_request(rb->data, rb->len, req);
        if (pr == HTTP_PARSE_ERROR)
        {
            return -1;
        }
        if (pr == HTTP_PARSE_OK)
        {
            break;
        }
    }
    if (pr != HTTP_PARSE_OK)
    {
        return -1;
    }
    if (req->content_length > (long)rb->max)
    {
        return -2;
    }
    if (req->content_length > 0)
    {
        size_t hdr_end = (size_t)(req->body - rb->data);
        size_t total_expected = hdr_end + (size_t)req->content_length;
        if (total_expected + 1 > rb->max)
        {
            return -2;
        }
        if (dynbuf_reserve(rb, total_expected + 1) != 0)
        {
            return -2;
        }
        while (rb->len < total_expected && read_limit-- > 0)
        {
            size_t space = rb->cap - rb->len - 1;
            if (space == 0)
            {
                break;
            }
            int r = (int)read(sock, rb->data + rb->len, space);
            if (r <= 0)
            {
                break;
            }
            rb->len += (size_t)r;
            rb->data[rb->len] = '\0';
        }
        http_parse_request(rb->data, rb->len, req);
    }
    return (int)rb->len;
}

static void send_413(int sock)
{
    const char *resp = "HTTP/1.1 413 Payload Too Large\r\n"
                       "Content-Type: application/json\r\n"
                       "Access-Control-Allow-Origin: *\r\n"
                       "Content-Length: 27\r\n\r\n"
                       "{\"error\":\"Payload too large\"}";
    (void)send_all(sock, resp, strlen(resp));
}

static void send_400(int sock, const char *msg)
{
    assert(msg != NULL);
    char body[128];
    (void)snprintf(body, sizeof(body), "{\"error\":\"%s\"}", msg);
    send_text(sock, 400, body);
}

static void handle_proxy_route(WorkerCtx *ctx, int sock, const HttpRequest *req)
{
    assert(ctx != NULL);
    assert(req != NULL);
    size_t url_len = 0, method_len = 0, ct_len = 0, hdr_len = 0;
    const char *url_h = http_find_header(req, "X-Proxy-URL", &url_len);
    const char *method_h = http_find_header(req, "X-Proxy-Method", &method_len);
    const char *ct_h = http_find_header(req, "X-Proxy-CT", &ct_len);
    const char *hdr_h = http_find_header(req, "X-Proxy-Headers", &hdr_len);
    if (!url_h || url_len == 0)
    {
        send_400(sock, "Missing proxy URL");
        return;
    }
    ProxyMeta *m = &ctx->meta;
    (void)base64_decode(url_h, url_len, m->url, sizeof(m->url));
    (void)base64_decode(ct_h ? ct_h : "", ct_len, m->ct, sizeof(m->ct));
    (void)base64_decode(hdr_h ? hdr_h : "", hdr_len, m->headers,
                        sizeof(m->headers));
    if (method_h && method_len > 0)
    {
        size_t mcopy = method_len < sizeof(m->method) - 1
                           ? method_len
                           : sizeof(m->method) - 1;
        memcpy(m->method, method_h, mcopy);
        m->method[mcopy] = '\0';
    }
    else
    {
        m->method[0] = 'G';
        m->method[1] = 'E';
        m->method[2] = 'T';
        m->method[3] = '\0';
    }
    if (m->url[0] == '\0')
    {
        send_400(sock, "Missing proxy URL");
        return;
    }
    perform_api_call(&ctx->call, sock, m->url, m->method,
                     req->body ? req->body : "",
                     req->body ? req->body_len : 0, m->ct, m->headers);
}

static void handle_save_route(int sock, const HttpRequest *req)
{
    assert(req != NULL);
    if (!req->body || req->body_len == 0)
    {
        send_400(sock, "Empty body");
        return;
    }
    const char *tmp_path = "data/.requests.json.tmp";
    const char *final_path = "data/requests.json";
    (void)pthread_mutex_lock(&g_save_lock);
    FILE *f = fopen(tmp_path, "w");
    if (!f)
    {
        (void)pthread_mutex_unlock(&g_save_lock);
        send_text(sock, 500, "{\"error\":\"Cannot open data file\"}");
        return;
    }
    size_t written = fwrite(req->body, 1, req->body_len, f);
    int flush_rc = fflush(f);
    int close_rc = fclose(f);
    if (written != req->body_len || flush_rc != 0 || close_rc != 0)
    {
        (void)remove(tmp_path);
        (void)pthread_mutex_unlock(&g_save_lock);
        send_text(sock, 500, "{\"error\":\"Write failed\"}");
        return;
    }
    if (rename(tmp_path, final_path) != 0)
    {
        (void)remove(tmp_path);
        (void)pthread_mutex_unlock(&g_save_lock);
        send_text(sock, 500, "{\"error\":\"Rename failed\"}");
        return;
    }
    (void)pthread_mutex_unlock(&g_save_lock);
    send_text(sock, 200, "{\"status\":\"saved\"}");
}

static void handle_options(int sock)
{
    const char *pre = "HTTP/1.1 204 No Content\r\n"
                      "Access-Control-Allow-Origin: *\r\n"
                      "Access-Control-Allow-Methods: POST, GET, OPTIONS\r\n"
                      "Access-Control-Allow-Headers: Content-Type, "
                      "X-Proxy-URL, X-Proxy-Method, X-Proxy-CT, "
                      "X-Proxy-Headers\r\n\r\n";
    (void)send_all(sock, pre, strlen(pre));
}

static void route_request(WorkerCtx *ctx, int sock, const HttpRequest *req)
{
    assert(ctx != NULL);
    assert(req != NULL);
    if (strcmp(req->method, "OPTIONS") == 0)
    {
        handle_options(sock);
        return;
    }
    if (strncmp(req->path, "/stress/", 8) == 0)
    {
        stress_handle(sock, req);
        return;
    }
    if (strcmp(req->method, "POST") == 0)
    {
        if (strcmp(req->path, "/proxy") == 0)
        {
            handle_proxy_route(ctx, sock, req);
            return;
        }
        if (strcmp(req->path, "/save") == 0)
        {
            handle_save_route(sock, req);
            return;
        }
    }
    if (strcmp(req->method, "GET") == 0)
    {
        for (int i = 0; i < STATIC_FILE_COUNT; i++)
        {
            if (strcmp(req->path, STATIC_FILES[i].route) == 0)
            {
                if (strcmp(STATIC_FILES[i].fs_path, "data/requests.json") ==
                        0 &&
                    access(STATIC_FILES[i].fs_path, F_OK) != 0)
                {
                    send_text(sock, 200, "[]");
                }
                else
                {
                    serve_file(sock, STATIC_FILES[i].fs_path,
                               STATIC_FILES[i].ct);
                }
                return;
            }
        }
    }
    const char *nf = "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n";
    (void)send_all(sock, nf, strlen(nf));
}

void handle_client(WorkerCtx *ctx, int sock)
{
    assert(ctx != NULL);
    assert(sock >= 0);
    struct timeval tv;
    tv.tv_sec = SOCKET_TIMEOUT_SEC;
    tv.tv_usec = 0;
    (void)setsockopt(sock, SOL_SOCKET, SO_RCVTIMEO, &tv, sizeof(tv));
    (void)setsockopt(sock, SOL_SOCKET, SO_SNDTIMEO, &tv, sizeof(tv));

    HttpRequest req;
    int n = read_full_request(sock, &ctx->reqbuf, &req);
    if (n == -2)
    {
        send_413(sock);
    }
    else if (n > 0)
    {
        route_request(ctx, sock, &req);
    }
    (void)close(sock);
    worker_ctx_reset(ctx);
}
