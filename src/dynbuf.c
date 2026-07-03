#include "dynbuf.h"
#include <assert.h>
#include <stdlib.h>

#define DYNBUF_MIN_CHUNK 8192

static void secure_zero(void *p, size_t n)
{
    volatile unsigned char *vp = (volatile unsigned char *)p;
    for (size_t i = 0; i < n; i++)
    {
        vp[i] = 0;
    }
}

int dynbuf_init(DynBuf *b, size_t max)
{
    assert(b != NULL);
    if (max == 0)
    {
        return -1;
    }
    b->data = NULL;
    b->len = 0;
    b->cap = 0;
    b->max = max;
    b->truncated = 0;
    return 0;
}

int dynbuf_reserve(DynBuf *b, size_t need)
{
    assert(b != NULL);
    if (need > b->max)
    {
        need = b->max;
        b->truncated = 1;
    }
    if (need <= b->cap)
    {
        return 0;
    }
    size_t newcap = b->cap ? b->cap : (size_t)DYNBUF_MIN_CHUNK;
    while (newcap < need)
    {
        if (newcap > b->max / 2)
        {
            newcap = b->max;
            break;
        }
        newcap *= 2;
    }
    if (newcap < need)
    {
        newcap = need;
    }
    char *p = realloc(b->data, newcap);
    if (!p)
    {
        return -1;
    }
    b->data = p;
    b->cap = newcap;
    return 0;
}

int dynbuf_append(DynBuf *b, const char *src, size_t n)
{
    assert(b != NULL);
    if (!src && n > 0)
    {
        return -1;
    }
    if (n == 0)
    {
        return 0;
    }
    if (dynbuf_reserve(b, b->len + n) != 0)
    {
        b->truncated = 1;
    }
    size_t canwrite = b->cap - b->len;
    size_t w = n < canwrite ? n : canwrite;
    if (w > 0)
    {
        assert(b->data != NULL);
        for (size_t i = 0; i < w; i++)
        {
            b->data[b->len + i] = src[i];
        }
        b->len += w;
    }
    if (w < n)
    {
        b->truncated = 1;
    }
    return 0;
}

void dynbuf_reset(DynBuf *b)
{
    assert(b != NULL);
    if (b->data)
    {
        secure_zero(b->data, b->len);
        free(b->data);
        b->data = NULL;
    }
    b->len = 0;
    b->cap = 0;
    b->truncated = 0;
}

void dynbuf_free(DynBuf *b)
{
    assert(b != NULL);
    if (b->data)
    {
        secure_zero(b->data, b->len);
        free(b->data);
        b->data = NULL;
    }
    b->len = 0;
    b->cap = 0;
}
