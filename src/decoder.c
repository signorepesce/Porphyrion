#include "decoder.h"
#include <stddef.h>

static int hex_val(unsigned char c)
{
    if (c >= '0' && c <= '9')
    {
        return c - '0';
    }
    if (c >= 'a' && c <= 'f')
    {
        return c - 'a' + 10;
    }
    if (c >= 'A' && c <= 'F')
    {
        return c - 'A' + 10;
    }
    return -1;
}

void url_decode(char *src, char *dst, size_t dst_size)
{
    if (!src || !dst || dst_size == 0)
    {
        return;
    }
    char *d = dst;
    const char *end = dst + dst_size - 1;
    while (*src != '\0' && d < end)
    {
        if (src[0] == '%')
        {
            int hi = hex_val((unsigned char)src[1]);
            int lo = (hi >= 0) ? hex_val((unsigned char)src[2]) : -1;
            if (lo >= 0)
            {
                *d++ = (char)((hi << 4) | lo);
                src += 3;
                continue;
            }
        }
        *d++ = (char)(*src == '+' ? ' ' : *src);
        src++;
    }
    *d = '\0';
}

static int b64_val(unsigned char c)
{
    if (c >= 'A' && c <= 'Z')
    {
        return c - 'A';
    }
    if (c >= 'a' && c <= 'z')
    {
        return c - 'a' + 26;
    }
    if (c >= '0' && c <= '9')
    {
        return c - '0' + 52;
    }
    if (c == '+')
    {
        return 62;
    }
    if (c == '/')
    {
        return 63;
    }
    return -1;
}

size_t base64_decode(const char *src, size_t src_len, char *dst,
                     size_t dst_size)
{
    if (!src || !dst || dst_size == 0)
    {
        return 0;
    }
    size_t o = 0;
    unsigned int acc = 0;
    int nbits = 0;
    for (size_t i = 0; i < src_len; i++)
    {
        unsigned char c = (unsigned char)src[i];
        if (c == '=')
        {
            break;
        }
        int v = b64_val(c);
        if (v < 0)
        {
            continue;
        }
        acc = (acc << 6) | (unsigned int)v;
        nbits += 6;
        if (nbits >= 8)
        {
            nbits -= 8;
            if (o + 1 >= dst_size)
            {
                break;
            }
            dst[o++] = (char)((acc >> (unsigned int)nbits) & 0xFFu);
        }
    }
    dst[o] = '\0';
    return o;
}
