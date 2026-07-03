#ifndef PROXY_NETWORKING_H
#define PROXY_NETWORKING_H

#include <stddef.h>

void resolve_url_init(void);

void resolve_url(const char *src, char *dst, size_t size);

#endif
