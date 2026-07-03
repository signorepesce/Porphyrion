#define _POSIX_C_SOURCE 200809L
#include "call_api.h"
#include "curl_util.h"
#include "dynbuf.h"
#include "http_response.h"
#include "proxy_networking.h"
#include <assert.h>
#include <curl/curl.h>
#include <stdio.h>
#include <string.h>

#define CT_HDR_SIZE 320
#define MAX_HEADER_LINES 512

int callscratch_init(CallScratch *cs)
{
    assert(cs != NULL);
    return dynbuf_init(&cs->body, CALL_RESP_MAX);
}

void callscratch_reset(CallScratch *cs)
{
    assert(cs != NULL);
    dynbuf_reset(&cs->body);
    cs->rhdr_len = 0;
}

void callscratch_free(CallScratch *cs)
{
    assert(cs != NULL);
    dynbuf_free(&cs->body);
}

static size_t header_callback(char *ptr, size_t size, size_t nmemb, void *user)
{
    CallScratch *cs = (CallScratch *)user;
    assert(cs != NULL);
    size_t incoming = size * nmemb;
    size_t space = CALL_RHDR_SIZE - cs->rhdr_len;
    if (incoming > space)
    {
        incoming = space;
    }
    if (incoming > 0)
    {
        assert(ptr != NULL);
        memcpy(cs->rhdr + cs->rhdr_len, ptr, incoming);
        cs->rhdr_len += incoming;
    }
    return size * nmemb;
}

static struct curl_slist *build_headers(const char *ct, char *headers_payload)
{
    assert(ct != NULL);
    assert(headers_payload != NULL);
    struct curl_slist *hdrs = NULL;
    if (ct[0] != '\0')
    {
        char ct_hdr[CT_HDR_SIZE];
        (void)snprintf(ct_hdr, sizeof(ct_hdr), "Content-Type: %s", ct);
        hdrs = curl_slist_append(hdrs, ct_hdr);
    }
    hdrs = curl_append_header_lines(hdrs, headers_payload, MAX_HEADER_LINES);
    return hdrs;
}

static const char B64[] =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

static size_t base64_encode(const char *src, size_t src_len, char *dst,
                            size_t dst_size)
{
    assert(src != NULL);
    assert(dst != NULL);
    assert(dst_size > 0);
    size_t o = 0, i = 0;
    while (i < src_len && o + 4 < dst_size)
    {
        unsigned char a = (unsigned char)src[i++];
        unsigned char b = i < src_len ? (unsigned char)src[i++] : 0;
        unsigned char c = i < src_len ? (unsigned char)src[i++] : 0;
        int pad = (i > src_len + 1) ? 2 : (i > src_len) ? 1 : 0;
        dst[o++] = B64[a >> 2];
        dst[o++] = B64[((a & 3) << 4) | (b >> 4)];
        dst[o++] = pad >= 2 ? '=' : B64[((b & 0xF) << 2) | (c >> 6)];
        dst[o++] = pad >= 1 ? '=' : B64[c & 0x3F];
    }
    dst[o] = '\0';
    return o;
}

static void send_502_init_fail(int sock)
{
    const char *msg = "{\"error\":\"curl_easy_init failed\"}";
    char hdr0[256];
    (void)snprintf(hdr0, sizeof(hdr0),
                   "HTTP/1.1 502 Bad Gateway\r\nContent-Type: "
                   "application/json\r\nAccess-Control-Allow-Origin: "
                   "*\r\nContent-Length: %zu\r\n\r\n",
                   strlen(msg));
    if (send_all(sock, hdr0, strlen(hdr0)) == 0)
    {
        (void)send_all(sock, msg, strlen(msg));
    }
}

void perform_api_call(CallScratch *cs, int sock, const char *url,
                      const char *method, const char *post_body,
                      size_t post_body_len, const char *ct,
                      char *headers_payload)
{
    assert(cs != NULL);
    assert(url != NULL);
    assert(method != NULL);
    assert(post_body != NULL);
    assert(ct != NULL);
    assert(headers_payload != NULL);

    cs->body.len = 0;
    cs->body.truncated = 0;
    cs->rhdr_len = 0;
    resolve_url(url, cs->resolved, sizeof(cs->resolved));
    long http_code = 0;
    const char *resp_data = cs->err_body;
    size_t resp_len = 0;
    CURL *curl = curl_easy_init();
    if (!curl)
    {
        send_502_init_fail(sock);
        return;
    }
    struct curl_slist *hdrs = build_headers(ct, headers_payload);
    (void)curl_easy_setopt(curl, CURLOPT_URL, cs->resolved);
    (void)curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, curl_write_dynbuf);
    (void)curl_easy_setopt(curl, CURLOPT_WRITEDATA, &cs->body);
    (void)curl_easy_setopt(curl, CURLOPT_HEADERFUNCTION, header_callback);
    (void)curl_easy_setopt(curl, CURLOPT_HEADERDATA, cs);
    if (hdrs)
    {
        (void)curl_easy_setopt(curl, CURLOPT_HTTPHEADER, hdrs);
    }
    curl_setup_method(curl, method, post_body, post_body_len);
    CURLcode rc = curl_easy_perform(curl);
    if (rc != CURLE_OK)
    {
        (void)snprintf(cs->err_body, sizeof(cs->err_body),
                       "{\"error\":\"Curl Error: %s\"}",
                       curl_easy_strerror(rc));
        resp_data = cs->err_body;
        resp_len = strlen(cs->err_body);
    }
    else
    {
        (void)curl_easy_getinfo(curl, CURLINFO_RESPONSE_CODE, &http_code);
        resp_data = cs->body.data;
        resp_len = cs->body.len;
    }
    if (hdrs)
    {
        curl_slist_free_all(hdrs);
    }
    curl_easy_cleanup(curl);
    (void)base64_encode(cs->rhdr, cs->rhdr_len, cs->b64_hdrs,
                        sizeof(cs->b64_hdrs));
    (void)snprintf(
        cs->hdr, sizeof(cs->hdr),
        "HTTP/1.1 200 OK\r\n"
        "Content-Type: application/octet-stream\r\n"
        "Access-Control-Allow-Origin: *\r\n"
        "Access-Control-Expose-Headers: "
        "X-Proxy-Status,X-Resp-Headers,X-Resp-Size,X-Resp-Truncated\r\n"
        "X-Proxy-Status: %ld\r\n"
        "X-Resp-Headers: %s\r\n"
        "X-Resp-Size: %zu\r\n"
        "X-Resp-Truncated: %d\r\n"
        "Content-Length: %zu\r\n\r\n",
        http_code, cs->b64_hdrs, resp_len, cs->body.truncated, resp_len);
    if (send_all(sock, cs->hdr, strlen(cs->hdr)) == 0 && resp_len > 0)
    {
        (void)send_all(sock, resp_data, resp_len);
    }
}
