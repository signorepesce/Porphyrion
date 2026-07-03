#ifndef HTTP_RESPONSE_H
#define HTTP_RESPONSE_H

#include <stddef.h>

int send_all(int sock, const char *buf, size_t len);

void serve_file(int sock, const char *path, const char *ct);

void send_text(int sock, int status, const char *body);

#endif
