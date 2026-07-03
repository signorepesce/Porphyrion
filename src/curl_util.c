#define _POSIX_C_SOURCE 200809L
#include "curl_util.h"
#include <assert.h>
#include <string.h>

size_t curl_write_dynbuf(char *ptr, size_t size, size_t nmemb, void *user)
{
    DynBuf *b = (DynBuf *)user;
    assert(b != NULL);
    size_t n = size * nmemb;
    if (n > 0)
    {
        assert(ptr != NULL);
        (void)dynbuf_append(b, ptr, n);
    }
    return n;
}

struct curl_slist *curl_append_header_lines(struct curl_slist *list,
                                            char *payload, int max_lines)
{
    assert(payload != NULL);
    if (payload[0] == '\0')
    {
        return list;
    }
    char *saveptr;
    char *line = strtok_r(payload, "\n", &saveptr);
    int guard = 0;
    while (line != NULL && guard < max_lines)
    {
        size_t ll = strlen(line);
        if (ll > 0 && line[ll - 1] == '\r')
        {
            line[ll - 1] = '\0';
        }
        if (line[0] != '\0')
        {
            list = curl_slist_append(list, line);
        }
        line = strtok_r(NULL, "\n", &saveptr);
        guard++;
    }
    return list;
}

void curl_setup_method(CURL *curl, const char *method, const char *body,
                       size_t body_len)
{
    assert(curl != NULL);
    assert(method != NULL);
    assert(body != NULL);
    if (strcmp(method, "POST") == 0)
    {
        (void)curl_easy_setopt(curl, CURLOPT_POST, 1L);
        (void)curl_easy_setopt(curl, CURLOPT_POSTFIELDS, body);
        (void)curl_easy_setopt(curl, CURLOPT_POSTFIELDSIZE, (long)body_len);
    }
    else if (strcmp(method, "GET") != 0)
    {
        (void)curl_easy_setopt(curl, CURLOPT_CUSTOMREQUEST, method);
        if (body_len > 0)
        {
            (void)curl_easy_setopt(curl, CURLOPT_POSTFIELDS, body);
            (void)curl_easy_setopt(curl, CURLOPT_POSTFIELDSIZE, (long)body_len);
        }
    }
}
