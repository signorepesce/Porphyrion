#ifndef DECODER_H
#define DECODER_H

#include <stddef.h>

void url_decode(char *src, char *dst, size_t dst_size);

size_t base64_decode(const char *src, size_t src_len, char *dst,
                     size_t dst_size);

#endif
