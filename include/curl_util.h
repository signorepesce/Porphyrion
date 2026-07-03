#ifndef CURL_UTIL_H
#define CURL_UTIL_H

#include "dynbuf.h"
#include <curl/curl.h>
#include <stddef.h>

size_t curl_write_dynbuf(char *ptr, size_t size, size_t nmemb, void *user);

struct curl_slist *curl_append_header_lines(struct curl_slist *list,
                                            char *payload, int max_lines);

void curl_setup_method(CURL *curl, const char *method, const char *body,
                       size_t body_len);

#endif
