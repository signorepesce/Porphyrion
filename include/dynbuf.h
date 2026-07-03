#ifndef DYNBUF_H
#define DYNBUF_H

#include <stddef.h>

typedef struct
{
    char *data;
    size_t len;
    size_t cap;
    size_t max;
    int truncated;
} DynBuf;

int dynbuf_init(DynBuf *b, size_t max);

int dynbuf_reserve(DynBuf *b, size_t need);

int dynbuf_append(DynBuf *b, const char *src, size_t n);

void dynbuf_reset(DynBuf *b);

void dynbuf_free(DynBuf *b);

#endif
