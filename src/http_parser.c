#include "http_parser.h"
#include <assert.h>
#include <ctype.h>
#include <stdlib.h>
#include <string.h>
#include <strings.h>

static int is_token_char(unsigned char c)
{
    static const char tchar[] = "!#$%&'*+-.^_`|~"
                                "0123456789"
                                "abcdefghijklmnopqrstuvwxyz"
                                "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const char *p = tchar;
    while (*p)
    {
        if ((unsigned char)*p == c)
        {
            return 1;
        }
        p++;
    }
    return 0;
}

static void skip_ows(const char **p, const char *end)
{
    assert(p != NULL && *p != NULL && end != NULL);
    while (*p < end && (**p == ' ' || **p == '\t'))
    {
        (*p)++;
    }
}

static int read_token(const char **p, const char *end, char *out,
                      size_t out_size)
{
    assert(p != NULL && *p != NULL && end != NULL && out != NULL);
    assert(out_size > 0);
    int count = 0;
    while (*p < end && is_token_char((unsigned char)**p))
    {
        if ((size_t)count >= out_size - 1)
        {
            return -1;
        }
        out[count++] = **p;
        (*p)++;
    }
    if (count == 0)
    {
        return -1;
    }
    out[count] = '\0';
    return count;
}

static int expect_crlf(const char **p, const char *end)
{
    assert(p != NULL && *p != NULL && end != NULL);
    if ((size_t)(end - *p) < 2)
    {
        return 0;
    }
    if ((*p)[0] != '\r' || (*p)[1] != '\n')
    {
        return 0;
    }
    *p += 2;
    return 1;
}

static HttpParseResult parse_request_line(const char **p, const char *end,
                                          HttpRequest *req)
{
    assert(p != NULL && *p != NULL && end != NULL && req != NULL);
    if (read_token(p, end, req->method, sizeof(req->method)) < 0)
    {
        return HTTP_PARSE_ERROR;
    }
    if (*p >= end || **p != ' ')
    {
        return HTTP_PARSE_ERROR;
    }
    (*p)++;
    const char *path_start = *p;
    int path_len = 0;
    while (*p < end && **p != ' ' && **p != '\r' && **p != '\n')
    {
        path_len++;
        (*p)++;
    }
    if (path_len == 0 || path_len >= HTTP_MAX_PATH)
    {
        return HTTP_PARSE_ERROR;
    }
    memcpy(req->path, path_start, (size_t)path_len);
    req->path[path_len] = '\0';
    if (*p >= end || **p != ' ')
    {
        return HTTP_PARSE_ERROR;
    }
    (*p)++;
    if ((size_t)(end - *p) < 8)
    {
        return HTTP_PARSE_ERROR;
    }
    if (memcmp(*p, "HTTP/1.", 7) != 0)
    {
        return HTTP_PARSE_ERROR;
    }
    *p += 7;
    char v = **p;
    if (v != '0' && v != '1')
    {
        return HTTP_PARSE_ERROR;
    }
    req->minor_version = v - '0';
    (*p)++;
    if (!expect_crlf(p, end))
    {
        return HTTP_PARSE_ERROR;
    }
    return HTTP_PARSE_OK;
}

static HttpParseResult parse_headers(const char **p, const char *end,
                                     HttpRequest *req)
{
    assert(p != NULL && *p != NULL && end != NULL && req != NULL);
    req->num_headers = 0;
    int line_limit = 1024;
    while (line_limit-- > 0)
    {
        if ((size_t)(end - *p) >= 2 && (*p)[0] == '\r' && (*p)[1] == '\n')
        {
            *p += 2;
            return HTTP_PARSE_OK;
        }
        const char *name_start = *p;
        size_t name_len = 0;
        while (*p < end && **p != ':' && **p != '\r' && **p != '\n')
        {
            if (!is_token_char((unsigned char)**p))
            {
                return HTTP_PARSE_ERROR;
            }
            name_len++;
            (*p)++;
        }
        if (name_len == 0 || *p >= end || **p != ':')
        {
            return HTTP_PARSE_ERROR;
        }
        (*p)++;
        skip_ows(p, end);
        const char *val_start = *p;
        size_t val_len = 0;
        while (*p < end && **p != '\r' && **p != '\n')
        {
            val_len++;
            (*p)++;
        }
        while (val_len > 0 && (val_start[val_len - 1] == ' ' ||
                               val_start[val_len - 1] == '\t'))
        {
            val_len--;
        }
        if (!expect_crlf(p, end))
        {
            return HTTP_PARSE_ERROR;
        }
        if (req->num_headers < HTTP_MAX_HEADERS)
        {
            HttpHeader *h = &req->headers[req->num_headers++];
            h->name = name_start;
            h->name_len = name_len;
            h->value = val_start;
            h->value_len = val_len;
        }
    }
    return HTTP_PARSE_ERROR;
}

HttpParseResult http_parse_request(char *buf, size_t len, HttpRequest *req)
{
    if (!buf || !req || len == 0)
    {
        return HTTP_PARSE_ERROR;
    }
    memset(req, 0, sizeof(*req));
    req->content_length = -1;
    const char *p = buf, *end = buf + len;
    HttpParseResult rc = parse_request_line(&p, end, req);
    if (rc != HTTP_PARSE_OK)
    {
        const char *crlf = (const char *)memchr(buf, '\n', len);
        if (!crlf)
        {
            return HTTP_PARSE_NEED_MORE;
        }
        return HTTP_PARSE_ERROR;
    }
    {
        const char *scan = p;
        int found = 0;
        size_t remaining = (size_t)(end - scan);
        if (remaining >= 4)
        {
            for (size_t i = 0; i <= remaining - 4; i++)
            {
                if (scan[i] == '\r' && scan[i + 1] == '\n' &&
                    scan[i + 2] == '\r' && scan[i + 3] == '\n')
                {
                    found = 1;
                    break;
                }
            }
        }
        if (!found)
        {
            return HTTP_PARSE_NEED_MORE;
        }
    }
    rc = parse_headers(&p, end, req);
    if (rc != HTTP_PARSE_OK)
    {
        return rc;
    }
    size_t cl_len = 0;
    const char *cl_val = http_find_header(req, "Content-Length", &cl_len);
    if (cl_val && cl_len > 0 && cl_len <= 20)
    {
        char tmp[24];
        size_t copy_len = cl_len < 23 ? cl_len : 23;
        memcpy(tmp, cl_val, copy_len);
        tmp[copy_len] = '\0';
        req->content_length = strtol(tmp, NULL, 10);
    }
    req->body = p;
    req->body_len = (size_t)(end - p);
    return HTTP_PARSE_OK;
}

const char *http_find_header(const HttpRequest *req, const char *name,
                             size_t *out_len)
{
    if (!req || !name)
    {
        return NULL;
    }
    size_t name_len = strlen(name);
    for (int i = 0; i < req->num_headers; i++)
    {
        const HttpHeader *h = &req->headers[i];
        if (h->name_len == name_len &&
            strncasecmp(h->name, name, name_len) == 0)
        {
            if (out_len)
            {
                *out_len = h->value_len;
            }
            return h->value;
        }
    }
    return NULL;
}
