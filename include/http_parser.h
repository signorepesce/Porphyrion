#ifndef HTTP_PARSER_H
#define HTTP_PARSER_H

#include <stddef.h>

#define HTTP_MAX_HEADERS 64
#define HTTP_MAX_METHOD 16
#define HTTP_MAX_PATH 512

typedef enum
{
    HTTP_PARSE_OK = 0,
    HTTP_PARSE_NEED_MORE = 1,
    HTTP_PARSE_ERROR = -1
} HttpParseResult;

typedef struct
{
    const char *name;
    size_t name_len;
    const char *value;
    size_t value_len;
} HttpHeader;

typedef struct
{
    char method[HTTP_MAX_METHOD];
    char path[HTTP_MAX_PATH];
    int minor_version;

    HttpHeader headers[HTTP_MAX_HEADERS];
    int num_headers;

    const char *body;
    size_t body_len;
    long content_length;
} HttpRequest;

HttpParseResult http_parse_request(char *buf, size_t len, HttpRequest *req);
const char *http_find_header(const HttpRequest *req, const char *name,
                             size_t *out_len);

#endif
